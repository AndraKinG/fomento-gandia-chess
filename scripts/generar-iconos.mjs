/**
 * Genera la marca y los iconos de la PWA desde el LOGO OFICIAL del club.
 *
 *   node scripts/generar-iconos.mjs [ruta-del-logo.jpg]   (por defecto public/logo-club.jpg)
 *
 * EL ORIGEN CAMBIÓ EL 2026-08-11: hasta entonces todo salía de un escudo redondo
 * generado por nosotros; el club pasó su logo oficial —el Puente del Fomento de
 * Gandia construido con piezas de ajedrez— y el propietario pidió sustituirlo en
 * todas partes. El mural entero (`/logo-club.jpg`) es lo que se enseña grande
 * (portada, /unirse, login); de aquí salen las piezas pequeñas.
 *
 * LA MARCA ES EL CABALLO. Un mural de 1128x712 con texto es ilegible a tamaño de
 * icono, así que la marca es un RECORTE: el caballo oscuro de la derecha con el
 * cable del puente cruzando — lo único del mural que se reconoce a 32 px. El
 * encuadre (864,170)-(1128,434) está elegido a ojo sobre el original: el caballo
 * entero, en el tercio derecho, con aire. Va en un disco con el aro marino de la
 * casa, como la marca anterior, para que el cambio no rompa el estilo de la app.
 *
 * QUÉ GENERA:
 * - `marca.png` — el caballo en disco, transparente fuera. Barra lateral y cabecera.
 * - `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
 *   `favicon.png` — los de la PWA, sobre fondo marino opaco (el maskable con el
 *   10% de margen que recorta Android; el de Apple opaco porque iOS compone la
 *   transparencia sobre negro).
 * - `src/app/favicon.ico` — 16+32+48; es convención de Next y manda sobre
 *   `metadata.icons`.
 *
 * YA NO GENERA `escudo.png`: la versión "completo" del componente Escudo enseña
 * el mural directamente (`/logo-club.jpg`).
 *
 * DEPENDENCIA: `sharp`, que viene con Next para optimizar imágenes.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MARINO = "#122840";
const CLARO = "#87a2bf";
const SALIDA = resolve(process.cwd(), "public");
const LADO_MARCA = 512;

/** El caballo, medido sobre el original de 1128x712. Si el club cambia el logo,
 *  volver a encuadrar aquí. */
const CABALLO = { left: 864, top: 170, width: 264, height: 264 };

/** El encuadre CENTRADO que se enseña en pantalla (petición del propietario,
 *  2026-08-11): el puente con los dos rótulos, sin la banda sobrante de la
 *  derecha ni los peones de abajo. El original entero se queda como master. */
const CENTRADO = { left: 20, top: 8, width: 860, height: 576 };

const origen = process.argv[2] ?? resolve(SALIDA, "logo-club.jpg");

async function guardar(nombre, buffer) {
  const ruta = resolve(SALIDA, nombre);
  mkdirSync(dirname(ruta), { recursive: true });
  await sharp(buffer).toFile(ruta);
  const { width, height } = await sharp(ruta).metadata();
  console.log(`  ${nombre.padEnd(26)} ${width}x${height}`);
}

/**
 * Icono cuadrado: el dibujo centrado sobre un fondo opaco.
 *
 * `margen` es la fracción del lado que se deja libre alrededor. En los iconos
 * normales basta un poco de aire; en el maskable hace falta el 10% por lado, porque
 * Android recorta hasta un círculo inscrito.
 */
async function iconoCuadrado(dibujo, lado, { margen = 0.06, fondo = MARINO } = {}) {
  const interior = Math.round(lado * (1 - margen * 2));
  const escalado = await sharp(dibujo).resize(interior, interior).png().toBuffer();
  return sharp({
    create: { width: lado, height: lado, channels: 4, background: fondo },
  })
    .composite([{ input: escalado, gravity: "center" }])
    .png()
    .toBuffer();
}

/**
 * Empaqueta varios PNG en un `.ico`.
 *
 * POR QUÉ A MANO: `sharp` no escribe ICO, y el formato es sencillo — cabecera de 6
 * bytes, una entrada de 16 por imagen y los PNG detrás. Meter PNG dentro de un ICO
 * lo entiende cualquier navegador actual.
 *
 * POR QUÉ HACE FALTA UN ICO Y NO BASTA EL PNG: `src/app/favicon.ico` es una
 * convención de Next y gana sobre lo que declare `metadata.icons`. Si ese fichero
 * es el del andamiaje —lo era: el triángulo de Vercel—, la pestaña del navegador
 * enseña ese logo por mucho favicon PNG que se declare.
 */
function empaquetarIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(imagenes.length, 4);

  const entradas = [];
  let desplazamiento = 6 + imagenes.length * 16;
  for (const { lado, png } of imagenes) {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    entradas.push(e);
    desplazamiento += png.length;
  }
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.png)]);
}

console.log(`Origen: ${origen}\n`);

// 0. El recorte centrado para pantalla (ver CENTRADO).
await guardar(
  "logo-club-centrado.jpg",
  await sharp(origen).extract(CENTRADO).jpeg({ quality: 85, progressive: true }).toBuffer()
);

// 1. El caballo, recortado y en disco: se enmascara con un círculo (transparente
//    fuera) y se le pone el aro marino de la casa encima.
const caballo = await sharp(origen).extract(CABALLO).resize(LADO_MARCA, LADO_MARCA).png().toBuffer();
const mascara = Buffer.from(
  `<svg width="${LADO_MARCA}" height="${LADO_MARCA}">
     <circle cx="${LADO_MARCA / 2}" cy="${LADO_MARCA / 2}" r="${LADO_MARCA / 2 - 2}" fill="#fff"/>
   </svg>`
);
const aro = Buffer.from(
  `<svg width="${LADO_MARCA}" height="${LADO_MARCA}">
     <circle cx="${LADO_MARCA / 2}" cy="${LADO_MARCA / 2}" r="${LADO_MARCA / 2 - 7}"
             fill="none" stroke="${MARINO}" stroke-width="12"/>
     <circle cx="${LADO_MARCA / 2}" cy="${LADO_MARCA / 2}" r="${LADO_MARCA / 2 - 16}"
             fill="none" stroke="${CLARO}" stroke-width="3"/>
   </svg>`
);
const marca = await sharp(caballo)
  .composite([
    { input: mascara, blend: "dest-in" },
    { input: aro, blend: "over" },
  ])
  .png()
  .toBuffer();
await guardar("marca.png", marca);

// 2. Iconos de la PWA, todos desde la marca: es lo único que aguanta el tamaño.
await guardar("icon-512.png", await iconoCuadrado(marca, 512));
await guardar("icon-192.png", await iconoCuadrado(marca, 192));
await guardar("icon-maskable-512.png", await iconoCuadrado(marca, 512, { margen: 0.1 }));
await guardar("apple-touch-icon.png", await iconoCuadrado(marca, 180, { margen: 0.04 }));
await guardar("favicon.png", await sharp(marca).resize(32, 32).png().toBuffer());

// 3. El favicon clásico (ver empaquetarIco).
const ico = empaquetarIco(
  await Promise.all(
    [16, 32, 48].map(async (lado) => ({
      lado,
      png: await sharp(marca).resize(lado, lado).png().toBuffer(),
    }))
  )
);
writeFileSync(resolve(process.cwd(), "src/app/favicon.ico"), ico);
console.log(`  ${"src/app/favicon.ico".padEnd(26)} 16+32+48  ${ico.length} bytes`);

console.log("\nListo.");
