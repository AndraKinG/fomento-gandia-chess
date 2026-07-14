import { Cabecera } from "@/components/ui/Cabecera";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

export default function EquiposPage() {
  return (
    <main>
      <Cabecera titulo="Equipos" subtitulo="Interclubs FACV" />
      <div className="mx-auto max-w-md p-4">
        <EstadoVacio titulo="Los equipos llegan con el interclubs"
          detalle="Aquí verás calendario, clasificación y convocatorias de los equipos A, B y C" />
      </div>
    </main>
  );
}
