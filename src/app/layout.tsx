import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script
          dangerouslySetInnerHTML={{
            // Sin elección guardada —o con la vieja "sistema", que ya no se ofrece— manda
            // el sistema; con elección, manda ella. Va aquí y no en React para que no haya
            // un parpadeo en claro antes de hidratar.
            __html: `try{const t=localStorage.tema;const s=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="oscuro"||(t!=="claro"&&s))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
