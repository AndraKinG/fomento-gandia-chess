/**
 * Genera la imagen de vista previa de los enlaces (`public/og.jpg`).
 *
 *   node scripts/generar-og.mjs
 *
 * PARA QUÉ (auditoría del 2026-10-08): la web no tenía ninguna etiqueta Open Graph, así
 * que un enlace compartido por WhatsApp —que es para lo que se montó el botón de
 * compartir— salía sin imagen. Esta es la que sale ahora en cualquier enlace del club.
 *
 * VA EL LOGO COMPLETO, sin recortar. Es la regla del propietario para lo público
 * (`generar-iconos.mjs`): en las páginas públicas la imagen entera tal cual llegó del
 * club, y el encuadre del pilono solo para iconos. Una vista previa de WhatsApp es lo más
 * público que hay.
 *
 * 1200 x 630 PORQUE ES EL TAMAÑO QUE PIDEN TODOS (WhatsApp, Telegram, Facebook): una
 * proporción de 1,91. El logo es más estrecho (1,58), así que va a toda la altura y
 * centrado, con el azul marino de la casa a los lados — el mismo `MARINO` de los iconos,
 * para que todo lo del club se vea de la misma familia.
 *
 * JPEG Y POR DEBAJO DE 300 KB, y no es por ahorrar: **WhatsApp no enseña la imagen si
 * pesa más de unos 300 KB**, deja el enlace pelado sin decir por qué. El logo es una
 * ilustración con degradados, que en PNG se va de tamaño.
 *
 * Es un fichero estático que se genera una vez y se sube. Si el club cambia el logo, se
 * vuelve a lanzar.
 */
import sharp from "sharp";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const MARINO = "#122840";
const ANCHO = 1200;
const ALTO = 630;
const LIMITE_WHATSAPP = 300 * 1024;

const origen = resolve(process.cwd(), "public/logo-club.jpg");
const destino = resolve(process.cwd(), "public/og.jpg");

const logo = await sharp(origen)
  .resize({ height: ALTO, width: ANCHO, fit: "inside" })
  .toBuffer();
const { width: anchoLogo } = await sharp(logo).metadata();

await sharp({
  create: { width: ANCHO, height: ALTO, channels: 3, background: MARINO },
})
  .composite([{ input: logo, left: Math.round((ANCHO - anchoLogo) / 2), top: 0 }])
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile(destino);

const peso = statSync(destino).size;
console.log(`public/og.jpg: ${ANCHO}x${ALTO}, ${Math.round(peso / 1024)} KB`);
if (peso > LIMITE_WHATSAPP) {
  console.error("AVISO: pasa de 300 KB y WhatsApp no la enseñará. Baja la calidad.");
  process.exit(1);
}
