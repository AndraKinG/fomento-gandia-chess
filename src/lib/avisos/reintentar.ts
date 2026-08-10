import { createAdminClient } from "@/lib/supabase/admin";
import { intentarPush } from "@/lib/push/send";
import { debePush, debeReintentar, estadoPushDeAviso, type TipoAviso } from "@/lib/avisos/politica";

/**
 * A partir de cuántos minutos un `pendiente` deja de poder ser "uno en
 * curso" y pasa a ser huérfano.
 *
 * `avisar()` (src/lib/avisos/enviar.ts) inserta la fila como `pendiente` y,
 * en la MISMA petición, intenta el push y la actualiza a
 * `entregado`/`fallido`/`no_tocaba` — son unos pocos segundos, no minutos.
 * El único modo de que una fila se quede en `pendiente` más allá de eso es
 * que ese `update` final falle Y que su propio intento de rescate (marcarla
 * `fallido` en el `catch`) falle también: dos escrituras seguidas a la
 * misma fila, las dos rotas. Es un margen deliberadamente generoso — de
 * sobra para no confundir un envío lento con uno perdido — y aun así deja
 * fuera de toda duda que, pasado ese tiempo, la fila no la está terminando
 * nadie: se puede reintentar con total tranquilidad.
 */
const MINUTOS_PENDIENTE_HUERFANO = 10;

type FilaNotificacion = {
  id: string;
  profile_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  push: string;
  push_intentos: number;
};

/**
 * Reintenta los avisos que se quedaron sin entregar. Barre DOS conjuntos,
 * no uno:
 *
 * 1. Los `fallido` que `debeReintentar()` diga que tocan (como mucho un
 *    reintento por aviso: ver los tests de esa función en politica.test.ts).
 * 2. Los `pendiente` HUÉRFANOS (más viejos que `MINUTOS_PENDIENTE_HUERFANO`,
 *    ver esa constante). Sin este segundo barrido, el hueco que deja abierto
 *    `avisar()` cuando fallan sus DOS escrituras seguidas deja la fila en
 *    `pendiente` para siempre: el índice parcial de la migración 0028 solo
 *    cubre `push = 'fallido'`, así que nada ni nadie vuelve a mirarla. Es
 *    justo el agujero que encontró la revisión de la tarea anterior.
 *
 *    Un huérfano no pasa por `debeReintentar` (esa función exige
 *    `push === "fallido"` y estos son `pendiente`): se tratan como
 *    candidatos siempre que aparecen, porque ESTE es su primer y único
 *    reintento — antes de este barrido nadie lo había intentado nunca en su
 *    nombre. Si vuelve a fallar se marca `fallido` con `push_intentos = 1`,
 *    para que el día siguiente `debeReintentar` ya diga que no: el mismo
 *    tope de "un solo reintento" que rige para los `fallido` de toda la
 *    vida, solo que contado desde este primer barrido.
 *
 * `push_intentos` solo sube cuando el reintento VUELVE a fallar (queda en
 * `fallido`): si entrega o resulta que ya no tocaba (p. ej. la suscripción
 * se borró entre medias), el aviso no se va a volver a mirar por dejar de
 * estar en `fallido`/`pendiente`, así que gastar el contador no aporta nada.
 *
 * LA POLÍTICA VUELVE A DECIDIR AQUÍ, no solo en el primer envío (`avisar()`).
 * Entre el fallo original y este barrido puede haber pasado un día entero:
 * si el socio silenció el grupo mientras tanto (o se quedó sin ningún
 * dispositivo suscrito), mandarle el push de todos modos es justo lo que
 * pidió que no pasara. `debePush` es el único juez tanto aquí como en
 * `enviar.ts`, para que las dos puertas de entrada al push nunca puedan
 * discrepar.
 *
 * Y SE SALTA LO YA LEÍDO: si el socio ya vio el aviso en la bandeja antes de
 * que el cron pasara, mandarle un push al día siguiente es avisarle de algo
 * que ya sabe. Se filtra con `leido_en is null` en las DOS consultas.
 *
 * Nunca lanza: la llama el cron TODOS los días (es barata: índice parcial,
 * normalmente 0 filas) y un fallo aquí no puede tumbar el resto de lo que
 * hace ese cron ese día (pedir disponibilidad, recordar, sincronizar FACV).
 */
export async function reintentarAvisosFallidos(): Promise<{ reintentados: number }> {
  try {
    const admin = createAdminClient();
    const limite = new Date(Date.now() - MINUTOS_PENDIENTE_HUERFANO * 60_000).toISOString();
    const columnas = "id, profile_id, tipo, titulo, cuerpo, url, push, push_intentos";

    const [{ data: fallidos }, { data: huerfanos }] = await Promise.all([
      admin.from("notifications").select(columnas).eq("push", "fallido").is("leido_en", null),
      admin
        .from("notifications")
        .select(columnas)
        .eq("push", "pendiente")
        .lt("creado_en", limite)
        .is("leido_en", null),
    ]);

    const candidatos: FilaNotificacion[] = [
      ...((fallidos ?? []) as FilaNotificacion[]).filter((fila) => debeReintentar(fila)),
      ...((huerfanos ?? []) as FilaNotificacion[]),
    ];

    if (candidatos.length === 0) return { reintentados: 0 };

    // Preferencias de silencio y suscripciones de los destinatarios de ESTOS
    // candidatos (no de todo el club): lo mismo que lee `avisar()` antes de
    // decidir, para que `debePush` tenga con qué juzgar también en el reintento.
    const perfilIds = Array.from(new Set(candidatos.map((f) => f.profile_id)));
    const [{ data: perfiles }, { data: subs }] = await Promise.all([
      admin.from("profiles").select("id, avisos_silenciados").in("id", perfilIds),
      admin.from("push_subscriptions").select("user_id").in("user_id", perfilIds),
    ]);
    const silenciadosPorId = new Map<string, string[]>(
      (perfiles ?? []).map((p) => [p.id as string, (p.avisos_silenciados ?? []) as string[]])
    );
    const conSuscripcion = new Set((subs ?? []).map((s) => s.user_id as string));

    await Promise.all(
      candidatos.map(async (fila) => {
        try {
          const tocaEnviar = debePush(fila.tipo as TipoAviso, {
            silenciados: silenciadosPorId.get(fila.profile_id) ?? [],
            tieneSuscripcion: conSuscripcion.has(fila.profile_id),
          });
          if (!tocaEnviar) {
            // Ya no toca: silenció el grupo o se quedó sin dispositivos entre
            // medias. No es un fallo nuevo, así que `push_intentos` no sube.
            await admin.from("notifications").update({ push: "no_tocaba" }).eq("id", fila.id);
            return;
          }

          const resultados = await intentarPush(fila.profile_id, {
            title: fila.titulo,
            body: fila.cuerpo,
            url: fila.url ?? undefined,
          });
          const estado = estadoPushDeAviso(resultados);
          await admin
            .from("notifications")
            .update({
              push: estado,
              push_intentos:
                estado === "fallido" ? fila.push_intentos + 1 : fila.push_intentos,
            })
            .eq("id", fila.id);
        } catch {
          // Si ni siquiera se puede escribir el resultado, se deja la fila
          // como estaba: la próxima pasada del cron la vuelve a encontrar
          // (un `fallido` sigue siendo `fallido`; un huérfano sigue siendo
          // `pendiente` y, si acaso, más viejo todavía, así que sigue
          // calificando igual).
        }
      })
    );

    return { reintentados: candidatos.length };
  } catch {
    // Ver cabecera: un fallo aquí (p. ej. la propia consulta) no puede
    // tumbar el resto del cron.
    return { reintentados: 0 };
  }
}
