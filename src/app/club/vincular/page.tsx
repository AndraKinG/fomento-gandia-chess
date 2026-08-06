import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { ChipElo } from "@/components/ui/ChipElo";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { solicitarVinculo } from "./actions";
import { Contenedor } from "@/components/ui/Contenedor";

export default async function VincularPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Toda la lectura de esta pantalla va con el cliente de servicio, y es una
  // excepción deliberada: desde la migración 0009 una cuenta sin ficha aprobada
  // NO puede leer `players` ni `force_order` por RLS, que es justo el caso de
  // quien llega aquí. Del censo del club salen solo `nombre` y `elo_oficial`,
  // que es lo mínimo para reconocerse en la lista.
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("profiles")
    .select("player_id")
    .eq("id", user.id)
    .single();
  if (perfil?.player_id) redirect("/club");

  // Si ya tiene solicitud pendiente, no se le vuelve a ofrecer la lista: espera.
  const { data: solicitud } = await admin
    .from("link_requests")
    .select("player_id, created_at")
    .eq("user_id", user.id)
    .eq("status", "pendiente")
    .maybeSingle();

  if (solicitud) {
    const { data: ficha } = await admin
      .from("players")
      .select("nombre")
      .eq("id", solicitud.player_id)
      .single();
    return (
      <main className="min-h-dvh bg-fondo pb-10">
        <Cabecera titulo="Solicitud enviada" />
        <Contenedor medida="lectura" className="space-y-4">
          <Banner tipo="ok">
            Has dicho que eres <b className="font-semibold">{ficha?.nombre}</b>.
          </Banner>
          <EstadoVacio
            titulo="Pendiente de confirmación"
            detalle="El administrador del club tiene que confirmar que eres tú. En cuanto lo haga tendrás acceso a la app."
          />
        </Contenedor>
      </main>
    );
  }

  // El censo del club es el ORDEN DE FUERZA de la temporada activa, no la tabla
  // `players` entera: `players` incluye fichas que no son socios (restos de
  // probar los importadores de ELO) y ofrecerlas aquí permitiría reclamarlas.
  const { data: temporada } = await admin
    .from("seasons")
    .select("id")
    .eq("activa", true)
    .maybeSingle();

  const { data: censo } = temporada
    ? await admin
        .from("force_order")
        .select("numero, bis_index, elo_oficial, players(id, nombre)")
        .eq("season_id", temporada.id)
        .order("numero")
        .order("bis_index")
    : { data: [] };

  const [{ data: vinculados }, { data: pendientes }] = await Promise.all([
    admin.from("profiles").select("player_id").not("player_id", "is", null),
    admin.from("link_requests").select("player_id").eq("status", "pendiente"),
  ]);
  const ocupados = new Set([
    ...(vinculados ?? []).map((v) => v.player_id),
    ...(pendientes ?? []).map((r) => r.player_id),
  ]);

  const libres = (censo ?? [])
    .map((fila) => ({
      ...(fila.players as unknown as { id: string; nombre: string }),
      elo: fila.elo_oficial as number | null,
    }))
    .filter((p) => p?.id && !ocupados.has(p.id));

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="¿Quién eres?"
        subtitulo="Busca tu nombre en la lista del club"
      />
      <Contenedor medida="lectura" className="space-y-4">
        <p className="text-sm text-tinta-suave">
          Elige tu ficha. El admin del club confirmará que eres tú antes de
          darte acceso.
        </p>
        {error && <Banner tipo="error">{error}</Banner>}
        <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          {libres.map((p) => (
            <li key={p.id}>
              <Tarjeta className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 truncate text-tinta">{p.nombre}</span>
                  <span className="shrink-0">
                    <ChipElo valor={p.elo} etiqueta="FACV" />
                  </span>
                </div>
                <form
                  className="shrink-0"
                  action={async () => {
                    "use server";
                    const r = await solicitarVinculo(p.id);
                    if (r?.error)
                      redirect("/club/vincular?error=" + encodeURIComponent(r.error));
                  }}
                >
                  <button className="shrink-0 rounded-xl bg-acento-fuerte px-4 py-1.5 text-sm font-semibold text-sobre-acento transition duration-100 hover:brightness-110 active:scale-[0.97]">
                    Soy yo
                  </button>
                </form>
              </Tarjeta>
            </li>
          ))}
        </ul>
        {libres.length === 0 && (
          <EstadoVacio
            titulo="No queda ninguna ficha libre"
            detalle="Todas las fichas del orden de fuerza están ya vinculadas o pendientes. Avisa al admin del club."
          />
        )}

        {/* La lista sale del orden de fuerza, que se cierra a principio de
            temporada: un socio que se haya dado de alta después no se encontrará
            en ella. Sin este aviso, la salida natural es reclamar la ficha de
            otro "porque había que elegir alguna". */}
        {libres.length > 0 && (
          <Tarjeta compacta>
            <p className="text-sm text-tinta">
              <b className="font-semibold">¿No encuentras tu nombre?</b> La lista
              es el orden de fuerza de esta temporada. Si acabas de entrar en el
              club puede que todavía no estés en él:{" "}
              <b className="font-semibold">no elijas otra ficha</b>, avisa al
              admin y te añade.
            </p>
          </Tarjeta>
        )}
      </Contenedor>
    </main>
  );
}
