import { redirect } from "next/navigation";
import { aplicarListaFeda, actualizarEloFeda, actualizarEloFide } from "./actions";

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
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Actualización de ELO</h1>
      {msg ? (
        <p
          className={`mt-4 rounded p-3 text-sm ${
            tipo === "ok"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {msg}
        </p>
      ) : null}
      <form action={refrescarFide} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Actualizar FIDE ahora (perfiles fide.com)
        </button>
      </form>
      <form action={refrescarFeda} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Actualizar FEDA ahora (descarga lista oficial)
        </button>
      </form>
      <p className="mt-1 text-xs text-gray-500">
        Ojo: la lista automática de feda.org puede estar desactualizada
        (última publicada: 2023). Para datos actuales usa la subida manual
        del fichero.
      </p>
      <form action={subirFichero} className="mt-6 flex flex-col gap-2">
        <label className="text-sm font-medium">
          Respaldo manual: subir lista FEDA (.xlsx)
        </label>
        <input type="file" name="fichero" accept=".xlsx" required
          className="rounded border p-2 text-sm" />
        <button className="rounded border p-2 text-sm">Aplicar fichero</button>
      </form>
    </main>
  );
}
