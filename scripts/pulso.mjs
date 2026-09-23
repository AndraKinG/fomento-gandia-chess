/**
 * El pulso del club: cómo va el alta de socios, ahora mismo. Solo lectura.
 *
 *   node scripts/pulso.mjs
 *
 * PARA QUÉ, y por qué no vale con mirar el panel de uso: ese cuenta visitas y tiempo,
 * que es lo que interesa cuando la app YA está en marcha. Los primeros días lo que
 * importa es otra cosa — **quién se ha quedado a medias** —, y eso no se ve en ninguna
 * pantalla porque son huecos, no filas: el socio que creó la cuenta y no eligió ficha,
 * y el que la eligió y está esperando a que alguien le apruebe.
 *
 * EL SEGUNDO CASO ES EL QUE CORRE PRISA. Mientras la solicitud esté sin aprobar, ese
 * socio ve una pantalla de espera y nada más: no puede entrar a la app. Llega un aviso
 * push al admin, pero un push se pierde con facilidad, y aquí el coste de perderlo es
 * que alguien se quede fuera sin saber por qué.
 *
 * TAMBIÉN AVISA DE LO QUE PUEDE ATASCAR A TODOS A LA VEZ: que el código de acceso se
 * quede sin usos, y que se acumulen intentos fallidos desde una misma IP —diez en una
 * hora y esa red se bloquea, así que si varios socios están en el mismo wifi del club
 * un código mal escrito los deja fuera a todos—.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const db = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("SUPABASE_SERVICE_ROLE_KEY"));

const titulo = (t) => console.log(`\n── ${t}`);
const hace = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

const [{ data: perfiles }, { data: solicitudes }, { data: fichas }, { data: orden }] =
  await Promise.all([
    db.from("profiles").select("id, email, player_id, is_admin"),
    db.from("link_requests").select("user_id, player_id, status, created_at"),
    db.from("players").select("id, nombre, apodo, activo, de_prueba"),
    db.from("force_order").select("player_id"),
  ]);

const nombre = new Map(fichas.map((f) => [f.id, f.apodo || f.nombre]));
const socios = fichas.filter((f) => f.activo !== false && !f.de_prueba);

// ---------------------------------------------------------------------------
titulo("Altas");
// LA CUENTA DE PRUEBAS NO CUENTA. Está vinculada a una ficha `de_prueba`, así que
// sumarla dejaba el recuento peleado consigo mismo: "4 cuentas creadas" arriba y
// "43 de 46 sin entrar" cuatro líneas más abajo.
const dePrueba = new Set(fichas.filter((f) => f.de_prueba).map((f) => f.id));
const reales = perfiles.filter((p) => !p.player_id || !dePrueba.has(p.player_id));
const vinculados = reales.filter((p) => p.player_id);
console.log(`   ${reales.length} cuentas creadas, de ${socios.length} socios`);
console.log(`   ${vinculados.length} ya tienen su ficha vinculada`);

// ---------------------------------------------------------------------------
titulo("ESPERANDO A QUE ALGUIEN LES APRUEBE");
const pendientes = (solicitudes ?? []).filter((s) => s.status === "pendiente");
if (pendientes.length === 0) {
  console.log("   nadie, todo al día");
} else {
  for (const s of pendientes.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    console.log(`   ${nombre.get(s.player_id) ?? "?"} — pidió ${hace(s.created_at)}`);
  }
  console.log(`\n   Se aprueban en /club/admin/vinculaciones`);
}

// ---------------------------------------------------------------------------
titulo("Se quedaron a medias");
// Cuenta creada pero sin ficha y SIN solicitud: se registró y cerró la app antes de
// buscarse en la lista. No hay aviso de esto en ninguna parte.
const conSolicitud = new Set((solicitudes ?? []).map((s) => s.user_id));
const aMedias = reales.filter((p) => !p.player_id && !conSolicitud.has(p.id));
if (aMedias.length === 0) console.log("   ninguno");
else {
  for (const p of aMedias) console.log(`   ${p.email} — creó la cuenta y no eligió ficha`);
  console.log("\n   Escríbeles: solo les falta entrar y buscarse en la lista.");
}

// ---------------------------------------------------------------------------
titulo("Socios que todavía no han entrado");
const idsOrden = new Set((orden ?? []).map((o) => o.player_id));
const tomadas = new Set(vinculados.map((p) => p.player_id));
const sinCuenta = socios.filter((f) => idsOrden.has(f.id) && !tomadas.has(f.id));
console.log(`   ${sinCuenta.length} de ${socios.length}`);
if (sinCuenta.length && sinCuenta.length <= 12) {
  console.log(`   ${sinCuenta.map((f) => f.apodo || f.nombre).join(", ")}`);
}

// ---------------------------------------------------------------------------
titulo("Lo que puede atascar a todos");
const { data: codigos } = await db
  .from("access_codes")
  .select("activo, usos, max_usos")
  .eq("activo", true);
const cod = codigos?.[0];
if (!cod) console.log("   AVISO: no hay ningún código de acceso activo. Nadie puede registrarse.");
else if (cod.max_usos != null && cod.usos >= cod.max_usos) {
  console.log(`   AVISO: el código está agotado (${cod.usos}/${cod.max_usos}).`);
} else {
  console.log(`   código activo, ${cod.usos} usos${cod.max_usos != null ? ` de ${cod.max_usos}` : " y sin tope"}`);
}

const { data: intentos } = await db
  .from("registro_intentos")
  .select("ip, created_at")
  .gte("created_at", new Date(Date.now() - 3600e3).toISOString());
const porIp = new Map();
for (const i of intentos ?? []) porIp.set(i.ip, (porIp.get(i.ip) ?? 0) + 1);
const enRiesgo = [...porIp.entries()].filter(([, n]) => n >= 5);
if (enRiesgo.length === 0) {
  console.log(`   ${intentos?.length ?? 0} códigos mal escritos en la última hora`);
} else {
  for (const [, n] of enRiesgo) {
    // La IP NO se imprime: es un dato personal y para esto no hace falta saber cuál es,
    // solo que hay una red a punto de bloquearse.
    console.log(`   AVISO: una red lleva ${n} intentos fallidos esta hora (a los 10 se bloquea).`);
  }
}

console.log("");
