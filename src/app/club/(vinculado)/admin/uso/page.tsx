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
  porcentajeDelClub,
  tiempoDeUso,
  tiempoPorSocio,
  type Periodo,
  type UsoDia,
} from "@/lib/uso/agrupar";

/**
 * El panel de datos de uso, solo para el admin (la puerta la pone el layout de
 * /club/admin).
 *
 * TRES BLOQUES, y el orden es el de las preguntas que se hacen de verdad
 * (reordenado el 2026-08-12 a petición del propietario, que pidió "datos más
 * útiles y todo mejor estructurado"):
 *
 * 1. **¿Cuánto club hay dentro?** Adopción: cuentas, notificaciones, quién ha
 *    entrado alguna vez. No depende del periodo — es una foto de hoy.
 * 2. **¿Se está usando?** Las cifras del periodo en curso, en grande.
 * 3. **¿Va a mejor o a peor?** La tabla, para comparar periodos.
 *
 * QUÉ ENSEÑA Y QUÉ NO: contadores agregados del latido (ver la decisión de
 * privacidad en la migración 0032) más la actividad que YA estaba en la base con
 * su fecha, agregada al consultarla por `recuento_uso`. De cada socio solo se
 * sabe "entró tal día", nunca a qué hora ni qué miró.
 *
 * CUÁNTO SE MIRA HACIA ATRÁS según el periodo: 14 días, 12 semanas o 12 meses.
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
    { count: fichas },
    { count: dispositivos },
    { data: todosLosDias },
  ] = await Promise.all([
    admin.rpc("recuento_uso", { desde: desdeIso }),
    admin.from("uso_diario").select("dia, visitas, latidos").gte("dia", desdeIso),
    admin.from("uso_socios_dia").select("dia, profile_id").gte("dia", desdeIso),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("player_id", "is", null),
    supabase.from("players").select("id", { count: "exact", head: true }).eq("activo", true),
    // Dispositivos con notificaciones activas: es la mejor medida de adopción real
    // que tenemos, porque activarlas exige tener la app a mano (en iOS, instalada).
    admin.from("push_subscriptions").select("id", { count: "exact", head: true }),
    // TODA la historia de quién ha entrado, para "han entrado alguna vez". Son ≤46
    // socios por día: una consulta ligera que cabe de sobra en el tope de mil filas
    // mientras el club sea el que es.
    admin.from("uso_socios_dia").select("profile_id"),
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
    nuevos: Number(f.nuevos),
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
  const hanEntradoAlguna = new Set((todosLosDias ?? []).map((f) => f.profile_id as string)).size;

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="Datos de uso"
        subtitulo="Cuánto club hay dentro de la app"
        volverA="/club/admin"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-6">
        {/* ---- 1. ADOPCIÓN: la foto de hoy, sin depender del periodo ---- */}
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            El club en la app
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato
              titulo="Cuentas creadas"
              valor={String(cuentas ?? 0)}
              nota={`de ${fichas ?? 0} socios`}
            />
            <Dato
              titulo="Con ficha vinculada"
              valor={String(vinculadas ?? 0)}
              nota="pueden usarlo todo"
            />
            <Dato
              titulo="Han entrado alguna vez"
              valor={String(hanEntradoAlguna)}
              nota={porcentajeDelClub(hanEntradoAlguna, vinculadas ?? 0) + " de las cuentas"}
            />
            <Dato
              titulo="Avisos activados"
              valor={String(dispositivos ?? 0)}
              nota="dispositivos"
            />
          </div>
        </section>

        {/* ---- 2. EL PERIODO EN CURSO, en grande ---- */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              {periodo === "dia" ? "Hoy" : periodo === "semana" ? "Esta semana" : "Este mes"}
            </h2>
            <Pestanas>
              {/* "Por día" apunta a la URL LIMPIA, que ya significa día por
                  defecto: así el mismo estado tiene siempre la misma dirección. */}
              <Pestana href="/club/admin/uso" activa={periodo === "dia"}>
                Día
              </Pestana>
              <Pestana href="/club/admin/uso?periodo=semana" activa={periodo === "semana"}>
                Semana
              </Pestana>
              <Pestana href="/club/admin/uso?periodo=mes" activa={periodo === "mes"}>
                Mes
              </Pestana>
            </Pestanas>
          </div>

          {actual && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato
                titulo="Socios activos"
                valor={String(actual.activos)}
                nota={porcentajeDelClub(actual.activos, vinculadas ?? 0) + " de las cuentas"}
              />
              <Dato
                titulo="Nuevos"
                valor={actual.nuevos > 0 ? `+${actual.nuevos}` : "0"}
                nota="entran por primera vez"
              />
              <Dato
                titulo="Tiempo por socio"
                valor={tiempoPorSocio(actual.latidos, actual.activos)}
                nota={`${tiempoDeUso(actual.latidos)} en total`}
              />
              <Dato
                titulo="Conectados a la vez"
                valor={mediaConectados(actual.latidos, diasDelGrupo(periodo))}
                nota="de media"
              />
            </div>
          )}
        </section>

        {/* ---- 3. LA TABLA, para comparar periodos ---- */}
        {grupos.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono="📊"
              titulo="Todavía no hay datos"
              detalle="Los contadores se llenan con el uso; los días anteriores a estrenarlos van a cero."
            />
          </Tarjeta>
        ) : (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-tinta-suave">
              {ventana.titulo}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-borde bg-tarjeta">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {/* DOS FILAS DE CABECERA: "Gente" y "Actividad" son dos cosas
                        distintas, y nueve columnas seguidas sin agrupar no se leen. */}
                    <tr className="border-b border-borde text-[11px] uppercase tracking-wide text-tinta-suave">
                      <th className="px-3 pt-2" />
                      <th className="px-3 pt-2 text-center font-semibold" colSpan={4}>
                        Gente
                      </th>
                      <th
                        className="border-l border-borde px-3 pt-2 text-center font-semibold"
                        colSpan={5}
                      >
                        Actividad
                      </th>
                    </tr>
                    <tr className="border-b border-borde text-xs text-tinta-suave">
                      <th className="px-3 pb-2 text-left font-medium">Periodo</th>
                      <th className="px-3 pb-2 text-right font-medium">Activos</th>
                      <th className="px-3 pb-2 text-right font-medium">Nuevos</th>
                      <th className="px-3 pb-2 text-right font-medium">Visitas</th>
                      <th className="px-3 pb-2 text-right font-medium">Tiempo</th>
                      <th className="border-l border-borde px-3 pb-2 text-right font-medium" title="Partidas en vivo">
                        En vivo
                      </th>
                      <th className="px-3 pb-2 text-right font-medium">Retos</th>
                      <th className="px-3 pb-2 text-right font-medium" title="Partidas subidas al repositorio">
                        Subidas
                      </th>
                      <th className="px-3 pb-2 text-right font-medium">Chat</th>
                      <th className="px-3 pb-2 text-right font-medium" title="Avisos generados / push entregados">
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
                        <Num v={g.nuevos} />
                        <Num v={g.visitas} />
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                          {g.latidos === 0 ? (
                            <span className="text-tinta-suave">—</span>
                          ) : (
                            tiempoDeUso(g.latidos)
                          )}
                        </td>
                        <td className="border-l border-borde px-3 py-1.5 text-right tabular-nums">
                          {g.partidasVivo === 0 ? (
                            <span className="text-tinta-suave">—</span>
                          ) : (
                            g.partidasVivo
                          )}
                        </td>
                        <Num v={g.retos} />
                        <Num v={g.partidasSubidas} />
                        <Num v={g.mensajesChat} />
                        <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                          {g.avisos === 0 ? (
                            <span className="text-tinta-suave">—</span>
                          ) : (
                            `${g.avisos} / ${g.pushEntregados}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <p className="px-1 text-xs text-tinta-suave">
          Una <b className="font-semibold">visita</b> es entrar en la app, y de cada
          socio se cuenta como mucho una cada cinco horas: recargar la pantalla no
          infla el número. El <b className="font-semibold">tiempo</b> sale del latido
          de la app (cada 5 min con la pestaña delante), así que los días anteriores a
          estrenarlo van a cero. De cada socio solo se guarda «entró tal día»: sin
          horas ni pantallas.
        </p>
      </Contenedor>
    </main>
  );
}

function Dato({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string;
  /** La línea pequeña que le da sentido al número: un dato sin referencia
   *  ("3 activos") no dice si es bueno o malo. */
  nota?: string;
}) {
  return (
    <Tarjeta compacta>
      <p className="text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-tinta-suave">{titulo}</p>
      {nota && <p className="mt-0.5 text-xs text-tinta-suave">{nota}</p>}
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
