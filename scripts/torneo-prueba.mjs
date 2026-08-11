/**
 * Monta un torneo interno de DOS jugadores con una ronda ya emparejada, para poder
 * probar de verdad una partida en vivo.
 *
 *   node scripts/torneo-prueba.mjs poner
 *   node scripts/torneo-prueba.mjs quitar
 *
 * POR QUÉ HACE FALTA UN SCRIPT: por la app se puede hacer todo esto a mano (crear
 * torneo, inscribir, generar ronda), pero son seis pantallas y hay que repetirlo
 * cada vez que se quiere probar. Esto lo deja en un comando y lo quita en otro.
 *
 * QUÉ NO HACE: NO crea ninguna cuenta. Para jugar hacen falta DOS sesiones a la
 * vez, y las cuentas son cosa del propietario — ver el final de la ejecución, que
 * dice qué opciones hay.
 *
 * MARCA: el torneo lleva `PRUEBA` en el nombre, como el resto de datos de prueba.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MARCA = "PRUEBA";
const NOMBRE = `${MARCA} — Partida en vivo`;
/** Rápidas cortas: para probar el reloj hace falta verlo bajar. */
const BASE_MIN = 3;
const INCREMENTO_S = 2;

const env = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const db = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("SUPABASE_SERVICE_ROLE_KEY"));

const comprobar = ({ error }) => {
  if (error) throw new Error(error.message);
};

async function poner() {
  // El torneo se monta alrededor de quien tiene cuenta: si no, no lo puede jugar.
  const { data: perfil } = await db
    .from("profiles")
    .select("player_id, players(nombre)")
    .not("player_id", "is", null)
    .limit(1)
    .single();
  if (!perfil?.player_id) throw new Error("No hay ninguna cuenta con ficha del club.");

  // El rival: el primero del orden de fuerza que no sea uno mismo. Da igual quién
  // sea, pero que sea una ficha real hace la prueba más parecida a lo de verdad.
  const { data: rival } = await db
    .from("players")
    .select("id, nombre")
    .eq("activo", true)
    .neq("id", perfil.player_id)
    .order("nombre")
    .limit(1)
    .single();
  if (!rival) throw new Error("No hay otra ficha con la que emparejar.");

  const yo = { id: perfil.player_id, nombre: perfil.players?.nombre ?? "Tú" };
  console.log(`${yo.nombre}  vs  ${rival.nombre}\n`);

  const { data: torneo, error: errorTorneo } = await db
    .from("club_tournaments")
    .insert({
      nombre: NOMBRE,
      sistema: "liguilla",
      rondas_totales: 1,
      estado: "en_curso",
      fecha_inicio: new Date().toISOString().slice(0, 10),
      notas: `${MARCA}: torneo para probar las partidas en vivo.`,
      base_min: BASE_MIN,
      incremento_s: INCREMENTO_S,
    })
    .select("id")
    .single();
  if (errorTorneo || !torneo) {
    throw new Error(
      `No se ha podido crear el torneo: ${errorTorneo?.message ?? "sin datos"}. ` +
        "Si ya existe, lanza antes `node scripts/torneo-prueba.mjs quitar`."
    );
  }

  // ELO de partida: 1000 para todos, como hace la app al inscribir (decisión
  // del propietario, 2026-08-11 — ver ELO_POR_DEFECTO en src/lib/club/elo.ts).
  comprobar(
    await db.from("club_tournament_players").insert([
      { tournament_id: torneo.id, player_id: yo.id, elo_inicial: 1000 },
      { tournament_id: torneo.id, player_id: rival.id, elo_inicial: 1000 },
    ])
  );

  const { data: ronda, error: errorRonda } = await db
    .from("club_rounds")
    .insert({ tournament_id: torneo.id, numero: 1 })
    .select("id")
    .single();
  if (errorRonda || !ronda) throw new Error(`No se ha podido crear la ronda: ${errorRonda?.message}`);

  // Blancas para quien tiene cuenta, para que la primera jugada la pueda hacer él y
  // se vea arrancar el reloj sin depender de nadie.
  comprobar(
    await db.from("club_pairings").insert({
      round_id: ronda.id,
      mesa: 1,
      blancas_id: yo.id,
      negras_id: rival.id,
    })
  );

  console.log(`Torneo "${NOMBRE}" creado: liguilla de 1 ronda, ${BASE_MIN}+${INCREMENTO_S}.`);
  console.log(`  Tú llevas BLANCAS, así que mueves primero.`);
  console.log(`\nEstá en: /club/torneos/interno`);
  console.log(`Pulsa "Jugar aquí" en tu cruce y se abre la mesa.\n`);
  console.log("PARA JUGAR DE VERDAD HACEN FALTA DOS SESIONES:");
  console.log("  · lo más fiel: que un socio entre con su cuenta desde su móvil;");
  console.log("  · para probarlo tú solo, necesitarías una segunda cuenta vinculada");
  console.log(`    a la ficha de ${rival.nombre}, y eso lo tienes que crear tú.`);
  console.log("\nSin la segunda sesión se puede comprobar igualmente: que la mesa abre,");
  console.log("que tu reloj baja, que la jugada se guarda y que el rival no puede");
  console.log("moverse porque no es su turno.");
  console.log("\nPara quitarlo: node scripts/torneo-prueba.mjs quitar");
}

async function quitar() {
  const { data: torneos } = await db
    .from("club_tournaments")
    .select("id")
    .ilike("nombre", `%${MARCA}%`);
  const ids = (torneos ?? []).map((t) => t.id);
  if (ids.length === 0) {
    console.log("No hay ningún torneo de prueba que quitar.");
    return;
  }

  // Las partidas en vivo de esos emparejamientos primero: la clave foránea es
  // `on delete set null`, así que sin esto quedarían mesas huérfanas dando vueltas.
  const { data: rondas } = await db.from("club_rounds").select("id").in("tournament_id", ids);
  const idsRonda = (rondas ?? []).map((r) => r.id);
  if (idsRonda.length > 0) {
    const { data: cruces } = await db
      .from("club_pairings")
      .select("id")
      .in("round_id", idsRonda);
    const idsCruce = (cruces ?? []).map((c) => c.id);
    if (idsCruce.length > 0) {
      comprobar(await db.from("live_games").delete().in("club_pairing_id", idsCruce));
    }
  }

  // El torneo se lleva por delante rondas y emparejamientos (`on delete cascade`).
  comprobar(await db.from("club_tournaments").delete().in("id", ids));
  console.log(`Quitados ${ids.length} torneo(s) de prueba y sus partidas en vivo.`);
}

const orden = process.argv[2];
if (orden === "poner") await poner();
else if (orden === "quitar") await quitar();
else {
  console.error("Uso: node scripts/torneo-prueba.mjs poner | quitar");
  process.exit(1);
}
