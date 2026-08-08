/**
 * Deja que un script de `scripts/` importe los módulos de `src/` tal como están
 * escritos, sin compilar nada.
 *
 * POR QUÉ HACE FALTA: el código de la app usa dos cosas que Node no entiende por su
 * cuenta —imports sin extensión (`./rangos`) y el alias `@/`— porque quien resuelve
 * eso normalmente es Next. Node sí sabe quitar los tipos de un `.ts` él solo
 * (`--experimental-strip-types`), así que lo único que falta es enseñarle a
 * encontrar los ficheros.
 *
 * Uso:
 *   node --experimental-strip-types --import ./scripts/cargar-ts.mjs scripts/loquesea.mjs
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolverRuta } from "node:path";

const RAIZ = pathToFileURL(resolverRuta(process.cwd(), "src") + "/").href;

/** Prueba las extensiones que usa el proyecto y devuelve la primera que exista. */
function conExtension(base) {
  for (const cola of [".ts", ".tsx", "/index.ts", ".mjs", ".js"]) {
    const url = new URL(base + cola);
    if (existsSync(fileURLToPath(url))) return url.href;
  }
  return null;
}

registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith("@/")) {
      const encontrado = conExtension(RAIZ + especificador.slice(2));
      if (encontrado) return { url: encontrado, shortCircuit: true };
    }
    if (especificador.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(especificador)) {
      const encontrado = conExtension(new URL(especificador, contexto.parentURL).href);
      if (encontrado) return { url: encontrado, shortCircuit: true };
    }
    return siguiente(especificador, contexto);
  },
});
