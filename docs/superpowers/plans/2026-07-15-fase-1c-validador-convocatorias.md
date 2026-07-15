# Fase 1C — Validador RGC, convocatorias y resultados · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El capitán monta la convocatoria con validación reglamentaria EN VIVO (artículos 50-59 del RGC FACV), la publica con push a los convocados (tablero + color), anota resultados por tablero, y las clasificaciones se sincronizan de la FACV. Es el corazón del producto.

**Architecture:** Migración 0005 (lineups, lineup_boards, board_results, standings) con RLS de capitán reutilizando `es_capitan_de`. **El validador es un módulo TypeScript puro** (`src/lib/validador/`) sin BD ni UI, compartido entre el cliente (validación en vivo mientras el capitán arrastra) y el servidor (re-validación al publicar — la UI nunca es la única barrera). La pantalla de convocatoria es un client component que consulta al validador en cada cambio. Los datos de contexto (convocatorias de la misma fecha/sede, contadores del 50%) se cargan una vez por servidor y viajan como props serializables.

**Tech Stack:** el existente. Sin dependencias nuevas.

## Global Constraints

- Copy en español, tokens gandiblue, componentes `@/components/ui/*`. TS strict, sin `any` (cast `as unknown as {...}` sancionado en joins).
- **Pulido visual congelado** (decisión del usuario): los hallazgos visuales menores van al ledger para la pasada de pulido global, NO a fix-loops — salvo layout roto o accesibilidad grave. La lógica mantiene el listón completo (reviews + fixes inmediatos).
- Matriz de permisos del plan 1B (anexo) vinculante: convocatorias y resultados = capitán de SU equipo o admin; RLS garantía dura + server actions re-verifican + UI oculta. Convocatoria `publicada` visible para todo el club; `borrador` solo capitán del equipo y admin (¡también en RLS!).
- Reglamento de referencia: `docs/referencia/rgc-facv-2018-texto-extraido.txt` (arts. 49-59). Cada regla del validador cita su artículo en el mensaje de infracción.
- **Fuerza del jugador** = `force_order.elo_oficial`; si null → `fuerza({eloFide, eloFeda, eloOtro})` de `@/lib/elo/fuerza` (art. 52.1-52.2).
- Migración: fichero `supabase/migrations/0005_convocatorias.sql`, aplicada a mano por el usuario (gate).
- Claude NUNCA hace `git push`. `npm test` + `npm run build` verdes al cierre de cada tarea. Suite actual: 59/59.
- Cuentas de prueba: admin.prueba@... / jugador.prueba@... (ver ledger). La cuenta real del usuario (jony9vcf@gmail.com, admin + capitán del equipo A vía ficha Joan Martínez Ribes) NO se toca sin avisar.
- Datos reales en BD: temporada activa con 46 jugadores (elo_oficial), 3 equipos, 31 jornadas jugadas de 2026 (estado pendiente aún — la sync de resultados los pasará a jugado).

---

### Task 1: Migración 0005 — convocatorias, resultados y clasificación

**Files:**
- Create: `supabase/migrations/0005_convocatorias.sql`

**Interfaces:**
- Produces: tablas `lineups`, `lineup_boards`, `board_results`, `standings`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Convocatoria de una jornada (una por match)
create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicada_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tableros de la convocatoria (color se calcula al leer: art. 59, no se almacena)
create table public.lineup_boards (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  tablero int not null check (tablero between 1 and 8),
  player_id uuid not null references public.players(id) on delete cascade,
  unique (lineup_id, tablero),
  unique (lineup_id, player_id)
);

-- Resultado por tablero, desde el punto de vista del jugador del club
create table public.board_results (
  lineup_board_id uuid primary key references public.lineup_boards(id) on delete cascade,
  resultado numeric(2,1) not null check (resultado in (1, 0.5, 0)),
  updated_at timestamptz not null default now()
);

-- Clasificación del grupo de cada equipo (sync FACV o edición admin)
create table public.standings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  posicion int not null,
  club text not null,
  puntos numeric(5,1) not null default 0,
  es_nuestro boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (team_id, posicion)
);

-- ¿Es el usuario capitán del equipo de esta jornada?
create or replace function public.es_capitan_de_match(encuentro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_capitan_de((select team_id from public.matches where id = encuentro));
$$;

alter table public.lineups enable row level security;
alter table public.lineup_boards enable row level security;
alter table public.board_results enable row level security;
alter table public.standings enable row level security;

-- lineups: publicadas para todos; borradores solo capitán del equipo o admin
create policy "lineups publicadas legibles" on public.lineups
  for select to authenticated
  using (estado = 'publicada' or public.is_admin() or public.es_capitan_de_match(match_id));
create policy "lineups gestiona capitan" on public.lineups
  for all to authenticated
  using (public.is_admin() or public.es_capitan_de_match(match_id))
  with check (public.is_admin() or public.es_capitan_de_match(match_id));

create policy "boards siguen a su lineup" on public.lineup_boards
  for select to authenticated
  using (exists (
    select 1 from public.lineups l where l.id = lineup_id
      and (l.estado = 'publicada' or public.is_admin() or public.es_capitan_de_match(l.match_id))
  ));
create policy "boards gestiona capitan" on public.lineup_boards
  for all to authenticated
  using (exists (select 1 from public.lineups l where l.id = lineup_id
    and (public.is_admin() or public.es_capitan_de_match(l.match_id))))
  with check (exists (select 1 from public.lineups l where l.id = lineup_id
    and (public.is_admin() or public.es_capitan_de_match(l.match_id))));

create policy "resultados legibles" on public.board_results
  for select to authenticated using (true);
create policy "resultados gestiona capitan" on public.board_results
  for all to authenticated
  using (exists (
    select 1 from public.lineup_boards lb join public.lineups l on l.id = lb.lineup_id
    where lb.id = lineup_board_id and (public.is_admin() or public.es_capitan_de_match(l.match_id))
  ))
  with check (exists (
    select 1 from public.lineup_boards lb join public.lineups l on l.id = lb.lineup_id
    where lb.id = lineup_board_id and (public.is_admin() or public.es_capitan_de_match(l.match_id))
  ));

create policy "standings legibles" on public.standings
  for select to authenticated using (true);
create policy "standings escribe admin" on public.standings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: GATE USUARIO — aplicar en SQL Editor** (portapapeles + verificación REST de las 4 tablas).
- [ ] **Step 3: Commit** — `git commit -m "feat: esquema de convocatorias, resultados y clasificacion"`

---

### Task 2: Validador RGC — núcleo (orden, margen ELO, bises)

**Files:**
- Create: `src/lib/validador/tipos.ts`, `src/lib/validador/nucleo.ts`, `src/lib/validador/nucleo.test.ts`

**Interfaces (contrato compartido con Tasks 3-5):**

```ts
// tipos.ts
export type JugadorOrden = {
  playerId: string;
  nombre: string;
  numero: number;        // posición en el orden de fuerza
  bisIndex: number;      // 0 = titular, 1 = bis
  fuerza: number;        // elo_oficial ?? fuerza(elos) — resuelto ANTES de llamar al validador
  excepcionMargen: boolean; // tecnificación o +75 autorizado (arts. 52.3.d-e)
};
export type TableroPropuesto = { tablero: number; playerId: string };
export type Infraccion = {
  nivel: "error" | "aviso";
  tablero: number | null;   // null = infracción global
  articulo: string;          // "51.2", "52.3", "50.3", ...
  mensaje: string;           // español, cita nombres y números concretos
};
export type ConfigEquipo = {
  margenElo: number | null;  // 100 | 200 | null (sin margen)
  numTableros: number;       // 8 | 4
};
```

- `validarNucleo(orden: JugadorOrden[], alineacion: TableroPropuesto[], config: ConfigEquipo): Infraccion[]` — reglas SIN contexto externo:
  - **R1 (art. 51.2)** orden estricto: en la alineación, un jugador no puede ir en tablero posterior... (¡al revés!) — un jugador con orden de fuerza PEOR (numero mayor) no puede ocupar tablero ANTERIOR a otro con orden mejor, SALVO lo permitido por R2. Con margen null, violación directa = error. N-bis cuenta inmediatamente detrás de N (ordenación por (numero, bisIndex)).
  - **R2 (art. 52.3)** margen: con margenElo 100/200, la inversión es legal si la diferencia de fuerza < margen (aviso "inversión legal"), y error si el que va detrás supera al de delante en ≥ margen. Jugadores con `excepcionMargen` no generan error de margen (aviso informativo).
  - **R6 (art. 50.3)** máximo 2 bises alineados por encuentro.
  - Estructurales: tablero duplicado, jugador duplicado, tablero fuera de 1..numTableros, jugador no presente en el orden (error "no está en el orden de fuerza").

- [ ] **Step 1: TDD exhaustivo — escribir TODOS estos casos primero** (nombres orientativos; RED antes de implementar):
  1. Alineación en orden perfecto, sin margen → sin infracciones.
  2. Sin margen (B/C): nº14 delante del nº9 → error 51.2 con ambos nombres.
  3. Margen 200 (A): delante alguien 150 puntos peor → aviso "inversión legal (<200)".
  4. Margen 200: delante alguien 250 puntos peor → error 52.3 "supera en 250 ≥ 200".
  5. Margen 200, diferencia EXACTA 200 → error (la norma dice "100 puntos o más" → ≥).
  6. Margen 100 (División de Honor simulada): 99 → aviso, 100 → error.
  7. Bis: 7bis se ordena tras el 7 y antes del 8; alinear 8 delante de 7bis sin margen → error.
  8. 3 bises alineados → error 50.3; 2 bises → sin error.
  9. `excepcionMargen` en el jugador adelantado → sin error, con aviso informativo.
  10. Tablero duplicado / jugador duplicado / tablero 9 con numTableros 8 / jugador fuera del orden → errores estructurales.
  11. Alineación incompleta (menos tableros que numTableros) → aviso (no error: se puede guardar borrador), y tableros vacíos intercalados → aviso.
  12. Fuerzas iguales (misma fuerza) en inversión → legal con margen (dif 0 < margen) y también SIN margen si numero contiguo... NO: sin margen manda el orden de fuerza, no la fuerza → error igualmente. Test que lo fije.
- [ ] **Step 2: RED** (módulo no existe) → **Step 3: implementar `validarNucleo`** hasta GREEN. La comparación de orden usa (numero, bisIndex) lexicográfico; la de margen usa `fuerza`. Mensajes con nombres y cifras reales ("García (2140) no puede ir detrás de Pérez (2010): le supera en 130 ≥ 100 (art. 52.3)").
- [ ] **Step 4: Suite completa + build + commit** — `git commit -m "feat: validador RGC nucleo (orden, margen, bises)"`

---

### Task 3: Validador RGC — contexto (bloques, límites, 50%, misma fecha/sede)

**Files:**
- Create: `src/lib/validador/contexto.ts`, `src/lib/validador/contexto.test.ts`, `src/lib/validador/index.ts`

**Interfaces:**

```ts
export type ContextoClub = {
  equipoIndice: number;          // 0 = A, 1 = B, 2 = C (orden por categoría)
  totalEquipos: number;
  numTablerosPorEquipo: number[];  // para calcular bloques de titulares (art. 51.4)
  esDivisionAutonomica: boolean[]; // por equipo (para límites 51.5.c)
  alineacionesMismaFecha: { equipoIndice: number; playerIds: string[] }[]; // otras convocatorias del club ese día
  mismaSede: number[];           // índices de equipos que juegan en nuestra sede ese día (art. 52.4)
  vecesEnSuperior: Record<string, number>; // playerId -> nº de rondas alineado en equipos superiores (art. 51.3)
  rondasJugadasEquipoOrigen: number;       // rondas disputadas por el equipo del jugador (base del 50%)
};
```

- `validarContexto(orden, alineacion, config, ctx: ContextoClub): Infraccion[]`:
  - **R3 (art. 51.1/51.4)** bloques de titulares: los números 1..T (T = tableros del equipo superior, contando bises intercalados) son titulares del equipo 0; T+1..2T del equipo 1, etc. Un titular de un equipo NO puede alinearse en equipo de índice MAYOR (inferior). Sí puede subir.
  - **R4 (art. 51.5.c)** si `esDivisionAutonomica[equipoIndice]`: equipo A (índice 0) solo números ≤ 18; equipo B (índice 1) solo 9..28 (o 9..fin si totalEquipos == 2). C y sucesivos sin límite.
  - **R5 (art. 51.3)** regla del 50%: si `vecesEnSuperior[playerId] + 1 > rondasJugadasEquipoOrigen * 0.5` para un titular de equipo inferior alineado arriba → AVISO preventivo ("si juega esta, ya no podrá volver al X"); si ya está bloqueado (`veces >= 50%`) y se le alinea en el equipo INFERIOR de origen → error 51.3.
  - **R7 (art. 54-55)** jugador presente en `alineacionesMismaFecha` de otro equipo → error.
  - **R8 (art. 52.4)** si hay `mismaSede`, valida el orden cruzado: ningún jugador de un equipo puede tener numero de orden mejor (menor) que alguien alineado en tablero comparable del equipo que juega en la misma sede... Implementación práctica del art. 52.4: concatenar las alineaciones de los equipos en la misma sede como si fueran un solo equipo (equipo superior primero) y aplicar R1/R2 sobre esa lista combinada; las infracciones resultantes se reportan con nivel error y artículo "52.4".
- `validar(...)` en index.ts = núcleo + contexto concatenados.

- [ ] **Step 1: TDD** — casos mínimos por regla (2-3 por regla, incluidos: titular del A intentando jugar en el B → error 51.1; nº 20 en el equipo A autonómico → error 51.5.c (>18); nº 19 en el B con 3 equipos → ok, nº 29 en el B → error; aviso preventivo del 50% en el límite exacto; jugador en dos convocatorias del mismo día → error en ambas direcciones; misma sede con inversión ilegal cruzada → error 52.4).
- [ ] **Step 2-3: RED → implementar → GREEN.**
- [ ] **Step 4: Commit** — `git commit -m "feat: validador RGC contexto (bloques, limites, 50 por ciento, fecha y sede)"`

---

### Task 4: Colores (art. 59) + carga del contexto desde BD

**Files:**
- Create: `src/lib/validador/colores.ts` (+ test), `src/lib/convocatorias/contexto-bd.ts`

**Interfaces:**
- `colorDeTablero(tablero: number, esLocal: boolean): "blancas" | "negras"` — local: blancas en impares (art. 59). Test de las 8 casillas × 2.
- `cargarContextoValidacion(matchId: string): Promise<{ orden: JugadorOrden[]; config: ConfigEquipo; ctx: ContextoClub }>` — server-only (adm client, lectura): resuelve fuerza (elo_oficial ?? fuerza()), equipos de la temporada ordenados por... **orden fijo A→B→C por nombre** (documentar: la categoría textual no es ordenable; el nombre del club con sufijo sí), alineaciones publicadas o borrador de la misma FECHA (día Madrid), misma sede (matches locales del club el mismo día), contadores del 50% desde lineup_boards de lineups publicadas de la temporada + estado jugado. NOTA: cuenta SOLO jornadas con estado 'jugado' para `rondasJugadasEquipoOrigen` y `vecesEnSuperior`.
- [ ] TDD para colores; contexto-bd verificado en vivo (sin tests unitarios — convención apply, revisar en vivo).
- [ ] **Commit** — `git commit -m "feat: colores art. 59 y carga de contexto de validacion"`

---

### Task 5: Server actions de convocatoria

**Files:**
- Create: `src/app/equipos/[id]/convocatoria/actions.ts`

**Interfaces:**
- `guardarBorrador(matchId, tableros: TableroPropuesto[])` — gate capitán-del-match o admin (helper `esCapitanDeMatch(matchId)` vía RPC + esAdmin). Valida con el validador COMPLETO: los `error` estructurales (duplicados, fuera de rango) bloquean el guardado; las infracciones reglamentarias NO bloquean el borrador (se guardan para seguir editando). Upsert de lineup (estado borrador) + replace de lineup_boards.
- `publicarConvocatoria(matchId)` — re-valida TODO en servidor: si hay algún `error` → `{ error: "No se puede publicar: N infracciones", infracciones }`. Si ok: estado publicada + publicada_at + push a cada convocado registrado: "Convocado con el {equipo} · Tablero {n} · {♙/♟} {color} · {fecha} {sede/rival}" con url al detalle de jornada. Devuelve `{ ok }`.
- `despublicarConvocatoria(matchId)` — vuelve a borrador (para correcciones), solo si el match no está jugado.
- [ ] Gates verificados: capitán de OTRO equipo → rechazado (además de RLS). Commit — `git commit -m "feat: acciones de convocatoria con re-validacion en servidor"`

---

### Task 6: Pantalla de convocatoria del capitán (validación en vivo)

**Files:**
- Create: `src/app/equipos/[id]/convocatoria/[matchId]/page.tsx` (server: guard + carga orden/contexto/disponibilidad/borrador), `src/app/equipos/[id]/convocatoria/[matchId]/EditorConvocatoria.tsx` (client)
- Modify: `src/app/equipos/[id]/plantilla/page.tsx` (enlace "Montar convocatoria" por jornada), `src/app/equipos/[id]/page.tsx` (chip "Convocatoria publicada" en jornadas que la tengan)

**Composición del editor (client):**
- Dos paneles móvil-first: **tableros 1..N** arriba (cada uno: nº, color calculado ♙/♟, jugador asignado o hueco "Toca para asignar") y **lista de disponibles** debajo (orden de fuerza con fuerza + estado de disponibilidad ✅/❌/🤔/—; los ❌ atenuados pero asignables con aviso).
- Interacción por toque (sin drag): tocar hueco → modo selección → tocar jugador (y viceversa). Quitar con ✕.
- **Validación EN VIVO**: en cada cambio, ejecutar `validar()` (el módulo puro corre en el cliente; el contexto viene serializado del server). Errores en rojo bajo el tablero afectado con el artículo; avisos en ámbar; contador arriba ("2 infracciones · 1 aviso").
- Botones: "Guardar borrador" (siempre, salvo errores estructurales) y "Publicar convocatoria" (deshabilitado si hay errores; confirm dialog nativo antes de push). Feedback banner.
- [ ] Verificación en vivo OBLIGATORIA con datos reales: como capitán real no hay (la cuenta real es del usuario) → usar admin.prueba (admin puede). Montar convocatoria del equipo B jornada R1 con jugadores reales 9-16 → sin infracciones; forzar inversión sin margen → error 51.2 visible; guardar borrador; verificar RLS de borrador (jugador.prueba NO lo ve en el detalle de jornada); NO publicar (evitar push masivo a suscripciones reales... en realidad solo hay 1-2 suscripciones de prueba y el push dice claramente el contenido — PUBLICAR SÍ, es la verificación clave; hacerlo con la R99... la R99 se borró; publicar la R1 del B — fecha pasada, inofensivo — y despublicar después).
- [ ] Commit — `git commit -m "feat: editor de convocatoria con validacion RGC en vivo"`

---

### Task 7: Detalle de jornada público + resultados del capitán

**Files:**
- Create: `src/app/jornadas/[matchId]/page.tsx` (público autenticado: datos del encuentro, convocatoria publicada con tableros/colores/nombres, resultados y marcador si los hay), `src/app/jornadas/[matchId]/ResultadosEditor.tsx` (client, visible solo capitán/admin), `src/app/jornadas/[matchId]/actions.ts` (`guardarResultados(matchId, resultados: {tablero, resultado}[])` — gate capitán; marca match estado 'jugado' cuando los N tableros tienen resultado; recalcula marcador)
- Modify: enlaces desde equipo-detalle y Home (la tarjeta de próxima jornada enlaza aquí).

- Marcador: suma de resultados ("4½ – 3½"); mostrar con el rival correcto según es_local.
- [ ] Verificación en vivo: anotar resultados reales de la R1 del B (están en chess-results/FACV… los reales se sincronizarán en T8; aquí anotar a mano 2-3 tableros, ver marcador parcial, completar, ver estado jugado) → deshacer no hace falta (son los datos reales de una jornada jugada).
- [ ] Commit — `git commit -m "feat: detalle de jornada con resultados por tablero"`

---

### Task 8: Sync de resultados y clasificación FACV (viernes del cron)

**Files:**
- Create: `src/lib/import/facv-resultados.ts` (+ test + fixture), `src/lib/import/facv-resultados-apply.ts`
- Modify: `src/app/api/cron/director/route.ts` (viernes → sync), `src/app/admin/equipos/actions.ts` + page (botón "Sincronizar resultados FACV"), `src/app/equipos/[id]/page.tsx` (tabla de clasificación desde standings)

**Interfaces:**
- `parseResultadosFACV(html, nombreClub)` → `{ ronda, grupo, marcadorLocal, marcadorVisitante, local, visitante }[]` (misma página calendario r=0 que T5-1B: los encuentros jugados llevan marcador — verificar en fixture; si el marcador vive en otra vista, investigar y documentar).
- Clasificación: la página FACV muestra puntos por equipo junto al nombre (visto: "Fomento de Gandía B 4 pts") — extraer posiciones/puntos del grupo de cada equipo; si la fuente real resulta ser chess-results, investigar y elegir la más parseable (fixture-first como siempre).
- Apply: marcador del encuentro → si el capitán NO anotó resultados por tablero, marcar match jugado con marcador global (guardado como filas board_results NO — sin tableros; añadir columnas `marcador_propio/marcador_rival` a matches en la MISMA migración... NO: migración ya aplicada. Añadir `0006_marcadores.sql` pequeña con esas 2 columnas numeric null en matches). El detalle de jornada muestra marcador global cuando no hay tableros.
- **Los resultados por tablero anotados por el capitán PREVALECEN** (spec): la sync solo completa marcadores globales vacíos y actualiza standings; discrepancias marcador-capitán vs marcador-FACV → aviso en el resultado de la sync.
- [ ] Fixture + TDD parser; migración 0006 (gate usuario); cron viernes integrado con `?forzar=sync`; verificación en vivo: sync trae los marcadores reales de la temporada 2026 completa y la clasificación final de los 3 grupos. Commit — `git commit -m "feat: sync de resultados y clasificacion FACV"`

---

### Task 9: Pendientes heredados pre-lanzamiento

**Files:** varios.

- [ ] **SMTP Resend (GATE USUARIO)**: guiar al usuario para crear cuenta en resend.com (gratis, 100/día), verificar dominio o usar onboarding@resend.dev, y configurar SMTP en Supabase (Settings → Auth → SMTP). Después personalizar plantilla de confirmación en español (ya editable con SMTP propio).
- [ ] **xlsx CVE**: migrar dependencia a `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (package.json), verificar tests FEDA 4/4.
- [ ] **README.md real**: setup (env, migraciones 0001→0006 en orden, cuentas), arquitectura breve, comandos, deploy Vercel, crons.
- [ ] **middleware → proxy**: renombrar `src/middleware.ts` a la convención `proxy` de Next 16 (leer `node_modules/next/dist/docs` messages/middleware-to-proxy; si el rename tiene fricción, documentar y posponer).
- [ ] **Constante temporada FACV**: `id=1428` promovido a constante junto al club id con comentario "actualizar cada temporada" (ambos en un único `src/lib/import/facv-config.ts` importado por los 3 importadores).
- [ ] Commit — `git commit -m "chore: pendientes pre-lanzamiento (smtp, xlsx, readme, proxy, config facv)"`

---

### Task 10: Verificación integral 1C + cierre

- [ ] Flujo completo en navegador (ambos temas): capitán monta convocatoria B con validación → publica (push real) → detalle de jornada visible para jugador → resultados → marcador → clasificación actualizada → Home enlaza todo. Cron `?forzar=sync`. `npm test` + build + lint verdes.
- [ ] Ajustes de la pasada (solo lógica/roturas; visual menor → ledger para la pasada de pulido global).
- [ ] **GATE USUARIO**: push + prueba en móvil (el usuario es capitán real del A: puede montar una convocatoria de verdad). Feedback → cerrar 1C.

---

## Autochequeo del plan (hecho)

- **Cobertura spec §5**: validador con las 8 reglas (T2-T3, arts. citados), colores 59 (T4), convocatoria en vivo + push (T5-T6), resultados capitán (T7), sync FACV + clasificación + viernes cron (T8), pendientes heredados (T9). Pantalla jornada-detalle (T7). Todo lo de 1B intacto.
- **Placeholders**: los casos de test del validador están enumerados con su resultado esperado; el fixture de resultados sigue el método fixture-first (procedimiento, no hueco). La duda real (¿marcadores en calendario r=0 o en chess-results?) está marcada como investigación del Step correspondiente con criterio de decisión.
- **Consistencia**: tipos `JugadorOrden/TableroPropuesto/Infraccion/ConfigEquipo/ContextoClub` definidos una vez (T2) y consumidos por T3-T6; `es_capitan_de_match` definida en 0005 y usada en RLS + actions; fuerza = elo_oficial con fallback al módulo de Fase 0; matriz de permisos 1B extendida a lineups/resultados en RLS explícita.
- **Nota 0006**: los marcadores globales van en migración aparte (0005 ya estará aplicada cuando se descubra T8) — decisión consciente, no error.
