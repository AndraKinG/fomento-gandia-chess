/**
 * Agrupar los datos de uso diarios en semanas y meses, para el panel de admin.
 *
 * MÓDULO PURO: entran filas por día y sale la misma tabla agrupada. La base
 * solo guarda días (ver migración 0032); semanas y meses son una forma de
 * mirarlos, no un dato, así que se calculan aquí y no se guardan.
 *
 * LOS SOCIOS ACTIVOS NO SE SUMAN, y es el motivo de que este módulo reciba los
 * pares (día, cuenta) y no un número por día: quien entra el lunes y el martes
 * es UNA persona activa esa semana, no dos. Sumar los conteos diarios es el
 * error clásico de los paneles de uso.
 */

export type Periodo = "dia" | "semana" | "mes";

/** Una fila de `uso_diario` más el recuento de actividad de ese día. */
export type UsoDia = {
  dia: string; // "2026-08-10"
  visitas: number;
  latidos: number;
  /** Socios que entran en la app POR PRIMERA VEZ ese día (lo calcula
   *  `recuento_uso` en SQL). Cada socio es nuevo UNA sola vez en la historia, así
   *  que sumarlo por semanas o meses da el número correcto sin más cuentas. */
  nuevos: number;
  partidasVivo: number;
  retos: number;
  partidasSubidas: number;
  mensajesChat: number;
  avisos: number;
  pushEntregados: number;
};

export type UsoAgrupado = Omit<UsoDia, "dia"> & {
  /** El día, el lunes de la semana o el primero del mes, según el periodo. */
  clave: string;
  /** Cuentas distintas vistas en el periodo (no la suma de los días). */
  activos: number;
  /**
   * Media de socios distintos que entran POR DÍA dentro del periodo.
   *
   * Es otra pregunta que `activos`, y las dos importan: en una semana pueden
   * entrar 10 socios distintos (activos) siendo solo 2 al día (esto). El primero
   * mide alcance; el segundo, el pulso diario. En el periodo "día" valen lo mismo,
   * claro.
   *
   * Se divide entre TODOS los días del periodo, incluidos los que no entró nadie:
   * saltárselos daría una media inflada que solo habla de los días buenos.
   */
  activosPorDia: number;
};

/** Cada latido son ~5 minutos con la pestaña delante (ver Latido.tsx). */
export const MINUTOS_POR_LATIDO = 5;

/** Cuántas franjas de latido tiene un día: para la media de conectados. */
export const FRANJAS_DIA = (24 * 60) / MINUTOS_POR_LATIDO;

/** El lunes de la semana de una fecha, en ISO. La semana del club empieza en
 *  lunes, como los torneos y como el cron. */
export function claveSemana(dia: string): string {
  const f = new Date(`${dia}T00:00:00Z`);
  // getUTCDay: 0=domingo... el lunes está a (dia+6)%7 días hacia atrás.
  const atras = (f.getUTCDay() + 6) % 7;
  f.setUTCDate(f.getUTCDate() - atras);
  return f.toISOString().slice(0, 10);
}

export function claveMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

export function clavePeriodo(dia: string, periodo: Periodo): string {
  if (periodo === "semana") return claveSemana(dia);
  if (periodo === "mes") return claveMes(dia);
  return dia;
}

/**
 * Agrupa las filas diarias por periodo, sumando los contadores y contando los
 * activos SIN duplicar dentro del periodo.
 *
 * Sale ordenado del periodo más reciente al más viejo, que es como se lee un
 * panel: lo de hoy arriba.
 */
export function agruparUso(
  dias: UsoDia[],
  actividad: { dia: string; profileId: string }[],
  periodo: Periodo
): UsoAgrupado[] {
  const grupos = new Map<string, UsoAgrupado>();

  for (const d of dias) {
    const clave = clavePeriodo(d.dia, periodo);
    const g = grupos.get(clave) ?? {
      clave,
      activos: 0,
      activosPorDia: 0,
      visitas: 0,
      latidos: 0,
      nuevos: 0,
      partidasVivo: 0,
      retos: 0,
      partidasSubidas: 0,
      mensajesChat: 0,
      avisos: 0,
      pushEntregados: 0,
    };
    g.visitas += d.visitas;
    g.latidos += d.latidos;
    g.nuevos += d.nuevos;
    g.partidasVivo += d.partidasVivo;
    g.retos += d.retos;
    g.partidasSubidas += d.partidasSubidas;
    g.mensajesChat += d.mensajesChat;
    g.avisos += d.avisos;
    g.pushEntregados += d.pushEntregados;
    grupos.set(clave, g);
  }

  // Los activos, aparte y con Set por periodo: la misma cuenta en dos días de
  // la misma semana cuenta una vez.
  const vistos = new Map<string, Set<string>>();
  // Y por DÍA, que es lo que da la media diaria.
  const porDia = new Map<string, Set<string>>();
  for (const a of actividad) {
    const clave = clavePeriodo(a.dia, periodo);
    if (!grupos.has(clave)) continue; // actividad de un día sin fila no inventa periodos
    const s = vistos.get(clave) ?? new Set<string>();
    s.add(a.profileId);
    vistos.set(clave, s);
    const d = porDia.get(a.dia) ?? new Set<string>();
    d.add(a.profileId);
    porDia.set(a.dia, d);
  }
  for (const [clave, s] of vistos) {
    const g = grupos.get(clave);
    if (g) g.activos = s.size;
  }

  // La media diaria: se suman los distintos DE CADA DÍA y se divide entre los días
  // que tiene el periodo — contando los días sin nadie, que también son días.
  const cuantosDias = new Map<string, number>();
  const sumaDiaria = new Map<string, number>();
  for (const d of dias) {
    const clave = clavePeriodo(d.dia, periodo);
    cuantosDias.set(clave, (cuantosDias.get(clave) ?? 0) + 1);
    sumaDiaria.set(clave, (sumaDiaria.get(clave) ?? 0) + (porDia.get(d.dia)?.size ?? 0));
  }
  for (const [clave, g] of grupos) {
    const n = cuantosDias.get(clave) ?? 0;
    g.activosPorDia = n > 0 ? (sumaDiaria.get(clave) ?? 0) / n : 0;
  }

  return [...grupos.values()].sort((a, b) => b.clave.localeCompare(a.clave));
}

/** Tiempo de uso estimado de un grupo, en texto ("3 h 25 min"). */
export function tiempoDeUso(latidos: number): string {
  const minutos = latidos * MINUTOS_POR_LATIDO;
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Media de conectados a la vez en un periodo de `dias` días.
 *
 * Cada latido es una persona presente en una franja de 5 min: latidos partido
 * por las franjas del periodo da la ocupación media. Con una décima basta —
 * "0,3 personas de media" ya dice lo que tiene que decir.
 */
export function mediaConectados(latidos: number, dias: number): string {
  if (dias <= 0) return "0";
  const media = latidos / (FRANJAS_DIA * dias);
  return media.toFixed(1).replace(".", ",");
}

/**
 * Tiempo medio por socio activo, en texto.
 *
 * ES MÁS ÚTIL QUE EL TOTAL: "3 h de uso" no dice nada sin saber entre cuántos —
 * pueden ser tres socios de una hora o veinte de nueve minutos. Con la media se
 * ve si la gente se queda o solo asoma.
 */
export function tiempoPorSocio(latidos: number, activos: number): string {
  if (activos <= 0) return "—";
  return tiempoDeUso(Math.round(latidos / activos));
}

/**
 * Qué parte del club ha entrado, en porcentaje entero.
 *
 * El denominador son las CUENTAS VINCULADAS y no las 46 fichas del club: quien no
 * se ha registrado todavía no puede entrar, así que meterlo en el porcentaje mide
 * el alta de socios, no el uso de la app — dos cosas distintas.
 */
export function porcentajeDelClub(activos: number, cuentasVinculadas: number): string {
  if (cuentasVinculadas <= 0) return "—";
  return `${Math.round((activos / cuentasVinculadas) * 100)} %`;
}

/** Un número con una décima y coma decimal, como se escribe en español. */
export function conUnDecimal(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
