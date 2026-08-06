import { enviarPushPrueba } from "./actions";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor } from "@/components/ui/Contenedor";
import { BotonAccion } from "@/components/ui/BotonAccion";

export default function PushAdminPage() {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Notificaciones" volverA="/club/admin" />
      <Contenedor medida="lectura">
        <Tarjeta>
          <form action={enviarPushPrueba}>
            <BotonAccion trabajando="Enviando…" className="w-full text-sm">
              Enviarme una notificación de prueba
            </BotonAccion>
          </form>
        </Tarjeta>
      </Contenedor>
    </main>
  );
}
