import { alcanza, type Rango } from "@/lib/asistente/rangos";

/**
 * La guía de la app: qué hay y qué puede hacer cada uno.
 *
 * UNA SOLA FUENTE PARA DOS BOCAS: de aquí leen la pantalla "¿Qué puedes hacer
 * aquí?" del perfil Y el mapa de la app que se le da al asistente. Antes el
 * asistente llevaba el suyo escrito a mano en `instrucciones.ts`, y dos textos
 * que cuentan lo mismo en dos sitios acaban contando cosas distintas.
 *
 * RECORTADA POR RANGO con la misma escala del asistente (`rangos.ts`): a un
 * jugador no se le enseña la sección de admin — ni en pantalla ni en lo que el
 * modelo ve, que lo que no ve no lo puede mencionar. Los CARGOS SE ACUMULAN
 * (un admin ve también lo de junta y jugador), así que basta el mínimo.
 *
 * TEXTOS CORTOS a propósito (regla del propietario): qué es y qué haces ahí,
 * sin razonar el reglamento. El detalle se pregunta al asistente, que para eso
 * comparte esta misma guía.
 */

export type SeccionGuia = {
  clave: string;
  icono: string;
  titulo: string;
  /** Rango mínimo que la ve. */
  rango: Rango;
  /** Qué es, en una línea. */
  que: string;
  /** Qué puedes hacer ahí, una cosa por punto. */
  puntos: string[];
};

export const GUIA: readonly SeccionGuia[] = [
  {
    clave: "inicio",
    icono: "🏠",
    titulo: "Inicio",
    rango: "jugador",
    que: "Lo que está pasando en el club, de un vistazo.",
    puntos: [
      "Próximas jornadas y torneos",
      "Torneos del club en marcha",
      "Accesos a lo que tengas pendiente",
    ],
  },
  {
    clave: "interclubs",
    icono: "🛡️",
    titulo: "Interclubs",
    rango: "jugador",
    que: "La liga por equipos de la FACV: equipos, calendario y orden de fuerza.",
    puntos: [
      "Calendario de cada equipo con el acta tablero a tablero",
      "Marcar tu disponibilidad para las jornadas",
      "Orden de fuerza oficial, por número o por ELO",
      "Temporadas pasadas, con el desplegable de arriba",
    ],
  },
  {
    clave: "torneos",
    icono: "🏆",
    titulo: "Torneos",
    rango: "jugador",
    que: "El calendario de torneos de fuera (FACV) y su logística.",
    puntos: [
      "Decir si vas a cada torneo",
      "Cuadrar los coches para ir",
      "Los torneos del club NO están aquí: están en Jugar",
    ],
  },
  {
    clave: "jugar",
    icono: "♟️",
    titulo: "Jugar",
    rango: "jugador",
    que: "Todo lo que se juega en la app: retos y torneos del club.",
    puntos: [
      "Retar a cualquier socio conectado (el punto verde lo dice)",
      "Cadencia de siempre o a tu medida, y color a elegir o al azar",
      "Torneos del club: inscribirte, rondas, clasificación y ranking de ELO propio",
      "Al acabar, la partida entra sola en el repositorio",
    ],
  },
  {
    clave: "partidas",
    icono: "📖",
    titulo: "Partidas",
    rango: "jugador",
    que: "El repositorio compartido de partidas del club.",
    puntos: [
      "Subir las tuyas moviendo piezas o pegando el PGN",
      "Reproducir cualquiera y analizarla con motor",
      "Buscar por nombre e importar de Lichess o Chess.com",
    ],
  },
  {
    clave: "perfil",
    icono: "👤",
    titulo: "Perfil",
    rango: "jugador",
    que: "Tu ficha y tu experiencia en la app.",
    puntos: [
      "Foto y aperturas favoritas, que salen en tu ficha de socio",
      "Colores del tablero y juego de piezas, a tu gusto",
      "Tema claro u oscuro y qué avisos quieres recibir",
    ],
  },
  {
    clave: "avisos",
    icono: "🔔",
    titulo: "Avisos",
    rango: "jugador",
    que: "Todo lo que te ha pasado en el club, en una bandeja.",
    puntos: [
      "Retos, resultados y novedades, con su enlace",
      "Notificaciones en el móvil si las activas en el perfil",
    ],
  },
  {
    clave: "asistente",
    icono: "💬",
    titulo: "Asistente",
    rango: "jugador",
    que: "El botón flotante de abajo a la derecha.",
    puntos: [
      "Pregúntale de ajedrez o del club: consulta los datos reales",
      "Sabe usar la app: si no encuentras algo, pregúntale dónde está",
    ],
  },
  {
    clave: "solicitudes",
    icono: "📥",
    titulo: "Solicitudes de ingreso",
    rango: "junta",
    que: "Las altas de socios nuevos, que aprueba la junta.",
    puntos: [
      "Revisar y aprobar solicitudes de ingreso al club",
      "Se llega desde el perfil; avisa cuando hay pendientes",
    ],
  },
  {
    clave: "admin",
    icono: "⚙️",
    titulo: "Administración",
    rango: "admin",
    que: "La gestión del club entera, solo para el administrador.",
    puntos: [
      "Orden de fuerza, calendario y actas: importar y sincronizar",
      "Vinculaciones de cuentas, roles y código de acceso",
      "Equipos y capitanes de la temporada",
      "Actualización de ELO, notificaciones y datos de uso",
    ],
  },
];

/** Las secciones que le tocan a un rango, en el orden de la navegación. */
export function guiaPara(rango: Rango): SeccionGuia[] {
  return GUIA.filter((s) => alcanza(rango, s.rango));
}

/**
 * La misma guía dicha para el MODELO: es el bloque "qué hay en la aplicación"
 * de las instrucciones del asistente. Filtrada por el mismo rango que la
 * pantalla — lo que el modelo no ve, no lo puede mencionar ni explicar.
 */
export function guiaParaElModelo(rango: Rango): string {
  return guiaPara(rango)
    .map((s) => `- ${s.titulo}: ${s.que} ${s.puntos.join("; ")}.`)
    .join("\n");
}
