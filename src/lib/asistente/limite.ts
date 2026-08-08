/**
 * Freno de mensajes por socio.
 *
 * POR QUÉ HACE FALTA: la capa gratuita de Gemini va por minutos, y basta con que
 * alguien se quede pulsando Enter para dejar sin asistente al resto del club el
 * resto del rato. Además cada mensaje es una llamada de verdad.
 *
 * SE CUENTA POR SOCIO Y NO POR IP, que es lo que hacía el bot del otro proyecto:
 * aquí hay sesión, así que se sabe quién pregunta, y por IP se penalizaría a dos
 * socios en el mismo local.
 *
 * VIVE EN MEMORIA Y ESO TIENE LETRA PEQUEÑA: en Vercel cada instancia lleva su
 * propia cuenta, así que el tope real puede ser algo más alto si hay varias vivas.
 * Para lo que es —evitar que uno se desboque— sobra; si algún día no bastara, esto
 * se cambia por una tabla o por Vercel KV sin tocar nada más.
 */

/** Mensajes por ventana y socio. Una conversación normal de dudas son cuatro o
 *  cinco mensajes; treinta en diez minutos ya es aporrear. */
export const TOPE = 30;
export const VENTANA_MS = 10 * 60_000;

type Cuenta = { veces: number; hasta: number };

export class Freno {
  private cuentas = new Map<string, Cuenta>();

  /** true si este socio se ha pasado. Cuenta la llamada. */
  pasado(quien: string, ahora: number): boolean {
    const c = this.cuentas.get(quien);
    if (!c || ahora > c.hasta) {
      this.cuentas.set(quien, { veces: 1, hasta: ahora + VENTANA_MS });
      this.limpiar(ahora);
      return false;
    }
    c.veces++;
    return c.veces > TOPE;
  }

  /** Tira las ventanas caducadas. Sin esto el mapa crece con cada socio que pasa
   *  por aquí y no se vacía nunca. */
  private limpiar(ahora: number): void {
    for (const [quien, c] of this.cuentas) {
      if (ahora > c.hasta) this.cuentas.delete(quien);
    }
  }
}

/** Uno por instancia del servidor. */
export const freno = new Freno();
