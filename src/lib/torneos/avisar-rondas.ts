import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";
import { horaCorta, MINUTOS_DE_AVISO, tocaAvisar } from "./hora-de-ronda";
import { nombreDeFila } from "@/lib/club/nombre-socio";

/**
 * Avisa a quien juega una ronda que empieza en una hora.
 *
 * Lo llama el endpoint `/api/cron/rondas`, y a ese endpoint lo llama pg_cron cada
 * cinco minutos desde dentro de Supabase (ver la migración 0037: el cron de Vercel
 * en el plan gratuito solo se despierta una vez al día y esto tiene que despertarse
 * a la hora que haga falta).
 *
 * NUNCA LANZA. Un fallo aquí no puede tumbar la pasada del programador: se traza y
 * se sigue, y la ronda que se quedó sin marca la recoge la pasada siguiente
 * mientras siga dentro de la ventana.
 *
 * QUIÉN RECIBE EL AVISO: los dos jugadores de cada cruce sin resultado. Quien
 * descansa no juega, así que no se le molesta. Un cruce ya jugado (se adelantó la
 * partida) tampoco avisa a nadie: su hora ya no importa.
 *
 * UN AVISO POR CRUCE Y NO POR JUGADOR: el texto ("Ana vs Bea") vale igual para los
 * dos, así que una sola llamada a `avisar()` cubre la mesa entera. Personalizarlo
 * ("juegas contra Bea") obligaría a una llamada por persona, con sus consultas, para
 * ganar una palabra.
 */
export async function avisarRondasProximas(): Promise<{
  rondas: number;
  avisados: number;
}> {
  try {
    const admin = createAdminClient();
    const ahora = new Date();
    const hasta = new Date(ahora.getTime() + MINUTOS_DE_AVISO * 60_000);

    // Prefiltro por índice (`club_rounds_fecha_hora`): lo normal es que no
    // devuelva ninguna fila, y esa es la pasada barata que se ejecuta 288 veces al
    // día. Quien decide de verdad es `tocaAvisar`, que está probado.
    const { data: rondas, error } = await admin
      .from("club_rounds")
      .select(
        "id, numero, fecha_hora, aviso_enviado_en, tournament_id, club_tournaments(nombre, estado)"
      )
      .is("aviso_enviado_en", null)
      .gte("fecha_hora", ahora.toISOString())
      .lte("fecha_hora", hasta.toISOString());

    if (error) {
      console.error("[rondas] no se pudieron leer las rondas próximas", error.message);
      return { rondas: 0, avisados: 0 };
    }

    const candidatas = ((rondas ?? []) as unknown as FilaRonda[]).filter(
      (r) =>
        // Un torneo cerrado no avisa de nada, aunque le quedara una hora puesta.
        r.club_tournaments?.estado !== "terminado" &&
        tocaAvisar({ fechaHora: r.fecha_hora, avisoEnviadoEn: r.aviso_enviado_en }, ahora)
    );
    if (candidatas.length === 0) return { rondas: 0, avisados: 0 };

    let avisados = 0;
    let hechas = 0;

    for (const ronda of candidatas) {
      // SE MARCA ANTES DE ENVIAR, y con la condición `aviso_enviado_en is null` en
      // el propio UPDATE: eso lo convierte en una reserva atómica. Si dos pasadas
      // se solapan (o si pg_cron dispara dos veces), solo una recibe la fila de
      // vuelta y solo esa manda el aviso. Al revés —enviar y luego marcar— el
      // riesgo es doce pushes por ronda, que es mucho peor que el caso raro de
      // perder uno si el proceso muere justo aquí (y ese caso lo tapa el push del
      // día siguiente: la ronda de mañana es otra fila).
      const { data: reservada } = await admin
        .from("club_rounds")
        .update({ aviso_enviado_en: new Date().toISOString() })
        .eq("id", ronda.id)
        .is("aviso_enviado_en", null)
        .select("id")
        .maybeSingle();
      if (!reservada) continue;

      const { data: cruces } = await admin
        .from("club_pairings")
        .select("mesa, blancas_id, negras_id, blancas:blancas_id(nombre, apodo), negras:negras_id(nombre, apodo)")
        .eq("round_id", ronda.id)
        .is("resultado", null)
        .order("mesa");

      const pares = (cruces ?? []) as unknown as FilaCruce[];
      if (pares.length === 0) continue;

      // De ficha a cuenta: `notifications.profile_id` es el id de la CUENTA, no el
      // de la ficha. Quien no se ha registrado todavía no tiene cuenta y se queda
      // fuera sin más — no es un fallo, es que no hay dónde avisarle.
      const fichas = pares.flatMap((p) => [p.blancas_id, p.negras_id]);
      const { data: perfiles } = await admin
        .from("profiles")
        .select("id, player_id")
        .in("player_id", fichas);
      const cuentaDeFicha = new Map(
        ((perfiles ?? []) as { id: string; player_id: string }[]).map((p) => [p.player_id, p.id])
      );

      const nombreTorneo = ronda.club_tournaments?.nombre ?? "Torneo del club";
      const hora = horaCorta(ronda.fecha_hora!);
      const url = `/club/jugar/torneos/${ronda.tournament_id}`;

      for (const par of pares) {
        const destinatarios = [par.blancas_id, par.negras_id]
          .map((ficha) => cuentaDeFicha.get(ficha))
          .filter((id): id is string => Boolean(id));
        if (destinatarios.length === 0) continue;

        const r = await avisar(destinatarios, {
          tipo: "ronda_hora",
          titulo: `Tu ronda es a las ${hora}`,
          cuerpo: `${nombreTorneo} · ronda ${ronda.numero}: ${nombreDeFila(par.blancas)} vs ${nombreDeFila(par.negras)}.`,
          url,
        });
        avisados += r.guardados;
      }

      hechas++;
    }

    return { rondas: hechas, avisados };
  } catch (err) {
    console.error("[rondas] avisarRondasProximas ha fallado por completo", err);
    return { rondas: 0, avisados: 0 };
  }
}

type FilaRonda = {
  id: string;
  numero: number;
  fecha_hora: string | null;
  aviso_enviado_en: string | null;
  tournament_id: string;
  club_tournaments: { nombre: string; estado: string } | null;
};

type FilaCruce = {
  mesa: number;
  blancas_id: string;
  negras_id: string;
  blancas: { nombre: string } | null;
  negras: { nombre: string } | null;
};
