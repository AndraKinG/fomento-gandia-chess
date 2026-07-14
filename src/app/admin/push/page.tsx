import { enviarPushPrueba } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";

export default function PushAdminPage() {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Notificaciones" />
      <div className="mx-auto max-w-md p-4">
        <Tarjeta>
          <form action={enviarPushPrueba}>
            <button className="w-full rounded-xl bg-degradado-club p-3 text-sm font-semibold text-sobre-acento">
              Enviarme una notificación de prueba
            </button>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
