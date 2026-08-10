import { createAdminClient } from "@/lib/supabase/admin";
import { intentarPush } from "@/lib/push/send";
import { debePush, estadoPushDeAviso, GRUPO_DE, type TipoAviso } from "@/lib/avisos/politica";

/**
 * Guarda el aviso para cada destinatario y LUEGO intenta el push. Nunca lanza.
 *
 * Orden que no se puede invertir (spec "Entrega garantizada", punto 1): si el
 * push falla o el servicio está caído, el aviso ya está en la bandeja del
 * socio; si se hiciera al revés (push primero) y fallara el guardado, se
 * reproduciría el problema que este módulo viene a arreglar — un aviso que
 * nadie ve en ningún sitio.
 *
 * Escribe con clave de servicio: `notifications` no tiene policy de INSERT a
 * propósito (0028), así que un socio no puede fabricarse un aviso ni para sí
 * mismo ni para otro.
 *
 * Un fallo aquí (guardar o mandar el push) NUNCA debe tumbar la operación que
 * disparó el aviso (publicar una convocatoria, aceptar un reto...), así que
 * todo el cuerpo va en try/catch silencioso.
 */
export async function avisar(
  profileIds: string[],
  aviso: { tipo: TipoAviso; titulo: string; cuerpo: string; url?: string }
): Promise<{ guardados: number; pushEnviados: number }> {
  try {
    // Sin destinatarios no hay nada que hacer (evita un `.in()` vacío, que
    // algunos clientes de Postgrest tratan de formas distintas).
    const destinatarios = Array.from(new Set(profileIds));
    if (destinatarios.length === 0) return { guardados: 0, pushEnviados: 0 };

    const admin = createAdminClient();

    // Dos lecturas en paralelo: preferencias de silencio (de `profiles`) y
    // quién tiene al menos un dispositivo suscrito (de `push_subscriptions`).
    // Ninguna de las dos decide nada por sí sola: eso es trabajo de `debePush`.
    const [
      { data: perfiles, error: perfilesError },
      { data: subs, error: subsError },
    ] = await Promise.all([
      admin.from("profiles").select("id, avisos_silenciados").in("id", destinatarios),
      admin.from("push_subscriptions").select("user_id").in("user_id", destinatarios),
    ]);

    // Si cualquiera de las dos lecturas falla, `data` viene `null` y hoy se
    // descartaba sin dejar rastro: "esta tanda no se guardó" y "no había
    // nada que guardar" quedaban indistinguibles en los logs de Vercel, que
    // es la única observabilidad que tiene el propietario. Se traza aquí,
    // antes de que cada `?? []` de abajo borre la diferencia.
    if (perfilesError) {
      console.error("[avisos] no se pudo leer profiles (silenciados)", aviso.tipo, perfilesError.message);
    }
    if (subsError) {
      console.error("[avisos] no se pudo leer push_subscriptions", aviso.tipo, subsError.message);
    }

    const silenciadosPorId = new Map<string, string[]>(
      (perfiles ?? []).map((p) => [p.id as string, (p.avisos_silenciados ?? []) as string[]])
    );
    const conSuscripcion = new Set((subs ?? []).map((s) => s.user_id as string));

    // Solo destinatarios con ficha de perfil real: un id suelto que no exista
    // en `profiles` rompería el INSERT completo (la fila viola la FK), y eso
    // se llevaría por delante el aviso de TODOS los demás destinatarios
    // válidos. Mejor descartar el que no cuadra que perder el resto.
    //
    // Si `perfilesError` ha saltado, este filtro rechaza a TODO el mundo
    // (el mapa queda vacío) y la función se va sin guardar nada — igual que
    // antes de este arreglo. Se deja así a propósito y no se trata como el
    // caso (b) de abajo: esta lectura no es solo el dato de entrada de
    // `debePush`, es también la única forma de confirmar que el id es un
    // socio real antes de insertar, así que no hay un "pendiente" seguro al
    // que degradar — insertar a ciegas es arriesgar la FK de la tanda
    // entera. Lo único que se podía arreglar aquí era el silencio del log
    // de arriba, y ya está hecho.
    const destinatariosValidos = destinatarios.filter((id) => silenciadosPorId.has(id));
    if (destinatariosValidos.length === 0) {
      console.error(
        "[avisos] sin destinatarios válidos tras cruzar con profiles",
        aviso.tipo,
        `(${destinatarios.length} solicitados)`
      );
      return { guardados: 0, pushEnviados: 0 };
    }

    const grupo = GRUPO_DE[aviso.tipo];

    const filas = destinatariosValidos.map((profileId) => ({
      profile_id: profileId,
      grupo,
      tipo: aviso.tipo,
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: aviso.url ?? null,
      // "pendiente" si toca intentar el push ahora mismo; "no_tocaba" si el
      // socio lo tiene silenciado o no tiene ningún dispositivo — la bandeja
      // recibe la fila igual, solo cambia si además se intenta el push.
      //
      // Si `push_subscriptions` no se pudo leer (`subsError`), NO se le pasa
      // `tieneSuscripcion: false` a `debePush`: eso sería mentirle — no es
      // que no tenga suscripción, es que no lo sabemos — y esa mentira
      // colaría por su primera guarda ("sin suscripción no hay dónde
      // mandarlo") directa a `no_tocaba`, el estado que el cron NUNCA
      // vuelve a mirar (ver reintentar.ts): la tanda entera se quedaría sin
      // push para siempre y en la base parecería una decisión a propósito.
      // Se le pasa `true` (optimista) en su lugar, para que `debePush` — que
      // sigue siendo el único juez, aquí no se repite ni una línea de su
      // lógica — decida solo con el dato que SÍ es firme pase lo que pase
      // con la suscripción: si el socio silenció el grupo. Con eso:
      //   - Silenciado → `debePush` da `false` igual, con dato fiable:
      //     `no_tocaba` sigue siendo verdad, no una suposición.
      //   - No silenciado (o convocatoria, que no se silencia nunca) →
      //     `debePush` da `true` → `pendiente`. Si de verdad no había
      //     ningún dispositivo, el intento de más abajo lo va a descubrir
      //     por su cuenta (`intentarPush` hace su propia lectura, no reusa
      //     `conSuscripcion`) y la fila acabará en `no_tocaba` de todos
      //     modos — mismo resultado, por el camino honesto. Y si ese
      //     intento también tropieza con el mismo fallo de lectura, queda
      //     en `fallido`, que el barrido de huérfanos SÍ recoge.
      push: debePush(aviso.tipo, {
        silenciados: silenciadosPorId.get(profileId) ?? [],
        tieneSuscripcion: subsError ? true : conSuscripcion.has(profileId),
      })
        ? "pendiente"
        : "no_tocaba",
    }));

    const { data: insertadas, error: insertError } = await admin
      .from("notifications")
      .insert(filas)
      .select("id, profile_id, push");

    // Traza para el propietario: el silencio de fuera es a propósito (ver
    // cabecera), pero sin esto "el aviso nunca se guardó" y "se guardó pero el
    // push falló" son indistinguibles en los logs de Vercel, y la bandeja se
    // vende justo como la herramienta para ver qué ha fallado. `insertadas`
    // puede venir `null` sin que Postgrest marque `error` (p. ej. si el
    // `.select()` posterior al insert no devuelve filas); se avisa igual.
    if (insertError || !insertadas) {
      console.error(
        "[avisos] no se pudo guardar la notificación",
        aviso.tipo,
        insertError?.message ?? "insert sin filas devueltas"
      );
    }

    const guardadas = (insertadas ?? []) as unknown as Array<{
      id: string;
      profile_id: string;
      push: string;
    }>;

    const payload = { title: aviso.titulo, body: aviso.cuerpo, url: aviso.url };
    const pendientes = guardadas.filter((fila) => fila.push === "pendiente");

    let pushEnviados = 0;
    await Promise.all(
      pendientes.map(async (fila) => {
        try {
          // Cómo se agrega el resultado de varios dispositivos en un único
          // estado de la fila (entregado si alguno lo recibió, fallido si
          // ninguno pero alguno era reintentable, no_tocaba en el resto de
          // casos) es política, no I/O: vive en `estadoPushDeAviso`, no aquí.
          const resultados = await intentarPush(fila.profile_id, payload);
          const estado = estadoPushDeAviso(resultados);
          if (estado === "entregado") pushEnviados++;
          // OJO: `push_intentos` se queda a propósito en su valor por
          // defecto (0) en este primer intento. Cuenta los REINTENTOS que
          // hace el cron, no los intentos totales (`debeReintentar` solo
          // tiene sentido leído así: ver sus tests). Si este primer intento
          // ya lo incrementara, el cron jamás podría reintentar ni una vez.
          // Le toca incrementarlo a quien construya ese reintento.
          await admin.from("notifications").update({ push: estado }).eq("id", fila.id);
        } catch {
          // Último recurso: `intentarPush` está blindado para no rechazar
          // nunca, pero si algo de este bloque falla de todos modos (p. ej.
          // el propio `update` de arriba), la fila se queda en "pendiente"
          // salvo que se intente aquí, aparte, dejarla en "fallido" — así el
          // cron la recoge (busca solo push='fallido', índice parcial de la
          // 0028) en vez de que el aviso se pierda en silencio para siempre.
          // Try/catch anidado para que ni este último intento pueda lanzar.
          try {
            await admin.from("notifications").update({ push: "fallido" }).eq("id", fila.id);
          } catch {
            // Si ni esto se puede escribir, no queda nada más que hacer sin
            // arriesgar la operación que disparó el aviso.
          }
        }
      })
    );

    return { guardados: guardadas.length, pushEnviados };
  } catch (err) {
    // Ver cabecera del fichero: guardar o mandar el push nunca tumba la
    // operación que disparó el aviso, pero sin esta traza el propietario no
    // tiene forma de distinguir "no se guardó nada" de "se guardó y el push
    // falló" — y en Vercel esto sí llega a los logs, que es donde se mira.
    console.error("[avisos] avisar() ha fallado por completo", aviso.tipo, err);
    return { guardados: 0, pushEnviados: 0 };
  }
}
