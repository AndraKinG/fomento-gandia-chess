"use client";

import { createClient } from "./client";

/**
 * Cliente de navegador con el TOKEN DEL USUARIO ya puesto en el socket de tiempo
 * real.
 *
 * POR QUÉ EXISTE, y costó medirlo: el canal se suscribía bien (`SUBSCRIBED`) pero no
 * llegaba ni un aviso. Comprobado con dos clientes contra la misma fila: con la
 * clave de servicio el aviso llega; con la clave anónima y sin sesión, no llega
 * ninguno. La causa es que `postgres_changes` aplica la RLS al que escucha, y
 * nuestras políticas exigen socio vinculado (`esta_vinculado()`): si el socket no
 * lleva el token del usuario, el servidor no ve a nadie y lo filtra todo.
 *
 * `createBrowserClient` acaba poniendo ese token cuando la sesión se resuelve, pero
 * un `subscribe()` dentro de un `useEffect` del primer render llega antes. Aquí se
 * espera a la sesión y se pone a mano ANTES de suscribir nada.
 *
 * Sin esto, la partida en vivo funcionaba solo gracias al reintento cada dos
 * segundos: las jugadas tardaban en aparecer y el chat obligaba a recargar.
 */
export async function clienteEnVivo() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    await supabase.realtime.setAuth(session.access_token);
  }
  // `conSesion` se devuelve para poder DECIRLO en pantalla. Sin él, un canal que se
  // suscribe pero no recibe nada es indistinguible de uno que funciona y no tiene
  // novedades, que es exactamente lo que costó dos rondas averiguar.
  return { supabase, conSesion: Boolean(session?.access_token) };
}
