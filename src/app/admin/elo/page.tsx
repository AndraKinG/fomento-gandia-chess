import { aplicarListaFeda, actualizarEloFeda } from "./actions";

export default function EloAdminPage() {
  async function subirFichero(formData: FormData) {
    "use server";
    const file = formData.get("fichero") as File;
    await aplicarListaFeda(await file.arrayBuffer());
  }
  async function refrescarFeda() {
    "use server";
    await actualizarEloFeda();
  }
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Actualización de ELO</h1>
      <form action={refrescarFeda} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Actualizar FEDA ahora (descarga lista oficial)
        </button>
      </form>
      <form action={subirFichero} className="mt-6 flex flex-col gap-2">
        <label className="text-sm font-medium">
          Respaldo manual: subir lista FEDA (.xlsx)
        </label>
        <input
          type="file"
          name="fichero"
          accept=".xlsx"
          required
          className="rounded border p-2 text-sm"
        />
        <button className="rounded border p-2 text-sm">Aplicar fichero</button>
      </form>
    </main>
  );
}
