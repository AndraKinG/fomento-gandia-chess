/**
 * Copia de seguridad de los datos del club. Solo lee de la base; escribe en tu PC.
 *
 *   node scripts/copia-seguridad.mjs             hace una copia nueva
 *   node scripts/copia-seguridad.mjs comprobar   revisa que la última esté entera
 *
 * POR QUÉ (auditoría del 2026-10-08): desde el lanzamiento hay datos que no se pueden
 * volver a sacar de ningún sitio —las cuentas de los socios vinculadas a su ficha, los
 * motes, las partidas subidas, los torneos del club— y no existía ninguna copia que el
 * propietario pudiera restaurar. Lo que viene de la FACV se puede volver a importar; esto
 * no.
 *
 * POR LA API Y NO CON pg_dump, decisión del propietario: no hace falta instalar nada. La
 * contrapartida, que hay que tener clara: **la API no da las contraseñas**. Si se perdiera
 * la base entera, los socios volverían a registrarse con el código y a vincularse, pero
 * todo lo demás —fichas, motes, partidas, torneos, avisos— volvería tal cual.
 *
 * QUÉ COPIA:
 *  - todas las tablas, con la lista sacada de las MIGRACIONES y no escrita aquí: una
 *    tabla nueva entra sola en la copia. Si alguna no se puede leer, la copia se aborta
 *    entera — una copia a la que le falta una tabla y parece completa es peor que
 *    ninguna, porque nadie la mira hasta el día que hace falta.
 *  - las cuentas (id, email, fechas), sin contraseñas.
 *  - las fotos de perfil del bucket `fotos`.
 *  - un manifiesto con cuántas filas tenía cada tabla, que es lo que usa `comprobar`.
 *
 * DÓNDE: en una carpeta HERMANA del proyecto (`../copias-fomento-gandia`), FUERA del
 * repositorio, a propósito y comprobado al arrancar. El repo es PÚBLICO y la copia lleva
 * los correos de los socios, el código de acceso del club y las claves de las
 * suscripciones push. Con `COPIAS_DIR` se puede mandar a otro sitio, pero nunca dentro
 * del proyecto.
 *
 * SE GUARDAN LAS ÚLTIMAS 30; las más viejas se borran. Toda la base son unos 260 KB, así
 * que el límite es por orden, no por espacio.
 *
 * PAGINADO DE 1000 EN 1000 aunque hoy ninguna tabla llegue: PostgREST corta en 1000 filas
 * SIN AVISAR, y el día que `match_boards` pase de ahí una copia sin paginar se quedaría
 * con las 1000 primeras y diría que ha ido bien.
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const RAIZ = process.cwd();
const env = readFileSync(join(RAIZ, ".env.local"), "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const db = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const DESTINO = resolve(process.env.COPIAS_DIR || join(RAIZ, "..", "copias-fomento-gandia"));
const GUARDAR = 30;
const POR_PAGINA = 1000;
const PATRON_COPIA = /^\d{4}-\d{2}-\d{2}_\d{4}$/;

// NUNCA DENTRO DEL REPO. Se comprueba con la ruta ya resuelta, no con el texto, para que
// un `COPIAS_DIR=./algo` no se cuele.
const rel = relative(RAIZ, DESTINO);
if (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel)) {
  console.error(`La carpeta de copias está DENTRO del proyecto (${DESTINO}).`);
  console.error("El repo es público y la copia lleva datos personales. Elige otra.");
  process.exit(1);
}

/** Las tablas vivas según las migraciones: creadas y no borradas después. */
function tablasDeLasMigraciones() {
  const carpeta = join(RAIZ, "supabase", "migrations");
  const sql = readdirSync(carpeta)
    .sort()
    .map((f) => readFileSync(join(carpeta, f), "utf8"))
    .join("\n")
    .toLowerCase();
  const creadas = new Set([...sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?"?(\w+)/g)].map((m) => m[1]));
  const borradas = new Set([...sql.matchAll(/drop table(?: if exists)?\s+(?:public\.)?"?(\w+)/g)].map((m) => m[1]));
  return [...creadas].filter((t) => !borradas.has(t)).sort();
}

async function leerTabla(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { data, error } = await db
      .from(tabla)
      .select("*")
      .range(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...data);
    if (data.length < POR_PAGINA) return filas;
  }
}

async function leerCuentas() {
  const cuentas = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) throw new Error(`cuentas: ${error.message}`);
    // SIN CONTRASEÑAS: la API no las da. Y se guarda solo lo que sirve para reconstruir,
    // no el objeto entero —que trae metadatos de sesión que no hacen falta para nada.
    cuentas.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        creada: u.created_at,
        ultimo_acceso: u.last_sign_in_at,
        confirmada: Boolean(u.email_confirmed_at),
      }))
    );
    if (data.users.length < POR_PAGINA) return cuentas;
  }
}

/** Todos los ficheros del bucket, entrando en carpetas. */
async function listarFotos(prefijo = "") {
  const { data, error } = await db.storage.from("fotos").list(prefijo, { limit: 1000 });
  if (error) throw new Error(`fotos: ${error.message}`);
  const ficheros = [];
  for (const e of data) {
    const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
    // En Storage una "carpeta" es una entrada sin id.
    if (e.id === null) ficheros.push(...(await listarFotos(ruta)));
    else ficheros.push(ruta);
  }
  return ficheros;
}

function marcaDeTiempo() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}`;
}

function copiasExistentes() {
  if (!existsSync(DESTINO)) return [];
  return readdirSync(DESTINO).filter((n) => PATRON_COPIA.test(n)).sort();
}

async function hacerCopia() {
  const carpeta = join(DESTINO, marcaDeTiempo());
  mkdirSync(join(carpeta, "tablas"), { recursive: true });
  const manifiesto = { creada: new Date().toISOString(), tablas: {}, cuentas: 0, fotos: 0 };
  try {
    manifiesto.commit = execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim();
  } catch {
    manifiesto.commit = null;
  }

  const tablas = tablasDeLasMigraciones();
  for (const t of tablas) {
    const filas = await leerTabla(t);
    writeFileSync(join(carpeta, "tablas", `${t}.json`), JSON.stringify(filas, null, 1));
    manifiesto.tablas[t] = filas.length;
  }

  const cuentas = await leerCuentas();
  writeFileSync(join(carpeta, "cuentas.json"), JSON.stringify(cuentas, null, 1));
  manifiesto.cuentas = cuentas.length;

  const fotos = await listarFotos();
  for (const ruta of fotos) {
    const { data, error } = await db.storage.from("fotos").download(ruta);
    if (error) throw new Error(`foto ${ruta}: ${error.message}`);
    const destino = join(carpeta, "fotos", ...ruta.split("/"));
    mkdirSync(dirname(destino), { recursive: true });
    await pipeline(Readable.fromWeb(data.stream()), createWriteStream(destino));
  }
  manifiesto.fotos = fotos.length;

  // EL MANIFIESTO SE ESCRIBE EL ÚLTIMO: si la copia se corta a medias, la carpeta queda
  // sin manifiesto y `comprobar` la detecta como rota en vez de darla por buena.
  writeFileSync(join(carpeta, "manifiesto.json"), JSON.stringify(manifiesto, null, 1));

  const filas = Object.values(manifiesto.tablas).reduce((a, n) => a + n, 0);
  console.log(`Copia hecha en ${carpeta}`);
  console.log(`  ${tablas.length} tablas, ${filas} filas, ${cuentas.length} cuentas, ${fotos.length} fotos`);

  // Las más viejas fuera, solo las que tienen forma de copia: nunca se borra nada más.
  const todas = copiasExistentes();
  const sobran = todas.slice(0, Math.max(0, todas.length - GUARDAR));
  for (const vieja of sobran) rmSync(join(DESTINO, vieja), { recursive: true, force: true });
  if (sobran.length) console.log(`  borradas ${sobran.length} copias viejas (se guardan las ${GUARDAR} últimas)`);
}

/**
 * ¿La última copia está entera? Y de paso, cuánto ha cambiado la base desde entonces.
 *
 * UNA COPIA QUE NUNCA SE HA MIRADO NO ES UNA COPIA: el día que hace falta es cuando se
 * descubre que estaba vacía. Esto revisa que cada tabla del manifiesto tenga su fichero,
 * que se pueda leer y que tenga las filas que dijo tener.
 */
async function comprobar() {
  const todas = copiasExistentes();
  if (!todas.length) {
    console.error(`No hay ninguna copia en ${DESTINO}`);
    process.exit(1);
  }
  const ultima = todas.at(-1);
  const carpeta = join(DESTINO, ultima);
  const rutaManifiesto = join(carpeta, "manifiesto.json");
  if (!existsSync(rutaManifiesto)) {
    console.error(`La copia ${ultima} NO tiene manifiesto: se cortó a medias. No sirve.`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(rutaManifiesto, "utf8"));
  const problemas = [];

  for (const [tabla, esperadas] of Object.entries(m.tablas)) {
    const f = join(carpeta, "tablas", `${tabla}.json`);
    if (!existsSync(f)) {
      problemas.push(`falta el fichero de ${tabla}`);
      continue;
    }
    const filas = JSON.parse(readFileSync(f, "utf8"));
    if (filas.length !== esperadas) problemas.push(`${tabla}: tiene ${filas.length} filas y debía ${esperadas}`);
  }
  // Una tabla que existe hoy y no está en la copia: se creó después, o la copia es vieja.
  for (const t of tablasDeLasMigraciones()) {
    if (!(t in m.tablas)) problemas.push(`la tabla ${t} no está en la copia`);
  }
  const fotos = existsSync(join(carpeta, "fotos"))
    ? readdirSync(join(carpeta, "fotos"), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length
    : 0;
  if (fotos !== m.fotos) problemas.push(`fotos: hay ${fotos} y debían ${m.fotos}`);

  const horas = Math.round((Date.now() - new Date(m.creada).getTime()) / 3600000);
  console.log(`Última copia: ${ultima} (hace ${horas} h), ${todas.length} copias guardadas`);
  if (horas > 48) problemas.push(`la última copia tiene ${horas} horas: la tarea diaria no está corriendo`);

  // Qué ha cambiado desde la copia: no es un error, es para saber cuánto se perdería hoy.
  const cambios = [];
  for (const [tabla, antes] of Object.entries(m.tablas)) {
    const { count } = await db.from(tabla).select("*", { count: "exact", head: true });
    if (count !== null && count !== antes) cambios.push(`${tabla} ${antes}→${count}`);
  }

  if (problemas.length) {
    console.log("\nPROBLEMAS:");
    for (const p of problemas) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log("Entera: todas las tablas, filas, cuentas y fotos donde dice el manifiesto.");
  console.log(
    cambios.length
      ? `Desde entonces ha cambiado: ${cambios.join(", ")}`
      : "La base no ha cambiado desde la copia."
  );
}

if (process.argv[2] === "comprobar") await comprobar();
else await hacerCopia();
