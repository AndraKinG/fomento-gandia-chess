import { createAdminClient } from "@/lib/supabase/admin";
import { formatearCodigo } from "@/lib/acceso/codigo";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { cambiarEstadoCodigo, regenerarCodigo } from "./actions";

export default async function AccesoPage() {
  // El layout de /admin ya ha comprobado que quien llega es admin.
  const admin = createAdminClient();
  const { data: codigos } = await admin
    .from("access_codes")
    .select("id, codigo, activo, usos, notas, created_at")
    .order("activo", { ascending: false })
    .order("created_at", { ascending: false });

  const activo = (codigos ?? []).find((c) => c.activo);
  const historial = (codigos ?? []).filter((c) => !c.activo);

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Acceso al club"
        subtitulo="Código para que los socios se registren"
        volverA="/admin"
      />
      <div className="mx-auto max-w-md space-y-4 p-4">
        {activo ? (
          <Tarjeta destacada>
            <p className="text-xs uppercase tracking-wide text-tinta-suave">
              Código activo
            </p>
            <p className="mt-1 select-all font-mono text-2xl font-bold tracking-wider text-tinta">
              {formatearCodigo(activo.codigo)}
            </p>
            <p className="mt-2 text-sm text-tinta-suave">
              {activo.usos} {activo.usos === 1 ? "cuenta creada" : "cuentas creadas"}{" "}
              con este código.
            </p>
            <form action={cambiarEstadoCodigo.bind(null, activo.id, false)} className="mt-3">
              <button className="rounded-xl border border-borde bg-tarjeta px-3 py-1.5 text-sm text-tinta-suave transition duration-100 hover:bg-tarjeta-suave active:scale-[0.97]">
                Cerrar el registro
              </button>
            </form>
          </Tarjeta>
        ) : (
          <>
            <Banner tipo="aviso">
              El registro está <b className="font-semibold">cerrado</b>. Nadie
              puede crear cuenta nueva. Los socios ya registrados entran con
              normalidad.
            </Banner>
            <EstadoVacio
              titulo="Sin código activo"
              detalle="Genera uno cuando quieras volver a abrir el registro."
            />
          </>
        )}

        <Tarjeta>
          <p className="text-sm text-tinta">
            Pásales el código y la dirección de la app. Con esos dos datos
            crean su cuenta y eligen su ficha; tú confirmas en{" "}
            <b className="font-semibold">Vinculaciones</b>.
          </p>
          <form action={regenerarCodigo} className="mt-3">
            <button className="rounded-xl bg-acento-fuerte px-4 py-2 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]">
              Generar código nuevo
            </button>
          </form>
          <p className="mt-2 text-xs text-tinta-suave">
            El anterior deja de valer al instante. No afecta a quien ya tenga
            cuenta.
          </p>
        </Tarjeta>

        {historial.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-xs uppercase tracking-wide text-tinta-suave">
              Códigos anteriores
            </p>
            {historial.map((c) => (
              <Tarjeta key={c.id} compacta>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm text-tinta-suave line-through">
                    {formatearCodigo(c.codigo)}
                  </span>
                  <span className="shrink-0 text-xs text-tinta-suave">
                    {c.usos} {c.usos === 1 ? "alta" : "altas"}
                  </span>
                </div>
              </Tarjeta>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
