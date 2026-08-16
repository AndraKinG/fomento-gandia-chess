"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionActual } from "@/lib/auth/sesion";
import { esTemaValido } from "@/lib/ajedrez/temas";
import { esJuegoValido } from "@/lib/ajedrez/piezas";
import { SITIOS } from "@/lib/asistente/boton";
import type { GrupoAviso } from "@/lib/avisos/politica";
import { moteOcupado, textoOcupado, validarMote } from "@/lib/club/mote";
import { avisar } from "@/lib/avisos/enviar";

/** Los únicos cuatro valores válidos. Cualquier otra cosa que llegue del
 *  cliente se descarta antes de tocar la base (ver comentario más abajo). */
const GRUPOS_VALIDOS: readonly GrupoAviso[] = ["interclubs", "torneos", "partidas", "gestion"];

function esGrupoValido(valor: string): valor is GrupoAviso {
  return (GRUPOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Guarda qué grupos de avisos tiene silenciados el socio de la sesión.
 *
 * POR QUÉ CON CLAVE DE SERVICIO Y NO "EL CLIENTE DE USUARIO" (el encargo
 * original de esta tarea decía lo segundo; es imposible y fallaría en
 * silencio). La única policy de UPDATE que existe sobre `profiles` es
 * "perfil escribe admin" (supabase/migrations/0001_init.sql), y exige
 * `public.is_admin()` tanto en el USING como en el WITH CHECK. Un socio
 * normal que intente actualizar su propia fila con su sesión no salta
 * ningún error: Postgres simplemente no encuentra ninguna fila que cumpla
 * la policy, así que el UPDATE afecta a 0 filas y no lanza. La pantalla
 * parecería haber guardado la preferencia y en realidad no habría cambiado
 * nada en la base — el peor tipo de fallo, porque no se nota.
 *
 * Tampoco se abre una policy nueva para esta columna: limitarla solo a
 * `avisos_silenciados` (y no a `email`, `player_id`, `is_admin`...)
 * necesitaría además un trigger que bloqueara el resto de columnas de la
 * fila. Eso es más superficie de ataque que esta action, que ya resuelve el
 * problema comprobando la sesión y filtrando los valores antes de escribir:
 * es el mismo patrón que usan las otras ~20 acciones de servidor del
 * proyecto (comprobar identidad y rol ANTES de escribir con service_role).
 *
 * El id del perfil sale SIEMPRE de la sesión del servidor (`user.id`), nunca
 * de un argumento que mande el cliente: así no hay forma de que alguien
 * llame a esta action pidiendo cambiar la fila de otro socio.
 */
export async function guardarPreferenciasAvisos(
  silenciados: GrupoAviso[]
): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Filtra cualquier valor que no sea uno de los cuatro grupos: lo que llega
  // del cliente no es de fiar (podría venir de una llamada manual a la
  // action, no solo del interruptor de la pantalla), y a diferencia de
  // `notifications.grupo` (que sí tiene un CHECK en la 0028),
  // `profiles.avisos_silenciados` es un array de texto sin restricción en la
  // base: esta validación es la única puerta que tiene.
  const limpios = Array.from(new Set(silenciados.filter(esGrupoValido)));

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ avisos_silenciados: limpios })
    .eq("id", user.id);

  if (error) return { error: "No se pudo guardar la preferencia" };
  return {};
}

/**
 * Guarda el tema del tablero del socio de la sesión.
 *
 * Clave de servicio por el mismo motivo que `guardarPreferenciasAvisos` (ver su
 * comentario: la única policy de UPDATE de `profiles` es de admin, y un update
 * de socio afecta a 0 filas SIN error). El id sale de la sesión, nunca del
 * cliente, y la clave se valida contra el catálogo antes de escribir.
 */
export async function elegirTablero(clave: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  if (!esTemaValido(clave)) return { error: "Ese tema no existe." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ tema_tablero: clave })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar el tema" };

  // El tema lo provee el layout: sin esto, el tablero nuevo no se ve hasta
  // recargar a mano.
  revalidatePath("/club", "layout");
  return {};
}

/**
 * Guarda las aperturas favoritas EN LA FICHA del socio de la sesión.
 *
 * Van en `players` y no en `profiles` a propósito (migración 0030): la RLS de
 * `profiles` solo deja leer al dueño y al admin, y la gracia de las aperturas es
 * que los demás las vean en tu ficha de socio. La ficha que se escribe es SIEMPRE
 * la de la sesión: nadie puede ponerle aperturas a otro.
 */
export async function guardarAperturas(texto: string): Promise<{ error?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };

  // Tope corto y sin saltos de línea: es una línea de la ficha ("Italiana,
  // Siciliana Najdorf"), no una biografía. El recorte va aquí y no solo en el
  // `maxLength` del input, que cualquier llamada a mano se salta.
  const limpio = texto.replaceAll(/\s+/g, " ").trim().slice(0, 120);

  const admin = createAdminClient();
  const { error } = await admin
    .from("players")
    .update({ aperturas: limpio === "" ? null : limpio })
    .eq("id", sesion.playerId);
  if (error) return { error: "No se pudieron guardar las aperturas" };

  revalidatePath("/club/perfil");
  revalidatePath(`/club/socios/${sesion.playerId}`);
  return {};
}

/** La foto no puede pasar de esto NI llegando recortada: es el mismo tope que
 *  tiene puesto el bucket (migración 0030). */
const FOTO_MAX_BYTES = 1_048_576;
const TIPOS_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Sube (o reemplaza) la foto de la ficha del socio de la sesión.
 *
 * EL NAVEGADOR RECORTA Y ENCOGE ANTES DE SUBIR (ver `FotoPerfil.tsx`): una foto
 * de móvil sin tocar son 5 MB, y guardarla entera es pagar almacenamiento por
 * píxeles que se van a pintar a 160px. Aun así el servidor NO se fía: vuelve a
 * comprobar tipo y tamaño, porque el recorte del cliente se lo salta cualquiera.
 *
 * SIEMPRE EL MISMO NOMBRE (`<ficha>.jpg`, upsert): reemplazar la foto no deja
 * huérfanas la anteriores, y borrar es borrar un solo objeto. `foto_url` guarda
 * la RUTA dentro del bucket, no una URL: el bucket es privado y las URLs firmadas
 * caducan, así que guardar una URL sería guardar algo que deja de funcionar.
 */
export async function subirFoto(datos: FormData): Promise<{ error?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };

  const foto = datos.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { error: "No ha llegado ninguna foto." };
  if (!TIPOS_FOTO.has(foto.type)) return { error: "Tiene que ser una imagen (JPG, PNG o WebP)." };
  if (foto.size > FOTO_MAX_BYTES) {
    return { error: "La foto pesa demasiado incluso recortada. Prueba con otra." };
  }

  const admin = createAdminClient();
  const ruta = `${sesion.playerId}.jpg`;
  const { error: errorSubida } = await admin.storage
    .from("fotos")
    .upload(ruta, foto, { contentType: foto.type, upsert: true });
  if (errorSubida) return { error: "No se pudo subir la foto." };

  const { error } = await admin
    .from("players")
    .update({ foto_url: ruta })
    .eq("id", sesion.playerId);
  if (error) return { error: "La foto subió pero no se pudo apuntar en la ficha." };

  revalidatePath("/club/perfil");
  revalidatePath(`/club/socios/${sesion.playerId}`);
  return {};
}

/** Quita la foto de la ficha del socio de la sesión. */
export async function quitarFoto(): Promise<{ error?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };

  const admin = createAdminClient();
  await admin.storage.from("fotos").remove([`${sesion.playerId}.jpg`]);
  const { error } = await admin
    .from("players")
    .update({ foto_url: null })
    .eq("id", sesion.playerId);
  if (error) return { error: "No se pudo quitar la foto." };

  revalidatePath("/club/perfil");
  revalidatePath(`/club/socios/${sesion.playerId}`);
  return {};
}

/** Guarda el juego de piezas. Espejo exacto de `elegirTablero`, y por los
 *  mismos motivos (ver su comentario). */
export async function elegirPiezas(clave: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  if (!esJuegoValido(clave)) return { error: "Ese juego no existe." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ juego_piezas: clave })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar el juego" };

  revalidatePath("/club", "layout");
  return {};
}

/**
 * Guarda dónde quiere el socio el botón del asistente, o que no lo quiere ver.
 *
 * MISMA FORMA QUE `elegirPiezas`, y la validación no es un adorno: la columna tiene un
 * `check` en la base (migración 0044), así que un valor raro daría un error de Postgres
 * en vez de un mensaje entendible.
 */
export async function elegirAsistente(clave: string): Promise<{ error?: string }> {
  const sesion = await sesionActual();
  if (!sesion) return { error: "No autenticado" };
  if (!SITIOS.some((s) => s.clave === clave)) return { error: "Esa opción no existe." };

  const admin = createAdminClient();
  // Elegir esquina BORRA el arrastre (migración 0045): es la forma de deshacer un
  // botón dejado en un sitio raro, y sin esto el ajuste del perfil no haría nada
  // visible para quien ya lo había movido.
  const { error } = await admin
    .from("profiles")
    .update({ asistente_boton: clave, asistente_x: null, asistente_y: null })
    .eq("id", sesion.userId);
  if (error) return { error: "No se pudo guardar" };

  // El botón lo monta el layout del club, así que se revalida el layout entero: sin
  // esto el ajuste no se nota hasta la siguiente recarga completa.
  revalidatePath("/club", "layout");
  return {};
}

/**
 * Guarda dónde ha soltado el socio el botón del asistente (migración 0045).
 *
 * EN FRACCIONES DE PANTALLA, ya sujetadas por el navegador, y aquí se vuelven a
 * comprobar: la columna tiene un `check` de 0 a 1 en la base, así que un valor fuera de
 * rango daría un error de Postgres en mitad de un arrastre.
 *
 * NO REVALIDA NADA a propósito, y es la diferencia con `elegirAsistente`: el botón ya
 * está donde lo has soltado —lo pintó el navegador— así que rehacer el layout entero
 * solo serviría para que parpadeara la pantalla al soltar.
 */
export async function moverAsistente(x: number, y: number): Promise<{ error?: string }> {
  const sesion = await sesionActual();
  if (!sesion) return { error: "No autenticado" };
  const valido = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (!valido(x) || !valido(y)) return { error: "Posición fuera de la pantalla." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ asistente_x: x, asistente_y: y })
    .eq("id", sesion.userId);
  return error ? { error: "No se pudo guardar" } : {};
}

/**
 * El socio PIDE su mote; la junta lo aprueba (migraciones 0041 y 0043).
 *
 * POR QUÉ SE PIDE Y NO SE PONE (decisión del propietario, 2026-08-13): el mote lo ve el
 * club entero en todas las pantallas, así que un campo libre en manos de 46 personas
 * acaba con alguien llamándose algo que no toca. Y al revés, nadie sabe mejor que uno
 * mismo cómo le llaman: pedirlo tú y que lo aprueben es lo que respeta las dos cosas.
 *
 * ESCRIBE EN `apodo_solicitado`, NUNCA EN `apodo`: hasta que la junta lo apruebe, el
 * club sigue viendo el nombre de antes. El socio ve su solicitud pendiente en su perfil.
 *
 * EL MISMO VALIDADOR QUE USA LA JUNTA (`validarMote`), y la comprobación de que esté
 * libre cuenta también los motes PEDIDOS y sin aprobar: si no, dos socios piden "Ximo"
 * el mismo día, a los dos se les dice que perfecto, y el problema aparece cuando la
 * junta aprueba el segundo. Quien pide primero, reserva.
 */
export async function solicitarMote(mote: string): Promise<{ error?: string; ok?: string }> {
  const sesion = await sesionActual();
  if (!sesion?.playerId) return { error: "Necesitas tener ficha del club." };

  const revisado = validarMote(mote);
  if (!revisado.ok) return { error: revisado.error };
  const valor = revisado.valor || null;

  const admin = createAdminClient();

  if (valor) {
    // Las 46 filas y se decide con el módulo puro: la regla cruza dos columnas y
    // expresarla en PostgREST daría un filtro ilegible para ahorrar una lectura mínima.
    const { data: otros } = await admin
      .from("players")
      .select("nombre, apodo, apodo_solicitado")
      .neq("id", sesion.playerId);
    const ocupado = moteOcupado(
      valor,
      (otros ?? []).map((p) => ({
        nombre: p.nombre as string,
        apodo: p.apodo as string | null,
        apodoSolicitado: p.apodo_solicitado as string | null,
      }))
    );
    if (ocupado) return { error: textoOcupado(ocupado) };
  }

  const { error } = await admin
    .from("players")
    .update({ apodo_solicitado: valor })
    .eq("id", sesion.playerId);
  if (error) return { error: "No se pudo guardar la solicitud." };

  // A la junta, para que lo vea sin tener que pasar por la pantalla a mirar. Si el socio
  // retira su solicitud (valor null) no se avisa de nada: no hay nada que aprobar.
  if (valor) {
    const { data: junta } = await admin.from("member_roles").select("profile_id");
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("is_admin", true);
    const destinatarios = [
      ...new Set([
        ...(junta ?? []).map((r) => r.profile_id as string),
        ...(admins ?? []).map((p) => p.id as string),
      ]),
    ].filter((id) => id !== sesion.userId);
    await avisar(destinatarios, {
      tipo: "mote_pedido",
      titulo: "Un socio pide su mote",
      cuerpo: `${sesion.nombre ?? "Un socio"} quiere llamarse "${valor}".`,
      url: "/club/admin/orden-fuerza",
    });
  }

  revalidatePath("/club/perfil");
  revalidatePath("/club/admin/orden-fuerza");
  return { ok: valor ? "Pedido. La junta lo tiene que aprobar." : "Solicitud retirada." };
}
