import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { crearFichaManual, importarOrdenFuerza, sincronizarOrdenFuerzaFACV } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { ChipElo } from "@/components/ui/ChipElo";
import { FilaJugadorOF } from "@/components/ui/FilaJugadorOF";
import { Contenedor } from "@/components/ui/Contenedor";
import { BotonAccion } from "@/components/ui/BotonAccion";
import { partirEnDos } from "@/lib/ui/columnas";

const SEPARADOR_AVISOS = "||";

export default async function OrdenFuerzaPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string; avisos?: string }>;
}) {
  const { msg, tipo, avisos } = await searchParams;
  const listaAvisos = avisos ? avisos.split(SEPARADOR_AVISOS) : [];
  const supabase = await createServerSupabase();
  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  const { data: orden } = season
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, elo_oficial, players(nombre, elo_fide, elo_feda)")
        .eq("season_id", season.id)
        .order("numero").order("bis_index")
    : { data: null };

  // QUIÉN HA JUGADO POR EL CLUB Y NO TIENE FICHA.
  //
  // Es el aviso que hacía falta para el caso de quien entra a mitad de temporada: si un
  // socio juega una jornada y su nombre no cruza con ninguna ficha, aquí sale. No hace
  // falta guardar nada nuevo — las filas del acta sin `nuestro_player_id` YA son la
  // señal —, y se lee en la pantalla desde la que se corrige, que es esta.
  //
  // Puede salir por tres motivos, y los tres se arreglan aquí: la ficha no existe
  // todavía (sincroniza el orden de fuerza), el nombre de la ficha está escrito de otra
  // forma que el acta (corrígelo), o jugó alguien que ya no es socio (no hay nada que
  // hacer).
  const { data: sinFicha } = await supabase
    .from("match_boards")
    .select("nuestro_nombre")
    .is("nuestro_player_id", null);
  const nombresSinFicha = [...new Set((sinFicha ?? []).map((f) => f.nuestro_nombre as string))]
    .sort();

  async function accion(formData: FormData) {
    "use server";
    const resultado = await importarOrdenFuerza(
      String(formData.get("season")),
      String(formData.get("texto"))
    );
    const params = new URLSearchParams({
      msg: resultado.ok ?? resultado.error ?? "",
      tipo: resultado.ok ? "ok" : "error",
    });
    redirect(`/club/admin/orden-fuerza?${params.toString()}`);
  }

  async function accionCrearFicha(formData: FormData) {
    "use server";
    const resultado = await crearFichaManual(formData);
    const params = new URLSearchParams({
      msg: resultado.ok ?? resultado.error ?? "",
      tipo: resultado.ok ? "ok" : "error",
    });
    redirect(`/club/admin/orden-fuerza?${params.toString()}`);
  }

  async function accionSincronizar() {
    "use server";
    const resultado = await sincronizarOrdenFuerzaFACV();
    const params = new URLSearchParams({
      msg: resultado.error
        ?? `Sincronizado: ${resultado.creados} creados, ${resultado.actualizados} actualizados`,
      tipo: resultado.error ? "error" : "ok",
    });
    if (resultado.avisos?.length) {
      params.set("avisos", resultado.avisos.join(SEPARADOR_AVISOS));
    }
    redirect(`/club/admin/orden-fuerza?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Orden de fuerza" volverA="/club/admin" medida="panel" />
      <Contenedor medida="panel" className="space-y-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
        {listaAvisos.length > 0 ? (
          <Banner tipo="aviso">
            <ul className="list-disc space-y-1 pl-4">
              {listaAvisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Banner>
        ) : null}
        {nombresSinFicha.length > 0 && (
          <Banner tipo="aviso">
            <p className="font-semibold">
              {nombresSinFicha.length === 1
                ? "Un jugador del acta no tiene ficha en el club"
                : `${nombresSinFicha.length} jugadores del acta no tienen ficha en el club`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {nombresSinFicha.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Si acaban de entrar, sincroniza el orden de fuerza. Si ya están, revisa
              cómo está escrito el nombre en su ficha.
            </p>
          </Banner>
        )}

        <form action={accionSincronizar}>
          {/* Esto descarga y parsea una página de la FACV: los segundos que tarda
              tienen que verse, o parece que el botón no ha hecho nada. */}
          <BotonAccion trabajando="Consultando la web de la FACV…" className="w-full">
            Sincronizar con la FACV
          </BotonAccion>
        </form>

        <details className="group rounded-xl border border-borde bg-tarjeta p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-tinta">
            Crear una ficha a mano
            <span
              aria-hidden
              className="shrink-0 text-tinta-suave transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <p className="mt-2 text-sm text-tinta-suave">
            Para el socio que acaba de entrar y <b className="font-semibold">todavía no
            está federado</b>: sin ficha no puede vincular su cuenta. Se coloca por ELO.
          </p>
          <p className="mt-2 text-sm text-tinta-suave">
            Cuando la FACV lo publique, la sincronización semanal{" "}
            <b className="font-semibold">funde esta ficha con la oficial</b>. Si sabes su
            ID FIDE, ponlo.
          </p>
          <form action={accionCrearFicha} className="mt-3 flex flex-col gap-3">
            <input
              name="nombre"
              required
              placeholder="Nombre y apellidos"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input name="elo_fide" type="number" min={0} max={3500} placeholder="ELO FIDE"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
              <input name="elo_feda" type="number" min={0} max={3500} placeholder="ELO FEDA"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
              <input name="elo_otro" type="number" min={0} max={3500} placeholder="ELO estimado"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="fide_id" placeholder="ID FIDE (si lo tiene)"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
              <input name="feda_id" placeholder="ID FEDA (si lo tiene)"
                className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
            </div>
            <p className="text-xs text-tinta-suave">
              Los ELO son opcionales. Sin ninguno se le asigna 1400 (RGC 52.1) y queda al
              final del orden.
            </p>
            <BotonAccion variante="solido" trabajando="Creando la ficha…">
              Crear ficha y colocarla en el orden
            </BotonAccion>
          </form>
        </details>

        <details className="group rounded-xl border border-borde bg-tarjeta p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-tinta">
            Importación manual del orden completo (respaldo)
            <span
              aria-hidden
              className="shrink-0 text-tinta-suave transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <form action={accion} className="mt-3 flex flex-col gap-3">
            <input name="season" required placeholder="Nombre temporada (ej. Interclubs 2027)"
              className="rounded-xl border border-borde bg-tarjeta p-3 text-tinta" />
            <textarea name="texto" required rows={12}
              placeholder={"1; Apellidos, Nombre; fide_id; feda_id\n2; ..."}
              className="rounded-xl border border-borde bg-tarjeta p-3 font-mono text-xs text-tinta" />
            <BotonAccion variante="solido" trabajando="Importando…">
              Importar
            </BotonAccion>
          </form>
        </details>

        {orden && orden.length > 0 ? (
          // EN DOS COLUMNAS desde lg, como su gemela de socios: 46 filas en una
          // sola columna es la pantalla corriendo hacia abajo sin techo, que es
          // justo lo que la regla de "usar el ancho" vino a quitar.
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-x-4">
            {partirEnDos(orden).map((trozo, n) => (
              <ol key={n} className="space-y-2">
                {trozo.map((f) => {
                  const p = f.players as unknown as {
                    nombre: string; elo_fide: number | null; elo_feda: number | null;
                  };
                  return (
                    <li key={`${f.numero}-${f.bis_index}`}>
                      <FilaJugadorOF
                        numero={f.numero}
                        bisIndex={f.bis_index}
                        nombre={p.nombre}
                        chips={
                          <>
                            <ChipElo valor={f.elo_oficial} etiqueta="Oficial" />
                            <ChipElo valor={p.elo_fide} etiqueta="FIDE" />
                            <ChipElo valor={p.elo_feda} etiqueta="FEDA" />
                          </>
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            ))}
          </div>
        ) : null}
      </Contenedor>
    </main>
  );
}
