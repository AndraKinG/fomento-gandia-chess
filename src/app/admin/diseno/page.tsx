import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { ChipElo } from "@/components/ui/ChipElo";
import { ChipTablero } from "@/components/ui/ChipTablero";
import { TarjetaJornada } from "@/components/ui/TarjetaJornada";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemoDisponibilidad } from "./DemoDisponibilidad";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-suave">{titulo}</h2>
      {children}
    </section>
  );
}

export default function DisenoPage() {
  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera titulo="Biblioteca de componentes" subtitulo="Showcase gandiblue" />
      <div className="mx-auto max-w-md space-y-8 p-4">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        <Seccion titulo="Tarjeta de jornada">
          <TarjetaJornada
            equipo="Fomento Gandia A"
            rival="C.A. Ajedrez Alzira"
            fechaTexto="Sábado 20 sep · 16:00"
            esLocal
            sede="Casal Jove de Gandia"
            extra={
              <>
                <ChipTablero tablero={1} color="blancas" />
                <ChipElo valor={2104} />
              </>
            }
          />
        </Seccion>

        <Seccion titulo="Avisos">
          <div className="space-y-2">
            <Banner tipo="ok">Disponibilidad guardada correctamente.</Banner>
            <Banner tipo="error">No se ha podido guardar el cambio. Inténtalo de nuevo.</Banner>
            <Banner tipo="aviso">Aún no has confirmado tu disponibilidad para esta jornada.</Banner>
          </div>
        </Seccion>

        <Seccion titulo="Estado vacío">
          <Tarjeta>
            <EstadoVacio
              titulo="Sin jornadas próximas"
              detalle="Cuando el club publique el calendario, aparecerá aquí."
            />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Disponibilidad (interactivo)">
          <Tarjeta>
            <DemoDisponibilidad />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Tarjetas">
          <Tarjeta>
            <p className="text-sm text-tinta">Tarjeta normal.</p>
          </Tarjeta>
          <Tarjeta destacada>
            <p className="text-sm text-tinta">Tarjeta destacada.</p>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Chips">
          <div className="flex flex-wrap gap-2">
            <ChipElo valor={1850} />
            <ChipElo valor={null} />
            <ChipElo valor={2210} etiqueta="FEDA" />
            <ChipTablero tablero={2} color="blancas" />
            <ChipTablero tablero={3} color="negras" />
          </div>
        </Seccion>
      </div>
    </main>
  );
}
