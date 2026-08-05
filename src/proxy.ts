import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/registro", "/auth"];

export async function proxy(request: NextRequest) {
  // El layout raíz necesita saber en qué ruta estamos para decidir si redirige a
  // /vincular a una cuenta sin ficha, y los layouts no reciben el pathname. Se
  // lo pasamos por cabecera en vez de consultar la BD aquí: el proxy corre en
  // CADA petición y ya hace un viaje a Supabase con getUser(); el layout, en
  // cambio, ya consulta `profiles` para saber si eres admin, así que allí la
  // comprobación sale gratis.
  //
  // OJO al tocar esto: mutamos `request.headers` y devolvemos
  // `NextResponse.next({ request })`, que NO es el patrón de los docs de Next
  // (ellos hacen `new Headers(request.headers)` + `next({ request: { headers } })`).
  // Se hace así porque el bloque de cookies de más abajo, que es el patrón
  // canónico de @supabase/ssr, necesita pasar el `request` entero para que las
  // cookies refrescadas lleguen al servidor. Verificado empíricamente el
  // 2026-08-05 que la cabecera llega al layout **tanto en dev como en el build
  // de producción**; si alguien lo "arregla" al patrón de los docs, comprobar
  // que siguen funcionando las dos cosas: el redirect Y el refresco de sesión.
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          // `request` conserva la cabecera x-pathname puesta arriba, así que
          // recrear la respuesta aquí no la pierde.
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|api/cron|api/push).*)",
  ],
};
