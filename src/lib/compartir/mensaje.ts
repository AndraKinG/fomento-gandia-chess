/**
 * El texto que sale al compartir una pantalla por WhatsApp.
 *
 * POR QUÉ UN MÓDULO PURO Y NO TEXTO SUELTO EN CADA PANTALLA: son cuatro sitios que
 * comparten y el mensaje tiene que leerse igual en los cuatro. Escrito en cada pantalla,
 * uno acaba con emoji y otro sin, uno pone la fecha delante y otro detrás, y el grupo del
 * club recibe cuatro formatos distintos de la misma app.
 *
 * LA REGLA DE FONDO: el mensaje tiene que valer SIN abrir el enlace. Quien lo recibe está
 * en un grupo de WhatsApp con el móvil en la mano, y si para saber de qué torneo hablamos
 * hay que pulsar, la mitad no pulsa. Por eso van dentro el qué, el cuándo y el dónde, y
 * el enlace es para quien quiera apuntarse.
 *
 * LÍNEAS VACÍAS FUERA: los datos vienen de la base y muchos son opcionales (un torneo sin
 * hora, una jornada sin sede). Dejarlas daba mensajes con huecos y guiones sueltos.
 *
 * EL ENLACE VA DENTRO DEL TEXTO, no en el campo `url` de `navigator.share`: ver
 * `BotonCompartir.tsx`, donde está el motivo.
 */

/**
 * El dominio de producción, escrito aquí y no sacado de `window.location`.
 *
 * A PROPÓSITO: quien comparte puede estar en una vista previa de Vercel o en localhost,
 * y entonces mandaría al grupo un enlace que no abre nadie. El mensaje tiene que llevar
 * SIEMPRE la dirección buena, comparta quien comparta y desde donde comparta.
 */
export const URL_APP = "https://fomento-gandia-chess-swart.vercel.app";

/** La dirección completa de una pantalla, para meterla en un mensaje. */
export function enlace(ruta: string): string {
  return URL_APP + (ruta.startsWith("/") ? ruta : `/${ruta}`);
}

/** Una línea del mensaje; lo que no sea texto con contenido se cae. */
export type Linea = string | null | undefined | false;

/** Junta título, líneas y enlace en un mensaje de WhatsApp. */
export function mensaje(titulo: string, lineas: Linea[], url: string): string {
  const cuerpo = lineas
    .filter((l): l is string => typeof l === "string" && l.trim() !== "")
    .map((l) => l.trim());
  // El enlace separado por una línea en blanco: pegado al texto, WhatsApp se come el
  // último carácter dentro del enlace cuando la línea de antes acaba en signo.
  return [titulo.trim(), ...cuerpo].join("\n") + "\n\n" + url;
}

/**
 * Un torneo de fuera: el caso que pidió el propietario ("para ir a un torneo").
 *
 * VA CUÁNTA GENTE DEL CLUB Y SI QUEDA SITIO EN UN COCHE, que es lo que de verdad decide
 * si alguien se apunta. "Van 6 y queda sitio" convence; un enlace pelado, no.
 */
export function mensajeTorneoFuera(t: {
  nombre: string;
  fechas: string;
  lugar?: string | null;
  hora?: string | null;
  van: number;
  plazasLibres: number;
  url: string;
}): string {
  return mensaje(
    `♟️ ${t.nombre}`,
    [
      `📅 ${t.fechas}${t.hora ? ` · ${t.hora}` : ""}`,
      t.lugar && `📍 ${t.lugar}`,
      t.van > 0 && `Vamos ${t.van} del club.`,
      t.plazasLibres > 0 &&
        (t.plazasLibres === 1 ? "Queda 1 plaza en coche." : `Quedan ${t.plazasLibres} plazas en coche.`),
      "¿Te apuntas?",
    ],
    t.url
  );
}

/** Un torneo del club, para llamar a inscribirse. */
export function mensajeTorneoClub(t: {
  nombre: string;
  sistema: "liguilla" | "suizo";
  fecha?: string | null;
  inscritos: number;
  abierto: boolean;
  url: string;
}): string {
  return mensaje(
    `♟️ ${t.nombre}`,
    [
      `Torneo del club · ${t.sistema === "liguilla" ? "Liguilla" : "Sistema suizo"}`,
      t.fecha && `📅 ${t.fecha}`,
      t.inscritos > 0 &&
        (t.inscritos === 1 ? "Hay 1 inscrito." : `Ya hay ${t.inscritos} inscritos.`),
      t.abierto ? "Apúntate desde la app." : "Sigue la clasificación en la app.",
    ],
    t.url
  );
}

/** Una jornada de Interclubs. */
export function mensajeJornada(j: {
  equipo: string;
  rival: string;
  esLocal: boolean;
  fecha: string;
  sede?: string | null;
  url: string;
}): string {
  return mensaje(
    `🛡️ ${j.equipo} · ${j.esLocal ? "contra" : "fuera contra"} ${j.rival}`,
    [`📅 ${j.fecha}`, j.sede && `📍 ${j.sede}`],
    j.url
  );
}

/**
 * La app entera, para el mensaje de "instálatela".
 *
 * ES EL QUE MÁS SE VA A USAR y el que menos se ve venir: el club tiene que poder mandar
 * la app al grupo el día del lanzamiento sin que nadie escriba el mensaje a mano.
 */
export function mensajeApp(url: string): string {
  return mensaje(
    "♟️ La app del Fomento de Gandia",
    [
      "Calendario, convocatorias, resultados, quién va a cada torneo y con quién ir.",
      "Entra con el código del club y vincula tu ficha.",
    ],
    url
  );
}
