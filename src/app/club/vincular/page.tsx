import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Cabecera } from "@/components/ui/Cabecera";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Banner } from "@/components/ui/Banner";
import { EstadoVacio } from "@/components/ui/EstadoVacio";
import { ListaFichas } from "./ListaFichas";
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

  // El censo del club es el ORDEN DE FUERZA, no la tabla `players` entera: `players`
  // incluye fichas que no son socios (restos de probar los importadores de ELO) y
  // ofrecerlas aquí permitiría reclamarlas.
  //
  // LA ACTIVA, O LA ÚLTIMA SI NO HAY NINGUNA, y esto costó caro el 2026-09-23: al
  // cerrar la temporada 2026 —terminó en marzo— esta consulta dejó de encontrar nada y
  // la pantalla empezó a decir "No queda ninguna ficha libre" a TODO EL MUNDO. El
  // primer socio que se registró tras abrir la app al club se quedó fuera por esto, y
  // no dejó rastro en ninguna parte: sin ficha no hay solicitud, así que no salía como
  // pendiente ni generaba aviso. Parecía que se había ido a medias por su cuenta.
  //
  // El Interclubs va de enero a marzo: nueve meses al año NO hay temporada activa, así
  // que atar a ella la única puerta de entrada de un socio nuevo era dejar la app sin
  // altas tres cuartos del año.
  const { data: temporadas } = await admin
    .from("seasons")
    .select("id, activa")
    .order("created_at", { ascending: false });
  const temporada = (temporadas ?? []).find((t) => t.activa) ?? (temporadas ?? [])[0] ?? null;

  const { data: censo } = temporada
    ? await admin
        .from("force_order")
        .select("numero, bis_index, elo_oficial, players(id, nombre, activo)")
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
      ...(fila.players as unknown as { id: string; nombre: string; activo: boolean | null }),
      elo: fila.elo_oficial as number | null,
    }))
    // NI LAS BAJAS: su fila sigue en el documento de la FACV —ese papel no se
    // reescribe—, pero ofrecerla aquí es ofrecer la identidad de alguien que ya no
    // es del club. Si vuelve, la junta lo reactiva y entonces aparece.
    .filter((p) => p?.id && p.activo !== false && !ocupados.has(p.id));

  return (
    <main className="min-h-dvh bg-fondo pb-10">
      <Cabecera
        titulo="¿Quién eres?"
        subtitulo="Búscate en la lista del club"
        medida="panel"
      />
      <Contenedor medida="panel" className="space-y-4">
        {error && <Banner tipo="error">{error}</Banner>}
        <p className="text-sm text-tinta-suave">
          Elige tu ficha y el admin del club confirmará que eres tú antes de darte
          acceso.
        </p>

        {/* ARRIBA Y NO AL FINAL. La lista sale del orden de fuerza, que se cierra a
            principio de temporada, así que un socio que entró después no está en
            ella. Abajo del todo, detrás de 46 nombres, este aviso solo lo lee quien
            ya ha bajado buscándose — y para entonces o se ha encontrado o ha elegido
            una ficha que no es la suya, que es justo lo que quería evitar. */}
        {libres.length > 0 && (
          <Tarjeta compacta>
            <p className="text-sm text-tinta">
              <b className="font-semibold">¿No encuentras tu nombre?</b> La lista es
              el orden de fuerza de esta temporada. Si acabas de entrar en el club
              puede que todavía no estés en él:{" "}
              <b className="font-semibold">no elijas otra ficha</b>, avisa al admin y
              te añade.
            </p>
          </Tarjeta>
        )}

        {libres.length === 0 ? (
          <EstadoVacio
            titulo="No queda ninguna ficha libre"
            detalle="Todas las fichas del orden de fuerza están ya vinculadas o pendientes. Avisa al admin del club."
          />
        ) : (
          <ListaFichas fichas={libres.map((p) => ({ id: p.id, nombre: p.nombre, elo: p.elo }))} />
        )}

      </Contenedor>
    </main>
  );
}
