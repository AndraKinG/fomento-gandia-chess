/**
 * Prueba EMPÍRICA de que las mesas en vivo son privadas (migración 0033).
 *
 *   node scripts/probar-mesa-privada.mjs
 *
 * Qué hace, sin tocar ninguna tabla:
 *  1. Un cliente con la clave PÚBLICA y SIN sesión intenta unirse al canal
 *     privado de una mesa → tiene que ser RECHAZADO.
 *  2. El mismo cliente se une al canal público de presencia → tiene que PODER
 *     (la presencia se queda pública a propósito; esto separa "la mesa está
 *     cerrada" de "el tiempo real está roto").
 *
 * La cara positiva (un socio vinculado SÍ recibe) no se puede probar desde aquí
 * sin una contraseña de socio: se prueba jugando, que es lo que el propietario
 * hace de todos modos. Si tras aplicar la 0033 las jugadas llegan al instante,
 * la policy de SELECT funciona.
 *
 * Es la misma prueba con la que la auditoría del 2026-08-10 DEMOSTRÓ el agujero
 * (entonces el paso 1 recibía el mensaje); ahora demuestra el cierre.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
const leer = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();

const espia = createClient(leer("NEXT_PUBLIC_SUPABASE_URL"), leer("NEXT_PUBLIC_SUPABASE_ANON_KEY"));

function unirse(canal) {
  return new Promise((resolver) => {
    const tope = setTimeout(() => resolver("TIMED_OUT"), 8000);
    canal.subscribe((estado, err) => {
      if (estado === "SUBSCRIBED" || estado === "CHANNEL_ERROR" || estado === "CLOSED") {
        clearTimeout(tope);
        resolver(err ? `${estado} (${err.message})` : estado);
      }
    });
  });
}

// 1. La mesa privada, sin sesión: tiene que fallar la unión.
const mesa = espia.channel("partida-00000000-0000-0000-0000-000000000000", {
  config: { private: true },
});
const resultadoMesa = await unirse(mesa);
const mesaCerrada = resultadoMesa !== "SUBSCRIBED";
console.log(`1. Mesa privada sin sesión: ${resultadoMesa} → ${mesaCerrada ? "CERRADA ✔" : "¡ABIERTA! ✘"}`);
await espia.removeChannel(mesa);

// 2. La presencia pública: tiene que seguir funcionando.
const presencia = espia.channel("presencia-club", { config: { presence: { key: "sonda" } } });
const resultadoPresencia = await unirse(presencia);
const presenciaAbierta = resultadoPresencia === "SUBSCRIBED";
console.log(`2. Presencia pública sin sesión: ${resultadoPresencia} → ${presenciaAbierta ? "FUNCIONA ✔" : "ROTA ✘"}`);
await espia.removeChannel(presencia);

process.exit(mesaCerrada && presenciaAbierta ? 0 : 1);
