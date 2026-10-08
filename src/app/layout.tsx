import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { URL_APP } from "@/lib/compartir/mensaje";
import { CapturarErrores } from "@/components/CapturarErrores";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fomento de Gandia · Ajedrez",
  description: "Club de ajedrez Fomento de Gandia",
  manifest: "/manifest.json",
  // Los tres los genera `scripts/generar-iconos.mjs` desde el escudo del club.
  // `apple-touch-icon` va aparte y opaco porque iOS no admite transparencia ahí:
  // compondría el escudo sobre negro. El favicon es la MARCA REDUCIDA, no el
  // escudo completo: a 32 px el aro con el nombre del club no se lee.
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // La zona de socios no tiene sentido en buscadores. La web pública sí querrá
  // indexarse cuando tenga contenido de verdad: entonces se sobrescribe este
  // `robots` en el metadata de la propia página pública.
  robots: { index: false, follow: false },

  /**
   * LA TARJETA DE VISTA PREVIA de cualquier enlace del club (WhatsApp, Telegram...).
   *
   * No existía (auditoría del 2026-10-08): un enlace compartido salía sin imagen, que es
   * justo lo contrario de para qué se montó el botón de compartir.
   *
   * VA AQUÍ, EN EL LAYOUT RAÍZ, y en ninguna página. Next mezcla los metadatos POR
   * ENCIMA: si una página define su propio `openGraph`, pierde ENTERO el de aquí, imagen
   * incluida — está en su documentación. Puesto solo aquí lo heredan todas.
   *
   * Y LA QUE MÁS SE VA A VER ES LA DEL LOGIN, no la de la portada: los enlaces que
   * comparte la app van a `/club/...`, que pide sesión, y el robot de WhatsApp no tiene
   * sesión — así que le redirigen al login y lee lo que haya allí. Por eso la tarjeta
   * habla del club en general y no de ninguna pantalla concreta.
   *
   * `metadataBase` hace falta para que `/og.jpg` salga como dirección completa: los
   * robots no saben resolver una ruta relativa.
   */
  metadataBase: new URL(URL_APP),
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Club de Ajedrez Fomento de Gandia",
    title: "Club de Ajedrez Fomento de Gandia",
    description:
      "Interclubs, torneos, quién va a cada uno y con quién ir. La app del club de ajedrez de Gandia.",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Club de Ajedrez Fomento de Gandia",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0369a1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

/**
 * Layout raíz: solo el documento y el tema.
 *
 * Todo lo que es "de socio" (navegación inferior, suscripción a notificaciones,
 * comprobación de sesión y de ficha) vive en los layouts de `/club`. Antes
 * estaba aquí y obligaba a saber la ruta actual para decidir si redirigir, algo
 * que los layouts no reciben y había que pasar por una cabecera desde el proxy.
 * Con la zona de socios en su propio segmento, la estructura de carpetas ya dice
 * quién necesita qué y ese truco desaparece.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // El nonce de la CSP de scripts, que genera el proxy en cada petición (ver
  // `src/lib/seguridad/csp.ts`). Lo lleva el script del tema de abajo, que es el ÚNICO
  // script en línea nuestro; los de Next lo reciben solos.
  //
  // LEER LAS CABECERAS HACE DINÁMICAS TODAS LAS PÁGINAS, a propósito: una página
  // generada de antemano no puede llevar un nonce que cambia en cada visita. Afecta a
  // la portada, `/unirse` y el 404, que eran las tres únicas estáticas.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            // Sin elección guardada —o con la vieja "sistema", que ya no se ofrece— manda
            // el sistema; con elección, manda ella. Va aquí y no en React para que no haya
            // un parpadeo en claro antes de hidratar.
            __html: `try{const t=localStorage.tema;const s=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="oscuro"||(t!=="claro"&&s))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <CapturarErrores />
        {children}
      </body>
    </html>
  );
}
