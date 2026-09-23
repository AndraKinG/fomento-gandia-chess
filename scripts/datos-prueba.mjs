/**
 * Llena la base de datos de prueba para poder revisar la app EN USO.
 *
 *   node scripts/datos-prueba.mjs poner
 *   node scripts/datos-prueba.mjs quitar
 *
 * LA PREMISA DE SEGURIDAD DE AGOSTO YA NO SE CUMPLE, y por eso esto se reescribió el
 * 2026-09-23. Entonces decía "es seguro sobre producción porque solo existe UNA cuenta y
 * las seis tablas están a cero", así que `quitar` vaciaba tablas enteras. Hoy hay CUATRO
 * cuentas y hay datos de verdad dentro: 3 partidas en el repositorio, 3 torneos internos
 * ("Social 2026" G1, G2 y Final) y 5 respuestas de asistencia. Con el código viejo,
 * `quitar` se habría llevado las partidas y las asistencias por delante —y de hecho ni
 * llegaba a correr: su única guarda aborta en cuanto ve un torneo interno que no sea de
 * prueba, así que lo sembrado se habría quedado dentro sin forma limpia de sacarlo.
 *
 * AHORA `quitar` NO BORRA NADA QUE NO HAYA PUESTO `poner`. Dos mecanismos, y hacen falta
 * los dos:
 *
 * 1. **La marca `PRUEBA` en un campo de texto visible** — jornadas, partidas, torneos
 *    internos y coches. Se ve en la pantalla, así que no hay duda mirando; y se puede
 *    borrar por ella aunque se pierda el manifiesto.
 * 2. **Un manifiesto** (`scripts/.datos-prueba.json`, gitignorado) con los ids de lo que
 *    NO puede llevar marca: las respuestas de asistencia (no tienen ningún campo de
 *    texto) y los torneos REALES que se marcan como "de interés" (ahí solo se cambia un
 *    booleano de una fila que ya existía). Sin manifiesto, `quitar` deja esas dos cosas
 *    en su sitio y lo dice, en vez de adivinar.
 *
 * Y LAS TABLAS HIJAS NO SE TOCAN A MANO: `availability`, `lineups`, `club_rounds`,
 * `club_pairings`, `club_tournament_players` y `car_seats` cuelgan con `on delete
 * cascade` de algo que sí lleva marca. Borrar el padre se las lleva, y así no hay un
 * `delete` suelto que pueda apuntar a la fila equivocada.
 *
 * Los participantes son los socios REALES a propósito: con nombres inventados no se ve
 * si la pantalla aguanta un "Luca Luvisi Figueres Wright" de 28 caracteres.
 *
 * OJO AL SEMBRAR EN PRODUCCIÓN: los otros socios con cuenta ven esto mientras esté
 * puesto. Es para un rato de revisión, no para dejarlo.
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MARCA = "PRUEBA";
/** Dónde se apunta lo que no puede llevar la marca dentro. Gitignorado. */
const MANIFIESTO = "scripts/.datos-prueba.json";

const leerManifiesto = () => {
  try {
    return JSON.parse(readFileSync(MANIFIESTO, "utf8"));
  } catch {
    return null;
  }
};

const env = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const db = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("SUPABASE_SERVICE_ROLE_KEY"));

const comprobar = ({ error }) => {
  if (error) throw new Error(error.message);
};

/** Aleatorio reproducible: la misma semilla da siempre los mismos datos. */
let semilla = 20260807;
function aleatorio() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
}
const elegir = (lista) => lista[Math.floor(aleatorio() * lista.length)];

const PGN_EJEMPLO = `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4
15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6
21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+ 26. Qxe1 Kxf7
27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd6 1/2-1/2`;

const APERTURAS = [
  "Española", "Siciliana Najdorf", "Defensa Francesa", "Gambito de dama",
  "Defensa India de Rey", "Caro-Kann", "Inglesa", "Defensa Escandinava",
];

async function poner() {
  const { data: socios } = await db.from("players").select("id, nombre").order("nombre");
  if (!socios?.length) throw new Error("No hay fichas: nada que hacer");
  const { data: orden } = await db.from("force_order").select("player_id, numero, elo_oficial");
  const eloPorFicha = new Map((orden ?? []).map((f) => [f.player_id, f.elo_oficial ?? 1500]));
  const numeroPorFicha = new Map((orden ?? []).map((f) => [f.player_id, f.numero]));
  const { data: equipos } = await db.from("teams").select("id, nombre").order("nombre");
  // EL ADMIN, no "el primero que salga": desde que hay cuatro cuentas, `limit(1)` era
  // una lotería, y `creado_por` decide quién puede borrar el torneo luego.
  const { data: perfiles } = await db.from("profiles").select("id, player_id, is_admin");
  const perfil = (perfiles ?? []).find((x) => x.is_admin) ?? (perfiles ?? [])[0] ?? null;

  // Lo que no puede llevar la marca dentro se apunta aquí para poder deshacerlo luego.
  const creado = { fecha: new Date().toISOString(), asistencias: [], deInteres: [] };

  console.log(`${socios.length} socios, ${equipos.length} equipos\n`);

  // --- 1. Una jornada FUTURA, con disponibilidad y convocatoria ----------------
  //
  // La temporada 2026 terminó y sin una jornada por delante no se pueden revisar ni
  // la pantalla de disponibilidad ni la del capitán, que son las dos que más se usan
  // en temporada.
  const dentroDe = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    d.setHours(17, 0, 0, 0);
    return d.toISOString();
  };
  // El error SE COMPRUEBA. Sin esto, un fallo aquí dejaba la jornada a medias y el
  // script petaba diez líneas más abajo con un "cannot read properties of null",
  // que no dice nada de lo que pasó de verdad. Pasó el 2026-08-08.
  const { data: jornada, error: errorJornada } = await db
    .from("matches")
    .insert({
      team_id: equipos[0].id,
      ronda: 99,
      fecha_hora: dentroDe(9),
      rival: `${MARCA} — Amistoso Benimaclet`,
      es_local: false,
      sede: "Casa de la Cultura, Benimaclet",
      estado: "pendiente",
    })
    .select("id")
    .single();
  if (errorJornada || !jornada) {
    throw new Error(
      `No se ha podido crear la jornada de prueba: ${errorJornada?.message ?? "sin datos"}. ` +
        "Si dice que ya existe, lanza primero `node scripts/datos-prueba.mjs quitar`."
    );
  }
  console.log(`Jornada futura creada (R99, dentro de 9 días)`);

  // Disponibilidad de 24 socios, repartida.
  //
  // Los 24 PRIMEROS DEL ORDEN DE FUERZA, no los 24 primeros por orden alfabético: en
  // una jornada de verdad contesta sobre todo la gente que juega, y con una muestra
  // alfabética la convocatoria salía con infracciones del art. 51.5.c porque entre los
  // disponibles no había suficientes de los primeros puestos.
  const porOrden = [...socios].sort(
    (a, b) => (numeroPorFicha.get(a.id) ?? 999) - (numeroPorFicha.get(b.id) ?? 999)
  );
  const disponibilidad = porOrden.slice(0, 24).map((s, i) => ({
    match_id: jornada.id,
    player_id: s.id,
    estado: i % 7 === 0 ? "no_disponible" : i % 5 === 0 ? "duda" : "disponible",
  }));
  comprobar(await db.from("availability").insert(disponibilidad));
  console.log(`  ${disponibilidad.length} respuestas de disponibilidad`);

  // Convocatoria con los 8 primeros del ORDEN DE FUERZA que estén disponibles.
  //
  // Por número de orden y no por ELO: es el criterio del RGC, y ordenando por ELO la
  // convocatoria salía con infracciones de verdad (el validador las cazó — art. 51.5.c,
  // el equipo A solo puede alinear hasta la posición 18).
  const disponibles = disponibilidad
    .filter((d) => d.estado === "disponible")
    .map((d) => d.player_id)
    .sort((a, b) => (numeroPorFicha.get(a) ?? 999) - (numeroPorFicha.get(b) ?? 999))
    .slice(0, 8);
  const { data: lineup } = await db
    .from("lineups")
    .insert({ match_id: jornada.id, estado: "publicada", publicada_at: new Date().toISOString() })
    .select("id")
    .single();
  comprobar(
    await db.from("lineup_boards").insert(
      disponibles.map((playerId, i) => ({
        lineup_id: lineup.id,
        tablero: i + 1,
        player_id: playerId,
      }))
    )
  );
  console.log(`  convocatoria publicada con ${disponibles.length} tableros`);

  // --- 2. Torneos de fuera: quién va y coches ----------------------------------
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: proximos } = await db
    .from("tournaments")
    .select("id, nombre")
    .gte("fecha_fin", hoy)
    .order("fecha_inicio")
    .limit(3);

  for (const [n, torneo] of (proximos ?? []).entries()) {
    // SOLO SE APUNTA SI NO ESTABA YA MARCADO: si la junta marcó de verdad este torneo
    // como de interés, `quitar` no debe desmarcarlo después.
    const { data: antes } = await db
      .from("tournaments").select("de_interes").eq("id", torneo.id).single();
    if (!antes?.de_interes) {
      comprobar(await db.from("tournaments").update({ de_interes: true }).eq("id", torneo.id));
      creado.deInteres.push(torneo.id);
    }

    const cuantos = 9 - n * 2;
    // LAS RESPUESTAS QUE YA EXISTEN NO SE TOCAN. Hay 5 de verdad en la base, y volver a
    // insertar el mismo par (torneo, ficha) revienta contra la clave primaria: el script
    // moría a la mitad dejando media siembra dentro.
    const { data: yaRespondieron } = await db
      .from("tournament_attendance").select("player_id").eq("tournament_id", torneo.id);
    const ocupados = new Set((yaRespondieron ?? []).map((a) => a.player_id));
    const asistentes = socios.slice(n * 3, n * 3 + cuantos).filter((s) => !ocupados.has(s.id));
    const filas = asistentes.map((s, i) => ({
      tournament_id: torneo.id,
      player_id: s.id,
      estado: i % 6 === 0 ? "duda" : i % 9 === 0 ? "no_voy" : "voy",
    }));
    comprobar(await db.from("tournament_attendance").insert(filas));
    for (const f of filas) creado.asistencias.push([f.tournament_id, f.player_id]);
    // Un coche en los dos primeros, con pasajeros de los que van.
    if (n < 2) {
      const van = asistentes.filter((_, i) => i % 6 !== 0 && i % 9 !== 0);
      const { data: coche } = await db
        .from("cars")
        .insert({
          tournament_id: torneo.id,
          conductor_id: van[0].id,
          plazas: 4,
          hora_salida: "08:15",
          punto_salida: "Parking del Poliesportiu",
          // LA MARCA SIEMPRE, no solo en el primero: el segundo coche salía con `notas`
          // a null y era indistinguible de uno de verdad a la hora de limpiar.
          notas:
            n === 0
              ? `${MARCA}: volvemos en cuanto acabe la última ronda`
              : `${MARCA}: coche de ejemplo`,
        })
        .select("id")
        .single();
      const pasajeros = van.slice(1, 1 + (n === 0 ? 3 : 4));
      comprobar(
        await db.from("car_seats").insert(
          pasajeros.map((p) => ({ car_id: coche.id, player_id: p.id }))
        )
      );
      console.log(
        `  ${torneo.nombre}: ${asistentes.length} respuestas, 1 coche con ${pasajeros.length} pasajeros`
      );
    } else {
      console.log(`  ${torneo.nombre}: ${asistentes.length} respuestas, sin coche`);
    }
  }

  // --- 3. Repositorio de partidas ---------------------------------------------
  const RIVALES = [
    "Sanz Wawer, Daniel", "Komljenovic, Davorin", "Fenollar Jorda, Manuel",
    "Efimovich, Sergey", "Giaccio, Alfredo", "Granero Roca, Antonio",
    "Randazzo, Adrian", "Yurkovskiy, Ivan", "Mirete Bernabe, Marco Antonio",
    "Sala Espi, Antonio", "Boluda Nadal, Andres", "Vidal Rubiella, Salvador",
  ];
  const partidas = [];
  for (let i = 0; i < 34; i++) {
    const socio = socios[i % 14];
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (i * 11 + 3));
    partidas.push({
      player_id: socio.id,
      torneo_texto: `${MARCA} — ${elegir(["Open Ciutat de Sueca", "Interclubs", "Torneo del club", "Open Villa de Mislata"])}`,
      fecha: fecha.toISOString().slice(0, 10),
      ronda: (i % 9) + 1,
      rival_nombre: elegir(RIVALES),
      rival_elo: 1500 + Math.floor(aleatorio() * 700),
      mi_elo: eloPorFicha.get(socio.id) ?? 1600,
      color: i % 2 === 0 ? "blancas" : "negras",
      resultado: elegir(["1", "1", "0.5", "0", "0"]),
      apertura: elegir(APERTURAS),
      notas: i % 4 === 0 ? `${MARCA}: partida de ejemplo para revisar la pantalla.` : null,
      pgn: i % 3 === 0 ? PGN_EJEMPLO : null,
    });
  }
  comprobar(await db.from("games").insert(partidas));
  console.log(`\n${partidas.length} partidas en el repositorio`);

  // --- 4. Torneos internos ------------------------------------------------------
  // Uno terminado (liguilla, alimenta el ELO del club) y otro a medias (suizo).
  await torneoInterno({
    nombre: `${MARCA} — Torneo de Navidad`,
    sistema: "liguilla",
    jugadores: socios.slice(0, 8),
    rondasJugadas: 7,
    rondasTotales: 7,
    estado: "terminado",
    diasAtras: 120,
    eloPorFicha,
    creadoPor: perfil?.id ?? null,
  });
  await torneoInterno({
    nombre: `${MARCA} — Rápidas de verano`,
    sistema: "suizo",
    jugadores: socios.slice(8, 18),
    rondasJugadas: 3,
    rondasTotales: 5,
    estado: "en_curso",
    diasAtras: 14,
    eloPorFicha,
    creadoPor: perfil?.id ?? null,
  });

  writeFileSync(MANIFIESTO, JSON.stringify(creado, null, 2));
  console.log(
    `\nApuntado en ${MANIFIESTO}: ${creado.asistencias.length} asistencias y ` +
      `${creado.deInteres.length} torneos marcados de interés.`
  );
  console.log("Listo. Recuerda: `node scripts/datos-prueba.mjs quitar` cuando acabemos.");
}

/** Crea un torneo interno con sus rondas, emparejamientos y resultados. */
async function torneoInterno({
  nombre, sistema, jugadores, rondasJugadas, rondasTotales, estado, diasAtras,
  eloPorFicha, creadoPor,
}) {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - diasAtras);
  const { data: torneo } = await db
    .from("club_tournaments")
    .insert({
      nombre,
      sistema,
      rondas_totales: rondasTotales,
      estado,
      fecha_inicio: inicio.toISOString().slice(0, 10),
      notas: `${MARCA}: torneo de ejemplo.`,
      creado_por: creadoPor,
    })
    .select("id")
    .single();

  comprobar(
    await db.from("club_tournament_players").insert(
      jugadores.map((j) => ({
        tournament_id: torneo.id,
        player_id: j.id,
        elo_inicial: eloPorFicha.get(j.id) ?? 1500,
      }))
    )
  );

  // Emparejamiento sencillo por rotación: no es el algoritmo de la app, pero da
  // cruces válidos (nadie repite dentro de una ronda) que es lo que hace falta para
  // ver las pantallas y que el ELO del club se calcule con partidas de verdad.
  const n = jugadores.length;
  for (let r = 0; r < rondasJugadas; r++) {
    const { data: ronda } = await db
      .from("club_rounds")
      .insert({ tournament_id: torneo.id, numero: r + 1 })
      .select("id")
      .single();

    const rotados = [jugadores[0], ...jugadores.slice(1).map((_, i) => jugadores[1 + ((i + r) % (n - 1))])];
    const pares = [];
    for (let m = 0; m < n / 2; m++) {
      const a = rotados[m];
      const b = rotados[n - 1 - m];
      if (!a || !b || a.id === b.id) continue;
      // Los colores alternan por ronda, como en una liguilla de verdad.
      const blancas = (m + r) % 2 === 0 ? a : b;
      const negras = blancas === a ? b : a;
      pares.push({
        round_id: ronda.id,
        mesa: m + 1,
        blancas_id: blancas.id,
        negras_id: negras.id,
        resultado: elegir(["1", "1", "0.5", "0"]),
      });
    }
    // Uno a uno: el trigger de "nadie dos veces por ronda" comprueba fila a fila.
    for (const par of pares) comprobar(await db.from("club_pairings").insert(par));
  }
  console.log(`Torneo interno "${nombre}": ${jugadores.length} inscritos, ${rondasJugadas} rondas`);
}

async function quitar() {
  const manifiesto = leerManifiesto();
  let quedaAlgo = false;

  // --- 1. Lo que lleva la marca dentro -----------------------------------------
  //
  // SE BORRA EL PADRE Y CASCADE HACE EL RESTO: `availability`, `lineups`,
  // `lineup_boards`, `club_rounds`, `club_pairings`, `club_tournament_players` y
  // `car_seats` cuelgan con `on delete cascade`. Un `delete` suelto por cada tabla hija
  // es una oportunidad más de apuntar a la fila equivocada, y aquí no hace falta.
  const borrarMarcados = async (tabla, campo, etiqueta) => {
    const { data: filas, error } = await db
      .from(tabla).select("id").ilike(campo, `${MARCA}%`);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (!filas?.length) {
      console.log(`  0 ${etiqueta}`);
      return;
    }
    comprobar(await db.from(tabla).delete().in("id", filas.map((f) => f.id)));
    console.log(`  ${filas.length} ${etiqueta}`);
  };

  console.log("Borrando lo que lleva la marca:");
  await borrarMarcados("club_tournaments", "nombre", "torneos internos (con sus rondas y cruces)");
  await borrarMarcados("games", "torneo_texto", "partidas del repositorio");
  await borrarMarcados("cars", "notas", "coches (con sus plazas)");
  await borrarMarcados("matches", "rival", "jornadas (con su disponibilidad y convocatoria)");

  // --- 2. Lo que no puede llevarla: solo por manifiesto -------------------------
  //
  // Una respuesta de asistencia no tiene ningún campo de texto, y "de interés" es un
  // booleano de una fila que ya existía. Sin saber CUÁLES pusimos nosotros, la única
  // forma de limpiarlas sería vaciar la tabla o desmarcarlo todo — que es exactamente
  // lo que hacía la versión vieja y lo que se llevaba por delante los datos de verdad.
  if (!manifiesto) {
    console.log(
      `\nNo hay ${MANIFIESTO}, así que NO se tocan las respuestas de asistencia ni los ` +
        `torneos marcados de interés: sin él no se puede saber cuáles pusimos nosotros y ` +
        `cuáles son de verdad. Si hace falta, se quitan a mano desde la app.`
    );
    quedaAlgo = true;
  } else {
    const asistencias = manifiesto.asistencias ?? [];
    for (const [torneo, ficha] of asistencias) {
      comprobar(
        await db.from("tournament_attendance").delete()
          .eq("tournament_id", torneo).eq("player_id", ficha)
      );
    }
    const deInteres = manifiesto.deInteres ?? [];
    if (deInteres.length) {
      comprobar(
        await db.from("tournaments").update({ de_interes: false }).in("id", deInteres)
      );
    }
    console.log(
      `\nDel manifiesto: ${asistencias.length} respuestas de asistencia y ` +
        `${deInteres.length} torneos desmarcados de interés.`
    );
    rmSync(MANIFIESTO, { force: true });
  }

  // --- 3. Lo que queda, contado ------------------------------------------------
  const contar = async (t) => (await db.from(t).select("*", { count: "exact", head: true })).count;
  const { count: marcadas } = await db
    .from("games").select("*", { count: "exact", head: true }).ilike("torneo_texto", `${MARCA}%`);
  console.log("\nQueda en la base (todo esto es REAL, no se ha tocado):");
  for (const t of ["players", "force_order", "matches", "match_boards", "games",
                   "club_tournaments", "tournament_attendance", "cars", "tournaments"]) {
    console.log(`  ${String(await contar(t)).padStart(4)} ${t}`);
  }
  if (marcadas) {
    console.log(`\nOJO: quedan ${marcadas} partidas con la marca ${MARCA}. Revisa a mano.`);
    quedaAlgo = true;
  }
  if (!quedaAlgo) console.log("\nLimpio del todo.");
}

const accion = process.argv[2];
if (accion === "poner") await poner();
else if (accion === "quitar") await quitar();
else {
  console.error("Uso: node scripts/datos-prueba.mjs poner | quitar");
  process.exit(1);
}
