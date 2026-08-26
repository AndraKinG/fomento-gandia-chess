import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor } from "@/components/ui/Contenedor";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { estadisticasClub, ordenarPorElo } from "@/lib/elo/ranking-oficial";
import { inicioDelTrozo, partirEnDos } from "@/lib/ui/columnas";
import { nombreDeFila } from "@/lib/club/nombre-socio";
import { TablaSocios, type FilaSocio } from "@/components/club/TablaSocios";
import Link from "next/link";

/**
 * Los socios del club, con su ELO y su ficha. FUERA de Interclubs.
 *
 * POR QUÉ EXISTE ESTA PANTALLA (decisión del propietario, 2026-08-26, y es un cambio de
 * estructura, no una pantalla más): hasta hoy la única lista de jugadores del club era
 * `/club/orden-fuerza`, dentro de Interclubs. Y eso está mal por lo que el orden de
 * fuerza ES: un documento que publica la FACV al empezar la temporada y que **no se
 * puede reescribir**. Quien entra al club con el plazo abierto entra en él con un número
 * "bis"; quien entra después NO, y no debe entrar — ese papel decide en qué tablero juega
 * cada uno y cambiarlo a mitad de temporada rompería las convocatorias ya hechas.
 *
 * Consecuencia: un socio que llegaba tarde no aparecía en ninguna lista y **no había
 * forma de llegar a su ficha**. El orden de fuerza servía de índice de socios sin serlo.
 *
 * ASÍ QUE AQUÍ SALEN DE `players` Y NO DE `force_order`: están todos los socios activos,
 * tengan número de orden o no. Esta es la lista de la gente; aquella es un documento del
 * Interclubs y se queda allí.
 *
 * LAS BAJAS NO SALEN. Quien se ha ido del club no lo ve nadie (`activo = false`): la
 * ficha y su historia se conservan, pero deja de aparecer en las listas. Se recupera
 * desde su ficha, reactivándola.
 */
export default async function SociosPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: temporada } = await supabase
    .from("seasons")
    .select("id")
    .eq("activa", true)
    .maybeSingle();

  const [{ data: socios }, { data: orden }] = await Promise.all([
    // LA FICHA DE PRUEBAS FUERA (migración 0040): no es nadie, y en una lista de socios
    // sería una entrada que no se puede explicar.
    supabase
      .from("players")
      .select("id, nombre, apodo, elo_fide, elo_feda, elo_otro")
      .eq("activo", true)
      .eq("de_prueba", false)
      .order("nombre"),
    // El número de orden, si lo tiene: se enseña al lado del nombre para poder cruzar
    // esta lista con el documento del Interclubs de un vistazo.
    temporada
      ? supabase
          .from("force_order")
          .select("player_id, numero, bis_index, elo_oficial")
          .eq("season_id", temporada.id)
      : Promise.resolve({ data: null }),
  ]);

  const ordenPorFicha = new Map(
    (orden ?? []).map((f) => [
      f.player_id as string,
      {
        numero: f.numero as number,
        bisIndex: f.bis_index as number,
        eloOficial: (f.elo_oficial as number | null) ?? null,
      },
    ])
  );

  const filas: FilaSocio[] = (socios ?? []).map((p) => {
    const suOrden = ordenPorFicha.get(p.id as string);
    return {
      ficha: p.id as string,
      nombre: nombreDeFila(p),
      nombreOficial: (p.nombre as string) ?? "Socio",
      numero: suOrden?.numero ?? null,
      bisIndex: suOrden?.bisIndex ?? 0,
      eloOficial: suOrden?.eloOficial ?? null,
      eloFide: (p.elo_fide as number | null) ?? null,
      eloFeda: (p.elo_feda as number | null) ?? null,
      eloOtro: (p.elo_otro as number | null) ?? null,
    };
  });

  const visibles = ordenarPorElo(filas);
  const conFide = filas.some((f) => f.eloFide !== null);
  const conFeda = filas.some((f) => f.eloFeda !== null);
  // La columna del estimado solo si le sirve a alguien: un socio SIN FIDE que lo tenga
  // puesto. Con todo el club federado sería una columna de guiones.
  const conEstimado = filas.some((f) => f.eloFide === null && f.eloOtro !== null);
  const trozos = partirEnDos(visibles);
  const { media, maximo } = estadisticasClub(filas);
  const sinNumero = filas.filter((f) => f.numero === null).length;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Socios del club"
        subtitulo="Su ELO y su ficha"
        volverA="/club"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {filas.length === 0 ? (
          <EstadoVacio
            icono="👥"
            titulo="Todavía no hay socios"
            detalle="Las fichas llegan con el orden de fuerza de la FACV, o se crean a mano."
          />
        ) : (
          <>
            <Tarjeta>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                <Estadistica valor={String(filas.length)} etiqueta="Socios" />
                <Estadistica valor={media?.toString() ?? "—"} etiqueta="ELO medio" />
                <Estadistica valor={maximo?.toString() ?? "—"} etiqueta="Más alto" />
              </div>
              <p className="mt-3 text-xs text-tinta-suave">
                Ordenados por su ELO real. Toca un nombre para ver su ficha.
              </p>
            </Tarjeta>

            {/* DOS COLUMNAS DESDE `lg`: la lista es alta y estrecha, y en un monitor
                ocupaba metro y medio de scroll dejando media pantalla en blanco. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {trozos.map((trozo, n) => (
                <TablaSocios
                  key={n}
                  filas={trozo}
                  desde={inicioDelTrozo(trozos, n)}
                  criterio="elo"
                  miFicha={sesion?.playerId ?? null}
                  conFide={conFide}
                  conFeda={conFeda}
                  conEstimado={conEstimado}
                />
              ))}
            </div>

            <Tarjeta compacta>
              <p className="text-xs text-tinta-suave">
                <b className="font-semibold">ELO</b>: el FIDE de clásicas, al día. Quien
                no lo tiene aún, el estimado que pone la junta.{" "}
                <b className="font-semibold">nº</b>: su número en el orden de fuerza del
                Interclubs, si está en él.
              </p>
              {/* DECIR POR QUÉ HAY GENTE SIN NÚMERO, que si no parece un dato que falta.
                  Es justo el motivo de que esta pantalla exista. */}
              {sinNumero > 0 && (
                <p className="mt-1.5 text-xs text-tinta-suave">
                  {sinNumero === 1
                    ? "Un socio no tiene número: entró después de publicarse el orden de fuerza, que la FACV no reescribe a mitad de temporada."
                    : `${sinNumero} socios no tienen número: entraron después de publicarse el orden de fuerza, que la FACV no reescribe a mitad de temporada.`}{" "}
                  <Link href="/club/orden-fuerza" className="text-acento-texto underline">
                    Ver el orden de fuerza
                  </Link>
                </p>
              )}
            </Tarjeta>
          </>
        )}
      </Contenedor>
    </main>
  );
}

function Estadistica({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{etiqueta}</p>
    </div>
  );
}
