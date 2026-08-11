/**
 * Genera la marca y los iconos de la PWA desde el LOGO OFICIAL del club.
 *
 *   node scripts/generar-iconos.mjs [ruta-del-logo.jpg]   (por defecto public/logo-club.jpg)
 *
 * EL REPARTO LO FIJÓ EL PROPIETARIO (2026-08-11, segunda vuelta):
 * - En las PÁGINAS PÚBLICAS (portada, /unirse, login, registro) va la imagen
 *   COMPLETA (`/logo-club.jpg`), tal cual llegó del club.
 * - Para TODO LO DEMÁS —la marca de la barra lateral y cabeceras, los iconos de
 *   la PWA y el favicon— va SU ENCUADRE: el pilono del puente con los dos
 *   rótulos (const LOGO, abajo). No se re-recorta nada de ese encuadre: se mete
 *   ENTERO, contenido sin deformar, en un disco marino de la casa — el disco es
 *   lo que le da cuerpo a 32 px, donde una imagen apaisada suelta sería un hilo.
 *
 * QUÉ GENERA:
 * - `marca.png` — el encuadre en disco marino con aro, transparente fuera.
 *   Barra lateral, cabeceras de móvil y cabecera de la portada.
 * - `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`,
 *   `favicon.png` — los de la PWA, sobre fondo marino opaco (el maskable con el
 *   10% de margen que recorta Android; el de Apple opaco porque iOS compone la
 *   transparencia sobre negro).
 * - `src/app/favicon.ico` — 16+32+48; es convención de Next y manda sobre
 *   `metadata.icons`.
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

/** El encuadre del propietario sobre el original de 1128x712: el pilono del
 *  puente con "Club de Ajedrez" y "Fomento Gandia". Si el club cambia el logo,
 *  volver a encuadrar aquí. */
const LOGO = { left: 20, top: 8, width: 860, height: 576 };

const origen = process.argv[2] ?? resolve(SALIDA, "logo-club.jpg");

async function guardar(nombre, buffer) {
  const ruta = resolve(SALIDA, nombre);
  mkdirSync(dirname(ruta), { recursive: true });
  await sharp(buffer).toFile(ruta);
  const { width, height } = await sharp(ruta).metadata();
  console.log(`  ${nombre.padEnd(26)} ${width}x${height}`);
}

/**
 * Icono cuadrado: la marca centrada sobre un fondo opaco.
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

// 1. La marca: el encuadre ENTERO, contenido sin deformar dentro de un disco
//    marino con el aro claro de la casa. El disco se rellena primero y la imagen
//    va encima ya escalada al ancho que cabe dentro del círculo a su altura.
const R = LADO_MARCA / 2;
// Ancho que cabe dentro del círculo para una imagen de proporción LOGO a media
// altura: se escala a que las ESQUINAS de la imagen toquen el círculo.
//半 alto/ancho de la imagen: h = w * 576/860. Esquinas en el círculo:
// (w/2)² + (h/2)² = (R-8)² → w = 2(R-8)/sqrt(1 + (576/860)²)
const proporcion = LOGO.height / LOGO.width;
const anchoDentro = Math.floor((2 * (R - 8)) / Math.sqrt(1 + proporcion ** 2));
const dentro = await sharp(origen)
  .extract(LOGO)
  .resize(anchoDentro, Math.round(anchoDentro * proporcion))
  .png()
  .toBuffer();
const disco = Buffer.from(
  `<svg width="${LADO_MARCA}" height="${LADO_MARCA}">
     <circle cx="${R}" cy="${R}" r="${R - 2}" fill="${MARINO}"/>
   </svg>`
);
const aro = Buffer.from(
  `<svg width="${LADO_MARCA}" height="${LADO_MARCA}">
     <circle cx="${R}" cy="${R}" r="${R - 16}" fill="none" stroke="${CLARO}" stroke-width="3"/>
   </svg>`
);
const marca = await sharp(disco)
  .composite([
    { input: dentro, gravity: "center" },
    { input: aro, blend: "over" },
  ])
  .png()
  .toBuffer();
await guardar("marca.png", marca);

// 2. Iconos de la PWA, todos desde la marca.
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
