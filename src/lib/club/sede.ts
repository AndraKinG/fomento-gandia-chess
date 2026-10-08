/**
 * Dónde juega el club. ÚNICO sitio con estos datos: lo leen la portada ("Dónde jugamos")
 * y `/unirse` ("Dónde estamos"). Antes iban copiados a mano en las dos páginas.
 *
 * CAMBIO DE SEDE (2026-10-08, aviso del club): el Interclubs pasa al **Centro de Mayores
 * de Corea**, frente a la Guardia Civil. Antes era el Poliesportiu Municipal (Sala de
 * Aeróbic, Avinguda dels Esports, 17).
 *
 * EL MAPA es el enlace de "Compartir" de Google Maps que pasó el propietario: lleva al
 * sitio exacto, que Google llama "Centro Social de Corea". Aquí se deja el nombre que usa
 * el club en su aviso, que es como lo conocen los socios.
 *
 * SIN CALLE NI NÚMERO A PROPÓSITO: ni el aviso del club ni la ficha de Google la dan, y
 * no se pone una inventada. "Frente a la Guardia Civil" es la referencia del propio club.
 */
export const SEDE = {
  nombre: "Centro de Mayores de Corea",
  referencia: "Frente a la Guardia Civil · Gandia (València)",
  detalle:
    "Un sitio cómodo, accesible y a pie de calle. Si vienes en coche, cerca suele haber sitio para aparcar.",
  mapa: "https://maps.app.goo.gl/GW7EN3n4reTXnXyZ7",
} as const;
