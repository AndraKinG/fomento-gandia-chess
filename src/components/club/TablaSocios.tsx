import Link from "next/link";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { eloParaOrdenar, etiquetaNumero } from "@/lib/elo/ranking-oficial";

/**
 * La tabla de socios con su ELO, compartida por las DOS listas que existen.
 *
 * POR QUÉ HAY DOS LISTAS, que es la decisión de fondo (propietario, 2026-08-26):
 *
 * - **`/club/socios` — los socios del club.** La lista de verdad: sale de `players`, así
 *   que están TODOS, incluido quien acaba de entrar. Es la puerta a las fichas.
 * - **`/club/orden-fuerza` — el documento de la FACV**, dentro de Interclubs. Sale de
 *   `force_order` y es INAMOVIBLE: quien entra al club una vez cerrado el plazo no está
 *   ahí y no debe estarlo, porque ese papel decide en qué tablero juega cada uno y no se
 *   puede reescribir a mitad de temporada.
 *
 * Antes las dos cosas eran la misma pantalla, y el efecto era que un socio nuevo no
 * existía para nadie: el orden de fuerza era el ÚNICO sitio desde donde llegar a una
 * ficha, así que quien no estuviera en ese papel no tenía forma de ser visto.
 *
 * DE AHÍ QUE `numero` SEA NULLABLE: en la lista de socios hay gente sin número de orden,
 * y eso no es un dato que falte — es que no le toca tenerlo.
 */

export type FilaSocio = {
  ficha: string;
  /** El mote del club si lo tiene; si no, el oficial (`nombreVisible`). */
  nombre: string;
  /** El de la FACV, siempre. Se enseña debajo del mote cuando son distintos. */
  nombreOficial: string;
  /** null = no está en el orden de fuerza de esta temporada. */
  numero: number | null;
  bisIndex: number;
  /** `force_order.elo_oficial`, nullable de verdad (migración 0004, sin `not null`). */
  eloOficial: number | null;
  eloFide: number | null;
  eloFeda: number | null;
  eloOtro: number | null;
};

/** Qué manda en la primera columna numérica. */
export type Criterio = "orden" | "elo";

export function TablaSocios({
  filas,
  desde,
  criterio,
  miFicha,
  conFide,
  conFeda,
  conEstimado,
}: {
  filas: FilaSocio[];
  /** Posición global del primer elemento del trozo: con la lista partida en dos, el
   *  índice local empezaría otra vez por 1 en la segunda mitad. */
  desde: number;
  criterio: Criterio;
  miFicha: string | null;
  conFide: boolean;
  conFeda: boolean;
  conEstimado: boolean;
}) {
  return (
    <Tarjeta compacta>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-tinta-suave">
              <th scope="col" className="pb-1 pr-2 font-medium">
                {criterio === "elo" ? "#" : "Nº"}
              </th>
              <th scope="col" className="pb-1 pr-2 font-medium">
                Jugador
              </th>
              {/* LA COLUMNA QUE MANDA CAMBIA CON LA LISTA: en la de socios, el ELO real;
                  en el documento de la FACV, el suyo. Y NINGUNA se llama "Oficial", que
                  era la queja de un socio de la junta: el rating oficial de un jugador
                  ES el de la FIDE, así que llamar así al número de un documento interno
                  invitaba a leerlo del revés. */}
              <th scope="col" className="pb-1 pr-2 text-right font-medium">
                {criterio === "elo" ? "ELO" : "O. fuerza"}
              </th>
              {criterio === "elo"
                ? conEstimado && (
                    <th
                      scope="col"
                      className="hidden pb-1 pr-2 text-right font-medium sm:table-cell"
                      title="Lo pone la junta a mano para quien no tiene ELO FIDE"
                    >
                      Estimado
                    </th>
                  )
                : conFide && (
                    <th
                      scope="col"
                      className="hidden pb-1 pr-2 text-right font-medium sm:table-cell"
                    >
                      FIDE
                    </th>
                  )}
              {conFeda && (
                <th scope="col" className="hidden pb-1 text-right font-medium sm:table-cell">
                  FEDA
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const soyYo = f.ficha === miFicha;
              // Sin ningún ELO la fila se apaga entera: son los últimos de la lista,
              // todos con un guion, y en tinta fuerte pesaban más que los que sí tienen
              // número. Un socio recién federado sin partidas valoradas no es una fila
              // importante.
              const sinElo = criterio === "elo" && eloParaOrdenar(f) === null;
              return (
                <tr
                  key={f.ficha}
                  className={`border-t border-borde ${soyYo ? "bg-tarjeta-suave" : ""} ${
                    sinElo ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-1.5 pr-2 tabular-nums text-tinta-suave">
                    {criterio === "elo"
                      ? desde + i + 1
                      : f.numero === null
                        ? "—"
                        : etiquetaNumero(f.numero, f.bisIndex)}
                  </td>
                  <td className="py-1.5 pr-2 text-tinta">
                    {/* EL NÚMERO DE ORDEN EN LA MISMA LÍNEA QUE EL NOMBRE: pintado en
                        bloque antes del número, quien tiene mote ocupaba TRES líneas y
                        quien no, una, así que una columna medía el doble que la otra. */}
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        href={`/club/socios/${f.ficha}`}
                        className={`text-acento-texto hover:underline ${soyYo ? "font-semibold" : ""}`}
                      >
                        {f.nombre}
                      </Link>
                      {/* En el orden por ELO se enseña al lado el número de orden: es lo
                          que deja ver de un vistazo dónde los dos criterios no
                          coinciden. Si no lo tiene, no se pinta nada — no le toca. */}
                      {criterio === "elo" && f.numero !== null && (
                        <span className="text-xs text-tinta-suave">
                          nº {etiquetaNumero(f.numero, f.bisIndex)}
                        </span>
                      )}
                    </span>
                    {/* EL OFICIAL DEBAJO, y solo si el mote no es él: en el documento de
                        la FACV el nombre de la federación importa, porque es con el que
                        un capitán busca a alguien en un acta. */}
                    {f.nombreOficial !== f.nombre && (
                      <span className="block truncate text-xs leading-tight text-tinta-suave">
                        {f.nombreOficial}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right tabular-nums ${
                      sinElo ? "text-tinta-suave" : "font-semibold text-tinta"
                    }`}
                  >
                    {(criterio === "elo" ? eloParaOrdenar(f) : f.eloOficial) || "—"}
                  </td>
                  {criterio === "elo"
                    ? conEstimado && (
                        <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                          {/* Solo si NO tiene FIDE: con FIDE el estimado ya no se usa, y
                              ponerlo al lado invita a compararlos como si fueran dos
                              opiniones sobre lo mismo. */}
                          {f.eloFide === null ? (f.eloOtro ?? "—") : "—"}
                        </td>
                      )
                    : conFide && (
                        <td className="hidden py-1.5 pr-2 text-right tabular-nums text-tinta-suave sm:table-cell">
                          {f.eloFide ?? "—"}
                        </td>
                      )}
                  {conFeda && (
                    <td className="hidden py-1.5 text-right tabular-nums text-tinta-suave sm:table-cell">
                      {f.eloFeda ?? "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
