# Fase 0 — Cimientos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App desplegable con cuentas de usuario vinculadas a fichas de jugador ("reclama tu ficha"), orden de fuerza importable con soporte de bises, ELO FIDE/FEDA actualizables automáticamente, y PWA instalable con notificaciones push.

**Architecture:** Next.js App Router (TypeScript) + Supabase (Postgres/Auth/RLS). Lógica de dominio en módulos puros bajo `src/lib` testeados con Vitest. Server actions para mutaciones con permisos; cron routes de Vercel para importaciones de ELO.

**Tech Stack:** Next.js 15+, React, TypeScript strict, Tailwind CSS, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, `web-push`, `xlsx` (SheetJS).

## Global Constraints

- Toda la copy de UI en **español**. Diseño **móvil-first** (viewport base 390px).
- Coste 0 €/mes: planes gratuitos de Vercel (Hobby) y Supabase.
- TypeScript `strict: true`. Sin `any` salvo interop inevitable.
- La spec manda: `docs/superpowers/specs/2026-07-13-chess-club-manager-design.md`. Fuerza del jugador = max(ELO FEDA, ELO FIDE); sin ELOs → `elo_otro`; sin nada → 1400 (RGC art. 52.1-52.2).
- Claude NUNCA hace `git push` — al final de cada tarea solo commit local; el usuario pushea.
- Toda importación automática debe tener respaldo de edición manual en la UI.
- Los secretos van en `.env.local` (gitignored); `.env.example` documenta las claves sin valores.

---

### Task 1: Scaffold del proyecto Next.js + Vitest

**Files:**
- Create: proyecto Next.js en la raíz del repo (via scaffold temporal), `vitest.config.ts`, `src/lib/smoke.test.ts`, `.env.example`
- Modify: `.gitignore` (añadir `.env*.local`), `package.json` (script `test`)

**Interfaces:**
- Produces: proyecto compilable (`npm run build`), runner de tests (`npm test`) que las demás tareas usan.

- [ ] **Step 1: Scaffold en carpeta temporal y mover a la raíz** (la raíz ya contiene `docs/` y `.git`, `create-next-app` no acepta carpetas no vacías)

```powershell
npx create-next-app@latest scaffold-tmp --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm --yes
Get-ChildItem scaffold-tmp -Force | Where-Object Name -ne '.git' | Move-Item -Destination .
Remove-Item scaffold-tmp -Recurse -Force
```

- [ ] **Step 2: Verificar que arranca**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 3: Instalar y configurar Vitest**

```powershell
npm install -D vitest
```

Crear `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Añadir a `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Test de humo**

Crear `src/lib/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("entorno de tests", () => {
  it("funciona", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: `.env.example` y gitignore**

Crear `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
```

Comprobar que `.gitignore` incluye `.env*.local` (create-next-app lo trae; si no, añadirlo).

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: scaffold Next.js + Vitest"
```

---

### Task 2: Proyecto Supabase (acción del usuario) + clientes

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/middleware.ts`

**Interfaces:**
- Produces: `createClient()` (browser), `createServerSupabase()` (RSC/actions, async), `createAdminClient()` (service role, solo servidor). Middleware que refresca sesión y redirige a `/login` si no hay usuario (excepto rutas públicas).

- [ ] **Step 1: GATE USUARIO — crear proyecto Supabase.** Pedir al usuario: crear proyecto en supabase.com (región EU), y pegar en `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Settings → API). No continuar sin esto.

- [ ] **Step 2: Instalar dependencias**

```powershell
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Clientes**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* llamado desde RSC: el middleware refresca la sesión */
          }
        },
      },
    }
  );
}
```

`src/lib/supabase/admin.ts`:

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Cliente con service role: SOLO usar en servidor tras verificar permisos. */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 4: Middleware de sesión**

`src/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/registro", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|api/cron|api/push).*)",
  ],
};
```

- [ ] **Step 5: Verificar build y commit**

Run: `npm run build` → sin errores.

```powershell
git add -A; git commit -m "feat: clientes Supabase y middleware de sesion"
```

---

### Task 3: Esquema de base de datos + RLS

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces: tablas `players`, `profiles`, `seasons`, `force_order`, `link_requests`; función `public.is_admin()`; trigger de creación de perfil al registrarse. Todas las tareas posteriores consumen este esquema.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0001_init.sql`:

```sql
-- Fichas de jugador (existen sin cuenta de usuario)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fide_id text unique,
  feda_id text unique,
  elo_fide int,
  elo_feda int,
  elo_otro int,
  activo boolean not null default true,
  excepcion_tecnificacion boolean not null default false, -- RGC 52.3.d
  excepcion_veterano boolean not null default false,      -- RGC 52.3.e
  created_at timestamptz not null default now()
);

-- Perfil 1:1 con auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  player_id uuid unique references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default false,
  created_at timestamptz not null default now()
);

-- Orden de fuerza por temporada; bis_index 0 = titular N, 1 = N-bis (RGC art. 50)
create table public.force_order (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  numero int not null,
  bis_index int not null default 0,
  unique (season_id, player_id),
  unique (season_id, numero, bis_index)
);

create table public.link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now()
);

-- Perfil automático al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de rol
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()), false
  );
$$;

-- RLS
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.force_order enable row level security;
alter table public.link_requests enable row level security;

create policy "players legibles por autenticados" on public.players
  for select to authenticated using (true);
create policy "players escribe admin" on public.players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "perfil propio o admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "perfil escribe admin" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "seasons legibles" on public.seasons
  for select to authenticated using (true);
create policy "seasons escribe admin" on public.seasons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "force_order legible" on public.force_order
  for select to authenticated using (true);
create policy "force_order escribe admin" on public.force_order
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "link_requests: crear la propia" on public.link_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy "link_requests: ver propia o admin" on public.link_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "link_requests: gestiona admin" on public.link_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Aplicar la migración.** Vía Supabase SQL Editor (pegar el fichero completo y ejecutar) o CLI si está instalada (`npx supabase db push`). Verificar en Table Editor que existen las 5 tablas.

- [ ] **Step 3: GATE USUARIO — hacerse admin.** Pedir al usuario que se registre (cuando exista /registro en Task 4 puede posponerse) o ejecutar en SQL Editor tras su primer registro:

```sql
update public.profiles set is_admin = true where email = 'EMAIL_DEL_USUARIO';
```

(Anotar este paso; se ejecuta realmente al final de la Task 4.)

- [ ] **Step 4: Commit**

```powershell
git add supabase; git commit -m "feat: esquema inicial con RLS (players, profiles, seasons, force_order, link_requests)"
```

---

### Task 4: Autenticación (registro, login, logout)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/registro/page.tsx`, `src/app/(auth)/actions.ts`, `src/app/auth/confirm/route.ts`
- Modify: `src/app/page.tsx` (home mínima con logout)

**Interfaces:**
- Consumes: `createServerSupabase()` de Task 2.
- Produces: server actions `login(formData)`, `registro(formData)`, `logout()`; rutas `/login`, `/registro` operativas.

- [ ] **Step 1: Server actions de auth**

`src/app/(auth)/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: "Email o contraseña incorrectos" };
  redirect("/");
}

export async function registro(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: error.message };
  redirect("/login?registrado=1");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Páginas de login y registro** (formularios móvil-first con Tailwind)

`src/app/(auth)/login/page.tsx`:

```tsx
import Link from "next/link";
import { login } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>;
}) {
  const { registrado } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Fomento de Gandia · Ajedrez</h1>
      {registrado && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.
        </p>
      )}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email"
          className="rounded border p-3" />
        <input name="password" type="password" required placeholder="Contraseña"
          className="rounded border p-3" />
        <button className="rounded bg-black p-3 font-semibold text-white">
          Entrar
        </button>
      </form>
      <p className="text-sm">
        ¿Sin cuenta? <Link className="underline" href="/registro">Regístrate</Link>
      </p>
    </main>
  );
}
```

`src/app/(auth)/registro/page.tsx`: mismo layout con `action={registro}`, campos email + contraseña (minLength 8) y enlace inverso a `/login`:

```tsx
import Link from "next/link";
import { registro } from "../actions";

export default function RegistroPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <form action={registro} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email"
          className="rounded border p-3" />
        <input name="password" type="password" required minLength={8}
          placeholder="Contraseña (mín. 8)" className="rounded border p-3" />
        <button className="rounded bg-black p-3 font-semibold text-white">
          Registrarme
        </button>
      </form>
      <p className="text-sm">
        ¿Ya tienes cuenta? <Link className="underline" href="/login">Entra</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Ruta de confirmación de email**

`src/app/auth/confirm/route.ts`:

```ts
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (token_hash && type) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect("/");
  }
  redirect("/login");
}
```

En Supabase Dashboard → Authentication → Email Templates, cambiar la URL de confirmación a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

- [ ] **Step 4: Home mínima con logout**

Reemplazar `src/app/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Hola, {user?.email}</h1>
      <form action={logout}>
        <button className="mt-4 rounded border p-2 text-sm">Cerrar sesión</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Verificación manual en navegador** (viewport móvil): registrarse → confirmar email → login → home → logout → middleware redirige a /login. Ejecutar entonces el SQL de Task 3 Step 3 para hacer admin al usuario.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: autenticacion email con confirmacion, login y logout"
```

---

### Task 5: Módulo de fuerza del jugador (puro, TDD)

**Files:**
- Create: `src/lib/elo/fuerza.ts`, `src/lib/elo/fuerza.test.ts`
- Delete: `src/lib/smoke.test.ts`

**Interfaces:**
- Produces: `type ElosJugador = { eloFide: number | null; eloFeda: number | null; eloOtro: number | null }`; `fuerza(e: ElosJugador): number`. La usará el validador de la Fase 1 y las pantallas de listado.

- [ ] **Step 1: Test que falla**

`src/lib/elo/fuerza.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fuerza } from "./fuerza";

describe("fuerza (RGC art. 52.1-52.2)", () => {
  it("usa el mayor entre FEDA y FIDE", () => {
    expect(fuerza({ eloFide: 2000, eloFeda: 2100, eloOtro: null })).toBe(2100);
    expect(fuerza({ eloFide: 2150, eloFeda: 2100, eloOtro: null })).toBe(2150);
  });
  it("con un solo ELO oficial, usa ese", () => {
    expect(fuerza({ eloFide: 1900, eloFeda: null, eloOtro: null })).toBe(1900);
    expect(fuerza({ eloFide: null, eloFeda: 1850, eloOtro: null })).toBe(1850);
  });
  it("sin oficiales usa el autonomico/extranjero", () => {
    expect(fuerza({ eloFide: null, eloFeda: null, eloOtro: 1700 })).toBe(1700);
  });
  it("sin ningun ELO devuelve 1400 ficticio", () => {
    expect(fuerza({ eloFide: null, eloFeda: null, eloOtro: null })).toBe(1400);
  });
  it("ignora ceros como ausencia de ELO", () => {
    expect(fuerza({ eloFide: 0, eloFeda: null, eloOtro: 0 })).toBe(1400);
  });
});
```

Run: `npm test` → FAIL (`fuerza` no existe).

- [ ] **Step 2: Implementación mínima**

`src/lib/elo/fuerza.ts`:

```ts
export type ElosJugador = {
  eloFide: number | null;
  eloFeda: number | null;
  eloOtro: number | null;
};

/** Fuerza del jugador según RGC FACV art. 52.1-52.2. */
export function fuerza(e: ElosJugador): number {
  const oficiales = [e.eloFeda, e.eloFide].filter(
    (x): x is number => typeof x === "number" && x > 0
  );
  if (oficiales.length > 0) return Math.max(...oficiales);
  if (typeof e.eloOtro === "number" && e.eloOtro > 0) return e.eloOtro;
  return 1400;
}
```

- [ ] **Step 3: Verificar que pasa**

Run: `npm test` → 5 passed. Borrar `src/lib/smoke.test.ts`.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat: modulo de fuerza del jugador (max FEDA/FIDE, fallback 1400)"
```

---

### Task 6: Parser del orden de fuerza (TDD) + importación admin

**Files:**
- Create: `src/lib/import/orden-fuerza-parser.ts`, `src/lib/import/orden-fuerza-parser.test.ts`, `src/app/admin/layout.tsx`, `src/app/admin/orden-fuerza/page.tsx`, `src/app/admin/orden-fuerza/actions.ts`

**Interfaces:**
- Consumes: esquema de Task 3, admin client de Task 2.
- Produces: `parseOrdenFuerza(texto: string): { filas: FilaOrden[]; errores: ErrorLinea[] }` con `type FilaOrden = { numero: number; bisIndex: number; nombre: string; fideId: string | null; fedaId: string | null }` y `type ErrorLinea = { linea: number; motivo: string }`. Server action `importarOrdenFuerza(seasonNombre: string, texto: string)`. Guard de layout `/admin` (solo `is_admin`).

Formato de entrada (una línea por jugador, columnas separadas por tabulador o `;`):
`numero[bis] <sep> nombre <sep> [fide_id] <sep> [feda_id]` — ej. `7bis; García Pérez, Juan; 22334455; 55443322`.

- [ ] **Step 1: Test que falla**

`src/lib/import/orden-fuerza-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseOrdenFuerza } from "./orden-fuerza-parser";

describe("parseOrdenFuerza", () => {
  it("parsea lineas con ; y con tabulador", () => {
    const r = parseOrdenFuerza(
      "1; Perez Lopez, Ana; 11111111; 22222222\n2\tGarcia Ruiz, Luis\t33333333\t44444444"
    );
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { numero: 1, bisIndex: 0, nombre: "Perez Lopez, Ana", fideId: "11111111", fedaId: "22222222" },
      { numero: 2, bisIndex: 0, nombre: "Garcia Ruiz, Luis", fideId: "33333333", fedaId: "44444444" },
    ]);
  });
  it("soporta numeros bis, incluido 0bis (RGC art. 50.2)", () => {
    const r = parseOrdenFuerza("0bis; Vidal, Marc\n7bis; Soler, Pau; 55555555");
    expect(r.filas[0]).toMatchObject({ numero: 0, bisIndex: 1, nombre: "Vidal, Marc" });
    expect(r.filas[1]).toMatchObject({ numero: 7, bisIndex: 1, fideId: "55555555", fedaId: null });
  });
  it("ignora lineas vacias y reporta lineas invalidas con su numero", () => {
    const r = parseOrdenFuerza("1; Bien, Uno\n\nsin numero valido\n3; Bien, Tres");
    expect(r.filas).toHaveLength(2);
    expect(r.errores).toEqual([{ linea: 3, motivo: "Número de orden no reconocido" }]);
  });
  it("rechaza numeros duplicados", () => {
    const r = parseOrdenFuerza("4; Uno, A\n4; Dos, B");
    expect(r.errores).toEqual([{ linea: 2, motivo: "Número 4 duplicado" }]);
  });
});
```

Run: `npm test` → FAIL.

- [ ] **Step 2: Implementación**

`src/lib/import/orden-fuerza-parser.ts`:

```ts
export type FilaOrden = {
  numero: number;
  bisIndex: number;
  nombre: string;
  fideId: string | null;
  fedaId: string | null;
};
export type ErrorLinea = { linea: number; motivo: string };

const NUM_RE = /^(\d+)(bis)?$/i;

export function parseOrdenFuerza(texto: string): {
  filas: FilaOrden[];
  errores: ErrorLinea[];
} {
  const filas: FilaOrden[] = [];
  const errores: ErrorLinea[] = [];
  const vistos = new Set<string>();

  texto.split(/\r?\n/).forEach((raw, i) => {
    const linea = i + 1;
    if (!raw.trim()) return;
    const cols = raw.split(/\t|;/).map((c) => c.trim());
    const m = NUM_RE.exec(cols[0] ?? "");
    if (!m) {
      errores.push({ linea, motivo: "Número de orden no reconocido" });
      return;
    }
    const numero = Number(m[1]);
    const bisIndex = m[2] ? 1 : 0;
    const clave = `${numero}/${bisIndex}`;
    if (vistos.has(clave)) {
      errores.push({
        linea,
        motivo: `Número ${numero}${bisIndex ? "bis" : ""} duplicado`,
      });
      return;
    }
    vistos.add(clave);
    const nombre = cols[1] ?? "";
    if (!nombre) {
      errores.push({ linea, motivo: "Falta el nombre" });
      return;
    }
    filas.push({
      numero,
      bisIndex,
      nombre,
      fideId: cols[2] || null,
      fedaId: cols[3] || null,
    });
  });
  return { filas, errores };
}
```

Run: `npm test` → todos passed.

- [ ] **Step 3: Guard de admin**

`src/app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/");
  return <>{children}</>;
}
```

- [ ] **Step 4: Server action de importación**

`src/app/admin/orden-fuerza/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOrdenFuerza } from "@/lib/import/orden-fuerza-parser";

export async function importarOrdenFuerza(
  seasonNombre: string,
  texto: string
): Promise<{ ok?: string; error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Solo el admin puede importar" };

  const { filas, errores } = parseOrdenFuerza(texto);
  if (errores.length > 0)
    return { error: errores.map((e) => `L${e.linea}: ${e.motivo}`).join(" · ") };
  if (filas.length === 0) return { error: "No hay filas que importar" };

  const admin = createAdminClient();
  const { data: season, error: seasonErr } = await admin
    .from("seasons")
    .insert({ nombre: seasonNombre, activa: true })
    .select("id").single();
  if (seasonErr) return { error: seasonErr.message };

  for (const fila of filas) {
    // Reutiliza ficha existente por fide_id/feda_id; si no, la crea
    let playerId: string | null = null;
    if (fila.fideId || fila.fedaId) {
      const or = [
        fila.fideId ? `fide_id.eq.${fila.fideId}` : null,
        fila.fedaId ? `feda_id.eq.${fila.fedaId}` : null,
      ].filter(Boolean).join(",");
      const { data: existing } = await admin
        .from("players").select("id").or(or).maybeSingle();
      playerId = existing?.id ?? null;
    }
    if (!playerId) {
      const { data: created, error: createErr } = await admin
        .from("players")
        .insert({ nombre: fila.nombre, fide_id: fila.fideId, feda_id: fila.fedaId })
        .select("id").single();
      if (createErr) return { error: `${fila.nombre}: ${createErr.message}` };
      playerId = created.id;
    }
    const { error: orderErr } = await admin.from("force_order").insert({
      season_id: season.id,
      player_id: playerId,
      numero: fila.numero,
      bis_index: fila.bisIndex,
    });
    if (orderErr) return { error: `${fila.nombre}: ${orderErr.message}` };
  }
  revalidatePath("/admin/orden-fuerza");
  return { ok: `Importados ${filas.length} jugadores en "${seasonNombre}"` };
}
```

- [ ] **Step 5: Página de importación** (textarea + resultado)

`src/app/admin/orden-fuerza/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { importarOrdenFuerza } from "./actions";

export default async function OrdenFuerzaPage() {
  const supabase = await createServerSupabase();
  const { data: season } = await supabase
    .from("seasons").select("id, nombre").eq("activa", true).maybeSingle();
  const { data: orden } = season
    ? await supabase
        .from("force_order")
        .select("numero, bis_index, players(nombre, elo_fide, elo_feda)")
        .eq("season_id", season.id)
        .order("numero").order("bis_index")
    : { data: null };

  async function accion(formData: FormData) {
    "use server";
    await importarOrdenFuerza(
      String(formData.get("season")),
      String(formData.get("texto"))
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Orden de fuerza</h1>
      {orden && orden.length > 0 ? (
        <ol className="mt-4 space-y-1">
          {orden.map((f) => {
            const p = f.players as unknown as {
              nombre: string; elo_fide: number | null; elo_feda: number | null;
            };
            return (
              <li key={`${f.numero}-${f.bis_index}`} className="rounded border p-2 text-sm">
                <b>{f.numero}{f.bis_index ? "bis" : ""}</b> · {p.nombre} ·
                FIDE {p.elo_fide ?? "—"} · FEDA {p.elo_feda ?? "—"}
              </li>
            );
          })}
        </ol>
      ) : (
        <form action={accion} className="mt-4 flex flex-col gap-3">
          <input name="season" required placeholder="Nombre temporada (ej. Interclubs 2027)"
            className="rounded border p-3" />
          <textarea name="texto" required rows={12}
            placeholder={"1; Apellidos, Nombre; fide_id; feda_id\n2; ..."}
            className="rounded border p-3 font-mono text-xs" />
          <button className="rounded bg-black p-3 font-semibold text-white">
            Importar
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Verificación manual.** Con el usuario admin: importar una lista de prueba de 6 jugadores (con un `3bis`), comprobar listado ordenado y que un usuario no-admin recibe redirect fuera de `/admin`.

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: parser e importacion del orden de fuerza con bises"
```

---

### Task 7: Flujo "reclama tu ficha"

**Files:**
- Create: `src/app/vincular/page.tsx`, `src/app/vincular/actions.ts`
- Modify: `src/app/page.tsx` (aviso si no vinculado)

**Interfaces:**
- Consumes: `link_requests`, `players`, `profiles` (Task 3).
- Produces: server action `solicitarVinculo(playerId: string)`; página `/vincular` con buscador de fichas libres.

- [ ] **Step 1: Server action**

`src/app/vincular/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function solicitarVinculo(playerId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };
  const { error } = await supabase
    .from("link_requests")
    .insert({ user_id: user.id, player_id: playerId });
  if (error) return { error: "No se pudo crear la solicitud (¿ya tienes una?)" };
  redirect("/?solicitud=enviada");
}
```

- [ ] **Step 2: Página de vinculación** — lista fichas activas sin perfil vinculado y sin solicitud aprobada, con filtro por nombre en cliente:

`src/app/vincular/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { solicitarVinculo } from "./actions";

export default async function VincularPage() {
  const supabase = await createServerSupabase();
  const { data: players } = await supabase
    .from("players")
    .select("id, nombre, elo_fide, elo_feda")
    .eq("activo", true)
    .order("nombre");
  const { data: vinculados } = await supabase
    .from("profiles").select("player_id").not("player_id", "is", null);
  const ocupados = new Set((vinculados ?? []).map((v) => v.player_id));
  const libres = (players ?? []).filter((p) => !ocupados.has(p.id));

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">¿Quién eres?</h1>
      <p className="mt-1 text-sm text-gray-600">
        Busca tu nombre en la lista del club. El admin confirmará tu vinculación.
      </p>
      <ul className="mt-4 space-y-2">
        {libres.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded border p-3">
            <span>
              {p.nombre}
              <span className="ml-2 text-xs text-gray-500">
                FIDE {p.elo_fide ?? "—"}
              </span>
            </span>
            <form action={solicitarVinculo.bind(null, p.id)}>
              <button className="rounded bg-black px-3 py-1 text-sm text-white">
                Soy yo
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Aviso en home.** En `src/app/page.tsx`, tras obtener el user, cargar su profile; si `player_id` es null, mostrar banner con enlace a `/vincular`; si tiene solicitud pendiente, mostrar "Solicitud pendiente de aprobación".

```tsx
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("player_id").eq("id", user!.id).single();
  const { data: pendiente } = await supabase
    .from("link_requests").select("id").eq("user_id", user!.id)
    .eq("status", "pendiente").maybeSingle();

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-bold">Hola, {user?.email}</h1>
      {!profile?.player_id && !pendiente && (
        <Link href="/vincular"
          className="mt-4 block rounded bg-amber-100 p-3 text-sm text-amber-900">
          Aún no estás vinculado a tu ficha del club → hazlo aquí
        </Link>
      )}
      {!profile?.player_id && pendiente && (
        <p className="mt-4 rounded bg-blue-100 p-3 text-sm text-blue-900">
          Solicitud de vinculación pendiente de aprobación.
        </p>
      )}
      <form action={logout}>
        <button className="mt-4 rounded border p-2 text-sm">Cerrar sesión</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verificación manual** con segunda cuenta (no admin): registrarse → vincular → banner pendiente.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: flujo reclama tu ficha con solicitud de vinculo"
```

---

### Task 8: Aprobación de vinculaciones (admin)

**Files:**
- Create: `src/app/admin/vinculaciones/page.tsx`, `src/app/admin/vinculaciones/actions.ts`, `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `link_requests`, guard de `/admin` (Task 6).
- Produces: server actions `aprobarVinculo(requestId)`, `rechazarVinculo(requestId)`; índice `/admin` con enlaces a las secciones.

- [ ] **Step 1: Server actions**

`src/app/admin/vinculaciones/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function esAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  return Boolean(data?.is_admin);
}

export async function aprobarVinculo(requestId: string) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  const { data: req } = await admin
    .from("link_requests").select("user_id, player_id")
    .eq("id", requestId).eq("status", "pendiente").single();
  if (!req) return;
  await admin.from("profiles")
    .update({ player_id: req.player_id }).eq("id", req.user_id);
  await admin.from("link_requests")
    .update({ status: "aprobada" }).eq("id", requestId);
  revalidatePath("/admin/vinculaciones");
}

export async function rechazarVinculo(requestId: string) {
  if (!(await esAdmin())) return;
  const admin = createAdminClient();
  await admin.from("link_requests")
    .update({ status: "rechazada" }).eq("id", requestId);
  revalidatePath("/admin/vinculaciones");
}
```

- [ ] **Step 2: Página de pendientes**

`src/app/admin/vinculaciones/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { aprobarVinculo, rechazarVinculo } from "./actions";

export default async function VinculacionesPage() {
  const supabase = await createServerSupabase();
  const { data: pendientes } = await supabase
    .from("link_requests")
    .select("id, created_at, profiles(email), players(nombre)")
    .eq("status", "pendiente")
    .order("created_at");

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Vinculaciones pendientes</h1>
      <ul className="mt-4 space-y-2">
        {(pendientes ?? []).map((r) => {
          const email = (r.profiles as unknown as { email: string }).email;
          const nombre = (r.players as unknown as { nombre: string }).nombre;
          return (
            <li key={r.id} className="rounded border p-3 text-sm">
              <p><b>{email}</b> dice ser <b>{nombre}</b></p>
              <div className="mt-2 flex gap-2">
                <form action={aprobarVinculo.bind(null, r.id)}>
                  <button className="rounded bg-green-600 px-3 py-1 text-white">
                    Aprobar
                  </button>
                </form>
                <form action={rechazarVinculo.bind(null, r.id)}>
                  <button className="rounded border px-3 py-1">Rechazar</button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      {(pendientes ?? []).length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No hay solicitudes pendientes.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Índice de admin**

`src/app/admin/page.tsx`:

```tsx
import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Administración</h1>
      <nav className="mt-4 flex flex-col gap-2">
        <Link className="rounded border p-3" href="/admin/orden-fuerza">
          Orden de fuerza
        </Link>
        <Link className="rounded border p-3" href="/admin/vinculaciones">
          Vinculaciones pendientes
        </Link>
      </nav>
    </main>
  );
}
```

- [ ] **Step 4: Verificación manual**: aprobar la solicitud de la cuenta de prueba → su home deja de mostrar el banner; rechazo funciona.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: aprobacion de vinculaciones e indice de admin"
```

---

### Task 9: Importador ELO FIDE (TDD con fixture real)

**Files:**
- Create: `src/lib/import/fide.ts`, `src/lib/import/fide.test.ts`, `src/lib/import/fixtures/fide-profile.html`, `src/app/api/cron/elo-fide/route.ts`

**Interfaces:**
- Consumes: `players` (fide_id), admin client.
- Produces: `parseEloFideDesdePerfil(html: string): number | null`; ruta cron `GET /api/cron/elo-fide` (auth por `CRON_SECRET`).

- [ ] **Step 1: Descargar fixture real.** Descargar el HTML del perfil FIDE de un jugador conocido (p. ej. un jugador del club con ID FIDE) y guardarlo en `src/lib/import/fixtures/fide-profile.html`:

```powershell
Invoke-WebRequest "https://ratings.fide.com/profile/2263862" -OutFile "src/lib/import/fixtures/fide-profile.html"
```

Abrir el fixture, localizar el ELO standard visible y **anotar su valor para el test**.

- [ ] **Step 2: Test que falla** (ajustar `ELO_ESPERADO` al valor real del fixture)

`src/lib/import/fide.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEloFideDesdePerfil } from "./fide";

const html = readFileSync(
  join(__dirname, "fixtures", "fide-profile.html"),
  "utf-8"
);
const ELO_ESPERADO = 2600; // ← sustituir por el valor visible en el fixture

describe("parseEloFideDesdePerfil", () => {
  it("extrae el ELO standard del perfil", () => {
    expect(parseEloFideDesdePerfil(html)).toBe(ELO_ESPERADO);
  });
  it("devuelve null si no hay rating", () => {
    expect(parseEloFideDesdePerfil("<html><body>Not rated</body></html>")).toBeNull();
  });
});
```

Run: `npm test` → FAIL.

- [ ] **Step 3: Implementación.** El perfil FIDE muestra el rating standard en un bloque etiquetado (`std`). Implementar con regex tolerante y **ajustarla al HTML real del fixture** hasta que el test pase:

`src/lib/import/fide.ts`:

```ts
/** Extrae el ELO standard de la página de perfil de ratings.fide.com. */
export function parseEloFideDesdePerfil(html: string): number | null {
  // El bloque de ratings del perfil contiene la etiqueta "std" seguida del valor.
  const m =
    /std[^0-9]{0,200}?(\d{3,4})/is.exec(html) ??
    /profile-top-rating-data[^0-9]{0,200}?(\d{3,4})/is.exec(html);
  if (!m) return null;
  const elo = Number(m[1]);
  return elo >= 1000 && elo <= 3000 ? elo : null;
}
```

Run: `npm test` → passed (si no, ajustar la regex al fixture; el test con dato real es la fuente de verdad).

- [ ] **Step 4: Ruta cron**

`src/app/api/cron/elo-fide/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseEloFideDesdePerfil } from "@/lib/import/fide";

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players").select("id, fide_id").not("fide_id", "is", null);

  const resultados: Record<string, string> = {};
  for (const p of players ?? []) {
    try {
      const res = await fetch(`https://ratings.fide.com/profile/${p.fide_id}`, {
        headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
      });
      const elo = parseEloFideDesdePerfil(await res.text());
      if (elo !== null) {
        await admin.from("players").update({ elo_fide: elo }).eq("id", p.id);
        resultados[p.fide_id!] = `ok ${elo}`;
      } else {
        resultados[p.fide_id!] = "sin rating";
      }
      await new Promise((r) => setTimeout(r, 500)); // cortesía con el servidor FIDE
    } catch (e) {
      resultados[p.fide_id!] = `error: ${String(e)}`;
    }
  }
  return NextResponse.json({ actualizados: resultados });
}
```

- [ ] **Step 5: Probar en local.** Añadir `CRON_SECRET` a `.env.local` (cualquier cadena aleatoria). Con jugadores importados con `fide_id` real:

```powershell
npm run dev
# en otra terminal:
curl -H "Authorization: Bearer EL_SECRET" http://localhost:3000/api/cron/elo-fide
```

Expected: JSON con `"ok <elo>"` por jugador; los ELO aparecen en `/admin/orden-fuerza`. Sin header → 401.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: importador de ELO FIDE via perfil con cron protegido"
```

---

### Task 10: Importador ELO FEDA (TDD con fixture real)

**Files:**
- Create: `src/lib/import/feda.ts`, `src/lib/import/feda.test.ts`, `src/lib/import/fixtures/feda-lista.xlsx`, `src/app/api/cron/elo-feda/route.ts`, `src/app/admin/elo/page.tsx`, `src/app/admin/elo/actions.ts`
- Modify: `src/app/admin/page.tsx` (enlace a `/admin/elo`)

**Interfaces:**
- Consumes: `players` (feda_id), admin client.
- Produces: `obtenerUrlUltimaListaFeda(htmlPaginaElo: string): string | null`; `parseListaFeda(buffer: ArrayBuffer): Map<string, number>` (feda_id → ELO); cron `GET /api/cron/elo-feda`; página admin `/admin/elo` con subida manual del xlsx (respaldo) y botones "Actualizar FIDE/FEDA ahora".

- [ ] **Step 1: Instalar dependencia y descargar fixture real**

```powershell
npm install xlsx
```

Descargar de https://feda.org/feda2k16/elo-feda/ la lista mensual más reciente (enlace .xlsx) y guardarla como `src/lib/import/fixtures/feda-lista.xlsx`. Abrirla e **inspeccionar los encabezados reales** (columna de ID de jugador y columna de ELO) y anotar 2 pares (id, elo) reales para el test.

- [ ] **Step 2: Test que falla** (sustituir los pares anotados)

`src/lib/import/feda.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "./feda";

const xlsx = readFileSync(join(__dirname, "fixtures", "feda-lista.xlsx"));

describe("parseListaFeda", () => {
  it("mapea feda_id -> elo con datos reales del fichero", () => {
    const mapa = parseListaFeda(xlsx.buffer as ArrayBuffer);
    expect(mapa.size).toBeGreaterThan(1000);
    // Pares reales anotados del fixture:
    expect(mapa.get("ID_REAL_1")).toBe(9999); // ← sustituir
    expect(mapa.get("ID_REAL_2")).toBe(9999); // ← sustituir
  });
});

describe("obtenerUrlUltimaListaFeda", () => {
  it("devuelve el primer enlace .xlsx de la pagina", () => {
    const html = `<a href="/old.pdf">x</a>
      <a href="https://feda.org/files/lista_junio.xlsx">Lista Elo FEDA Junio</a>
      <a href="https://feda.org/files/lista_mayo.xlsx">Mayo</a>`;
    expect(obtenerUrlUltimaListaFeda(html)).toBe(
      "https://feda.org/files/lista_junio.xlsx"
    );
  });
  it("null si no hay enlaces xlsx", () => {
    expect(obtenerUrlUltimaListaFeda("<p>nada</p>")).toBeNull();
  });
});
```

Run: `npm test` → FAIL.

- [ ] **Step 3: Implementación** (ajustar `COL_ID` / `COL_ELO` a los encabezados reales del fixture hasta que el test pase)

`src/lib/import/feda.ts`:

```ts
import * as XLSX from "xlsx";

// Encabezados de la lista FEDA — verificar contra el fixture real y ajustar.
const COL_ID = "IDFEDA";
const COL_ELO = "ELO";

export function parseListaFeda(buffer: ArrayBuffer): Map<string, number> {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const mapa = new Map<string, number>();
  for (const row of rows) {
    const id = row[COL_ID];
    const elo = Number(row[COL_ELO]);
    if (id != null && Number.isFinite(elo) && elo > 0) {
      mapa.set(String(id).trim(), elo);
    }
  }
  return mapa;
}

export function obtenerUrlUltimaListaFeda(html: string): string | null {
  const m = /href="([^"]+\.xlsx)"/i.exec(html);
  return m ? m[1] : null;
}
```

Run: `npm test` → passed.

- [ ] **Step 4: Cron + acción compartida.** Crear helper y ruta:

`src/app/api/cron/elo-feda/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { actualizarEloFeda } from "@/app/admin/elo/actions";

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const resultado = await actualizarEloFeda();
  return NextResponse.json(resultado);
}
```

`src/app/admin/elo/actions.ts`:

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { obtenerUrlUltimaListaFeda, parseListaFeda } from "@/lib/import/feda";

export async function actualizarEloFeda(): Promise<{
  actualizados: number;
  error?: string;
}> {
  const pagina = await fetch("https://feda.org/feda2k16/elo-feda/", {
    headers: { "user-agent": "FomentoGandiaClubApp/1.0" },
  });
  const url = obtenerUrlUltimaListaFeda(await pagina.text());
  if (!url) return { actualizados: 0, error: "No se encontró la lista FEDA" };
  const fichero = await fetch(url);
  return aplicarListaFeda(await fichero.arrayBuffer());
}

export async function aplicarListaFeda(
  buffer: ArrayBuffer
): Promise<{ actualizados: number; error?: string }> {
  const mapa = parseListaFeda(buffer);
  const admin = createAdminClient();
  const { data: players } = await admin
    .from("players").select("id, feda_id").not("feda_id", "is", null);
  let actualizados = 0;
  for (const p of players ?? []) {
    const elo = mapa.get(p.feda_id!);
    if (elo !== undefined) {
      await admin.from("players").update({ elo_feda: elo }).eq("id", p.id);
      actualizados++;
    }
  }
  return { actualizados };
}
```

- [ ] **Step 5: Página admin de ELOs** (respaldo manual: subir xlsx + lanzar actualizaciones)

`src/app/admin/elo/page.tsx`:

```tsx
import { aplicarListaFeda, actualizarEloFeda } from "./actions";

export default function EloAdminPage() {
  async function subirFichero(formData: FormData) {
    "use server";
    const file = formData.get("fichero") as File;
    await aplicarListaFeda(await file.arrayBuffer());
  }
  async function refrescarFeda() {
    "use server";
    await actualizarEloFeda();
  }
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Actualización de ELO</h1>
      <form action={refrescarFeda} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Actualizar FEDA ahora (descarga lista oficial)
        </button>
      </form>
      <form action={subirFichero} className="mt-6 flex flex-col gap-2">
        <label className="text-sm font-medium">
          Respaldo manual: subir lista FEDA (.xlsx)
        </label>
        <input type="file" name="fichero" accept=".xlsx" required
          className="rounded border p-2 text-sm" />
        <button className="rounded border p-2 text-sm">Aplicar fichero</button>
      </form>
    </main>
  );
}
```

Añadir en `src/app/admin/page.tsx` un enlace `href="/admin/elo"` análogo a los existentes. Nota: el guard del layout `/admin` (Task 6) protege la página; `actualizarEloFeda` solo la invocan el cron (con secret) y páginas bajo ese guard.

- [ ] **Step 6: Probar en local** con jugadores reales del club (feda_id): botón "Actualizar FEDA ahora" → los ELO FEDA aparecen en `/admin/orden-fuerza`.

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: importador ELO FEDA (auto + respaldo manual)"
```

---

### Task 11: PWA + notificaciones push

**Files:**
- Create: `public/manifest.json`, `public/sw.js`, `public/icon.svg`, `supabase/migrations/0002_push.sql`, `src/lib/push/send.ts`, `src/components/PushSubscriber.tsx`, `src/app/api/push/subscribe/route.ts`, `src/app/admin/push/page.tsx`, `src/app/admin/push/actions.ts`
- Modify: `src/app/layout.tsx` (manifest + PushSubscriber), `src/app/admin/page.tsx` (enlace)

**Interfaces:**
- Consumes: perfil/usuario autenticado.
- Produces: tabla `push_subscriptions`; `enviarPushAUsuario(userId: string, payload: { title: string; body: string; url?: string }): Promise<void>` — la Fase 1 la usará al publicar convocatorias.

- [ ] **Step 1: Generar claves VAPID**

```powershell
npm install web-push
npx web-push generate-vapid-keys
```

Copiar a `.env.local`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

- [ ] **Step 2: Migración de suscripciones**

`supabase/migrations/0002_push.sql`:

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "suscripcion propia" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Aplicar en SQL Editor.

- [ ] **Step 3: Manifest, icono y service worker**

`public/manifest.json`:

```json
{
  "name": "Fomento de Gandia · Ajedrez",
  "short_name": "Fomento",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a1a",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

`public/icon.svg` (provisional hasta tener el escudo del club):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#1a1a1a"/>
  <text x="50" y="66" font-size="48" text-anchor="middle" fill="#ffffff"
    font-family="serif">♞</text>
</svg>
```

`public/sw.js`:

```js
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Fomento de Gandia", {
      body: data.body || "",
      icon: "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
```

En `src/app/layout.tsx`, dentro de `<head>` vía metadata API: añadir `manifest: "/manifest.json"` al objeto `metadata` exportado.

- [ ] **Step 4: Componente de suscripción**

`src/components/PushSubscriber.tsx`:

```tsx
"use client";

import { useEffect } from "react";

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function PushSubscriber() {
  useEffect(() => {
    async function subscribe() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ),
        }));
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    }
    subscribe().catch(() => {});
  }, []);
  return null;
}
```

Montarlo en `src/app/layout.tsx` dentro de `<body>` (siempre; en rutas públicas no hará nada porque el POST exige sesión).

- [ ] **Step 5: Ruta de suscripción y envío**

`src/app/api/push/subscribe/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const sub = await request.json();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

`src/lib/push/send.ts`:

```ts
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

webpush.setVapidDetails(
  "mailto:admin@fomentogandia.example",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function enviarPushAUsuario(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  await Promise.allSettled(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        )
        .catch(async (err: { statusCode?: number }) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", s.endpoint);
          }
        })
    )
  );
}
```

- [ ] **Step 6: Página admin de prueba de push**

`src/app/admin/push/actions.ts`:

```ts
"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { enviarPushAUsuario } from "@/lib/push/send";

export async function enviarPushPrueba() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await enviarPushAUsuario(user.id, {
    title: "Fomento de Gandia",
    body: "¡Las notificaciones funcionan! ♞",
    url: "/",
  });
}
```

`src/app/admin/push/page.tsx`:

```tsx
import { enviarPushPrueba } from "./actions";

export default function PushAdminPage() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Notificaciones</h1>
      <form action={enviarPushPrueba} className="mt-4">
        <button className="rounded bg-black p-3 text-sm font-semibold text-white">
          Enviarme una notificación de prueba
        </button>
      </form>
    </main>
  );
}
```

Añadir enlace en `/admin`.

- [ ] **Step 7: Verificación manual.** `npm run dev` → login → aceptar permiso de notificaciones → `/admin/push` → botón → llega la notificación (probar también con la pestaña en segundo plano). En Chrome DevTools → Application: manifest válido y SW activo.

- [ ] **Step 8: Commit**

```powershell
git add -A; git commit -m "feat: PWA instalable con notificaciones push"
```

---

### Task 12: Navegación móvil, perfil y despliegue

**Files:**
- Create: `src/components/BottomNav.tsx`, `src/app/perfil/page.tsx`, `vercel.json`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: app desplegada en Vercel con crons mensuales; navegación base que la Fase 1 ampliará.

- [ ] **Step 1: Barra de navegación inferior**

`src/components/BottomNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/perfil", label: "Perfil", icon: "♟" },
];

export function BottomNav({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const all = esAdmin
    ? [...items, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : items;
  if (["/login", "/registro"].some((p) => pathname.startsWith(p))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-white p-2">
      {all.map((i) => (
        <Link key={i.href} href={i.href}
          className={`flex flex-col items-center px-3 text-xs ${
            pathname === i.href ? "font-bold" : "text-gray-500"
          }`}>
          <span className="text-lg">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
```

En `src/app/layout.tsx`: cargar el perfil del usuario en el layout no es posible (es client-agnostic); en su lugar, montar `<BottomNav esAdmin={...}>` desde un wrapper server: crear el fetch del perfil en `layout.tsx` (es Server Component) con `createServerSupabase()`, pasando `esAdmin` (false si no hay sesión). Añadir `pb-20` al `<body>` para no tapar contenido.

- [ ] **Step 2: Página de perfil** (ficha + ELOs + fuerza)

`src/app/perfil/page.tsx`:

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { fuerza } from "@/lib/elo/fuerza";
import { logout } from "../(auth)/actions";

export default async function PerfilPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, player_id, players(nombre, elo_fide, elo_feda, elo_otro, fide_id, feda_id)")
    .eq("id", user!.id)
    .single();
  const p = profile?.players as unknown as {
    nombre: string; elo_fide: number | null; elo_feda: number | null;
    elo_otro: number | null; fide_id: string | null; feda_id: string | null;
  } | null;

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">Mi perfil</h1>
      <p className="text-sm text-gray-600">{profile?.email}</p>
      {p ? (
        <div className="mt-4 rounded-lg border p-4">
          <p className="text-lg font-semibold">{p.nombre}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt>ELO FIDE</dt><dd className="text-right">{p.elo_fide ?? "—"}</dd>
            <dt>ELO FEDA</dt><dd className="text-right">{p.elo_feda ?? "—"}</dd>
            <dt className="font-semibold">Fuerza (RGC 52.1)</dt>
            <dd className="text-right font-semibold">
              {fuerza({ eloFide: p.elo_fide, eloFeda: p.elo_feda, eloOtro: p.elo_otro })}
            </dd>
          </dl>
        </div>
      ) : (
        <p className="mt-4 text-sm">Sin ficha vinculada todavía.</p>
      )}
      <form action={logout}>
        <button className="mt-6 rounded border p-2 text-sm">Cerrar sesión</button>
      </form>
    </main>
  );
}
```

Quitar el botón de logout de `src/app/page.tsx` (ya vive en el perfil).

- [ ] **Step 3: Config de crons**

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/elo-fide", "schedule": "0 6 3 * *" },
    { "path": "/api/cron/elo-feda", "schedule": "0 6 4 * *" }
  ]
}
```

(Día 3 y 4 de cada mes a las 06:00 UTC, tras la publicación de listas mensuales.)

- [ ] **Step 4: Build + tests completos**

Run: `npm test` y `npm run build`
Expected: todo verde, build sin errores.

- [ ] **Step 5: GATE USUARIO — desplegar.** Pedir al usuario: (1) push del repo a su GitHub; (2) importar el repo en vercel.com (framework autodetectado); (3) copiar todas las variables de `.env.local` a Vercel → Settings → Environment Variables; (4) en Supabase → Authentication → URL Configuration, poner la URL de producción como Site URL. Redeploy.

- [ ] **Step 6: Smoke test en producción** (checklist con el usuario, desde su móvil): registro → confirmación email → reclamar ficha → aprobar desde cuenta admin → instalar PWA → notificación de prueba → ELOs visibles en orden de fuerza.

- [ ] **Step 7: Commit final de fase**

```powershell
git add -A; git commit -m "feat: navegacion movil, perfil y despliegue con crons"
```

---

## Autochequeo del plan (hecho)

- **Cobertura de spec (Fase 0):** fichas sin cuenta (T3/T6), reclama-tu-ficha con aprobación (T7/T8), roles admin/jugador (T3/T6; capitán llega con equipos en Fase 1), ELO FIDE+FEDA automático con respaldo manual (T9/T10), fuerza max(FEDA,FIDE) (T5), orden de fuerza con bises (T3/T6), PWA+push (T11), móvil-first (todas), coste 0€ (T12). Excepciones reglamentarias (52.3.d-e) están en el esquema; su UI de edición llega con el validador en Fase 1, que es quien las consume.
- **Placeholders:** los dos valores `ELO_ESPERADO`/`ID_REAL_*` de los tests de importadores se rellenan con datos del fixture real descargado en su propio Step 1 — es parte del método (test contra datos reales), no un hueco.
- **Consistencia de tipos:** `fuerza(ElosJugador)`, `parseOrdenFuerza`, `enviarPushAUsuario`, clientes Supabase — nombres idénticos en tareas productoras y consumidoras, verificado.
