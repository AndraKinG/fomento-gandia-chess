import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

export async function proxy(request: NextRequest) {
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
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|manifest.json|sw.js|robots.txt|api/cron|api/push|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest)$).*)",
  ],
};
