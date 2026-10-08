import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { nuevoNonce, politicaCompleta } from "@/lib/seguridad/csp";

/**
 * Prefijo de la zona de socios. Todo lo que empiece por aquí exige sesión;
 * el resto (web pública, login, registro, confirmación de email) es abierto.
 *
 * Antes era al revés —protegido por defecto con una lista de excepciones— porque
 * la app ocupaba el dominio entero. Con web pública delante, la lista de
 * excepciones habría crecido con cada página nueva del sitio y un olvido
 * significaba dejar una página pública detrás del login.
 */
const ZONA_SOCIOS = "/club";

/**
 * Qué hace la CSP: `false` = SOLO INFORMAR (no bloquea nada, avisa en Admin → Errores);
 * `true` = BLOQUEAR. Se pasa a `true` cuando una semana de uso real no dé avisos de
 * nuestras pantallas (ver `src/lib/seguridad/csp.ts`).
 */
const CSP_BLOQUEA = false;
const CABECERA_CSP = CSP_BLOQUEA ? "content-security-policy" : "content-security-policy-report-only";

export async function proxy(request: NextRequest) {
  // CSP: un nonce nuevo por petición. Va en la cabecera de la PETICIÓN porque es de ahí
  // de donde lo lee Next para ponerlo en sus scripts, y en `x-nonce` para el script del
  // tema del layout. Se hace ANTES de crear la respuesta: el `NextResponse.next({ request })`
  // de abajo reenvía estas cabeceras a la página.
  //
  // UNA SOLA CABECERA DE CSP, Y NINGUNA OTRA (lección del 2026-10-08): las cabeceras de la
  // RESPUESTA acaban copiadas también en la petición que lee Next, y Next busca el nonce
  // PRIMERO en `content-security-policy`. Con una segunda CSP sin `script-src` (la base
  // de `next.config.ts` en Vercel, o puesta aquí) Next leía esa, no encontraba nonce y
  // sus scripts salían sin él. Por eso la base va DENTRO de esta (`politicaCompleta`).
  const nonce = nuevoNonce();
  const csp = politicaCompleta(nonce, process.env.NODE_ENV === "development");
  request.headers.set("x-nonce", nonce);
  request.headers.set(CABECERA_CSP, csp);

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Se llama en todas las rutas, no solo en /club: además de comprobar la
  // sesión, `getUser()` es lo que refresca las cookies de Supabase cuando el
  // token está a punto de caducar. Si solo corriera en la zona de socios, a un
  // socio que se quedara leyendo la web pública se le caducaría la sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith(ZONA_SOCIOS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  response.headers.set(CABECERA_CSP, csp);
  return response;
}

/**
 * Se excluyen los ficheros estáticos y los crons.
 *
 * Los iconos van por extensión (`.png`, `.svg`, `.ico`) y no uno a uno: son seis
 * ficheros que además se regeneran con `scripts/generar-iconos.mjs`, y una lista
 * nominal se queda desactualizada en cuanto se añade uno. Cada petición que llega
 * aquí gasta una llamada a `getUser()` contra Supabase, así que dejar pasar los
 * iconos es gastar por nada.
 *
 * `api/errores` tampoco pasa: recibe los fallos del navegador sin sesión a propósito (puede
 * fallar el login), así que comprobarla ahí sería una llamada a Supabase por cada error.
 * `api/csp`, por lo mismo: recibe los avisos de la CSP de scripts.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|manifest.json|sw.js|robots.txt|api/cron|api/push|api/errores|api/csp|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest)$).*)",
  ],
};
