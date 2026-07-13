import { enviarPushPrueba } from "./actions";

export default function PushAdminPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Notificaciones</h1>
      <form action={enviarPushPrueba} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Enviarme una notificación de prueba
        </button>
      </form>
    </main>
  );
}
