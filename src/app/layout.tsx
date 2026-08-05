import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PushSubscriber } from "@/components/PushSubscriber";
import { BottomNav } from "@/components/BottomNav";
import { createServerSupabase } from "@/lib/supabase/server";
import "./globals.css";

/**
 * Rutas por las que puede pasar una cuenta autenticada que AÚN NO tiene ficha
 * aprobada. El resto le redirige a /vincular.
 *
 * Es UX, no seguridad: la barrera de verdad son las policies de la migración
 * 0009, que no dejan a un no vinculado leer ni un nombre. Si este redirect
 * fallara, esas pantallas se verían vacías, no llenas.
 */
const RUTAS_SIN_FICHA = ["/vincular", "/perfil", "/login", "/registro", "/auth"];

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
  description: "App del club de ajedrez Fomento de Gandia",
  manifest: "/manifest.json",
  // La app es del club, no un sitio público: no tiene sentido que salga en
  // búsquedas. No es un control de seguridad (esa es la RLS), solo higiene.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0369a1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  let esAdmin = false;
  let tieneFicha = false;
  if (user) {
    // Un solo select para las dos cosas: si es admin y si ya tiene ficha.
    const { data: profile } = await supabase
      .from("profiles").select("is_admin, player_id").eq("id", user.id).single();
    esAdmin = Boolean(profile?.is_admin);
    tieneFicha = profile?.player_id != null;

    if (!tieneFicha && !esAdmin) {
      const ruta = (await headers()).get("x-pathname") ?? "/";
      if (!RUTAS_SIN_FICHA.some((r) => ruta.startsWith(r))) redirect("/vincular");
    }
  }

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-20">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.tema;const s=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="oscuro"||(!t||t==="sistema")&&s)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <PushSubscriber />
        {children}
        {/* Sin ficha aprobada la navegación no lleva a ningún sitio útil: todas
            sus pestañas redirigen de vuelta a /vincular. */}
        {(!user || tieneFicha || esAdmin) && <BottomNav esAdmin={esAdmin} />}
      </body>
    </html>
  );
}
