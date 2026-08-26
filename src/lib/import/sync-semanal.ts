import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";
import { sincronizarOrdenFuerzaFACVCore } from "@/lib/import/facv-of-apply";
import { sincronizarResultadosFACVCore } from "@/lib/import/facv-resultados-apply";
import { sincronizarActasCore } from "@/lib/import/chessresults-apply";
import { actualizarEloActualCore } from "@/lib/import/facv-elo-actual-apply";
import { sincronizarFichasTorneoFACV } from "@/lib/import/facv-fichas-apply";
import { sincronizarTorneosFACVCore } from "@/lib/import/facv-torneos-apply";

export type ResumenSyncSemanal = {
  ordenFuerza: Awaited<ReturnType<typeof sincronizarOrdenFuerzaFACVCore>>;
  resultados: Awaited<ReturnType<typeof sincronizarResultadosFACVCore>>;
  actas: Awaited<ReturnType<typeof sincronizarActasCore>>;
  eloActual: Awaited<ReturnType<typeof actualizarEloActualCore>>;
  /** El calendario de torneos de la FACV: los que ha publicado nuevos. */
  torneos: Awaited<ReturnType<typeof sincronizarTorneosFACVCore>>;
  /** Los enlaces de cada torneo a su página de la FACV y a sus resultados. */
  fichasTorneo: Awaited<ReturnType<typeof sincronizarFichasTorneoFACV>>;
  /** Cuántos admins y miembros de junta se han avisado de que hay fichas nuevas. */
  avisadosFichasNuevas: number;
};

/**
 * Las tres sincronizaciones semanales con la FACV, EN ORDEN.
 *
 * EL ORDEN NO ES ESTÉTICO, es una cadena de dependencias:
 *
 * 1. **Orden de fuerza**: crea las fichas (`players`) y sus números de orden. Va
 *    primero porque los dos pasos siguientes cruzan nombres contra esas fichas.
 * 2. **Resultados y clasificación**: crea/actualiza las jornadas (`matches`) con su
 *    marcador.
 * 3. **Actas por tablero**: necesita que las jornadas existan ya, porque cada tablero
 *    se cuelga de una de ellas.
 * 4. **Calendario de torneos** y, detrás, **sus enlaces**: un torneo recién publicado
 *    tiene que existir antes de poder ponerle su página de la FACV.
 *
 * POR QUÉ EL ORDEN DE FUERZA ESTABA FUERA DEL CRON, y por qué es un problema: solo se
 * sincronizaba pulsando un botón en Administración. Y **quien entra al club a mitad de
 * temporada aparece en el orden de fuerza de la FACV con un número "bis"**, así que
 * hasta que alguien se acordaba de pulsar ese botón, ese socio no existía para la app:
 * no podía vincular su cuenta —la lista de `/vincular` sale del orden de fuerza—, no
 * salía en el ranking, y sus partidas del acta se quedaban sin enlazar a ninguna ficha.
 *
 * AVISO A ADMIN Y JUNTA cuando aparecen fichas nuevas. Un socio nuevo casi siempre
 * necesita algo de una persona (darle el código de acceso, nombrarlo en un equipo), y
 * un contador en la respuesta de un cron que nadie lee no sirve de nada.
 */
export async function sincronizarSemanalCore(): Promise<ResumenSyncSemanal> {
  const ordenFuerza = await sincronizarOrdenFuerzaFACVCore();
  const resultados = await sincronizarResultadosFACVCore();
  const actas = await sincronizarActasCore();
  // 4. El ELO REAL de cada socio (FIDE de clásicas al día, vía el ranking FACV,
  //    que Vercel sí puede descargar). Después del orden de fuerza por lo mismo
  //    que los demás: cruza nombres contra las fichas.
  const eloActual = await actualizarEloActualCore();
  // 5. EL CALENDARIO DE TORNEOS de la FACV.
  //
  //    ESTO ESTABA FUERA DEL CRON Y ERA UN AGUJERO (visto el 2026-08-26, con el
  //    propietario preguntando justo por esto: "me preocupa que cuando llegue info nueva
  //    como torneos todo funcione ok"). Los 168 torneos que la FACV publica al año solo
  //    entraban pulsando un botón en Administración, así que un torneo anunciado esta
  //    semana no existía para el club hasta que alguien se acordara. Y es el mismo tipo
  //    de agujero que tenía el orden de fuerza hasta el 2026-08-06.
  //
  //    No avisa por push: son ~168 al año y llegan con `de_interes = false`, así que un
  //    aviso por cada uno sería ruido. Se marcan a mano los que interesan.
  const torneos = await sincronizarTorneosFACVCore();
  // 6. Los ENLACES de cada torneo: su página en la FACV con las bases y la de
  //    resultados. Va al final porque no depende de nada de lo anterior, y va AQUÍ
  //    —y no en un script a mano como los ELOs de la FIDE— porque facv.org sí se
  //    puede descargar desde Vercel. Si falla, no estropea el resto: los enlaces se
  //    quedan como estaban hasta el viernes siguiente.
  //    VA DESPUÉS DEL CALENDARIO, y el orden importa: un torneo que la FACV acaba de
  //    publicar tiene que existir en nuestra tabla antes de poder ponerle su enlace. Al
  //    revés, el torneo nuevo se quedaría sin URL hasta el viernes siguiente.
  const fichasTorneo = await sincronizarFichasTorneoFACV();

  let avisadosFichasNuevas = 0;
  if (ordenFuerza.creados > 0) {
    avisadosFichasNuevas = await avisarFichasNuevas(ordenFuerza.creados);
  }

  return {
    ordenFuerza,
    resultados,
    actas,
    eloActual,
    torneos,
    fichasTorneo,
    avisadosFichasNuevas,
  };
}

/**
 * Avisa por push a admin y junta de que el orden de fuerza trae fichas nuevas.
 *
 * Solo a ellos: es una tarea de gestión, no una noticia del club. Un socio no puede
 * hacer nada con esta información.
 */
async function avisarFichasNuevas(cuantas: number): Promise<number> {
  const admin = createAdminClient();

  const [{ data: porColumna }, { data: porRol }] = await Promise.all([
    admin.from("profiles").select("id").eq("is_admin", true),
    admin.from("member_roles").select("profile_id").in("rol", ["admin", "junta"]),
  ]);

  // La columna vieja O el rol nuevo, la misma regla que `is_admin()` en Postgres y que
  // `sesionActual()`. Un Set porque quien tenga las dos cosas no debe recibir dos push.
  const destinatarios = new Set<string>([
    ...(porColumna ?? []).map((p) => p.id as string),
    ...(porRol ?? []).map((r) => r.profile_id as string),
  ]);
  if (destinatarios.size === 0) return 0;

  const { guardados } = await avisar([...destinatarios], {
    tipo: "fichas_nuevas",
    titulo: cuantas === 1 ? "Ficha nueva en el club" : "Fichas nuevas en el club",
    cuerpo:
      cuantas === 1
        ? "El orden de fuerza de la FACV trae una ficha que no teníamos."
        : `El orden de fuerza de la FACV trae ${cuantas} fichas que no teníamos.`,
    url: "/club/orden-fuerza",
  });
  return guardados;
}
