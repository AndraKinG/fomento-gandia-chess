import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Contenedor } from "@/components/ui/Contenedor";
import { Pestana, Pestanas } from "@/components/ui/Pestanas";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import {
  agruparUso,
  mediaConectados,
  tiempoDeUso,
  type Periodo,
  type UsoDia,
} from "@/lib/uso/agrupar";

/**
 * El panel de datos de uso, solo para el admin (la puerta la pone el layout de
 * /club/admin).
 *
 * QUÉ ENSEÑA: los contadores agregados que deja el latido (visitas, tiempo,
 * media de conectados, socios activos — ver la decisión de privacidad en la
 * migración 0032) más la actividad que YA estaba en la base con su fecha
 * (partidas, retos, chat, avisos), agregada al consultarla por `recuento_uso`.
 *
 * CUÁNTO SE MIRA HACIA ATRÁS según el periodo: 14 días, 12 semanas o 12 meses.
 * Más historia en pantalla no ayuda a decidir nada y estira la tabla — y los
 * datos siguen en la base si algún día hacen falta.
 */

const VENTANAS: Record<Periodo, { dias: number; titulo: string }> = {
  dia: { dias: 14, titulo: "Últimos 14 días" },
  semana: { dias: 7 * 12, titulo: "Últimas 12 semanas" },
  mes: { dias: 366, titulo: "Últimos 12 meses" },
};

function esPeriodo(v: string | undefined): v is Periodo {
  return v === "dia" || v === "semana" || v === "mes";
}

/** Días que cubre un grupo, para la media de conectados. */
function diasDelGrupo(periodo: Periodo): number {
  return periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
}

function etiqueta(clave: string, periodo: Periodo): string {
  const f = new Date(`${clave}T00:00:00`);
  if (periodo === "mes") {
    return f.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }
  const dia = f.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return periodo === "semana" ? `Sem. del ${dia}` : dia;
}

export default async function UsoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: pedido } = await searchParams;
  const periodo: Periodo = esPeriodo(pedido) ? pedido : "dia";
  const ventana = VENTANAS[periodo];

  const desde = new Date();
  desde.setDate(desde.getDate() - ventana.dias);
  const desdeIso = desde.toISOString().slice(0, 10);

  // El recuento va con la clave de servicio: las funciones de la 0032 tienen el
  // EXECUTE revocado a los clientes. La puerta de admin ya la pasó el layout.
  const admin = createAdminClient();
  const supabase = await createServerSupabase();

  const [
    { data: recuento },
    { data: diario },
    { data: actividad },
    { count: cuentas },
    { count: vinculadas },
  ] = await Promise.all([
    admin.rpc("recuento_uso", { desde: desdeIso }),
    admin.from("uso_diario").select("dia, visitas, latidos").gte("dia", desdeIso),
    admin.from("uso_socios_dia").select("dia, profile_id").gte("dia", desdeIso),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("player_id", "is", null),
  ]);

  // Se casan las dos fuentes por día: el recuento trae TODOS los días de la
  // ventana (generate_series), así que es la espina; el diario del latido puede
  // tener huecos (días sin nadie) y se rellena con ceros.
  const latidosPorDia = new Map(
    (diario ?? []).map((f) => [f.dia as string, { visitas: f.visitas, latidos: f.latidos }])
  );
  const dias: UsoDia[] = ((recuento ?? []) as Record<string, unknown>[]).map((f) => ({
    dia: String(f.dia),
    visitas: latidosPorDia.get(String(f.dia))?.visitas ?? 0,
    latidos: latidosPorDia.get(String(f.dia))?.latidos ?? 0,
    partidasVivo: Number(f.partidas_vivo),
    retos: Number(f.retos),
    partidasSubidas: Number(f.partidas_subidas),
    mensajesChat: Number(f.mensajes_chat),
    avisos: Number(f.avisos),
    pushEntregados: Number(f.push_entregados),
  }));

  const pares = (actividad ?? []).map((a) => ({
    dia: a.dia as string,
    profileId: a.profile_id as string,
  }));

  const grupos = agruparUso(dias, pares, periodo);
  const actual = grupos[0];

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Datos de uso"
        subtitulo={`${vinculadas ?? 0} de ${cuentas ?? 0} cuentas vinculadas`}
        volverA="/club/admin"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        <Pestanas>
          {/* "Por día" apunta a la URL LIMPIA, que ya significa día por defecto:
              así el mismo estado tiene siempre la misma dirección, entre en el
              panel como entre. Con ?periodo=dia había dos URLs para lo mismo. */}
          <Pestana href="/club/admin/uso" activa={periodo === "dia"}>
            Por día
          </Pestana>
          <Pestana href="/club/admin/uso?periodo=semana" activa={periodo === "semana"}>
            Por semana
          </Pestana>
          <Pestana href="/club/admin/uso?periodo=mes" activa={periodo === "mes"}>
            Por mes
          </Pestana>
        </Pestanas>

        {/* El periodo en curso, en grande: es la pregunta que trae al panel
            ("¿se usa?"), y en una tabla de 14 filas no se ve de un vistazo. */}
        {actual && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Socios activos" valor={String(actual.activos)} />
            <Dato titulo="Visitas" valor={String(actual.visitas)} />
            <Dato titulo="Tiempo de uso" valor={tiempoDeUso(actual.latidos)} />
            <Dato
              titulo="Conectados de media"
              valor={mediaConectados(actual.latidos, diasDelGrupo(periodo))}
            />
          </div>
        )}

        {grupos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="📊"
              titulo="Todavía no hay datos"
              detalle="Los contadores empiezan a llenarse con el uso a partir de la migración 0032."
            />
          </Tarjeta>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-xs text-tinta-suave">
                    <th className="px-3 py-2 text-left font-medium">{ventana.titulo}</th>
                    <th className="px-3 py-2 text-right font-medium">Activos</th>
                    <th className="px-3 py-2 text-right font-medium">Visitas</th>
                    <th className="px-3 py-2 text-right font-medium">Tiempo</th>
                    <th className="px-3 py-2 text-right font-medium" title="Partidas en vivo">
                      En vivo
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Retos</th>
                    <th className="px-3 py-2 text-right font-medium" title="Partidas subidas al repositorio">
                      Subidas
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Chat</th>
                    <th className="px-3 py-2 text-right font-medium" title="Avisos generados / push entregados">
                      Avisos
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {grupos.map((g) => (
                    <tr key={g.clave} className="text-tinta">
                      <td className="whitespace-nowrap px-3 py-1.5 text-tinta-suave">
                        {etiqueta(g.clave, periodo)}
                      </td>
                      <Num v={g.activos} />
                      <Num v={g.visitas} />
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {g.latidos === 0 ? "—" : tiempoDeUso(g.latidos)}
                      </td>
                      <Num v={g.partidasVivo} />
                      <Num v={g.retos} />
                      <Num v={g.partidasSubidas} />
                      <Num v={g.mensajesChat} />
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {g.avisos === 0 ? "—" : `${g.avisos} / ${g.pushEntregados}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="px-1 text-xs text-tinta-suave">
          Visitas y tiempo salen del latido de la app (cada 5 min con la pestaña
          delante), así que los días anteriores a estrenarlo van a cero. De cada
          socio se guarda solo «entró tal día»: sin horas ni pantallas.
        </p>
      </Contenedor>
    </main>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Tarjeta compacta>
      <p className="text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{titulo}</p>
    </Tarjeta>
  );
}

function Num({ v }: { v: number }) {
  return (
    <td className="px-3 py-1.5 text-right tabular-nums">
      {v === 0 ? <span className="text-tinta-suave">—</span> : v}
    </td>
  );
}
