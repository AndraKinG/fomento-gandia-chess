import { NextResponse, type NextRequest } from "next/server";

export const maxDuration = 60;

/**
 * Ruta TEMPORAL de diagnóstico de conectividad saliente desde Vercel.
 * Protegida con CRON_SECRET. Eliminar cuando se resuelva el bloqueo de FIDE.
 * Solo permite consultar los hosts de federaciones que la app necesita.
 */
const HOSTS_PERMITIDOS = [
  "ratings.fide.com",
  "fide.com",
  "www.fide.com",
  "feda.org",
  "www.gefe.net",
  "chess-results.com",
  "www.facv.org",
];

export async function GET(request: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta ?url=" }, { status: 400 });
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || !HOSTS_PERMITIDOS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host no permitido" }, { status: 400 });
  }
  const inicio = Date.now();
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      redirect: "manual",
    });
    const cuerpo = (await res.text()).slice(0, 200);
    return NextResponse.json({
      status: res.status,
      ms: Date.now() - inicio,
      contentType: res.headers.get("content-type"),
      location: res.headers.get("location"),
      primerosBytes: cuerpo,
    });
  } catch (e) {
    return NextResponse.json({
      error: String(e).slice(0, 300),
      causa: String((e as { cause?: unknown })?.cause ?? "").slice(0, 300),
      ms: Date.now() - inicio,
    });
  }
}
