import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { clasificar } from "@/lib/club/clasificacion";
import { leerTorneo } from "../datos";
import { GestionTorneo, type RondaVista, type SocioVista } from "./GestionTorneo";
import { Contenedor } from "@/components/ui/Contenedor";
import { nombreVisible } from "@/lib/club/nombre-socio";

export default async function TorneoInternoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const torneo = await leerTorneo(supabase, id);
  if (!torneo) redirect("/club/jugar/torneos");

  // Todos los jugadores activos, para la lista de inscripción.
  const { data: jugadores } = await supabase
    .from("players")
    .select("id, nombre, apodo")
    .eq("activo", true)
    .order("nombre");

  const nombrePorFicha = new Map<string, string>(
    (jugadores ?? []).map((j) => [j.id, nombreVisible(j)])
  );
  for (const i of torneo.inscritos) nombrePorFicha.set(i.ficha, i.nombre);

  const inscritoPorFicha = new Map(torneo.inscritos.map((i) => [i.ficha, i]));
  const socios: SocioVista[] = (jugadores ?? []).map((j) => ({
    ficha: j.id,
    nombre: nombreVisible(j),
    inscrito: inscritoPorFicha.has(j.id),
    elo: inscritoPorFicha.get(j.id)?.eloInicial ?? 0,
  }));

  const rondas: RondaVista[] = torneo.rondas.map((r) => ({
    id: r.id,
    numero: r.numero,
    fechaHora: r.fechaHora,
    descansaNombre: r.descansa ? (nombrePorFicha.get(r.descansa) ?? "Socio") : null,
    pares: r.emparejamientos.map((e, i) => ({
      id: r.pares[i]?.id ?? `${r.id}-${i}`,
      mesa: r.pares[i]?.mesa ?? i + 1,
      blancasNombre: nombrePorFicha.get(e.blancas) ?? "Socio",
      negrasNombre: nombrePorFicha.get(e.negras) ?? "Socio",
      resultado: e.resultado,
      // Solo quien jugo la partida puede subir sus jugadas.
      esMia: e.blancas === sesion?.playerId || e.negras === sesion?.playerId,
      gameId: r.pares[i]?.gameId ?? null,
    })),
  }));

  // La clasificación se calcula con el MISMO módulo que usa el emparejador, para
  // que la tabla y los cruces no puedan discrepar sobre quién va primero.
  const tabla = clasificar(torneo.rondas, torneo.inscritos);
  const hayPartidas = torneo.rondas.some((r) =>
    r.emparejamientos.some((e) => e.resultado !== null)
  );

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo={torneo.nombre}
        subtitulo={`${torneo.sistema === "liguilla" ? "Liguilla" : "Suizo"}${
          torneo.rondasTotales ? ` · ${torneo.rondasTotales} rondas` : ""
        }`}
        volverA="/club/jugar/torneos" medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {torneo.estado === "terminado" && (
          <Banner tipo="ok">
            Torneo terminado.
            {hayPartidas && tabla.length > 0
              ? ` Gana ${nombrePorFicha.get(tabla[0].ficha) ?? "el primero de la tabla"}.`
              : ""}
          </Banner>
        )}
        {torneo.notas && (
          <Tarjeta compacta>
            <p className="whitespace-pre-line text-sm text-tinta">{torneo.notas}</p>
          </Tarjeta>
        )}

        {/* Rondas y clasificación en paralelo desde `lg`, igual que en el detalle de
            equipo: la tabla es estrecha, y apilada empujaba las rondas fuera de la
            vista además de dejar medio monitor vacío a su lado. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
        <GestionTorneo
          tournamentId={torneo.id}
          estado={torneo.estado}
          sistema={torneo.sistema}
          rondas={rondas}
          rondasTotales={torneo.rondasTotales}
          socios={socios}
          esJunta={Boolean(sesion?.esJunta)}
          // Borrar es para deshacer una equivocación: quien lo creó (o un admin) y
          // solo mientras no se haya jugado nada, porque los resultados cuentan para
          // el ELO del club. El servidor lo vuelve a comprobar, con la partida en vivo
          // incluida; esto solo decide si el botón se ofrece.
          puedeBorrar={
            Boolean(sesion?.esJunta) &&
            (Boolean(sesion?.esAdmin) || torneo.creadoPor === sesion?.userId) &&
            !hayPartidas
          }
        />
        </div>

        {hayPartidas && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              Clasificación
            </h2>
            <Tarjeta compacta>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-tinta-suave">
                    <th className="pb-1 pr-2 font-medium">#</th>
                    <th className="pb-1 pr-2 font-medium">Jugador</th>
                    <th className="pb-1 pr-2 text-right font-medium">Pts</th>
                    <th className="pb-1 text-right font-medium" title="Buchholz">
                      Bu
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tabla.map((f, i) => (
                    <tr key={f.ficha} className="border-t border-borde">
                      <td className="py-1.5 pr-2 text-tinta-suave">{i + 1}</td>
                      <td className="py-1.5 pr-2 text-tinta">
                        {nombrePorFicha.get(f.ficha) ?? "Socio"}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-semibold text-tinta">
                        {f.puntos % 1 === 0 ? f.puntos : f.puntos.toFixed(1)}
                      </td>
                      <td className="py-1.5 text-right text-tinta-suave">
                        {f.buchholz % 1 === 0 ? f.buchholz : f.buchholz.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-tinta-suave">
                Desempate: Buchholz y luego victorias.
              </p>
            </Tarjeta>
          </section>
        )}
        </div>
      </Contenedor>
    </main>
  );
}
