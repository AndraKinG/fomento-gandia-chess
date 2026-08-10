import { createAdminClient } from "@/lib/supabase/admin";
import { intentarPush } from "@/lib/push/send";
import { debePush, GRUPO_DE, type TipoAviso } from "@/lib/avisos/politica";

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
    const [{ data: perfiles }, { data: subs }] = await Promise.all([
      admin.from("profiles").select("id, avisos_silenciados").in("id", destinatarios),
      admin.from("push_subscriptions").select("user_id").in("user_id", destinatarios),
    ]);

    const silenciadosPorId = new Map<string, string[]>(
      (perfiles ?? []).map((p) => [p.id as string, (p.avisos_silenciados ?? []) as string[]])
    );
    const conSuscripcion = new Set((subs ?? []).map((s) => s.user_id as string));

    // Solo destinatarios con ficha de perfil real: un id suelto que no exista
    // en `profiles` rompería el INSERT completo (la fila viola la FK), y eso
    // se llevaría por delante el aviso de TODOS los demás destinatarios
    // válidos. Mejor descartar el que no cuadra que perder el resto.
    const destinatariosValidos = destinatarios.filter((id) => silenciadosPorId.has(id));
    if (destinatariosValidos.length === 0) return { guardados: 0, pushEnviados: 0 };

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
      push: debePush(aviso.tipo, {
        silenciados: silenciadosPorId.get(profileId) ?? [],
        tieneSuscripcion: conSuscripcion.has(profileId),
      })
        ? "pendiente"
        : "no_tocaba",
    }));

    const { data: insertadas } = await admin
      .from("notifications")
      .insert(filas)
      .select("id, profile_id, push");

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
          const resultados = await intentarPush(fila.profile_id, payload);
          const entregado = resultados.some((r) => r.entregado);
          if (entregado) {
            pushEnviados++;
            await admin.from("notifications").update({ push: "entregado" }).eq("id", fila.id);
            return;
          }
          // Ninguna suscripción lo recibió. Si al menos una falló "de verdad"
          // (no un 404/410 ya limpiado por `intentarPush`), se deja "fallido"
          // para que el cron lo reintente (una vez, por `debeReintentar`); si
          // todas acabaron en "no_tocaba" (o no había ninguna suscripción ya
          // en el momento de mandar), no hay nada que reintentar.
          const falloTemporal = resultados.some(
            (r) => !r.entregado && r.estado === "fallido"
          );
          await admin
            .from("notifications")
            .update({ push: falloTemporal ? "fallido" : "no_tocaba" })
            .eq("id", fila.id);
        } catch {
          // El push de UN destinatario no debe impedir intentar con los demás.
        }
      })
    );

    return { guardados: guardadas.length, pushEnviados };
  } catch {
    // Ver cabecera del fichero: guardar o mandar el push nunca tumba la
    // operación que disparó el aviso.
    return { guardados: 0, pushEnviados: 0 };
  }
}
