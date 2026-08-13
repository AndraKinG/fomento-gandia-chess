import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { nombreDeFila } from "@/lib/club/nombre-socio";

export { nombreDePila } from "@/lib/auth/nombre";

/** Roles que se conceden a dedo. `jugador` no está: se deduce de tener ficha. */
export type Rol = "junta" | "admin";

export type Sesion = {
  userId: string;
  email: string;
  /** true si tiene ficha del club aprobada. Es la definición de "jugador". */
  esJugador: boolean;
  esAdmin: boolean;
  /** La junta gestiona altas de socios. Un admin también puede, por acumulación. */
  esJunta: boolean;
  /** null = cuenta creada pero sin ficha del club aprobada todavía. */
  playerId: string | null;
  /** Nombre de la ficha, null si no tiene. Sale del mismo `select` que el rango,
   *  así que no cuesta ninguna consulta más: es para poder saludar por el nombre
   *  en vez de por el correo, que como saludo queda frío y además es un dato que
   *  no hace falta repetir en cada pantalla. */
  nombre: string | null;
  /**
   * La ficha es de pruebas (migración 0040).
   *
   * Sirve para que la cuenta no se anuncie: con esto puesto no se registra en la
   * presencia, así que no sale en "quién está mirando". Y al revés, las fichas de
   * prueba solo se ofrecen en las listas de retos y rivales a los admins, que son
   * los únicos que tienen algo que probar con ellas.
   */
  fichaDePrueba: boolean;
};


/**
 * Sesión, perfil y rangos del usuario actual, o null si no hay sesión.
 *
 * **Punto único donde se decide el rango en la aplicación.** Antes cada sitio
 * leía `profiles.is_admin` por su cuenta (el layout de admin, `esAdmin()`, el
 * cromo de /club y el aviso de vinculación), y eso dejaba la puerta abierta a que
 * la base de datos y la interfaz no opinaran lo mismo: `is_admin()` de Postgres
 * acepta la columna vieja **o** el rol nuevo, así que a alguien nombrado admin
 * por rol la RLS le habría dejado pasar y la app le habría echado a la calle.
 *
 * Aquí se aplica la MISMA regla que la función de SQL: columna vieja O rol.
 *
 * Envuelto en `cache()` de React porque lo consultan los dos layouts de la zona
 * de socios y varias acciones dentro de una misma petición; `cache()` deduplica
 * dentro de la petición, no entre peticiones.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: filasRol }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_admin, player_id, players(nombre, apodo, de_prueba)")
      .eq("id", user.id)
      .single(),
    // Si `member_roles` no existiera (migración 0011 sin aplicar), esto devuelve
    // error y `filasRol` queda null: se sigue con la columna vieja en vez de
    // dejar a todo el mundo fuera de la administración.
    supabase.from("member_roles").select("rol").eq("profile_id", user.id),
  ]);

  const roles = new Set((filasRol ?? []).map((r) => r.rol as Rol));
  const esAdmin = Boolean(profile?.is_admin) || roles.has("admin");

  return {
    userId: user.id,
    email: user.email ?? "",
    esJugador: profile?.player_id != null,
    esAdmin,
    // Por acumulación: el admin puede todo lo que puede la junta.
    esJunta: roles.has("junta") || esAdmin,
    playerId: profile?.player_id ?? null,
    // EL MOTE, si lo tiene: este `nombre` es el que saluda en la portada y el que
    // aparece en "quién está mirando", así que tiene que ser el del club.
    nombre: profile?.player_id
      ? nombreDeFila(profile?.players)
      : null,
    fichaDePrueba: Boolean(
      (profile?.players as unknown as { de_prueba?: boolean } | null)?.de_prueba
    ),
  };
});
