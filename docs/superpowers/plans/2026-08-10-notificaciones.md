# Notificaciones que llegan de verdad · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún aviso se pierda: cada uno se guarda en la base antes de intentar el push, el socio lo ve en su bandeja aunque el push no llegue, y elige por grupos qué le avisa al móvil.

**Architecture:** Una tabla `notifications` es la verdad; `enviarPushAUsuario` deja de ser la puerta de entrada y pasa a ser el mensajero de un nuevo `avisar()`, que guarda y luego intenta el push. La decisión de *a quién y por qué vía* vive en un módulo **puro y testeado** (`src/lib/avisos/politica.ts`), separado del I/O (`src/lib/avisos/enviar.ts`). Las 11 llamadas actuales se migran a `avisar()` sin cambiar sus textos.

**Tech Stack:** el existente (Next 16, Supabase, web-push, Vitest). Sin dependencias nuevas.

## Global Constraints

- Copy en **español**, tokens gandiblue, componentes `@/components/ui/*` y `Contenedor`/`Cabecera` con la misma medida (regla de ancho del CLAUDE.md). TS strict, sin `any` (cast sancionado `as unknown as {...}` en joins de Supabase).
- **Spec vinculante:** `docs/superpowers/specs/2026-08-10-notificaciones-design.md`. Los 4 grupos y los 11 tipos son los de su tabla; la convocatoria NO se puede silenciar; `gestion` solo para admin/junta.
- **Un aviso que falla NUNCA tumba la operación principal** (publicar convocatoria, aceptar reto, importar). Todo el camino de avisos va en try/catch silencioso, como ya hace el push hoy.
- Migración: fichero nuevo `supabase/migrations/0028_avisos.sql`, y el SQL **se pega completo en el chat** para que el usuario lo aplique (regla 2). NO aplicarla desde código.
- **Escribir avisos es exclusivo del servidor con clave de servicio**; el socio solo lee y marca leídos los suyos (permisos en 3 capas: RLS dura + action re-verifica + UI oculta).
- Scripts de un solo uso que tocan la base: NUNCA en `src/**/*.test.ts` (regla 6 — vitest los re-ejecuta). Van a `scripts/` y se borran.
- Claude NUNCA hace `git push`. `npm test` + `npm run build` + `npx tsc --noEmit` + `npm run lint` verdes al cierre de cada tarea. Suite actual: **703 tests**.
- No editar ficheros con acentos vía round-trips de PowerShell (corrompe UTF-8): usar las herramientas de edición.

---

### Task 1: Migración 0028 — tabla de avisos y preferencias

**Files:**
- Create: `supabase/migrations/0028_avisos.sql`

**Interfaces:**
- Produces: tabla `public.notifications`, columna `profiles.avisos_silenciados text[]`, y sus policies. Todas las tareas siguientes consumen este esquema.

Contenido (escribir con comentarios en español explicando el POR QUÉ, estilo 0018/0027 — se explica la decisión, no lo que hace el SQL):

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  grupo text not null check (grupo in ('interclubs', 'torneos', 'partidas', 'gestion')),
  tipo text not null,
  titulo text not null,
  cuerpo text not null,
  url text,
  creado_en timestamptz not null default now(),
  leido_en timestamptz,
  push text not null default 'pendiente'
    check (push in ('pendiente', 'entregado', 'fallido', 'no_tocaba')),
  push_intentos int not null default 0
);

-- La bandeja se lee siempre igual: los míos, los más nuevos primero.
create index notifications_bandeja on public.notifications (profile_id, creado_en desc);
-- El reintento del cron busca solo fallidos, que son pocos: índice parcial.
create index notifications_a_reintentar on public.notifications (push) where push = 'fallido';

-- Grupos que el socio ha apagado. Array y no cuatro columnas: añadir un grupo nuevo
-- no obliga a otra migración, y el valor por defecto (nada silenciado) es el que
-- queremos — quien no toca nada recibe lo de siempre.
alter table public.profiles
  add column if not exists avisos_silenciados text[] not null default '{}';

alter table public.notifications enable row level security;

-- Cada uno ve los suyos; el admin todos (para diagnosticar "a mí no me llegó nada").
create policy "avisos: leo los mios" on public.notifications
  for select to authenticated
  using (notifications.profile_id = auth.uid() or public.is_admin());

-- Marcar leído es lo ÚNICO que puede hacer el socio, y solo sobre los suyos. El
-- `with check` repite la condición para que no pueda reasignarse un aviso a otro.
create policy "avisos: marco leidos los mios" on public.notifications
  for update to authenticated
  using (notifications.profile_id = auth.uid())
  with check (notifications.profile_id = auth.uid());

-- NO hay policy de INSERT ni DELETE a propósito: los avisos los escribe el servidor
-- con clave de servicio. Sin esto, un socio podría fabricarse un aviso (o fabricárselo
-- a otro), que es exactamente el agujero que se cerró en el chat en la 0027.
```

Ojo al escribir: cualificar SIEMPRE los nombres con la tabla dentro de las policies (`notifications.profile_id`, no `profile_id` a secas) — el bug de la 0024 fue exactamente eso. Cerrar con un bloque `select` de verificación (tabla creada, columna añadida, 2 policies) como en 0017/0027.

- [ ] **Step 1: Escribir el fichero** con el SQL de arriba, tal cual.
- [ ] **Step 2: Verificar** que el fichero no tiene acentos corruptos y que el SQL es coherente. NO aplicar (gate del usuario, lo hace el controlador).
- [ ] **Step 3: Commit** — `git commit -m "feat(avisos): esquema de avisos y preferencias por grupo (0028)"`

---

### Task 2: La política de avisos (módulo puro, TDD)

**Files:**
- Create: `src/lib/avisos/politica.ts`, `src/lib/avisos/politica.test.ts`

**Interfaces (las consumen Tasks 3-6; no renombrar):**

```ts
export type GrupoAviso = "interclubs" | "torneos" | "partidas" | "gestion";

export type TipoAviso =
  | "convocatoria" | "disponibilidad_peticion" | "disponibilidad_recordatorio"
  | "torneo_interes" | "torneo_primer_apuntado" | "coche_plaza_libre" | "coche_sin_plaza"
  | "reto_aceptado"
  | "alta_socio" | "vinculacion" | "fichas_nuevas";

/** A qué grupo pertenece cada tipo (tabla de la spec). */
export const GRUPO_DE: Record<TipoAviso, GrupoAviso>;

/** Tipos que ignoran el silencio del socio (decisión del propietario). */
export const NO_SILENCIABLES: readonly TipoAviso[]; // ["convocatoria"]

/** ¿Se le manda push a este socio por este aviso? */
export function debePush(
  tipo: TipoAviso,
  destinatario: { silenciados: string[]; tieneSuscripcion: boolean }
): boolean;

/** Qué hacer con un fallo de envío, según lo que respondió el servicio de push. */
export function tratarFallo(statusCode: number | undefined):
  | { estado: "no_tocaba"; borrarSuscripcion: true }   // 404/410: ya no existe
  | { estado: "fallido"; borrarSuscripcion: false };   // el resto: reintentable

/** ¿Se reintenta este aviso fallido? Una sola vez (spec). */
export function debeReintentar(aviso: { push: string; push_intentos: number }): boolean;
```

- [ ] **Step 1: Escribir los tests PRIMERO** (RED). Casos obligatorios:
  1. `debePush("convocatoria", { silenciados: ["interclubs"], tieneSuscripcion: true })` → **true** (no silenciable, es LA regla del propietario).
  2. `debePush("disponibilidad_peticion", { silenciados: ["interclubs"], ... })` → false.
  3. `debePush("reto_aceptado", { silenciados: ["torneos"], ... })` → true (silenció otro grupo).
  4. Sin suscripción → false para cualquier tipo, **incluida** `convocatoria` (no hay dónde mandarlo; el aviso vive en la bandeja igual).
  5. Silenciados vacío → true.
  6. Un valor basura en `silenciados` (p. ej. `["inventado"]`) no rompe ni silencia nada.
  7. `GRUPO_DE` cubre los 11 tipos y ninguno queda sin grupo (test que recorre las claves).
  8. `tratarFallo(410)` y `tratarFallo(404)` → `no_tocaba` + borrar; `tratarFallo(500)` y `tratarFallo(undefined)` → `fallido` sin borrar.
  9. `debeReintentar({push:"fallido", push_intentos:0})` → true; `{push:"fallido", push_intentos:1}` → false (una sola vez); `{push:"entregado", push_intentos:0}` → false; `{push:"no_tocaba", ...}` → false.
- [ ] **Step 2: Ejecutar y ver el RED** (`npx vitest run src/lib/avisos` → falla por módulo inexistente). Capturar la salida para el informe.
- [ ] **Step 3: Implementar** hasta GREEN. Módulo PURO: sin imports de Supabase, sin fetch, sin React.
- [ ] **Step 4:** `npm test` completo verde + commit — `git commit -m "feat(avisos): politica de avisos pura y testeada"`

---

### Task 3: `avisar()` — guardar primero, push después

**Files:**
- Create: `src/lib/avisos/enviar.ts`
- Modify: `src/lib/push/send.ts` (solo lo necesario, ver abajo)

**Interfaces:**

```ts
/** Guarda el aviso para cada destinatario y luego intenta el push. Nunca lanza. */
export async function avisar(
  profileIds: string[],
  aviso: { tipo: TipoAviso; titulo: string; cuerpo: string; url?: string }
): Promise<{ guardados: number; pushEnviados: number }>;
```

Comportamiento (spec, sección "Entrega garantizada"):
1. Lee de `profiles` los destinatarios con su `avisos_silenciados`, y de `push_subscriptions` quién tiene al menos un dispositivo.
2. Inserta una fila por destinatario en `notifications` con `grupo = GRUPO_DE[tipo]` y `push` inicial: `pendiente` si `debePush(...)`, `no_tocaba` si no.
3. Para los `pendiente`, intenta el push reutilizando el envío que ya existe; según el resultado marca `entregado`, o aplica `tratarFallo` (que puede borrar la suscripción) e incrementa `push_intentos`.
4. **Todo envuelto en try/catch silencioso**: si algo falla, la operación que disparó el aviso sigue su curso.
5. Clave de servicio (`createAdminClient`) porque `notifications` no tiene policy de INSERT a propósito.

Sobre `send.ts`: **no romper su API pública** (`enviarPushAUsuario`/`enviarPushAMuchos` siguen exportados y funcionando: los usan el push de prueba del admin y los tests). Lo que se necesita es poder saber **qué pasó** con cada envío, así que se añade una función que devuelva el resultado por suscripción (p. ej. `intentarPush(userId, payload): Promise<{ ok: number; fallos: (number|undefined)[] }>`) y `enviarPushAUsuario` pasa a apoyarse en ella. Documentar en un comentario por qué existen las dos.

- [ ] **Step 1:** Implementar `intentarPush` en `send.ts` y reapoyar `enviarPushAUsuario` sobre ella, sin cambiar su firma.
- [ ] **Step 2:** Implementar `avisar()` con la lógica de arriba, delegando TODA decisión en `politica.ts` (no repetir reglas aquí).
- [ ] **Step 3:** `npm test` + build + tsc + lint verdes. Sin tests unitarios propios de `enviar.ts` (es I/O; se verifica en vivo en la Task 7, convención del proyecto para los `*-apply.ts`).
- [ ] **Step 4: Commit** — `git commit -m "feat(avisos): avisar() guarda el aviso y luego intenta el push"`

---

### Task 4: Migrar los 11 sitios que avisan hoy

**Files (los 8 ficheros con llamadas, verificados con grep):**
- Modify: `src/app/club/(vinculado)/equipos/[id]/convocatoria/actions.ts` (tipo `convocatoria`)
- Modify: `src/lib/push/disponibilidad.ts` (2 llamadas: `disponibilidad_peticion`, `disponibilidad_recordatorio`)
- Modify: `src/app/club/(vinculado)/admin/torneos/actions.ts` (`torneo_interes`)
- Modify: `src/app/club/(vinculado)/torneos/facv/actions.ts` (2: `coche_plaza_libre`/`coche_sin_plaza` según el aviso, y `torneo_primer_apuntado`)
- Modify: `src/app/club/(vinculado)/jugar/actions.ts` (`reto_aceptado`)
- Modify: `src/app/unirse/actions.ts` (`alta_socio`)
- Modify: `src/app/club/vincular/actions.ts` (`vinculacion`)
- Modify: `src/lib/import/sync-semanal.ts` (`fichas_nuevas`)
- NO tocar: `src/app/club/(vinculado)/admin/push/actions.ts` — es el push de prueba del admin, debe seguir siendo push directo sin dejar aviso en ninguna bandeja (documentarlo con un comentario ahí).

**Reglas de la migración:**
- Cada llamada pasa de `enviarPushAMuchos(ids, {title, body, url})` a `avisar(ids, { tipo, titulo: <mismo title>, cuerpo: <mismo body>, url })`. **Los textos NO cambian** (ya están revisados y en español).
- Ojo con `disponibilidad.ts`: hoy devuelve `notificados` (lo usa el cron y sus tests). Mantener ese contorno — devolver los `guardados` de `avisar()`, que es el número equivalente y más honesto (a cuántos se avisó), y ajustar el comentario que dice que la suscripción la decide el envío.
- Ojo con `gestion` (`alta_socio`, `vinculacion`, `fichas_nuevas`): esos tres sitios YA calculan sus destinatarios (admin/junta vía `member_roles` + la columna vieja). Ese cálculo se queda donde está; `avisar()` no decide destinatarios.

- [ ] **Step 1-8:** Un paso por fichero: sustituir la llamada, comprobar que el tipo es el correcto de `GRUPO_DE`, y que el try/catch existente sigue envolviendo.
- [ ] **Step 9:** `npm test` (703 verdes; los de `disponibilidad` deben seguir pasando sin cambios de expectativa) + build + tsc + lint.
- [ ] **Step 10: Commit** — `git commit -m "refactor(avisos): los once avisos pasan por avisar()"`

---

### Task 5: Bandeja del socio y número rojo real

**Files:**
- Create: `src/app/club/(vinculado)/avisos/page.tsx`, `src/app/club/(vinculado)/avisos/actions.ts`, `src/app/club/(vinculado)/avisos/loading.tsx`
- Modify: `src/app/club/layout.tsx` (el `inicial` del proveedor), `src/components/avisos/Pendientes.tsx` (comentario: ahora cuenta avisos sin leer), `src/components/Navegacion.tsx` (que el número lleve a `/club/avisos`)

**Interfaces:**
- `marcarLeido(avisoId: string)` — action gated: comprueba sesión y que el aviso es del que llama (RLS lo garantiza además); escribe `leido_en` con el cliente de USUARIO para que la RLS sea la que manda.
- Página: lista de los avisos del socio, más nuevos primero, los no leídos destacados; cada uno con título, cuerpo y, si tiene `url`, es un enlace que marca leído al pulsarlo. `EstadoVacio` cuando no hay ninguno. Sin filtros ni buscador (spec).
- `layout.tsx`: el `inicial` del `ProveedorPendientes` pasa a ser **el número de avisos sin leer** del socio (hoy es el de retos pendientes). El resto del mecanismo (contexto + cliente manda) no se toca.

- [ ] **Step 1:** Action `marcarLeido` + página con la lista.
- [ ] **Step 2:** `loading.tsx` con `Cargando` (regla del proyecto: sin él Next no precarga nada de una ruta dinámica).
- [ ] **Step 3:** Cambiar el `inicial` del layout y que el número del menú enlace a la bandeja.
- [ ] **Step 4:** Verificación en navegador (ambos temas, móvil): la bandeja pinta, un aviso marca leído y el número baja. Para tener datos con los que probar, insertar 2-3 avisos con clave de servicio desde un script de `scripts/` (y borrarlos después).
- [ ] **Step 5: Commit** — `git commit -m "feat(avisos): bandeja del socio y numero rojo de avisos sin leer"`

---

### Task 6: Preferencias en el perfil + reintento en el cron

**Files:**
- Modify: `src/app/club/perfil/page.tsx` (o donde vivan los ajustes del socio — localizarlo), y su `actions.ts`
- Modify: `src/app/api/cron/director/route.ts` (o `sync-semanal.ts` si el reintento encaja mejor ahí — decidir leyendo el cron)
- Create: `src/lib/avisos/reintentar.ts`

**Interfaces:**
- Action `guardarPreferenciasAvisos(silenciados: GrupoAviso[])` — gated por sesión, escribe `profiles.avisos_silenciados` del propio socio con el cliente de usuario.
- UI: cuatro interruptores (uno por grupo), encendido = recibo push. El de `interclubs` lleva la nota de que **la convocatoria avisa siempre**. El de `gestion` solo se muestra a admin/junta (a un jugador normal ese grupo no le llega nunca, así que enseñárselo confunde).
- `reintentarAvisosFallidos(): Promise<{ reintentados: number }>` — busca los `fallido` con `debeReintentar()`, intenta el push otra vez, actualiza estado e incrementa `push_intentos`. Se llama desde el cron diario, todos los días (es barato: índice parcial y normalmente 0 filas).

- [ ] **Step 1:** Preferencias (action + UI con los interruptores).
- [ ] **Step 2:** `reintentarAvisosFallidos` + engancharlo al cron director, documentando por qué va todos los días.
- [ ] **Step 3:** Verificación: cambiar preferencias y comprobar que se guardan; llamar al cron con `CRON_SECRET` y ver que responde sin error con 0 fallidos.
- [ ] **Step 4:** `npm test` + build + tsc + lint. **Commit** — `git commit -m "feat(avisos): preferencias por grupo y reintento de los fallidos"`

---

### Task 7: Las tarjetas se callan mientras juegas

**Files:**
- Modify: `src/components/avisos/Avisos.tsx`

**Contexto verificado:** las tarjetas salen `fixed inset-x-0 bottom-20 z-30` (centradas y a lo ancho en móvil; `lg:bottom-6 lg:right-6` en escritorio) y el componente ya conoce `pathname` pero solo lo usa para refrescar, no para decidir si molesta.

**Interfaz:** cuando la ruta es una partida (`/club/jugar/<id>`) **y esa partida está en juego**, no se pintan tarjetas: el aviso se queda en la bandeja y el número rojo. Si la partida terminó, las tarjetas vuelven.

Cómo saber si está en juego sin acoplar componentes: `Avisos` no conoce el estado de la partida. Opción elegida — **que la mesa lo diga**: un contexto minúsculo (o un `data-` en el layout de la partida) que `Avisos` consulta; si no hay nadie jugando, se comporta como hoy. Implementarlo con el patrón más simple que encaje con lo que ya existe (`Pendientes.tsx` es el precedente de contexto pequeño en este proyecto).

- [ ] **Step 1:** Implementar el silencio, con comentario explicando el por qué (abajo es zona de juego; perder por tiempo mirando una tarjeta es peor que un reto caducado).
- [ ] **Step 2:** Verificación en navegador: en una partida en juego no aparece tarjeta y el número rojo sí sube; en una partida acabada la tarjeta aparece. Si montar una partida viva resulta caro, dejar constancia honesta de qué se comprobó y qué no.
- [ ] **Step 3:** `npm test` + build + tsc + lint. **Commit** — `git commit -m "feat(avisos): sin tarjetas encima del tablero mientras la partida esta en juego"`

---

### Task 8: Verificación integral y cierre

- [ ] **Step 1: LOS DOS ESCENARIOS DE LA SPEC**, que son el corazón de todo esto (script en `scripts/`, borrado al terminar):
  1. **Con push**: provocar un aviso real de un tipo no silenciado a una cuenta con suscripción → llega la notificación, y el aviso está en la bandeja con `push = 'entregado'`.
  2. **Sin push**: la misma llamada a una cuenta **sin suscripción** (o con el grupo silenciado) → **no** se manda nada al dispositivo, y el aviso está en la bandeja con `push = 'no_tocaba'` y cuenta en el número rojo. *Este es el caso que hoy se pierde para siempre.*
- [ ] **Step 2:** Comprobar que la convocatoria ignora el silencio: silenciar `interclubs` en una cuenta de prueba y verificar que su aviso de convocatoria sale con `push = 'pendiente'/'entregado'`, no `no_tocaba`.
- [ ] **Step 3:** Comprobar que un socio **no puede fabricarse un aviso** (insert directo por REST con su sesión → rechazado) ni marcar leído el de otro. Con cuenta temporal, limpiando después.
- [ ] **Step 4:** `npm test` + `npm run build` + `npx tsc --noEmit` + `npm run lint` verdes. Arreglar solo roturas o fallos de lógica; lo visual menor va al ledger (regla 4).
- [ ] **Step 5:** Actualizar `CLAUDE.md`: punto 2 del bloque como hecho, migraciones hasta 0028, y la regla nueva ("los avisos se mandan con `avisar()`, nunca con push directo — el push directo solo lo usa la prueba del admin").
- [ ] **Step 6: GATE USUARIO** — pegar el SQL de la 0028 en el chat para que lo aplique, y pedirle la prueba en su móvil: activar/desactivar un grupo en Perfil, provocar un aviso, y comprobar la bandeja y el número rojo. Sus comentarios se aplican antes de cerrar.

---

## Autochequeo del plan (hecho)

- **Cobertura de la spec:** tabla + preferencias (T1), política pura testeada (T2), guardar-antes-de-push (T3), los 11 sitios migrados (T4), bandeja + número rojo (T5), preferencias en perfil + reintento (T6), tarjetas calladas en partida (T7), los dos escenarios en vivo + seguridad (T8). Sin huecos.
- **Sitios reales verificados con grep**, no de memoria: 11 llamadas en 8 ficheros, más el push de prueba del admin que se deja fuera a propósito.
- **Consistencia de tipos:** `GrupoAviso`/`TipoAviso`/`GRUPO_DE`/`debePush`/`tratarFallo`/`debeReintentar` se definen una vez en T2 y los consumen T3-T6; `avisar()` se define en T3 y lo consume T4.
- **Riesgo señalado:** en T3 no se rompe la API pública de `send.ts` porque la usan el push de prueba y los tests existentes; se añade función nueva en vez de cambiar firmas.
- **Decisiones que el implementador NO debe improvisar** (están resueltas en el plan): qué tipo corresponde a cada uno de los 11 sitios, que los textos no cambian, que el push de prueba del admin se queda fuera, y que la política pura es la única que decide si hay push.
