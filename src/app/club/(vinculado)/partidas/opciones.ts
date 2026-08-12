import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocioOpcion, TorneoOpcion } from "./FormularioPartida";

/**
 * Listas para los desplegables del formulario de partida: torneos a los que
 * enlazar y socios a los que señalar como rival.
 *
 * Compartido entre la pantalla de crear y la de editar para que las dos ofrezcan
 * exactamente lo mismo; duplicar las consultas acabaría con una lista de torneos
 * distinta en cada sitio.
 */
export async function cargarOpciones(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any>,
  miFicha: string
): Promise<{ torneos: TorneoOpcion[]; socios: SocioOpcion[] }> {
  const [{ data: torneos }, { data: jugadores }] = await Promise.all([
    // Los más recientes primero: una partida se sube justo después de jugarla,
    // así que el torneo que se busca casi siempre está arriba.
    supabase
      .from("tournaments")
      .select("id, nombre, fecha_inicio")
      .order("fecha_inicio", { ascending: false })
      .limit(60),
    // La ficha de pruebas fuera (migración 0040): nadie juega contra ella de verdad,
    // así que en la lista de rivales solo sería una entrada que no se explica. Se
    // filtra en la consulta y no después, para que no viaje al navegador.
    supabase
      .from("players")
      .select("id, nombre")
      .eq("activo", true)
      .eq("de_prueba", false)
      .order("nombre"),
  ]);

  return {
    torneos: (torneos ?? []).map((t) => ({ id: t.id, nombre: t.nombre })),
    // Uno mismo fuera: no puedes ser tu propio rival, y ofrecerlo solo lleva al
    // error que el check de la base de datos rechazaría.
    socios: (jugadores ?? [])
      .filter((j) => j.id !== miFicha)
      .map((j) => ({ id: j.id, nombre: j.nombre })),
  };
}
