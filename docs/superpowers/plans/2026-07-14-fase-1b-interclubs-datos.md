# Fase 1B — Interclubs: datos, importadores FACV y disponibilidad · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equipos con capitanes, calendario de jornadas importado de la FACV, orden de fuerza sincronizado con la página oficial del club (con ELO oficial), y disponibilidad de jugadores con push automático (petición del lunes, recordatorio del jueves). Tras este plan el club puede organizarse; las convocatorias con validador llegan en el plan 1C.

**Architecture:** Migración aditiva 0004 (teams, team_captains, matches, availability) con RLS por rol de capitán vía helper `es_capitan_de(team_id)`. Parsers FACV puros y testeados contra fixtures reales (patrón Fase 0). Acciones de servidor gated con `esAdmin()`/capitán. Cron único diario "director de orquesta" que multiplexa por día de semana (límite Vercel Hobby de 2 crons). UI sobre los componentes gandiblue de 1A.

**Tech Stack:** el existente (Next 16, Supabase, Tailwind v4, Vitest, web-push). Sin dependencias nuevas.

## Global Constraints

- Copy en **español**, móvil-first, tokens gandiblue de 1A (`bg-fondo`, `bg-tarjeta`, `text-tinta`, `text-acento-texto`, `bg-degradado-club`, componentes `@/components/ui/*`). TypeScript strict, sin `any` (cast sancionado `as unknown as {...}` para joins de Supabase).
- Migraciones: fichero nuevo `supabase/migrations/0004_interclubs.sql`; se aplica a mano en el SQL Editor (gate usuario). Idempotencia no requerida (fichero nuevo), pero sí orden correcto.
- Toda importación FACV con respaldo manual en la UI (principio de la spec). Parsers con fixture REAL descargado de facv.org y tests que afirman datos reales del fixture (patrón validado en Fase 0/…).
- El club en la web FACV: `of_publico.php?id=56` (orden de fuerza) y `calendario_publico.php` (calendario). El id de club (56) y el nombre a buscar ("Fomento") van en constantes con comentario, no hardcodeados dispersos.
- Reglas de seguridad: jugador escribe SOLO su disponibilidad; capitán gestiona SOLO su equipo; admin todo. Server actions siempre re-verifican permisos antes de tocar el admin client (patrón `esAdmin()` / nuevo `esCapitanDe()`).
- Claude NUNCA hace `git push`. `npm test` + `npm run build` verdes al cierre de cada tarea. Verificación en navegador (viewport móvil, ambos temas) para cada pantalla nueva.
- Cuentas de prueba: admin.prueba@fomentogandia.test / PruebaAdmin2026! (admin, sin ficha) y jugador.prueba@fomentogandia.test / PruebaJugador2026! (ficha "Jugador Prueba, Uno"). En el panel de navegador los submits pueden requerir `requestSubmit()`.

---

### Task 1: Migración 0004 — equipos, capitanes, jornadas y disponibilidad

**Files:**
- Create: `supabase/migrations/0004_interclubs.sql`

**Interfaces:**
- Produces: tablas `teams`, `team_captains`, `matches`, `availability`; helper SQL `public.es_capitan_de(uuid) returns boolean`; columna `force_order.elo_oficial int` (ELO oficial FACV de la temporada). Todas las tareas posteriores consumen este esquema.

- [ ] **Step 1: Escribir la migración**

```sql
-- Equipos de una temporada (A/B/C) con la configuración reglamentaria de su liga
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  nombre text not null,                    -- "Fomento de Gandia", "... B", "... C"
  categoria text not null,                 -- "1ª Autonómica Sur", etc.
  margen_elo int,                          -- RGC 52.3: 100 (Div. Honor), 200 (autonómicas), null = sin margen
  num_tableros int not null default 8,
  created_at timestamptz not null default now(),
  unique (season_id, nombre)
);

-- Capitanes: rol por equipo (el player gana permisos de gestión de SU equipo)
create table public.team_captains (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (team_id, player_id)
);

-- Jornadas (encuentros) de un equipo
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  ronda int not null,
  fecha_hora timestamptz,
  rival text not null,
  es_local boolean not null default true,
  sede text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'jugado')),
  unique (team_id, ronda)
);

-- Disponibilidad jugador × jornada
create table public.availability (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  estado text not null check (estado in ('disponible', 'no_disponible', 'duda')),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- ELO oficial FACV del orden de fuerza (fuente del validador en 1C)
alter table public.force_order add column elo_oficial int;

-- ¿Es el usuario actual capitán de este equipo?
create or replace function public.es_capitan_de(equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.team_captains tc
    join public.profiles p on p.player_id = tc.player_id
    where p.id = auth.uid() and tc.team_id = equipo
  );
$$;

-- RLS
alter table public.teams enable row level security;
alter table public.team_captains enable row level security;
alter table public.matches enable row level security;
alter table public.availability enable row level security;

create policy "teams legibles" on public.teams
  for select to authenticated using (true);
create policy "teams escribe admin" on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "capitanes legibles" on public.team_captains
  for select to authenticated using (true);
create policy "capitanes escribe admin" on public.team_captains
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "matches legibles" on public.matches
  for select to authenticated using (true);
create policy "matches escribe admin" on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "matches edita capitan" on public.matches
  for update to authenticated
  using (public.es_capitan_de(team_id)) with check (public.es_capitan_de(team_id));

-- Disponibilidad: el jugador escribe SOLO la suya (vía su profile); lectura para
-- el propio jugador, capitanes del equipo de la jornada y admin
create policy "disponibilidad propia escribe" on public.availability
  for all to authenticated
  using (player_id = (select player_id from public.profiles where id = auth.uid()))
  with check (player_id = (select player_id from public.profiles where id = auth.uid()));
create policy "disponibilidad lee capitan o admin" on public.availability
  for select to authenticated
  using (
    public.is_admin()
    or player_id = (select player_id from public.profiles where id = auth.uid())
    or public.es_capitan_de((select team_id from public.matches m where m.id = match_id))
  );
```

- [ ] **Step 2: GATE USUARIO — aplicar en el SQL Editor.** Copiar el fichero al portapapeles del usuario (`Get-Content supabase\migrations\0004_interclubs.sql | Out-String | Set-Clipboard`) y pedirle pegar + Run. Verificar después vía REST (service key): `teams`, `team_captains`, `matches`, `availability` responden 200 y `force_order?select=elo_oficial` no da 400.

- [ ] **Step 3: Commit** — `git commit -m "feat: esquema interclubs (equipos, capitanes, jornadas, disponibilidad)"`

---

### Task 2: Parser del orden de fuerza oficial FACV (TDD con fixture real)

**Files:**
- Create: `src/lib/import/facv-orden-fuerza.ts`, `src/lib/import/facv-orden-fuerza.test.ts`, `src/lib/import/fixtures/facv-of-club.html`

**Interfaces:**
- Produces: `parseOrdenFuerzaFACV(html: string): FilaOF[]` con `type FilaOF = { numero: number; bisIndex: number; nombre: string; eloOficial: number | null; fideId: string | null }`. Constante exportada `URL_OF_CLUB` (`https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56`, comentario: id 56 = Fomento Gandia).

Estructura HTML real (verificada 2026-07-14): filas `<tr data-search="nombre normalizado + fide">`, número OF en `<span class="badge text-bg-dark px-3 py-2">N</span>` (puede ser "5 bis" — comprobar formato exacto en el fixture), nombre en `<span class="cut">Nombre Completo</span>`, ELO en `<td class="text-end col-elo"> 2057<!--...--> </td>`, ID FIDE en enlace `href="https://ratings.fide.com/profile/2256711"` (puede faltar).

- [ ] **Step 1: Descargar fixture real**

```powershell
curl.exe -s -A "Mozilla/5.0" "https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56" -o "src/lib/import/fixtures/facv-of-club.html"
```

Abrir el fixture y ANOTAR: nº total de filas, y 3 jugadores concretos (posición, nombre, ELO, fide id) — al menos uno CON fide y, si existe, uno bis y uno sin ELO.

- [ ] **Step 2: Test que falla** (con los datos reales anotados — los valores de ejemplo se sustituyen):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOrdenFuerzaFACV } from "./facv-orden-fuerza";

const html = readFileSync(join(__dirname, "fixtures", "facv-of-club.html"), "utf-8");

describe("parseOrdenFuerzaFACV", () => {
  const filas = parseOrdenFuerzaFACV(html);
  it("extrae todas las filas del orden de fuerza", () => {
    expect(filas.length).toBeGreaterThan(10); // ajustar al total real anotado
  });
  it("extrae posicion, nombre, elo y fide id de jugadores reales", () => {
    // Sustituir por 3 filas reales anotadas del fixture:
    expect(filas[1]).toEqual({ numero: 2, bisIndex: 0, nombre: "NOMBRE_REAL",
      eloOficial: 9999, fideId: "9999999" });
  });
  it("las posiciones son crecientes y sin duplicados", () => {
    const claves = filas.map((f) => `${f.numero}/${f.bisIndex}`);
    expect(new Set(claves).size).toBe(claves.length);
  });
  it("devuelve [] con HTML sin filas", () => {
    expect(parseOrdenFuerzaFACV("<html><body>nada</body></html>")).toEqual([]);
  });
});
```

- [ ] **Step 3: Implementación** (ajustar regex al fixture hasta que pase; enfoque por bloques de `<tr` con extracción por regex de badge/cut/col-elo/profile link; decodificar entidades básicas `&amp;` etc. en el nombre; ignorar filas sin badge numérico):

```ts
export type FilaOF = {
  numero: number;
  bisIndex: number;
  nombre: string;
  eloOficial: number | null;
  fideId: string | null;
};

/** Página oficial del orden de fuerza del club (id 56 = Fomento Gandia). */
export const URL_OF_CLUB =
  "https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56";

const BADGE_RE = /class="badge[^"]*"[^>]*>\s*([0-9]+)\s*(bis)?\s*</i;
const NOMBRE_RE = /class="cut"[^>]*>\s*([^<]+?)\s*</i;
const ELO_RE = /col-elo[^>]*>\s*([0-9]{3,4})/i;
const FIDE_RE = /ratings\.fide\.com\/profile\/([0-9]+)/i;

export function parseOrdenFuerzaFACV(html: string): FilaOF[] {
  const filas: FilaOF[] = [];
  for (const bloque of html.split(/<tr[\s>]/i).slice(1)) {
    const badge = BADGE_RE.exec(bloque);
    const nombre = NOMBRE_RE.exec(bloque);
    if (!badge || !nombre) continue;
    const elo = ELO_RE.exec(bloque);
    const fide = FIDE_RE.exec(bloque);
    filas.push({
      numero: Number(badge[1]),
      bisIndex: badge[2] ? 1 : 0,
      nombre: nombre[1].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
      eloOficial: elo ? Number(elo[1]) : null,
      fideId: fide ? fide[1] : null,
    });
  }
  return filas;
}
```

- [ ] **Step 4: `npm test` verde (suite completa) + commit** — `git commit -m "feat: parser del orden de fuerza oficial FACV"`

---

### Task 3: Sincronización del orden de fuerza + botón admin

**Files:**
- Create: `src/lib/import/facv-of-apply.ts`
- Modify: `src/app/admin/orden-fuerza/actions.ts` (nueva action gated), `src/app/admin/orden-fuerza/page.tsx` (botón + resultado)

**Interfaces:**
- Produces: `sincronizarOrdenFuerzaFACVCore(): Promise<{ creados: number; actualizados: number; error?: string }>` en `facv-of-apply.ts` (sin gate — patrón feda-apply; NUNCA exportar desde "use server" sin gate). Action `sincronizarOrdenFuerzaFACV()` gated con `esAdmin()`.

Lógica del core (documentar en comentarios):
1. `fetch(URL_OF_CLUB)` (user-agent browser-like); si `!ok` → error.
2. `parseOrdenFuerzaFACV`; si 0 filas → error "la página no contiene el orden de fuerza (¿rediseño?)".
3. Temporada activa (`seasons.activa = true`); si no hay → error pidiendo crearla.
4. Por fila: buscar player por `fide_id`; si no, por `nombre` exacto; si no existe → crear (nombre, fide_id). Upsert de `force_order` de la temporada activa por `(season_id, player_id)`: numero, bis_index, **elo_oficial**. (No borrar filas existentes que la página ya no traiga: marcar en el resultado `avisos: string[]` con los que sobran, decisión humana.)
5. Devolver contadores.

- [ ] **Step 1: Implementar core** (código completo siguiendo la lógica de arriba; reusar `createAdminClient`).
- [ ] **Step 2: Action gated + botón** "Sincronizar con la FACV" arriba de la página orden-fuerza (estilo `bg-degradado-club`), feedback vía redirect `?msg=&tipo=` existente; mostrar también avisos si los hay. El formulario de pegado manual SE CONSERVA debajo (respaldo), dentro de un `<details>` colapsado "Importación manual (respaldo)".
- [ ] **Step 3: Verificación en navegador**: pulsar el botón con la BD real → deben aparecer los jugadores reales del club con su `elo_oficial`; los 7 de prueba de la Fase 0 quedan (avisados como "sobrantes"). `npm test` + build verdes.
- [ ] **Step 4: Commit** — `git commit -m "feat: sincronizacion del orden de fuerza oficial FACV"`

---

### Task 4: Admin de temporada — equipos y capitanes

**Files:**
- Create: `src/app/admin/equipos/page.tsx`, `src/app/admin/equipos/actions.ts`
- Modify: `src/app/admin/page.tsx` (enlace 🛡️ Equipos y capitanes)

**Interfaces:**
- Produces: actions gated `esAdmin()`: `crearEquipo(formData)` (nombre, categoria, margen_elo: ""|"100"|"200", num_tableros), `eliminarEquipo(teamId)` (solo si no tiene jornadas), `nombrarCapitan(teamId, playerId)`, `quitarCapitan(teamId, playerId)`.
- Página: lista de equipos de la temporada activa como Tarjetas (nombre, categoría, chip de margen "≥100"/"≥200"/"Orden estricto", capitanes con botón quitar ✕), formulario de alta de equipo, y por equipo un `<select>` de fichas (players activos) + botón "Nombrar capitán". Feedback `?msg=&tipo=`.

- [ ] **Step 1: Actions** (código completo con validaciones: margen solo ""|100|200 → null|100|200; nombre no vacío; capitán duplicado → error amable 23505).
- [ ] **Step 2: Página** (composición gandiblue; EstadoVacio si no hay temporada activa con aviso de crearla vía orden de fuerza).
- [ ] **Step 3: Verificación navegador** (crear los 3 equipos reales: "Fomento de Gandia" 1ª Autonómica Sur margen 200; "Fomento de Gandia B" 1ª Prov. Valencia Sur sin margen; "Fomento de Gandia C" 2ª Prov. 8T Valencia Sur 1 sin margen; nombrar capitán de prueba en uno). Tests + build.
- [ ] **Step 4: Commit** — `git commit -m "feat: gestion de equipos y capitanes"`

---

### Task 5: Parser + sincronización del calendario FACV

**Files:**
- Create: `src/lib/import/facv-calendario.ts`, `src/lib/import/facv-calendario.test.ts`, `src/lib/import/fixtures/facv-calendario.html`, `src/lib/import/facv-calendario-apply.ts`
- Modify: `src/app/admin/equipos/actions.ts` (action `sincronizarCalendarioFACV()`), `src/app/admin/equipos/page.tsx` (botón)

**Interfaces:**
- Produces: `parseCalendarioFACV(html: string, nombreClub: string): JornadaFACV[]` con `type JornadaFACV = { grupo: string; ronda: number; fecha: string | null; local: string; visitante: string }` (solo encuentros donde local o visitante contengan `nombreClub`); `sincronizarCalendarioFACVCore()` que asigna cada encuentro al equipo cuya `nombre` mejor coincida (mapeo exacto por sufijo: nombre con " B" → equipo B, " C" → C, resto → A; documentar) y upsertea `matches` por `(team_id, ronda)` con rival, es_local y fecha.

- [ ] **Step 1: Descubrir la URL exacta y descargar fixture.** La página índice pública es `https://www.facv.org/appwebfacv/public/staff/interclubs/calendario_publico.php?id=1428&modo=completo&sede_id=0&club_id=0&r=N` (id 1428 = Interclubs 2026, r = ronda). Investigar (curl con user-agent) si existe `club_id` para filtrar por club (probar `club_id=3` visto en enlaces "Grupos"); elegir la URL que traiga TODAS las rondas del club con menos peticiones y documentarla como constante `URL_CALENDARIO(ronda)`. Descargar el fixture de una ronda real que contenga "Fomento".
- [ ] **Step 2: Test que falla** (con 2 encuentros reales del fixture anotados: ronda, local, visitante) + edge: HTML vacío → [].
- [ ] **Step 3: Implementación** del parser (regex por bloques, mismo estilo que Task 2, matching de nombre de club case/acentos-insensitive con `.normalize("NFD")`) hasta test verde.
- [ ] **Step 4: Core + action + botón** "Importar calendario FACV" en admin/equipos (recorre rondas 1..11, agrupa por equipo, upsert). Respaldo manual: en la misma página, mini-formulario por equipo "Añadir jornada" (ronda, fecha, rival, local/visitante, sede) con action `crearJornada(formData)` gated admin.
- [ ] **Step 5: Verificación navegador** (importar calendario real de la temporada 2026 terminada — sirve como dato de prueba; ver jornadas por equipo). Tests + build. Commit — `git commit -m "feat: calendario de jornadas desde la FACV con respaldo manual"`

---

### Task 6: Disponibilidad — pantalla del jugador y plantilla del capitán

**Files:**
- Create: `src/app/disponibilidad/page.tsx`, `src/app/disponibilidad/actions.ts`, `src/app/disponibilidad/SelectorDisponibilidad.tsx` (client), `src/app/equipos/[id]/plantilla/page.tsx`
- Modify: `src/app/equipos/page.tsx` (de placeholder a lista real, ver Task 7 nota), `src/components/BottomNav.tsx` NO cambia (disponibilidad se llega desde Home/notificaciones)

**Interfaces:**
- Produces: action `marcarDisponibilidad(fecha: string, estado: "disponible" | "no_disponible" | "duda")` — usa el cliente de usuario (RLS hace cumplir que solo escribe la suya): upsert de `availability` para TODAS las jornadas pendientes del club cuya `fecha_hora` caiga en esa fecha (un toque cubre A, B y C del mismo sábado). Devuelve `{ error?: string }` (sin ficha vinculada → error).
- Página `/disponibilidad` (jugador): lista de próximas fechas con jornadas (agrupadas por fecha, mostrando qué equipos juegan), cada una con `BotonesDisponibilidad` (client `SelectorDisponibilidad` que llama a la action con `useTransition` y marca optimista). EstadoVacio si no hay jornadas.
- Página `/equipos/[id]/plantilla` (capitán/admin del equipo; guard en la página: `es_capitan_de` vía RPC `supabase.rpc("es_capitan_de", { equipo: id })` o admin — si no, redirect a /equipos): por jornada pendiente, lista del orden de fuerza con estado de cada jugador (✅/❌/🤔/— sin responder) y contadores.

- [ ] **Step 1: Action** (código completo: obtener player_id del perfil; jornadas pendientes de la fecha; upsert batch con cliente de usuario).
- [ ] **Step 2: Pantalla jugador** + client selector (optimista, revalida).
- [ ] **Step 3: Plantilla del capitán** (lectura con cliente de usuario — la RLS de availability ya permite al capitán ver su equipo; la lista de jugadores viene de force_order de la temporada activa con nombre + estado).
- [ ] **Step 4: Verificación navegador**: como jugador.prueba marcar disponibilidad de una fecha (ver que cubre las jornadas de esa fecha), como capitán de prueba ver la plantilla, como jugador NO capitán comprobar el redirect de /equipos/[id]/plantilla. Tests + build. Commit — `git commit -m "feat: disponibilidad por fecha y plantilla del capitan"`

---

### Task 7: Pestaña Equipos real + Home con próxima jornada

**Files:**
- Modify: `src/app/equipos/page.tsx` (lista real), `src/app/page.tsx` (TarjetaJornada real)
- Create: `src/app/equipos/[id]/page.tsx` (detalle), `src/components/ui/Boton.tsx`, `src/components/ui/FilaJugadorOF.tsx`

**Interfaces:**
- Produces (deuda 1A absorbida): `Boton({ variante: "degradado" | "solido" | "secundario", ... })` como wrapper de button/Link con las 3 clases canónicas; `FilaJugadorOF({ numero, bisIndex, nombre, chips? })` extraída del patrón de admin/orden-fuerza (badge redondo + nombre + chips) y reutilizada allí.
- `/equipos`: Tarjeta por equipo (nombre, categoría, chip margen, capitanes, próximas 2 jornadas resumidas) → enlaza al detalle.
- `/equipos/[id]`: Cabecera con nombre; calendario completo de jornadas (Tarjetas: ronda, rival, fecha, casa/fuera, sede, estado); enlace "Plantilla y disponibilidad" visible solo para capitán/admin.
- Home: si hay jornadas pendientes → `TarjetaJornada` de la más próxima (del equipo que sea) con extra = chips; aviso "Tienes jornadas sin responder" con `Boton` a /disponibilidad cuando falte disponibilidad del jugador para fechas próximas; EstadoVacio solo si no hay jornadas.

- [ ] **Step 1: Boton + FilaJugadorOF** (código completo; migrar admin/orden-fuerza y las 3 pantallas con botones degradado a `Boton` — cambio visualmente neutro).
- [ ] **Step 2: /equipos + detalle.**
- [ ] **Step 3: Home real** (consulta: próxima match con fecha futura; disponibilidad pendiente del player para fechas de los próximos 10 días).
- [ ] **Step 4: Verificación navegador ambos temas + tests + build. Commit** — `git commit -m "feat: equipos, detalle de equipo y home con proxima jornada"`

---

### Task 8: Push de disponibilidad — cron director de orquesta

**Files:**
- Create: `src/lib/push/disponibilidad.ts`, `src/app/api/cron/director/route.ts`
- Modify: `vercel.json` (un cron diario), `src/lib/push/send.ts` solo si hace falta un `enviarPushAMuchos(userIds, payload)` (batch con Promise.allSettled)

**Interfaces:**
- Produces: `pedirDisponibilidadSemana(): Promise<{ notificados: number }>` — busca jornadas pendientes con fecha en los próximos 7 días; push a TODOS los usuarios con ficha vinculada y suscripción push: título "¿Puedes jugar?" cuerpo "Jornada del {fecha}: marca tu disponibilidad", url "/disponibilidad". `recordarPendientes(): Promise<{ notificados: number }>` — igual pero SOLO a usuarios cuyo player no tiene fila de availability para alguna jornada de los próximos 4 días.
- Ruta `GET /api/cron/director` (gate `CRON_SECRET`, `maxDuration = 300`): según `new Date().getUTCDay()` — lunes (1) → pedir; jueves (4) → recordar; otros días → `{ dia: N, accion: "nada" }`. (El viernes-sync se añadirá en 1C; dejar el `switch` preparado con comentario.)
- `vercel.json`: `{ "crons": [{ "path": "/api/cron/director", "schedule": "0 9 * * *" }] }` (09:00 UTC diario).

- [ ] **Step 1: Lógica de push** (código completo; consulta jornadas próximas → fechas; usuarios con player_id y push_subscriptions; para recordatorio, anti-join con availability).
- [ ] **Step 2: Ruta director + vercel.json.**
- [ ] **Step 3: Verificación local**: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/director` un día no-lunes → `accion: "nada"`; forzar con `?forzar=pedir|recordar` (parámetro de prueba, también gated por el secret) y comprobar que llega el push a la suscripción del navegador del usuario si la hay (o al menos `notificados >= 0` sin error con BD real). Tests de la lógica pura si se extrae el cálculo de destinatarios a función testeable (hacerlo: `calcularDestinatariosRecordatorio(jornadas, disponibilidades, usuarios)` pura con test). Build verde.
- [ ] **Step 4: Commit** — `git commit -m "feat: cron director con peticion y recordatorio de disponibilidad"`

---

### Task 9: Verificación integral 1B + cierre

- [ ] **Step 1: Pasada en navegador** (ambos temas, móvil): flujo completo — admin sincroniza OF FACV → crea equipos → importa calendario → jugador marca disponibilidad → capitán ve plantilla → home muestra próxima jornada. Arreglar solo visual/UX menor; lo funcional que falle se arregla con fix-loop normal.
- [ ] **Step 2: `npm test` + `npm run build` + `npm run lint` verdes.**
- [ ] **Step 3: Commit de ajustes si los hay** — `git commit -m "fix: ajustes de la pasada integral 1B"`
- [ ] **Step 4: GATE USUARIO — push + prueba real en móvil** (sincronizar el OF real, ver el calendario real 2026, marcar disponibilidad, y el push de prueba del director con ?forzar). Comentarios del usuario se aplican antes de cerrar.

---

## Autochequeo del plan (hecho)

- **Cobertura spec 1B** (§3 datos: teams/team_captains/matches/availability ✓, lineups/board_results/standings quedan para 1C con su migración 0005; §4 importadores 1 y 2 ✓, el 3 (resultados) es de 1C; §5 disponibilidad+cron ✓ con el viernes-sync diferido a 1C; pantallas: equipos/detalle/plantilla/disponibilidad/home ✓, jornada-detalle con convocatoria es de 1C).
- **Placeholders:** los valores "ajustar al fixture real" de los tests de parsers siguen el método fixture-first validado; no son huecos sino el procedimiento.
- **Consistencia:** `es_capitan_de` se usa en RLS y vía RPC en la página plantilla; `elo_oficial` vive en force_order (por temporada) y lo consumirá el validador 1C; nombres de estados de availability idénticos a los props de BotonesDisponibilidad de 1A.

---

## Anexo: matriz de permisos (confirmada por el usuario, vinculante para todas las tareas)

| Acción | Jugador | Capitán (solo SU equipo) | Admin |
|---|:-:|:-:|:-:|
| Ver equipos/calendario/orden de fuerza/clasificación | ✅ | ✅ | ✅ |
| Marcar SU disponibilidad | ✅ | ✅ | ✅ |
| Ver disponibilidad de otros | ❌ | ✅ (su equipo) | ✅ |
| Ver plantilla del equipo | ❌ | ✅ (su equipo) | ✅ |
| Editar jornada (sede/hora) | ❌ | ✅ (su equipo, solo update) | ✅ (todo) |
| Convocatorias y resultados (1C) | ❌ | ✅ (su equipo) | ✅ |
| Crear equipos / nombrar capitanes | ❌ | ❌ | ✅ |
| Sincronizar FACV | ❌ | ❌ | ✅ |
| Vinculaciones / ELOs / push de prueba | ❌ | ❌ | ✅ |
| Panel /admin | ❌ | ❌ | ✅ |

Aplicación en 3 capas: (1) **RLS en Postgres = garantía dura** (`es_capitan_de` + `is_admin`); (2) las **server actions re-verifican SIEMPRE** antes de tocar el admin client; (3) la **UI oculta** lo no permitido (nunca es la única barrera). El capitán se identifica vía `team_captains` × `profiles.player_id`; sus herramientas viven en `/equipos/[id]`, nunca en `/admin`. Los revisores de cada tarea deben comprobar esta matriz.
