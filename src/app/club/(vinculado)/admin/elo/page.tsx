import { redirect } from "next/navigation";
import { actualizarEloFide } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Banner } from "@/components/ui/Banner";
import { BotonAccion } from "@/components/ui/BotonAccion";
import { Contenedor } from "@/components/ui/Contenedor";

/**
 * Actualización del ELO FIDE (el "ELO real" mensual de cada jugador).
 *
 * FEDA SE RETIRÓ ENTERA el 2026-08-11 (decisión del propietario: "no sirve"):
 * la federación no publica listas desde diciembre de 2023, así que el botón, el
 * respaldo manual y el importador solo podían traer datos de hace años. El código
 * queda en el historial de git (migración de vuelta: restaurar `feda.ts`,
 * `feda-apply.ts` y sus botones de este fichero) por si algún día publican.
 * La columna `players.elo_feda` se queda: es dato, no código.
 *
 * OJO CON FIDE: fide.com bloquea las IPs de Vercel (verificado dos veces, ver
 * docs/referencia/automatizaciones.md), así que este botón solo funciona
 * ejecutando la app EN LOCAL, o con `scripts/actualizar-elo-fide.mjs`.
 */
export default async function EloAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string }>;
}) {
  const { msg, tipo } = await searchParams;

  async function refrescarFide() {
    "use server";
    const resultado = await actualizarEloFide();
    const params = new URLSearchParams({
      msg:
        resultado.error ??
        `ELO FIDE actualizado: ${resultado.actualizados} jugadores`,
      tipo: resultado.error ? "error" : "ok",
    });
    redirect(`/club/admin/elo?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Actualización de ELO" volverA="/club/admin" medida="panel" />
      <Contenedor medida="panel" className="space-y-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
        <form action={refrescarFide}>
          <BotonAccion className="w-full text-sm" trabajando="Consultando fide.com…">
            Actualizar FIDE
          </BotonAccion>
        </form>
        <Banner tipo="aviso">
          fide.com bloquea al servidor de la web: este botón solo funciona con la
          app corriendo en tu ordenador. La lista sale el día 1 de cada mes.
        </Banner>
      </Contenedor>
    </main>
  );
}
