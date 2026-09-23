/**
 * Pasa los datos que HAY EN LA BASE por los módulos de verdad de la app y avisa de lo
 * que no cuadra. Solo lectura: no escribe ni borra nada.
 *
 *   node --experimental-strip-types --import ./scripts/cargar-ts.mjs scripts/revisar-coherencia.mjs
 *
 * POR QUÉ EXISTE, y por qué no lo sustituye hacer clic por la app: los tests cubren los
 * módulos con datos inventados, y hacer clic cubre la pantalla que miras. Lo que no
 * cubre ninguno de los dos es **el cruce entre los datos reales y las reglas**: una
 * convocatoria que infringe el RGC, un socio del orden de fuerza sin ficha, dos motes
 * iguales, un emparejamiento que apunta a alguien que no está inscrito. Eso no falla:
 * sale en pantalla como si fuera correcto.
 *
 * SE LLAMA ANTES DE UN LANZAMIENTO y después de sembrar datos de prueba. Cada bloque
 * dice qué mira y por qué importa; los avisos van con el dato concreto, nunca "hay un
 * problema en alguna parte".
 *
 * NO FALLA POR ENCONTRAR COSAS: termina con 0 si todo cuadra y con 1 si hay algo que
 * mirar, para que se pueda encadenar, pero lo importante es lo que imprime.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { validar } from "../src/lib/validador/index.ts";
import { cargarContextoValidacion } from "../src/lib/convocatorias/contexto-bd.ts";
import { clasificar } from "../src/lib/club/clasificacion.ts";
import { eloParaOrdenar } from "../src/lib/elo/ranking-oficial.ts";
import { nombreVisible } from "../src/lib/club/nombre-socio.ts";
import { claveMote } from "../src/lib/club/mote.ts";

const env = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const db = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("SUPABASE_SERVICE_ROLE_KEY"));

// LOS MÓDULOS DE LA APP LEEN `process.env`, no este fichero: `cargarContextoValidacion`
// se monta su propio cliente admin por dentro. Sin esto reventaba con "supabaseUrl is
// required", que parece un fallo del validador y es solo que le faltaba el entorno.
for (const clave of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  process.env[clave] ??= leer(clave);
}

let problemas = 0;
const titulo = (t) => console.log(`\n── ${t}`);
const bien = (t) => console.log(`   ok   ${t}`);
const mal = (t) => {
  problemas++;
  console.log(`   AVISO ${t}`);
};

// ---------------------------------------------------------------------------
// 1. Fichas y orden de fuerza
// ---------------------------------------------------------------------------
titulo("Fichas y orden de fuerza");
const { data: fichas } = await db
  .from("players")
  .select("id, nombre, apodo, apodo_solicitado, activo, de_prueba, fide_id, elo_fide, elo_otro");
const { data: orden } = await db
  .from("force_order")
  .select("player_id, numero, bis_index, elo_oficial, season_id");

const porId = new Map(fichas.map((f) => [f.id, f]));

// Una fila del documento que apunta a una ficha borrada deja un hueco en la lista
// SIN error: la pantalla pinta "Socio" y nadie sabe de quién era ese número.
const huerfanas = orden.filter((f) => !porId.has(f.player_id));
if (huerfanas.length) mal(`${huerfanas.length} filas del orden de fuerza apuntan a fichas que ya no existen`);
else bien(`las ${orden.length} filas del orden de fuerza tienen ficha`);

// Dos personas con el mismo número de orden es una convocatoria ambigua: el RGC ordena
// por ese número, y con un empate el desempate lo decide el orden en que salgan de la
// base, que no es ningún criterio.
const claves = orden.map((f) => `${f.season_id}/${f.numero}/${f.bis_index}`);
const repes = claves.filter((c, i) => claves.indexOf(c) !== i);
if (repes.length) mal(`números de orden repetidos: ${[...new Set(repes)].join(", ")}`);
else bien("ningún número de orden repetido");

// El mote es la identidad del socio en toda la app. Dos iguales y no se sabe quién
// jugó qué.
const motes = new Map();
for (const f of fichas) {
  for (const m of [f.apodo, f.apodo_solicitado]) {
    if (!m) continue;
    const k = claveMote(m);
    if (motes.has(k)) mal(`mote repetido "${m}": ${motes.get(k)} y ${f.nombre}`);
    else motes.set(k, f.nombre);
  }
}
if (motes.size) bien(`${motes.size} motes, todos distintos`);

// Un socio sin NINGÚN ELO se va al final de cualquier lista ordenada, y si son muchos
// la lista deja de ordenar nada.
const sinElo = fichas.filter(
  (f) =>
    f.activo !== false &&
    !f.de_prueba &&
    eloParaOrdenar({
      numero: null,
      bisIndex: 0,
      nombre: f.nombre,
      eloOficial: orden.find((o) => o.player_id === f.id)?.elo_oficial ?? null,
      eloFide: f.elo_fide,
      eloOtro: f.elo_otro,
    }) === null
);
if (sinElo.length) {
  mal(
    `${sinElo.length} socios sin ningún ELO (van al final de las listas): ` +
      sinElo.map((f) => nombreVisible(f)).slice(0, 5).join(", ")
  );
} else bien("todos los socios activos tienen algún ELO con el que ordenar");

// ---------------------------------------------------------------------------
// 2. Convocatorias publicadas contra el RGC
// ---------------------------------------------------------------------------
titulo("Convocatorias publicadas, contra el reglamento");
const { data: lineups } = await db
  .from("lineups")
  .select("id, match_id, estado, matches(rival, ronda, team_id)")
  .eq("estado", "publicada");

if (!lineups?.length) bien("no hay ninguna convocatoria publicada");
for (const l of lineups ?? []) {
  const { data: tableros } = await db
    .from("lineup_boards")
    .select("tablero, player_id")
    .eq("lineup_id", l.id)
    .order("tablero");
  const rival = l.matches?.rival ?? "?";
  try {
    const ctx = await cargarContextoValidacion(l.match_id);
    const infracciones = validar(
      ctx.orden,
      tableros.map((t) => ({ tablero: t.tablero, playerId: t.player_id })),
      ctx.config,
      ctx.ctx
    );
    const errores = infracciones.filter((i) => i.nivel === "error");
    if (errores.length) {
      mal(
        `"${rival}": ${errores.length} infracción(es) — ` +
          errores.map((e) => `art. ${e.articulo}: ${e.mensaje}`).join(" | ")
      );
    } else bien(`"${rival}": ${tableros.length} tableros, sin infracciones`);
  } catch (e) {
    mal(`"${rival}": no se ha podido validar — ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Torneos del club
// ---------------------------------------------------------------------------
titulo("Torneos del club");
const { data: torneos } = await db
  .from("club_tournaments")
  .select("id, nombre, sistema, estado, rondas_totales");

for (const t of torneos ?? []) {
  const { data: inscritos } = await db
    .from("club_tournament_players")
    .select("player_id")
    .eq("tournament_id", t.id);
  const { data: rondas } = await db
    .from("club_rounds")
    .select("id, numero")
    .eq("tournament_id", t.id)
    .order("numero");
  const ids = new Set(inscritos.map((i) => i.player_id));

  const rondasJugadas = [];
  let cruces = 0;
  for (const r of rondas ?? []) {
    const { data: pares } = await db
      .from("club_pairings")
      .select("mesa, blancas_id, negras_id, resultado")
      .eq("round_id", r.id);
    cruces += pares.length;

    // Un emparejamiento con alguien que no está inscrito sale en pantalla como una
    // partida normal, pero no puntúa en la clasificación: la tabla y los cruces
    // cuentan cosas distintas y no hay forma de ver por qué.
    for (const p of pares) {
      for (const lado of [p.blancas_id, p.negras_id]) {
        if (lado && !ids.has(lado)) {
          mal(`"${t.nombre}" ronda ${r.numero}: juega alguien que no está inscrito`);
        }
      }
      if (p.blancas_id && p.blancas_id === p.negras_id) {
        mal(`"${t.nombre}" ronda ${r.numero}: alguien emparejado consigo mismo`);
      }
    }
    // Nadie puede jugar dos veces en la misma ronda.
    const enLaRonda = pares.flatMap((p) => [p.blancas_id, p.negras_id]).filter(Boolean);
    if (new Set(enLaRonda).size !== enLaRonda.length) {
      mal(`"${t.nombre}" ronda ${r.numero}: alguien aparece en dos mesas`);
    }
    // El descanso va en su propio campo, no como un emparejamiento sin rival: es como
    // lo espera `clasificar`, y en el club un descanso puntúa 0,5.
    const conRival = pares.filter((p) => p.negras_id);
    const descansa = pares.find((p) => !p.negras_id)?.blancas_id ?? null;
    rondasJugadas.push({
      numero: r.numero,
      emparejamientos: conRival.map((p) => ({
        blancas: p.blancas_id,
        negras: p.negras_id,
        resultado: p.resultado,
      })),
      descansa,
    });
  }

  // La clasificación tiene que cuadrar con lo jugado: la suma de puntos de todos es,
  // como mucho, una por partida (más los descansos).
  try {
    const tabla = clasificar(
      rondasJugadas,
      [...ids].map((ficha) => ({ ficha, eloInicial: 1500 }))
    );
    const suma = tabla.reduce((a, f) => a + f.puntos, 0);
    const conResultado = rondasJugadas.flatMap((r) =>
      r.emparejamientos.filter((e) => e.resultado !== null)
    ).length;
    const descansos = rondasJugadas.filter((r) => r.descansa).length;
    const esperado = conResultado + descansos * 0.5;
    if (Math.abs(suma - esperado) > 0.001) {
      mal(`"${t.nombre}": los puntos suman ${suma} y deberían sumar ${esperado}`);
    } else {
      bien(
        `"${t.nombre}" (${t.sistema}, ${t.estado}): ${ids.size} inscritos, ` +
          `${rondas.length} rondas, ${cruces} cruces, puntos cuadran`
      );
    }
  } catch (e) {
    mal(`"${t.nombre}": la clasificación revienta — ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Coches y asistencia a torneos de fuera
// ---------------------------------------------------------------------------
titulo("Torneos de fuera: quién va y coches");
const { data: coches } = await db
  .from("cars")
  .select("id, tournament_id, conductor_id, plazas");
const { data: plazas } = await db.from("car_seats").select("car_id, player_id, tournament_id");
const { data: asistencia } = await db
  .from("tournament_attendance")
  .select("tournament_id, player_id, estado");

for (const c of coches ?? []) {
  const suyas = plazas.filter((p) => p.car_id === c.id);
  // Más pasajeros que plazas es un coche en el que alguien se queda en tierra el día
  // del torneo, y en pantalla no se ve hasta que se cuentan a mano.
  if (suyas.length > c.plazas) {
    mal(`un coche lleva ${suyas.length} pasajeros y solo tiene ${c.plazas} plazas`);
  }
  // Ir en un coche y haber dicho que no vas es la contradicción que deja a alguien
  // fuera de la lista de asistentes pero ocupando una plaza.
  for (const p of suyas) {
    const dijo = asistencia.find(
      (a) => a.tournament_id === c.tournament_id && a.player_id === p.player_id
    );
    if (dijo && dijo.estado === "no_voy") {
      mal(`alguien va en un coche a un torneo al que ha dicho que NO va`);
    }
  }
  if (!porId.has(c.conductor_id)) mal("un coche tiene un conductor sin ficha");
}
if (coches?.length) bien(`${coches.length} coches, ${plazas.length} plazas ocupadas, revisados`);
else bien("no hay coches");

// ---------------------------------------------------------------------------
// 5. Bajas: la regla es que no las ve nadie
// ---------------------------------------------------------------------------
titulo("Bajas");
const bajas = fichas.filter((f) => f.activo === false);
if (!bajas.length) bien("no hay ninguna baja");
for (const b of bajas) {
  const enOrden = orden.some((o) => o.player_id === b.id);
  const { count: enTorneos } = await db
    .from("club_tournament_players")
    .select("*", { count: "exact", head: true })
    .eq("player_id", b.id);
  console.log(
    `   ${nombreVisible(b)}: ${enOrden ? "sigue en el documento FACV (correcto, se filtra al pintar)" : "fuera del documento"}` +
      `, inscrito en ${enTorneos} torneos del club`
  );
}

// ---------------------------------------------------------------------------
console.log(
  problemas === 0
    ? "\nTodo cuadra."
    : `\n${problemas} cosa(s) que mirar.`
);
process.exit(problemas === 0 ? 0 : 1);
