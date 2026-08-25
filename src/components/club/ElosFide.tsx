import { textoVariacion } from "@/lib/import/fide-perfil";

/**
 * Los tres ELOs de la FIDE de un socio, cada uno con lo que lleva ganado o perdido
 * desde la última publicación mensual.
 *
 * QUÉ ES ESE SEGUNDO NÚMERO, que es lo que se pidió: la FIDE publica los ratings UNA VEZ
 * AL MES, pero en su perfil enseña además los puntos que llevas de las partidas jugadas
 * desde entonces y que se te aplicarán el mes que viene ("Expected +5"). Es el número que
 * mira todo el mundo al día siguiente de un torneo, porque el oficial no se mueve hasta
 * la próxima lista.
 *
 * NO ES UN ELO NUESTRO NI SE ESCRIBE A MANO: se lee del perfil de la FIDE tal cual. Y no
 * se mezcla con los otros dos números del club —el orden de fuerza y el ELO interno—, que
 * son otra cosa (regla de los tres ELOs en CLAUDE.md); de ahí que cada uno diga su
 * modalidad en letra.
 *
 * LLEVA LA FECHA DE LECTURA, y hace falta: fide.com bloquea las IPs de centro de datos,
 * así que esto no se refresca solo — lo trae un script que se lanza a mano desde casa. Un
 * número que se mueve cada día sin decir de cuándo es se lee como si fuera de hoy.
 */

export type ElosFideVista = {
  clasicas: number | null;
  rapidas: number | null;
  blitz: number | null;
  variacionClasicas: number | null;
  variacionRapidas: number | null;
  variacionBlitz: number | null;
  leidoEn: string | null;
};

/** Filas de `players` → lo que pinta este componente. */
export function elosDeFila(f: {
  elo_fide?: number | null;
  elo_fide_rapidas?: number | null;
  elo_fide_blitz?: number | null;
  variacion_fide?: number | null;
  variacion_fide_rapidas?: number | null;
  variacion_fide_blitz?: number | null;
  elo_fide_leido_en?: string | null;
}): ElosFideVista {
  return {
    clasicas: f.elo_fide ?? null,
    rapidas: f.elo_fide_rapidas ?? null,
    blitz: f.elo_fide_blitz ?? null,
    variacionClasicas: f.variacion_fide ?? null,
    variacionRapidas: f.variacion_fide_rapidas ?? null,
    variacionBlitz: f.variacion_fide_blitz ?? null,
    leidoEn: f.elo_fide_leido_en ?? null,
  };
}

function Modalidad({
  nombre,
  elo,
  variacion,
}: {
  nombre: string;
  elo: number | null;
  variacion: number | null;
}) {
  const texto = textoVariacion(variacion);
  const sube = (variacion ?? 0) > 0;
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-tarjeta-suave px-3 py-2 ring-1 ring-borde">
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{nombre}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums text-tinta">{elo ?? "—"}</span>
        {texto && (
          // EL COLOR NO ES LO ÚNICO que distingue subir de bajar: va también la flecha,
          // porque hay quien no distingue el verde del rojo.
          <span
            className={`text-xs font-semibold tabular-nums ${
              sube ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {sube ? "▲" : "▼"} {texto}
          </span>
        )}
      </p>
    </div>
  );
}

export function ElosFide({ elos }: { elos: ElosFideVista }) {
  // Sin ningún rating no se pinta nada: tres huecos con guiones no informan de nada.
  if (elos.clasicas === null && elos.rapidas === null && elos.blitz === null) return null;

  const hayVariacion =
    elos.variacionClasicas !== null ||
    elos.variacionRapidas !== null ||
    elos.variacionBlitz !== null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <Modalidad nombre="Clásicas" elo={elos.clasicas} variacion={elos.variacionClasicas} />
        <Modalidad nombre="Rápidas" elo={elos.rapidas} variacion={elos.variacionRapidas} />
        <Modalidad nombre="Blitz" elo={elos.blitz} variacion={elos.variacionBlitz} />
      </div>
      {hayVariacion && (
        <p className="px-1 text-xs text-tinta-suave">
          En verde y rojo, los puntos que la FIDE aplicará en la próxima lista mensual.
          {elos.leidoEn && ` Leído el ${fechaCorta(elos.leidoEn)}.`}
        </p>
      )}
    </div>
  );
}

/** "16 ago" en la hora de aquí. */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Madrid",
  });
}
