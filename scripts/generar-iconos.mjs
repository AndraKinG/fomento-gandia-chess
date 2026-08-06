/**
 * Limpia el escudo del club y genera los iconos de la PWA.
 *
 *   node scripts/generar-iconos.mjs <ruta-del-escudo.png>
 *
 * QUÉ ARREGLA DEL ORIGINAL: el PNG que venía del generador de imágenes **no tenía
 * transparencia**. El cuadriculado gris y blanco que parecía "fondo transparente"
 * estaba PINTADO dentro de la imagen, y además traía un manchón difuso a la derecha,
 * fuera del círculo. Las dos cosas se van recortando el disco del escudo con un
 * canal alfa de verdad: lo que queda fuera del círculo desaparece.
 *
 * GEOMETRÍA, ajustada sobre el original de 1408x768 buscando el centro que da el
 * radio más constante en 72 ángulos: centro (703.5, 383.0), borde del escudo entre
 * radio 292 y 295 (desviación 0,8 px, o sea un círculo casi perfecto). El aro con el
 * nombre ocupa de radio 195 a 294 y el círculo blanco del centro es radio < 195.
 *
 * SE RECORTA A 293 Y NO A 295 a propósito. Recortando por el borde exterior queda un
 * HALO claro arriba a la izquierda: el cuadriculado del fondo asomando por donde el
 * escudo llega a 292. Es mejor perder un píxel de filo del aro en la zona donde llega
 * a 295 que dejar un cerco de fondo, que se ve enseguida sobre blanco.
 *
 * QUÉ GENERA, y por qué cada uno:
 *
 * - `escudo.png` — el escudo completo, ya recortado y transparente. Para la web
 *   pública y para cualquier cosa impresa.
 * - `marca.png` — la MARCA REDUCIDA: la escena del centro sin el texto del aro,
 *   agrandada para llenar el disco. El escudo completo a 32 px es una mancha azul
 *   marino: el texto en círculo no se lee ni a 192. Esta se reconoce a 16.
 * - `icon-192.png` / `icon-512.png` — iconos de la PWA, fondo opaco.
 * - `icon-maskable-512.png` — para Android, que recorta el icono a la forma que
 *   quiera el lanzador. El dibujo se mete al 80% para que no le corte nada.
 * - `apple-touch-icon.png` (180) — iOS **no admite transparencia** aquí (compone
 *   sobre negro) y ya redondea él las esquinas, así que va a sangre y opaco.
 * - `favicon.png` (32) y `src/app/favicon.ico` (16+32+48) — la marca reducida. El
 *   .ico va en src/app porque es una convención de Next que manda sobre
 *   `metadata.icons`: el del andamiaje era el triángulo de Vercel, así que la
 *   pestaña del navegador del club enseñaba el logo de Vercel.
 *
 * DEPENDENCIA: usa `sharp`, que viene instalado con Next.js para optimizar
 * imágenes. Si algún día falta: `npm i -D sharp`.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Medido, no a ojo (ver la explicación de arriba).
const CENTRO_X = 703.5;
const CENTRO_Y = 383.0;
const RADIO = 293;
/**
 * Radio al que se corta la escena del centro para la marca reducida.
 *
 * Medido: el círculo BLANCO llega a radio 185 y el texto del aro no empieza hasta
 * 203, así que entre los dos hay un anillo de azul marino limpio. Se corta en 200,
 * dentro de ese anillo, por dos razones: la cruz de la corona del rey SE SALE del
 * círculo blanco y a 185 quedaría decapitada, y el marino que sobra es el MISMO
 * color que el fondo de la marca, así que la unión no se ve.
 */
const RADIO_INTERIOR = 200;

/** Colores del escudo, sacados del propio PNG (el más repetido de cada anillo). */
const MARINO = "#122840";
const CLARO = "#87a2bf";

const origen = process.argv[2];
if (!origen) {
  console.error("Falta la ruta del escudo. Uso: node scripts/generar-iconos.mjs <escudo.png>");
  process.exit(1);
}
const SALIDA = resolve(process.cwd(), "public");
mkdirSync(SALIDA, { recursive: true });

/** Máscara circular como SVG. `destination-in` la aplica al alfa. */
function discoSVG(lado) {
  const r = lado / 2;
  return Buffer.from(
    `<svg width="${lado}" height="${lado}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
  );
}

/** Recorta un círculo del original y lo devuelve como PNG cuadrado transparente. */
async function recortarDisco(radio) {
  const lado = Math.round(radio * 2);
  const izquierda = Math.round(CENTRO_X - radio);
  const arriba = Math.round(CENTRO_Y - radio);
  return sharp(origen)
    .extract({ left: izquierda, top: arriba, width: lado, height: lado })
    .composite([{ input: discoSVG(lado), blend: "dest-in" }])
    .png()
    .toBuffer();
}

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
    create: {
      width: lado,
      height: lado,
      channels: 4,
      background: fondo,
    },
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
  cabecera.writeUInt16LE(0, 0); // reservado
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);

  const entradas = [];
  let desplazamiento = 6 + imagenes.length * 16;
  for (const { lado, png } of imagenes) {
    const e = Buffer.alloc(16);
    // 0 significa 256 en este formato; con 16/32/48 no llega a darse, pero el
    // enmascarado deja el fichero correcto si algún día se añade el de 256.
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2); // paleta: ninguna
    e.writeUInt8(0, 3); // reservado
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    entradas.push(e);
    desplazamiento += png.length;
  }
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.png)]);
}

console.log(`Escudo de origen: ${origen}\n`);

// 1. Escudo completo, transparente.
const escudo = await recortarDisco(RADIO);
await guardar("escudo.png", escudo);

// 2. Marca reducida: la escena del centro, sin el aro, sobre un disco marino con un
//    filo claro. Se agranda al 96% del disco para que la pieza gane toda la presencia
//    posible: es lo que hace que se reconozca a 16 px.
const centro = await recortarDisco(RADIO_INTERIOR);
const LADO_MARCA = 512;
const escena = await sharp(centro)
  .resize(Math.round(LADO_MARCA * 0.96), Math.round(LADO_MARCA * 0.96))
  .png()
  .toBuffer();
const fondoMarca = Buffer.from(
  `<svg width="${LADO_MARCA}" height="${LADO_MARCA}">
     <circle cx="${LADO_MARCA / 2}" cy="${LADO_MARCA / 2}" r="${LADO_MARCA / 2 - 1}"
             fill="${MARINO}" stroke="${CLARO}" stroke-width="10"/>
   </svg>`
);
const marca = await sharp(fondoMarca)
  .composite([{ input: escena, gravity: "center" }])
  .png()
  .toBuffer();
await guardar("marca.png", marca);

// 3. Iconos de la PWA. El escudo completo se reserva para 512, donde el texto del
//    aro todavía se intuye; de 192 para abajo va la marca reducida.
await guardar("icon-512.png", await iconoCuadrado(escudo, 512));
await guardar("icon-192.png", await iconoCuadrado(marca, 192));
await guardar("icon-maskable-512.png", await iconoCuadrado(marca, 512, { margen: 0.1 }));
await guardar("apple-touch-icon.png", await iconoCuadrado(marca, 180, { margen: 0.04 }));
await guardar("favicon.png", await sharp(marca).resize(32, 32).png().toBuffer());

// 4. El favicon clásico, que va en src/app y no en public: es una convención de
//    Next y manda sobre `metadata.icons`. 16, 32 y 48, que son los que piden los
//    navegadores para la pestaña, la barra de marcadores y el acceso directo.
const ico = empaquetarIco(
  await Promise.all(
    [16, 32, 48].map(async (lado) => ({
      lado,
      png: await sharp(marca).resize(lado, lado).png().toBuffer(),
    }))
  )
);
const rutaIco = resolve(process.cwd(), "src/app/favicon.ico");
writeFileSync(rutaIco, ico);
console.log(`  ${"src/app/favicon.ico".padEnd(26)} 16+32+48  ${ico.length} bytes`);

console.log("\nListo.");
