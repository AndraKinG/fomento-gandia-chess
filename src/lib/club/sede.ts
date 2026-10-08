/**
 * Dónde juega el club. ÚNICO sitio con estos datos: lo leen la portada ("Dónde jugamos")
 * y `/unirse` ("Dónde estamos"). Antes iban copiados a mano en las dos páginas.
 *
 * CAMBIO DE SEDE (2026-10-08, aviso del club): el Interclubs pasa al **Centro de Mayores
 * de Corea**, frente a la Guardia Civil. Antes era el Poliesportiu Municipal (Sala de
 * Aeróbic, Avinguda dels Esports, 17).
 *
 * SIN CALLE NI NÚMERO A PROPÓSITO: el aviso del club no la da y no se encontró en
 * ninguna fuente fiable, así que no se pone una inventada. El enlace del mapa es una
 * BÚSQUEDA en Google Maps (formato oficial `maps/search/?api=1&query=`), no un punto
 * fijo. Cuando el propietario pase el enlace de "Compartir" de Google Maps del sitio
 * exacto, se cambia `mapa` por ese y se añade `direccion`.
 */
export const SEDE = {
  nombre: "Centro de Mayores de Corea",
  referencia: "Frente a la Guardia Civil · Gandia (València)",
  detalle:
    "Un sitio cómodo, accesible y a pie de calle. Si vienes en coche, cerca suele haber sitio para aparcar.",
  mapa:
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Centro de Mayores Corea Gandia"),
} as const;
