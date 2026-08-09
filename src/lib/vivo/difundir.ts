/**
 * Avisar a la mesa de que la partida ha cambiado, por difusión.
 *
 * POR QUÉ ESTO Y NO `postgres_changes`. La primera versión escuchaba los cambios de
 * la tabla, y NUNCA llegó ni un aviso: `postgres_changes` aplica la RLS al que
 * escucha, y algo de nuestras políticas lo deja fuera. La partida se sostenía a base
 * de repreguntar cada 400 ms, con el retardo que eso deja.
 *
 * La DIFUSIÓN va por el mismo socket —que sabemos sano, porque el círculo de
 * conectado funciona al instante— pero no consulta ninguna tabla: es un mensaje de
 * un canal a los que estén escuchando. Sin filas, no hay RLS que aplicar.
 *
 * NO ABRE UN AGUJERO: lo que se difunde ya lo ha decidido y validado la acción de
 * servidor, y quien escucha solo puede ver partidas que la RLS ya le deja leer al
 * abrir la pantalla. Esto no da acceso a nada, solo evita la espera.
 *
 * SI FALLA, NO PASA NADA: el reintento sigue ahí de red de seguridad. Por eso se
 * traga los errores en vez de tumbar la jugada, que ya está guardada.
 */

/** Lo que se manda: la fila tal cual, para que la mesa la pinte sin ir a buscarla. */
export type Difusion = Record<string, unknown>;

export async function difundirPartida(partidaId: string, fila: Difusion): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: clave,
        Authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        messages: [
          {
            // El nombre del canal es el mismo que abre la mesa.
            topic: `partida-${partidaId}`,
            event: "cambio",
            payload: { fila },
          },
        ],
      }),
    });
  } catch {
    // Silencio a propósito: ver el comentario de arriba.
  }
}

/**
 * Lo mismo para un mensaje del chat.
 *
 * Lo usan los eventos de la partida, que los escribe el servidor. Los mensajes que
 * escribe la gente los difunde su propio navegador, que ya los tiene delante.
 */
export async function difundirChat(partidaId: string, mensaje: Difusion): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return;

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: clave,
        Authorization: `Bearer ${clave}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `partida-${partidaId}`,
            event: "chat",
            payload: {
              mensaje: {
                id: mensaje.id,
                playerId: mensaje.player_id ?? null,
                texto: mensaje.texto,
                evento: mensaje.evento ?? null,
                creadoEn: mensaje.creado_en,
              },
            },
          },
        ],
      }),
    });
  } catch {
    // Silencio a propósito: el reintento del navegador lo recogerá igual.
  }
}
