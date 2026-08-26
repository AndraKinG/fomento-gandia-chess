import {
  parsearCabeceraPublica,
  parsearClasificacionPublica,
  parsearEmparejamientosPublicos,
  parsearInscritosPublicos,
  urlPestana,
  type FilaClasificacionPublica,
  type InscritoPublico,
  type MesaPublica,
} from "@/lib/import/chesspairings-publico";

/**
 * Traer de ChessPairings la clasificación y los emparejamientos de un torneo del club.
 *
 * SE LEE SU PÁGINA PÚBLICA Y NO SU API, y es una decisión del propietario que conviene
 * entender antes de "mejorarla" volviendo a la API (2026-08-26):
 *
 * La API estaba escrita, probada y daba JSON limpio. **Pero solo sirve los torneos de la
 * cuenta cuya clave esté configurada.** Y el club quiere que los torneos los cree quien
 * organiza, con su propia cuenta, sin depender de una persona — "quiero que ellos creen
 * los torneos y haya libertad, ya que no me encargo yo de eso". Con la API eso obligaría a
 * guardar la clave de cada organizador en nuestra base —credenciales de terceros— o a que
 * todo pasara por el propietario, que es justo lo que se quería evitar.
 *
 * Su página pública **no pide autenticación**: basta el enlace con su token, que es
 * público por diseño (sus 786 torneos están en el sitemap de chesspairings.org). Probado
 * con un torneo de otra cuenta: clasificación, emparejamientos e inscritos, sin clave.
 *
 * TRES PETICIONES EN PARALELO, una por pestaña: en serie serían tres viajes a Italia por
 * pantalla.
 *
 * CACHÉ DE 60 SEGUNDOS. No es una optimización: sin ella, cada socio que abre la pantalla
 * de un torneo en marcha sería una visita a su servidor, y con veinte personas mirando una
 * ronda eso son sesenta peticiones por minuto para traer lo mismo. Es la misma cifra que
 * usa su plugin oficial de WordPress.
 *
 * NUNCA LANZA. Un torneo que falle no puede tumbar la pantalla: se devuelve el error y
 * arriba se enseña el enlace a su página, que es lo que había antes de todo esto.
 */

const CACHE_SEGUNDOS = 60;

export type LecturaChessPairings = {
  /** El nombre que el torneo tiene ALLÍ, y en qué ronda va. */
  nombre: string | null;
  ronda: number | null;
  rondasTotales: number | null;
  clasificacion: FilaClasificacionPublica[];
  emparejamientos: MesaPublica[];
  inscritos: InscritoPublico[];
  error: "sin-enlace" | "no-existe" | "red" | "vacio" | null;
};

const VACIO: LecturaChessPairings = {
  nombre: null,
  ronda: null,
  rondasTotales: null,
  clasificacion: [],
  emparejamientos: [],
  inscritos: [],
  error: null,
};

async function bajar(
  url: string
): Promise<{ html: string | null; error: LecturaChessPairings["error"] }> {
  try {
    const r = await fetch(url, {
      headers: {
        // EL IDIOMA SE FIJA POR LAS DOS VÍAS, en la URL y aquí: su página traduce las
        // cabeceras de las tablas según el `Accept-Language`, y el parser busca las
        // columnas por su nombre en inglés.
        "accept-language": "en",
        // Quién llama, que es lo cortés con una web ajena que no nos ha pedido nada.
        "user-agent": "FomentoGandiaChess/1.0 (+https://fomento-gandia-chess-swart.vercel.app)",
      },
      next: { revalidate: CACHE_SEGUNDOS },
    });
    if (r.status === 404) return { html: null, error: "no-existe" };
    if (!r.ok) return { html: null, error: "red" };
    return { html: await r.text(), error: null };
  } catch {
    return { html: null, error: "red" };
  }
}

/** La clasificación, los emparejamientos y los inscritos de su página pública. */
export async function leerTorneoChessPairings(
  enlacePublico: string | null
): Promise<LecturaChessPairings> {
  if (!enlacePublico) return { ...VACIO, error: "sin-enlace" };

  const [c, a, i] = await Promise.all([
    bajar(urlPestana(enlacePublico, "classifica")),
    bajar(urlPestana(enlacePublico, "abbinamenti")),
    bajar(urlPestana(enlacePublico, "iscritti")),
  ]);

  // LA CLASIFICACIÓN MANDA: si esa página no responde, no hay torneo que enseñar. Que
  // falle una de las otras dos es un dato de menos, no una pantalla en blanco.
  if (!c.html) return { ...VACIO, error: c.error ?? "red" };

  const cabecera = parsearCabeceraPublica(c.html);
  const clasificacion = parsearClasificacionPublica(c.html);
  const emparejamientos = a.html ? parsearEmparejamientosPublicos(a.html) : [];
  const inscritos = i.html ? parsearInscritosPublicos(i.html) : [];

  // NI UNA FILA EN LAS TRES PESTAÑAS es un enlace que no lleva a un torneo —o que apunta
  // a uno privado, que su página pública no enseña—. Se distingue de un torneo recién
  // creado, que sí trae inscritos aunque no tenga clasificación.
  if (clasificacion.length === 0 && emparejamientos.length === 0 && inscritos.length === 0) {
    return { ...VACIO, error: "vacio" };
  }

  return {
    nombre: cabecera.nombre,
    ronda: cabecera.ronda,
    rondasTotales: cabecera.rondasTotales,
    clasificacion,
    emparejamientos,
    inscritos,
    error: null,
  };
}
