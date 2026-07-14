import { enviarPushPrueba } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";

export default function PushAdminPage() {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Notificaciones" />
      <div className="mx-auto max-w-md p-4">
        <Tarjeta>
          <form action={enviarPushPrueba}>
            <Boton variante="degradado" className="w-full text-sm">
              Enviarme una notificación de prueba
            </Boton>
          </form>
        </Tarjeta>
      </div>
    </main>
  );
}
