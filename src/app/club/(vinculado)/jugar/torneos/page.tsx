import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth/sesion";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { formatearRangoFechas } from "@/lib/torneos/fechas";
import { Contenedor, REJILLA } from "@/components/ui/Contenedor";
import { PestanasJugar } from "@/components/ui/Pestanas";

const ETIQUETA_ESTADO: Record<string, string> = {
  inscripcion: "Inscripción abierta",
  en_curso: "En juego",
  terminado: "Terminado",
};

export default async function InternoPage() {
  const supabase = await createServerSupabase();
  const sesion = await sesionActual();

  const { data: torneos } = await supabase
    .from("club_tournaments")
    .select("id, nombre, sistema, estado, rondas_totales, fecha_inicio")
    .order("created_at", { ascending: false });

  const ids = (torneos ?? []).map((t) => t.id);
  const { data: inscritos } =
    ids.length > 0
      ? await supabase
          .from("club_tournament_players")
          .select("tournament_id")
          .in("tournament_id", ids)
      : { data: [] };
  const cuantos = new Map<string, number>();
  for (const i of inscritos ?? []) {
    cuantos.set(i.tournament_id, (cuantos.get(i.tournament_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Torneos del club"
        subtitulo="Los que organizamos nosotros"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {/* Pestañas y acciones en la MISMA fila desde `sm`. Apiladas eran cuatro
            bloques a todo lo ancho antes de llegar al primer torneo. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PestanasJugar activa="torneos" />
          <div className="flex flex-wrap items-center gap-2">
            {/* El botón del ranking de ELO del club está fuera desde el 2026-08-13:
                el ELO interno se apagó para no confundirlo con el de la FACV. El
                motivo entero, y cómo volver a encenderlo, en `ranking/page.tsx`. */}
            {sesion?.esJunta && (
              <Boton
                variante="secundario"
                href="/club/jugar/torneos/nuevo"
                className="text-sm"
              >
                Organizar torneo
              </Boton>
            )}
          </div>
        </div>

        {(torneos ?? []).length === 0 && (
          <EstadoVacio
            icono="♛"
            titulo="Todavía no hay torneos internos"
            detalle={
              sesion?.esJunta
                ? "Organiza el primero: la app empareja, lleva las rondas y calcula el ELO."
                : "Aquí aparecerán con sus rondas y su clasificación."
            }
          />
        )}

        <ul className={REJILLA[3]}>
          {(torneos ?? []).map((t) => (
            <li key={t.id}>
              <Link href={`/club/jugar/torneos/${t.id}`} className="block">
                <Tarjeta
                  destacada={t.estado === "en_curso"}
                  className="flex items-start justify-between gap-3 transition hover:border-borde-acento"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-tinta">{t.nombre}</p>
                    <p className="mt-0.5 text-sm text-tinta-suave">
                      {t.sistema === "liguilla" ? "Liguilla" : "Suizo"}
                      {t.rondas_totales ? ` · ${t.rondas_totales} rondas` : ""}
                      {" · "}
                      {cuantos.get(t.id) ?? 0} inscritos
                    </p>
                    {t.fecha_inicio && (
                      <p className="text-sm text-tinta-suave">
                        {formatearRangoFechas(t.fecha_inicio, t.fecha_inicio)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                      t.estado === "terminado"
                        ? "bg-tarjeta text-tinta-suave ring-borde"
                        : "bg-tarjeta-suave text-acento-texto ring-borde-acento"
                    }`}
                  >
                    {ETIQUETA_ESTADO[t.estado]}
                  </span>
                </Tarjeta>
              </Link>
            </li>
          ))}
        </ul>
      </Contenedor>
    </main>
  );
}
