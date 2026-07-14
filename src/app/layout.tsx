import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PushSubscriber } from "@/components/PushSubscriber";
import { BottomNav } from "@/components/BottomNav";
import { createServerSupabase } from "@/lib/supabase/server";
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
  description: "App del club de ajedrez Fomento de Gandia",
  manifest: "/manifest.json",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  let esAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("is_admin").eq("id", user.id).single();
    esAdmin = Boolean(profile?.is_admin);
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
        <BottomNav esAdmin={esAdmin} />
      </body>
    </html>
  );
}
