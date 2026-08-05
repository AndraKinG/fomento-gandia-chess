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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|robots.txt|api/cron|api/push).*)",
  ],
};
