import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";

export type JornadaVentana = { id: string; fecha_hora: string };
export type DisponibilidadFila = { match_id: string; player_id: string };
export type UsuarioConFicha = { user_id: string; player_id: string };

/**
 * Pura: dadas las jornadas próximas, las respuestas de disponibilidad ya
 * registradas y los usuarios candidatos (con ficha vinculada), devuelve los
 * `user_id` a los que hay que recordar que les falta contestar — es decir,
 * a quien le falte al menos una jornada de la lista por responder.
 *
 * Fuera de alcance a propósito (se resuelve en otras capas):
 * - Que el usuario tenga o no suscripción push, y si le toca recibirla: eso
 *   lo decide `debePush()` dentro de `avisar()`, uno por uno, con las
 *   suscripciones y el silencio del socio. Esta función ni lo mira: a todos
 *   los que devuelve se les guarda el aviso en la bandeja igual, tengan o no
 *   push.
 * - Que el usuario tenga ficha (`player_id`) vinculada: el array `usuarios`
 *   que llega aquí ya viene filtrado aguas arriba (join con `profiles`).
 */
export function calcularDestinatariosRecordatorio(
  jornadas: JornadaVentana[],
  disponibilidades: DisponibilidadFila[],
  usuarios: UsuarioConFicha[]
): string[] {
  const respondidas = new Set(
    disponibilidades.map((d) => `${d.match_id}:${d.player_id}`)
  );
  return usuarios
    .filter((u) => jornadas.some((j) => !respondidas.has(`${j.id}:${u.player_id}`)))
    .map((u) => u.user_id);
}

/** Formatea una fecha ISO como día legible en es-ES, zona Europe/Madrid. */
function formatearFecha(fechaISO: string): string {
  return new Date(fechaISO).toLocaleDateString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Lista de fechas únicas (formateadas) de un conjunto de jornadas, unidas con "y". */
function textoFechas(jornadas: JornadaVentana[]): string {
  const fechas = Array.from(new Set(jornadas.map((j) => formatearFecha(j.fecha_hora))));
  return fechas.join(" y ");
}

/**
 * Todos los socios con ficha vinculada (`profiles.player_id` no nulo).
 *
 * YA NO filtra por suscripción push: antes descartaba aquí a quien no tenía
 * ninguna fila en `push_subscriptions`, lo que dejaba a ese socio sin ni
 * siquiera una fila en `notifications` — perdía el aviso para siempre, que es
 * justo lo que `avisar()` viene a arreglar. Ahora se le avisa a todo el que
 * tiene ficha; quién recibe además el push lo decide `debePush()` dentro de
 * `avisar()`, socio a socio.
 */
async function usuariosConFicha(
  admin: ReturnType<typeof createAdminClient>
): Promise<UsuarioConFicha[]> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, player_id")
    .not("player_id", "is", null);
  return ((profiles ?? []) as { id: string; player_id: string }[]).map((p) => ({
    user_id: p.id,
    player_id: p.player_id,
  }));
}

/** Jornadas pendientes cuya fecha cae en los próximos `diasVentana` días. */
async function jornadasProximas(
  admin: ReturnType<typeof createAdminClient>,
  diasVentana: number
): Promise<JornadaVentana[]> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + diasVentana * 24 * 60 * 60 * 1000);
  const { data } = await admin
    .from("matches")
    .select("id, fecha_hora")
    .eq("estado", "pendiente")
    .gte("fecha_hora", ahora.toISOString())
    .lte("fecha_hora", limite.toISOString());
  return (data ?? []).filter(
    (j): j is JornadaVentana => typeof j.fecha_hora === "string"
  );
}

/**
 * Petición semanal de disponibilidad: a TODOS los usuarios con ficha, para
 * las jornadas pendientes de los próximos `diasVentana` días (7 en
 * producción; se amplía en modo de prueba desde la ruta del cron).
 *
 * `notificados` es ahora `guardados` (a cuántos se les guardó el aviso en la
 * bandeja), no un recuento de pushes intentados: es el número equivalente y
 * más honesto para lo que el cron y sus tests esperan de este contorno.
 */
export async function pedirDisponibilidadSemana(
  diasVentana = 7
): Promise<{ notificados: number }> {
  const admin = createAdminClient();
  const jornadas = await jornadasProximas(admin, diasVentana);
  if (jornadas.length === 0) return { notificados: 0 };

  const usuarios = await usuariosConFicha(admin);
  if (usuarios.length === 0) return { notificados: 0 };

  const { guardados } = await avisar(
    usuarios.map((u) => u.user_id),
    {
      tipo: "disponibilidad_peticion",
      titulo: "¿Puedes jugar?",
      cuerpo: `Jornada del ${textoFechas(jornadas)}: marca tu disponibilidad`,
      url: "/club/disponibilidad",
    }
  );
  return { notificados: guardados };
}

/**
 * Recordatorio: SOLO a usuarios cuyo player no tiene fila de `availability`
 * para alguna jornada de los próximos `diasVentana` días (4 en producción).
 */
export async function recordarPendientes(
  diasVentana = 4
): Promise<{ notificados: number }> {
  const admin = createAdminClient();
  const jornadas = await jornadasProximas(admin, diasVentana);
  if (jornadas.length === 0) return { notificados: 0 };

  const { data: disponibilidades } = await admin
    .from("availability")
    .select("match_id, player_id")
    .in(
      "match_id",
      jornadas.map((j) => j.id)
    );

  const usuarios = await usuariosConFicha(admin);
  if (usuarios.length === 0) return { notificados: 0 };

  const destinatarios = calcularDestinatariosRecordatorio(
    jornadas,
    disponibilidades ?? [],
    usuarios
  );
  if (destinatarios.length === 0) return { notificados: 0 };

  const { guardados } = await avisar(destinatarios, {
    tipo: "disponibilidad_recordatorio",
    titulo: "¿Puedes jugar?",
    cuerpo: `Jornada del ${textoFechas(jornadas)}: marca tu disponibilidad`,
    url: "/club/disponibilidad",
  });
  return { notificados: guardados };
}
