/**
 * Iconos de la navegación.
 *
 * POR QUÉ SON SVG Y NO EMOJI: la barra usaba `🏠 ♟ ♛ 🏆 ♜ 👤 ⚙️`, y eso son dos
 * familias mezcladas. Los glifos de ajedrez (♟ ♛ ♜) los pinta el sistema en negro
 * y a un tamaño distinto de los emoji de color (🏠 🏆 ⚙️), así que la fila salía
 * descuadrada, con la mitad de los iconos sin poder tomar el color del tema y con
 * un dibujo diferente en Windows, iOS y Android.
 *
 * Estos son de trazo y usan `currentColor`, así que siguen al texto: se ponen
 * blancos sobre el azul del elemento activo y del color de la tinta cuando no lo
 * está, y miden exactamente lo mismo.
 */
type Props = { className?: string };

const COMUN = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Inicio: casa. */
export function IconoInicio({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** Interclubs: dos peones, porque es la competición por equipos. */
export function IconoInterclubs({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <circle cx="8.5" cy="6" r="2.5" />
      <path d="M6 20h5l-.8-6.5H6.8L6 20Z" />
      <path d="M5 20h7" />
      <circle cx="16.5" cy="9" r="2" />
      <path d="M14.5 20h4l-.6-5h-2.8l-.6 5Z" />
      <path d="M13.5 20h6" />
    </svg>
  );
}

/** Club: corona, los torneos internos y el ELO propio. */
export function IconoClub({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <path d="M4 8l3 3.5L12 5l5 6.5L20 8l-1.5 9h-13L4 8Z" />
      <path d="M5.5 20h13" />
    </svg>
  );
}

/** Torneos: copa. */
export function IconoTorneos({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4.5V7a3 3 0 0 0 3 3" />
      <path d="M17 5.5h2.5V7a3 3 0 0 1-3 3" />
      <path d="M12 13v4" />
      <path d="M8.5 20h7l-.7-3h-5.6l-.7 3Z" />
    </svg>
  );
}

/** Partidas: torre, el repositorio de partidas. */
export function IconoPartidas({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <path d="M7 4v3M12 4v3M17 4v3" />
      <path d="M6 4h12v4l-2 2 .8 8H7.2L8 10 6 8V4Z" />
      <path d="M5.5 20h13" />
    </svg>
  );
}

/** Perfil: persona. */
export function IconoPerfil({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
    </svg>
  );
}

/** Admin: engranaje. */
export function IconoAdmin({ className }: Props) {
  return (
    <svg {...COMUN} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
    </svg>
  );
}

/**
 * Caballo del escudo del club.
 *
 * ES EL CARÁCTER `♞` A PROPÓSITO, no un dibujo. En la barra lateral salía un
 * CUADRADO AZUL porque llevaba un degradado recortado al texto
 * (`bg-degradado-club bg-clip-text text-transparent`): el navegador recortaba el
 * degradado a la caja del `span`, no a la silueta de la pieza. El glifo en sí se
 * pinta perfectamente —en la cabecera del móvil siempre se ha visto bien—, así que
 * el arreglo es quitar el recorte y darle un color plano, no redibujar un caballo,
 * que es la pieza más difícil de dibujar a mano y la que más se nota si sale mal.
 *
 * Lleva `leading-none` porque un glifo de texto arrastra la altura de línea de la
 * fuente y sin eso descuadra la fila en la que esté.
 */
export function Caballo({ className }: Props) {
  return (
    <span aria-hidden className={`inline-block text-center leading-none ${className ?? ""}`}>
      ♞
    </span>
  );
}
