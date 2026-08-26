"use client";

/**
 * Lo que se ve si algo se rompe de verdad.
 *
 * POR QUÉ HACÍA FALTA: sin este fichero, un error que se escape al pintar deja la
 * pantalla de fábrica de Next —en producción, "Application error: a client-side
 * exception has occurred" sobre fondo blanco y nada más—. No dice qué hacer, no tiene
 * dónde pulsar y no se parece a la app, así que se lee como "la app está rota" y no como
 * "esta pantalla ha fallado".
 *
 * TIENE QUE LLEVAR SU PROPIO `html` Y `body`: `global-error` sustituye al layout raíz
 * entero, porque el error puede venir de ahí. De ahí que los colores vayan escritos a
 * mano en vez de con las variables del tema: las carga `globals.css` desde el layout,
 * que aquí no ha llegado a pintarse.
 *
 * `reset()` VUELVE A INTENTARLO sin recargar. Muchos de estos fallos son de una lectura
 * que ha ido mal una vez, así que reintentar arregla más de lo que parece; y si no,
 * queda el enlace al club, que sí recarga de cero.
 *
 * NO SE ENSEÑA EL MENSAJE DEL ERROR: a un socio no le dice nada, y puede llevar dentro
 * el nombre de una tabla o de una columna. El `digest` sí, que es un identificador sin
 * contenido y es lo que permite encontrar el fallo en los registros de Vercel.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f0f9ff",
          color: "#0c4a6e",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <p style={{ fontSize: "2.25rem", opacity: 0.4, margin: 0 }} aria-hidden>
            ♞
          </p>
          <h1 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0.5rem 0 0" }}>
            Algo ha fallado
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#556577", margin: "0.5rem 0 1.25rem" }}>
            No es cosa tuya. Prueba otra vez; si sigue igual, vuelve al club y entra de
            nuevo.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                borderRadius: "0.75rem",
                border: "none",
                background: "#0369a1",
                color: "#fff",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Volver a intentarlo
            </button>
            <a
              href="/club"
              style={{
                borderRadius: "0.75rem",
                border: "1px solid #bae6fd",
                color: "#0c4a6e",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Ir al club
            </a>
          </div>
          {error.digest && (
            <p style={{ fontSize: "0.7rem", color: "#8fa8c4", marginTop: "1.25rem" }}>
              Referencia: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
