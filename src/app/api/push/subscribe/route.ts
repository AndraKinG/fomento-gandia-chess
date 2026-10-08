import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { leerSuscripcion } from "@/lib/push/suscripcion";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  // Un cuerpo que no es JSON, o que no tiene forma de suscripción, es un 400: la
  // petición está mal. Antes reventaba con un 500 (ver `leerSuscripcion`).
  const sub = leerSuscripcion(await request.json().catch(() => null));
  if (!sub) return NextResponse.json({ error: "Suscripción no válida" }, { status: 400 });

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
