import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { leerSuscripcion } from "@/lib/push/suscripcion";
import { registrarError } from "@/lib/errores/registrar";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // Un cuerpo que no es JSON, o que no tiene forma de suscripción, es un 400: la
  // petición está mal. Antes reventaba con un 500 (ver `leerSuscripcion`).
  const lectura = leerSuscripcion(await request.json().catch(() => null));
  if (!lectura.ok) {
    if (lectura.motivo === "servicio" && lectura.endpoint) {
      // A la lista de errores, para que se note si es un navegador de verdad con un
      // servicio que falta en `servicios.ts`. Solo el HOST: el resto de la dirección
      // es el token de ese dispositivo. Mismo mensaje para todos los de un host, así
      // que se agrupan en una fila.
      let host = "dirección no válida";
      try {
        host = new URL(lectura.endpoint).host;
      } catch {}
      await registrarError({
        origen: "servidor",
        mensaje: `Servicio push no reconocido: ${host}`,
        ruta: "/api/push/subscribe",
        userAgent: request.headers.get("user-agent"),
      });
    }
    return NextResponse.json({ error: "Suscripción no válida" }, { status: 400 });
  }
  const sub = lectura.suscripcion;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    // El detalle a los registros, no al navegador: el mensaje de Postgres lleva
    // nombres de tablas y de restricciones.
    console.error("[push] no se pudo guardar la suscripción", error.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
