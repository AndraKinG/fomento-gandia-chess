import { createServerSupabase } from "@/lib/supabase/server";
import { formatearFechaMadrid } from "@/lib/fecha-madrid";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { Contenedor } from "@/components/ui/Contenedor";
import { BotonAccion } from "@/components/ui/BotonAccion";
import { marcarResuelto } from "./actions";

type FilaError = {
  id: number;
  origen: "servidor" | "navegador";
  mensaje: string;
  ruta: string;
  detalle: string | null;
  ultimo_digest: string | null;
  navegador: string | null;
  veces: number;
  primera_vez: string;
  ultima_vez: string;
  resuelto: boolean;
  resuelto_en: string | null;
};

const FECHA: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Los fallos de la app, agrupados (monitorización propia, 0052).
 *
 * Con el cliente de USUARIO, como `/club/admin/acceso`: la policy "errores: ver admin"
 * es la segunda barrera detrás del layout de `/club/admin`.
 *
 * Los resueltos se enseñan aparte y solo los últimos: sirven para ver qué se arregló, no
 * para trabajar con ellos. Si uno vuelve, sube solo a la lista de abiertos.
 */
export default async function ErroresPage() {
  const supabase = await createServerSupabase();
  const columnas =
    "id, origen, mensaje, ruta, detalle, ultimo_digest, navegador, veces, primera_vez, ultima_vez, resuelto, resuelto_en";
  const [abiertos, resueltos] = await Promise.all([
    supabase
      .from("errores")
      .select(columnas)
      .eq("resuelto", false)
      .order("ultima_vez", { ascending: false })
      .limit(100),
    supabase
      .from("errores")
      .select(columnas)
      .eq("resuelto", true)
      .order("resuelto_en", { ascending: false })
      .limit(20),
  ]);
  const fallo = abiertos.error ?? resueltos.error;
  const listaAbiertos = (abiertos.data ?? []) as FilaError[];
  const listaResueltos = (resueltos.data ?? []) as FilaError[];

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Errores"
        subtitulo="Lo que ha fallado en la app, agrupado"
        volverA="/club/admin"
      />
      <Contenedor medida="lectura" className="space-y-4">
        {fallo && (
          <Banner tipo="error">No se ha podido leer la lista de errores. Recarga en un rato.</Banner>
        )}

        {!fallo && listaAbiertos.length === 0 && (
          <EstadoVacio
            titulo="Sin errores abiertos"
            detalle="Cuando algo falle te llegará un aviso y aparecerá aquí."
          />
        )}

        {listaAbiertos.map((e) => (
          <TarjetaError key={e.id} error={e} />
        ))}

        {listaResueltos.length > 0 && (
          <details className="rounded-2xl border border-borde bg-tarjeta p-4">
            <summary className="cursor-pointer text-sm font-semibold text-tinta">
              Resueltos ({listaResueltos.length === 20 ? "los 20 últimos" : listaResueltos.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {listaResueltos.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="break-words text-tinta-suave">{e.mensaje}</p>
                  <p className="text-xs text-tinta-suave">
                    {e.ruta} · resuelto el {formatearFechaMadrid(e.resuelto_en, FECHA)}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="px-1 text-xs text-tinta-suave">
          No se guarda quién era ni desde dónde: solo el error, la pantalla y el tipo de
          navegador. Los resueltos se borran solos a los 90 días.
        </p>
      </Contenedor>
    </main>
  );
}

function TarjetaError({ error: e }: { error: FilaError }) {
  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-borde px-2 py-0.5 font-medium text-tinta-suave">
          {e.origen === "servidor" ? "Servidor" : "Navegador"}
        </span>
        <span className="rounded-full bg-acento-fuerte px-2 py-0.5 font-bold text-sobre-acento">
          {e.veces} {e.veces === 1 ? "vez" : "veces"}
        </span>
        <span className="font-mono text-tinta-suave">{e.ruta}</span>
      </div>

      <p className="mt-2 break-words font-mono text-sm text-tinta">{e.mensaje}</p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-tinta-suave">
        <dt>Última vez</dt>
        <dd>{formatearFechaMadrid(e.ultima_vez, FECHA)}</dd>
        <dt>Primera vez</dt>
        <dd>{formatearFechaMadrid(e.primera_vez, FECHA)}</dd>
        {e.navegador && (
          <>
            <dt>Navegador</dt>
            <dd>{e.navegador}</dd>
          </>
        )}
        {e.ultimo_digest && (
          <>
            <dt>Referencia</dt>
            <dd className="break-all font-mono">{e.ultimo_digest}</dd>
          </>
        )}
      </dl>

      {e.detalle && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-tinta-suave">
            Dónde ha fallado (pila)
          </summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-fondo p-2 text-[11px] text-tinta-suave">
            {e.detalle}
          </pre>
        </details>
      )}

      <form action={marcarResuelto.bind(null, e.id)} className="mt-3">
        <BotonAccion
          variante="secundario"
          trabajando="Guardando…"
          className="px-3 py-1.5 text-sm font-medium"
        >
          Marcar como resuelto
        </BotonAccion>
      </form>
    </Tarjeta>
  );
}
