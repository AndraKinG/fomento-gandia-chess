import { redirect } from "next/navigation";
import { aplicarListaFeda, actualizarEloFeda, actualizarEloFide } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { Boton } from "@/components/ui/Boton";

export default async function EloAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; tipo?: string }>;
}) {
  const { msg, tipo } = await searchParams;

  async function subirFichero(formData: FormData) {
    "use server";
    const fichero = formData.get("fichero");
    if (!(fichero instanceof File) || fichero.size === 0) {
      redirect(
        `/admin/elo?${new URLSearchParams({
          msg: "Selecciona un fichero .xlsx",
          tipo: "error",
        }).toString()}`
      );
    }
    const file = fichero as File;
    let resultado: { actualizados: number; error?: string };
    try {
      resultado = await aplicarListaFeda(await file.arrayBuffer());
    } catch {
      resultado = {
        actualizados: 0,
        error: "El fichero no es una lista FEDA válida (.xlsx)",
      };
    }
    const params = new URLSearchParams({
      msg:
        resultado.error ??
        `ELO FEDA actualizado: ${resultado.actualizados} jugadores`,
      tipo: resultado.error ? "error" : "ok",
    });
    redirect(`/admin/elo?${params.toString()}`);
  }

  async function refrescarFeda() {
    "use server";
    const resultado = await actualizarEloFeda();
    const params = new URLSearchParams({
      msg:
        resultado.error ??
        `ELO FEDA actualizado: ${resultado.actualizados} jugadores`,
      tipo: resultado.error ? "error" : "ok",
    });
    redirect(`/admin/elo?${params.toString()}`);
  }

  async function refrescarFide() {
    "use server";
    const resultado = await actualizarEloFide();
    const params = new URLSearchParams({
      msg:
        resultado.error ??
        `ELO FIDE actualizado: ${resultado.actualizados} jugadores`,
      tipo: resultado.error ? "error" : "ok",
    });
    redirect(`/admin/elo?${params.toString()}`);
  }

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Actualización de ELO" volverA="/admin" />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {msg ? <Banner tipo={tipo === "ok" ? "ok" : "error"}>{msg}</Banner> : null}
        <form action={refrescarFide}>
          <Boton variante="degradado" className="w-full text-sm">
            Actualizar FIDE ahora (perfiles fide.com)
          </Boton>
        </form>
        <form action={refrescarFeda}>
          <Boton variante="degradado" className="w-full text-sm">
            Actualizar FEDA ahora (descarga lista oficial)
          </Boton>
        </form>
        <Banner tipo="aviso">
          Ojo: la lista automática de feda.org puede estar desactualizada
          (última publicada: 2023). Para datos actuales usa la subida manual
          del fichero.
        </Banner>
        <Tarjeta>
          <form action={subirFichero} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-tinta">
              Respaldo manual: subir lista FEDA (.xlsx)
            </label>
            <input type="file" name="fichero" accept=".xlsx" required
              className="rounded-xl border border-borde bg-tarjeta p-2 text-sm text-tinta" />
            <button className="rounded-xl border border-borde bg-tarjeta p-2 text-sm text-tinta">
              Aplicar fichero
            </button>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
