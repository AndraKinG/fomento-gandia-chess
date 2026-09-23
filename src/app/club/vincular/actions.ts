"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/avisos/enviar";

/**
 * Avisa por push a los admins de que hay una solicitud esperando.
 *
 * Sin esto la junta tiene que acordarse de entrar en /club/vinculaciones a
 * mirar, y durante el alta del club llegan de golpe. Se hace con el cliente de
 * servicio porque hay que leer los `profiles` de OTRA gente (los admins), algo
 * que la RLS niega al socio que acaba de solicitar — y con razón.
 *
 * Nunca hace fallar la solicitud: si el push no sale, la solicitud ya está
 * guardada y aparecerá igual en el panel. Es un aviso, no parte del flujo.
 */
async function avisarAdminsDeSolicitud(nombreFicha: string): Promise<void> {
  // A LA JUNTA TAMBIÉN desde el 2026-09-23: si pueden aprobarlas, tienen que
  // enterarse. Avisar solo al admin de un trabajo que ahora es de varios deja las
  // solicitudes esperando a la única persona que recibe el aviso.
  try {
    const admin = createAdminClient();
    // Las DOS fuentes de rango, igual que `is_admin()` en Postgres: la columna
    // vieja y el rol. Si solo se mirara la columna, a un admin nombrado por rol
    // no le llegarían las solicitudes que tiene que aprobar.
    const [{ data: porColumna }, { data: porRol }] = await Promise.all([
      admin.from("profiles").select("id").eq("is_admin", true),
      admin.from("member_roles").select("profile_id").in("rol", ["admin", "junta"]),
    ]);
    const ids = [
      ...new Set([
        ...(porColumna ?? []).map((a) => a.id),
        ...(porRol ?? []).map((r) => r.profile_id),
      ]),
    ];
    if (ids.length === 0) return;
    await avisar(ids, {
      tipo: "vinculacion",
      titulo: "Nueva solicitud de vinculación",
      cuerpo: `Alguien dice ser ${nombreFicha}. Revísalo para darle acceso.`,
      url: "/club/vinculaciones",
    });
  } catch {
    // Silencio a propósito: ver comentario de arriba.
  }
}

export async function solicitarVinculo(playerId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user.id).single();
  if (profile?.player_id) return { error: "Ya estás vinculado a una ficha" };

  const { error } = await supabase
    .from("link_requests")
    .insert({ user_id: user.id, player_id: playerId });
  if (error) {
    // Postgres error code 23505 = unique constraint violation
    if (error.code === "23505") {
      return { error: "Ese jugador ya tiene una solicitud pendiente, o tú ya tienes una" };
    }
    return { error: "No se pudo crear la solicitud" };
  }

  // El nombre se lee con el cliente de servicio: el socio aún no está
  // vinculado, así que la RLS de la migración 0009 no le deja leer `players`.
  const admin = createAdminClient();
  const { data: ficha } = await admin
    .from("players").select("nombre").eq("id", playerId).single();
  await avisarAdminsDeSolicitud(ficha?.nombre ?? "un jugador del club");

  // A /vincular, no a la home: hasta que el admin apruebe, la propia pantalla
  // de vinculación es la que muestra el estado de espera (y la home le
  // redirigiría aquí de vuelta).
  redirect("/club/vincular");
}

/**
 * "No me encuentro en la lista": avisa a la junta desde DENTRO de la app.
 *
 * POR QUÉ HACÍA FALTA (2026-09-23): la pantalla decía "avisa al admin" y ahí se
 * acababa. El socio tenía que acordarse de escribir por WhatsApp, y si no lo hacía no
 * quedaba rastro en ninguna parte: sin ficha elegida no hay solicitud, así que no salía
 * como pendiente, no generaba aviso y nadie se enteraba de que había alguien atascado.
 * Es exactamente lo que pasó con el primer socio que entró tras abrir la app al club.
 *
 * VA A LA JUNTA, NO SOLO AL ADMIN: son los que pueden crear una ficha a mano, que es lo
 * que resuelve este caso.
 *
 * SE PERMITE REPETIRLO. Podría contarse cuántas veces lo ha pulsado cada uno para
 * evitar duplicados, pero el coste de un aviso de más es que alguien lo lea dos veces,
 * y el de bloquearlo es que un socio que pulsó cuando no había nadie mirando se quede
 * fuera para siempre. En un club de 46 personas, el riesgo de spam no existe.
 */
export async function avisarQueNoEstoy(): Promise<void> {
  // DEVUELVE void porque va directa en un `<form action>`: una acción de formulario no
  // puede devolver datos, y sin sesión no hay nada que enseñar aquí — al login.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Si ya tiene ficha no hay nada que avisar: habrá llegado aquí por un enlace viejo.
  const { data: perfil } = await admin
    .from("profiles").select("player_id, email").eq("id", user.id).maybeSingle();
  if (perfil?.player_id) redirect("/club");

  const [{ data: porColumna }, { data: porRol }] = await Promise.all([
    admin.from("profiles").select("id").eq("is_admin", true),
    admin.from("member_roles").select("profile_id").in("rol", ["admin", "junta"]),
  ]);
  const ids = [
    ...new Set([
      ...(porColumna ?? []).map((a) => a.id),
      ...(porRol ?? []).map((r) => r.profile_id),
    ]),
  ];

  await avisar(ids, {
    tipo: "ficha_no_encontrada",
    titulo: "Un socio no encuentra su ficha",
    // EL EMAIL VA DENTRO porque es el único dato que la junta tiene para saber a quién
    // crearle la ficha: quien aún no se ha vinculado no tiene nombre en la app.
    cuerpo: `${perfil?.email ?? "Alguien"} se ha registrado y no está en la lista del orden de fuerza. Hay que crearle la ficha a mano.`,
    url: "/club/socios",
  });

  redirect("/club/vincular?avisado=1");
}
