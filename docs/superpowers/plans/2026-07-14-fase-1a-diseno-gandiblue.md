# Fase 1A — Sistema de diseño gandiblue · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identidad visual gandiblue completa — doble tema (claro "Mediterráneo" / oscuro "Azul profundo"), biblioteca de componentes UI y re-vestido de todas las pantallas de la Fase 0 — dejando la app desplegada con aspecto profesional.

**Architecture:** Tokens de color como variables CSS en `globals.css` mapeadas a utilidades Tailwind v4 (`@theme inline`); tema oscuro por clase `.dark` en `<html>` con script anti-flash y conmutador persistido en localStorage. Componentes de presentación puros en `src/components/ui/` (sin datos, sin Supabase), consumidos por las pantallas. Un showcase interno (`/admin/diseno`) permite verificar visualmente toda la biblioteca en ambos temas.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (ya instalado), TypeScript strict. Sin dependencias nuevas.

## Global Constraints

- Copy de UI en **español**. Móvil-first (viewport base 375-390px), pero sin romper en escritorio.
- Paleta EXACTA elegida por el usuario:
  - Claro "Mediterráneo": acento #0ea5e9, acento fuerte #0369a1, degradado cabeceras `linear-gradient(135deg,#0ea5e9,#0369a1)`, fondo página #f0f9ff, tarjetas #ffffff, tarjeta destacada #f0f9ff con borde #bae6fd, borde normal #e2e8f0, texto #0c4a6e, texto suave #64748b.
  - Oscuro "Azul profundo": fondo página #0a1628, tarjetas #132c4d, borde #1e3a5f, acento #60a5fa, acento fuerte #2563eb, texto #e2ecf7, texto suave #8fa8c4.
- TypeScript strict, sin `any`. Componentes de `src/components/ui/` son de presentación pura: reciben props, no tocan Supabase ni hacen fetch.
- NO tocar lógica de datos de las pantallas al re-vestirlas: solo el JSX devuelto. Las server actions y queries quedan como están.
- Claude NUNCA hace `git push` — commits locales; el usuario pushea.
- Al cerrar cada tarea de pantalla: verificación en navegador (viewport móvil) en AMBOS temas.
- `npm test` (18/18) y `npm run build` en verde al final de cada tarea.

---

### Task 1: Tokens gandiblue + tema oscuro + conmutador

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/ThemeToggle.tsx`

**Interfaces:**
- Produces: utilidades Tailwind `bg-fondo`, `bg-tarjeta`, `bg-tarjeta-suave`, `border-borde`, `border-borde-acento`, `text-tinta`, `text-tinta-suave`, `text-acento`, `bg-acento`, `bg-acento-fuerte` disponibles en toda la app y sensibles al tema; clase CSS `bg-degradado-club`; componente `<ThemeToggle />` (client) que cicla sistema→claro→oscuro y persiste en `localStorage.tema`.

- [ ] **Step 1: Reescribir `src/app/globals.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* ===== Tema claro: Mediterráneo ===== */
:root {
  --fondo: #f0f9ff;
  --tarjeta: #ffffff;
  --tarjeta-suave: #f0f9ff;
  --borde: #e2e8f0;
  --borde-acento: #bae6fd;
  --tinta: #0c4a6e;
  --tinta-suave: #64748b;
  --acento: #0ea5e9;
  --acento-fuerte: #0369a1;
  --sobre-acento: #ffffff;
}

/* ===== Tema oscuro: Azul profundo ===== */
.dark {
  --fondo: #0a1628;
  --tarjeta: #132c4d;
  --tarjeta-suave: #0f2137;
  --borde: #1e3a5f;
  --borde-acento: #1e3a5f;
  --tinta: #e2ecf7;
  --tinta-suave: #8fa8c4;
  --acento: #60a5fa;
  --acento-fuerte: #2563eb;
  --sobre-acento: #ffffff;
}

@theme inline {
  --color-fondo: var(--fondo);
  --color-tarjeta: var(--tarjeta);
  --color-tarjeta-suave: var(--tarjeta-suave);
  --color-borde: var(--borde);
  --color-borde-acento: var(--borde-acento);
  --color-tinta: var(--tinta);
  --color-tinta-suave: var(--tinta-suave);
  --color-acento: var(--acento);
  --color-acento-fuerte: var(--acento-fuerte);
  --color-sobre-acento: var(--sobre-acento);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

.bg-degradado-club {
  background: linear-gradient(135deg, var(--acento), var(--acento-fuerte));
}

body {
  background: var(--fondo);
  color: var(--tinta);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 2: Script anti-flash y clase en `<html>`** — en `src/app/layout.tsx`, añadir dentro de `<html>` (antes de `<body>`) un `<head>` implícito no hace falta: Next permite `<script>` inline en el body top. Usar este patrón (primer hijo de `<body>`):

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `try{const t=localStorage.tema;const s=window.matchMedia("(prefers-color-scheme: dark)").matches;if(t==="oscuro"||(!t||t==="sistema")&&s)document.documentElement.classList.add("dark")}catch(e){}`,
  }}
/>
```

y `suppressHydrationWarning` en `<html>`.

- [ ] **Step 3: `src/components/ThemeToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

type Tema = "sistema" | "claro" | "oscuro";
const ORDEN: Tema[] = ["sistema", "claro", "oscuro"];
const ETIQUETA: Record<Tema, string> = {
  sistema: "🌗 Tema: sistema",
  claro: "☀️ Tema: claro",
  oscuro: "🌙 Tema: oscuro",
};

function aplicar(tema: Tema) {
  const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const oscuro = tema === "oscuro" || (tema === "sistema" && oscuroSistema);
  document.documentElement.classList.toggle("dark", oscuro);
}

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => {
    const guardado = (localStorage.getItem("tema") as Tema | null) ?? "sistema";
    setTema(guardado);
  }, []);
  function ciclar() {
    const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
    setTema(siguiente);
    localStorage.setItem("tema", siguiente);
    aplicar(siguiente);
  }
  return (
    <button onClick={ciclar}
      className="rounded-xl border border-borde bg-tarjeta px-4 py-2 text-sm text-tinta">
      {ETIQUETA[tema]}
    </button>
  );
}
```

- [ ] **Step 4: Verificar** — `npm run build` verde; `npm run dev` + navegador: la app existente se ve con fondo celeste suave (claro) y, forzando `document.documentElement.classList.add("dark")` en consola, con fondo marino. Sin flash al recargar.

- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat(ui): tokens gandiblue con doble tema y conmutador"`

---

### Task 2: Biblioteca de componentes UI + showcase

**Files:**
- Create: `src/components/ui/Cabecera.tsx`, `src/components/ui/Tarjeta.tsx`, `src/components/ui/Banner.tsx`, `src/components/ui/EstadoVacio.tsx`, `src/components/ui/ChipElo.tsx`, `src/components/ui/ChipTablero.tsx`, `src/components/ui/BotonesDisponibilidad.tsx`, `src/components/ui/TarjetaJornada.tsx`, `src/app/admin/diseno/page.tsx`

**Interfaces:**
- Produces (presentación pura, las pantallas y la Fase 1B dependen de estos nombres y props):
  - `Cabecera({ titulo, subtitulo? })` — franja con degradado del club y ♞.
  - `Tarjeta({ children, destacada?, className? })`
  - `Banner({ tipo: "ok" | "error" | "aviso", children })`
  - `EstadoVacio({ icono?, titulo, detalle? })`
  - `ChipElo({ valor: number | null, etiqueta? })` — muestra "—" si null.
  - `ChipTablero({ tablero: number, color: "blancas" | "negras" })`
  - `BotonesDisponibilidad({ valor: "disponible" | "no_disponible" | "duda" | null, onCambio(v): void, deshabilitado? })` (client component)
  - `TarjetaJornada({ equipo, rival, fechaTexto, esLocal, sede?, extra? })`

- [ ] **Step 1: Componentes.** Código completo:

`src/components/ui/Cabecera.tsx`:

```tsx
export function Cabecera({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="bg-degradado-club px-4 pb-5 pt-6 text-sobre-acento">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <span aria-hidden className="text-2xl">♞</span>
        <div>
          <h1 className="text-xl font-bold leading-tight">{titulo}</h1>
          {subtitulo && <p className="text-sm opacity-90">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}
```

`src/components/ui/Tarjeta.tsx`:

```tsx
export function Tarjeta({
  children, destacada = false, className = "",
}: { children: React.ReactNode; destacada?: boolean; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      destacada
        ? "border-borde-acento bg-tarjeta-suave"
        : "border-borde bg-tarjeta"
    } ${className}`}>
      {children}
    </div>
  );
}
```

`src/components/ui/Banner.tsx`:

```tsx
const ESTILOS = {
  ok: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  error: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  aviso: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
} as const;

export function Banner({
  tipo, children,
}: { tipo: keyof typeof ESTILOS; children: React.ReactNode }) {
  return (
    <p role="alert" className={`rounded-xl border p-3 text-sm ${ESTILOS[tipo]}`}>
      {children}
    </p>
  );
}
```

`src/components/ui/EstadoVacio.tsx`:

```tsx
export function EstadoVacio({
  icono = "♞", titulo, detalle,
}: { icono?: string; titulo: string; detalle?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span aria-hidden className="text-4xl opacity-40">{icono}</span>
      <p className="font-semibold text-tinta">{titulo}</p>
      {detalle && <p className="text-sm text-tinta-suave">{detalle}</p>}
    </div>
  );
}
```

`src/components/ui/ChipElo.tsx`:

```tsx
export function ChipElo({ valor, etiqueta = "ELO" }: { valor: number | null; etiqueta?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tarjeta-suave px-2.5 py-0.5 text-xs font-medium text-acento-fuerte ring-1 ring-borde-acento dark:text-acento">
      {etiqueta} {valor ?? "—"}
    </span>
  );
}
```

`src/components/ui/ChipTablero.tsx`:

```tsx
export function ChipTablero({
  tablero, color,
}: { tablero: number; color: "blancas" | "negras" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-acento px-2.5 py-0.5 text-xs font-semibold text-sobre-acento">
      Tablero {tablero} · {color === "blancas" ? "♙ Blancas" : "♟ Negras"}
    </span>
  );
}
```

`src/components/ui/BotonesDisponibilidad.tsx`:

```tsx
"use client";

type Valor = "disponible" | "no_disponible" | "duda" | null;
const OPCIONES: { valor: Exclude<Valor, null>; icono: string; texto: string }[] = [
  { valor: "disponible", icono: "✅", texto: "Puedo" },
  { valor: "no_disponible", icono: "❌", texto: "No puedo" },
  { valor: "duda", icono: "🤔", texto: "Duda" },
];

export function BotonesDisponibilidad({
  valor, onCambio, deshabilitado = false,
}: { valor: Valor; onCambio: (v: Exclude<Valor, null>) => void; deshabilitado?: boolean }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Disponibilidad">
      {OPCIONES.map((o) => (
        <button key={o.valor} type="button" disabled={deshabilitado}
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={`flex-1 rounded-xl border px-2 py-2 text-sm transition ${
            valor === o.valor
              ? "border-acento bg-acento text-sobre-acento"
              : "border-borde bg-tarjeta text-tinta"
          } disabled:opacity-50`}>
          <span aria-hidden>{o.icono}</span> {o.texto}
        </button>
      ))}
    </div>
  );
}
```

`src/components/ui/TarjetaJornada.tsx`:

```tsx
import { Tarjeta } from "./Tarjeta";

export function TarjetaJornada({
  equipo, rival, fechaTexto, esLocal, sede, extra,
}: {
  equipo: string; rival: string; fechaTexto: string; esLocal: boolean;
  sede?: string; extra?: React.ReactNode;
}) {
  return (
    <Tarjeta destacada>
      <p className="text-[11px] font-bold uppercase tracking-wide text-acento-fuerte dark:text-acento">
        Próxima jornada · {equipo}
      </p>
      <p className="mt-1 text-lg font-bold text-tinta">vs. {rival}</p>
      <p className="text-sm text-tinta-suave">
        {fechaTexto} · {esLocal ? "En casa" : "Fuera"}{sede ? ` · ${sede}` : ""}
      </p>
      {extra && <div className="mt-3 flex flex-wrap gap-2">{extra}</div>}
    </Tarjeta>
  );
}
```

- [ ] **Step 2: Showcase `/admin/diseno`** — página server (protegida ya por el layout de admin) que renderiza TODOS los componentes con datos de ejemplo y un `<ThemeToggle />` arriba, agrupados con títulos. Incluir: Cabecera, TarjetaJornada con `extra` de ChipTablero+ChipElo, los tres Banner, EstadoVacio, BotonesDisponibilidad (envuelto en un pequeño client wrapper con useState para que sea interactivo en el showcase), Tarjeta normal/destacada. Código del wrapper interactivo dentro del propio showcase:

```tsx
// src/app/admin/diseno/DemoDisponibilidad.tsx
"use client";
import { useState } from "react";
import { BotonesDisponibilidad } from "@/components/ui/BotonesDisponibilidad";

export function DemoDisponibilidad() {
  const [v, setV] = useState<"disponible" | "no_disponible" | "duda" | null>(null);
  return <BotonesDisponibilidad valor={v} onCambio={setV} />;
}
```

- [ ] **Step 3: Verificar en navegador** — `/admin/diseno` con sesión admin: todos los componentes visibles y correctos en claro y oscuro (usar el ThemeToggle de la propia página).

- [ ] **Step 4: Commit** — `git add -A; git commit -m "feat(ui): biblioteca de componentes gandiblue y showcase"`

---

### Task 3: Re-vestir login y registro

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/registro/page.tsx`

**Interfaces:**
- Consumes: `Banner`, tokens. NO tocar las server actions ni los wrappers `"use server"` ni la lógica de searchParams — solo el JSX visual.

- [ ] **Step 1: Login.** Mantener el form/action/searchParams exactamente como están; sustituir el JSX por: pantalla completa con fondo `bg-fondo`, bloque centrado max-w-sm, ♞ grande con degradado de texto, título "Fomento de Gandia", subtítulo "Club de ajedrez · Gandia", inputs con `rounded-xl border-borde bg-tarjeta p-3 text-tinta placeholder:text-tinta-suave` y `<label>` visibles (accesibilidad pendiente de Fase 0), botón `bg-degradado-club text-sobre-acento rounded-xl p-3 font-semibold`, banners con `<Banner tipo="ok">` (registrado) y `<Banner tipo="error">` (error). Enlace a registro en `text-acento`.

- [ ] **Step 2: Registro.** Mismo tratamiento (título "Crear cuenta", banner de error, minLength 8 se conserva).

- [ ] **Step 3: Verificar en navegador ambos temas** (login con error forzado `/login?error=prueba` y con `?registrado=1`).

- [ ] **Step 4: Commit** — `git commit -m "feat(ui): login y registro gandiblue"`

---

### Task 4: Re-vestir home + navegación de 4 pestañas

**Files:**
- Modify: `src/app/page.tsx`, `src/components/BottomNav.tsx`
- Create: `src/app/equipos/page.tsx` (placeholder Fase 1B)

**Interfaces:**
- Consumes: `Cabecera`, `Tarjeta`, `Banner`, `EstadoVacio`.
- Produces: BottomNav de 4 ítems: Inicio `/`, Equipos `/equipos`, Perfil `/perfil`, Admin `/admin` (admin solo si esAdmin); estilo: fondo `bg-tarjeta`, borde superior `border-borde`, activo en `text-acento` con font-bold.

- [ ] **Step 1: Home.** Mantener queries/lógica; nuevo JSX: `<Cabecera titulo="Fomento de Gandia" subtitulo="Hola, {email}" />` + contenido max-w-md: si no vinculado y sin pendiente → `<Banner tipo="aviso">` con el enlace a /vincular; si pendiente → `<Banner tipo="ok">`; y un `<EstadoVacio icono="♟" titulo="Aún no hay jornadas" detalle="Cuando arranque el interclubs verás aquí tu próxima jornada" />` como cuerpo (la TarjetaJornada real llega en Fase 1B).

- [ ] **Step 2: BottomNav.** Añadir ítem Equipos (icono ♟), aplicar tokens (quitar colores hardcodeados `bg-white`/`text-gray-500` → `bg-tarjeta`, `text-tinta-suave`, activo `text-acento`), `aria-current="page"` en el activo. Mantener la lógica de ocultación y subrutas.

- [ ] **Step 3: `/equipos` placeholder**:

```tsx
import { Cabecera } from "@/components/ui/Cabecera";
import { EstadoVacio } from "@/components/ui/EstadoVacio";

export default function EquiposPage() {
  return (
    <main>
      <Cabecera titulo="Equipos" subtitulo="Interclubs FACV" />
      <div className="mx-auto max-w-md p-4">
        <EstadoVacio titulo="Los equipos llegan con el interclubs"
          detalle="Aquí verás calendario, clasificación y convocatorias de los equipos A, B y C" />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verificar ambos temas + commit** — `git commit -m "feat(ui): home gandiblue y navegacion de 4 pestañas"`

---

### Task 5: Re-vestir perfil y vincular

**Files:**
- Modify: `src/app/perfil/page.tsx`, `src/app/vincular/page.tsx`

**Interfaces:**
- Consumes: `Cabecera`, `Tarjeta`, `ChipElo`, `Banner`, `EstadoVacio`, `ThemeToggle`.

- [ ] **Step 1: Perfil.** Mantener lógica; nuevo JSX: Cabecera "Mi perfil" con email de subtítulo; `<Tarjeta destacada>` con nombre grande, fila de `<ChipElo valor={fide} etiqueta="FIDE" />`, `<ChipElo valor={feda} etiqueta="FEDA" />` y `<ChipElo valor={fuerza} etiqueta="Fuerza" />`; debajo `<ThemeToggle />` (¡el conmutador vive aquí!), el botón "Activar notificaciones" restyled (`bg-degradado-club`), y logout como botón secundario (`border-borde bg-tarjeta text-tinta-suave`). Sin ficha → EstadoVacio con enlace a /vincular.

- [ ] **Step 2: Vincular.** Cabecera "¿Quién eres?"; lista de fichas como `<Tarjeta>` por jugador con nombre + ChipElo FIDE y botón "Soy yo" (`bg-acento text-sobre-acento rounded-xl px-4 py-1.5 text-sm font-semibold`); banner de error con `<Banner tipo="error">`. Mantener acciones y filtrado tal cual.

- [ ] **Step 3: Verificar ambos temas + commit** — `git commit -m "feat(ui): perfil y vincular gandiblue"`

---

### Task 6: Re-vestir el área de admin

**Files:**
- Modify: `src/app/admin/page.tsx`, `src/app/admin/orden-fuerza/page.tsx`, `src/app/admin/vinculaciones/page.tsx`, `src/app/admin/elo/page.tsx`, `src/app/admin/push/page.tsx`

**Interfaces:**
- Consumes: `Cabecera`, `Tarjeta`, `Banner`, `EstadoVacio`, `ChipElo`.

- [ ] **Step 1: Índice admin** — Cabecera "Administración"; enlaces como Tarjetas con icono, título y descripción corta (📋 Orden de fuerza · 🔗 Vinculaciones · 📈 Actualización de ELO · 🔔 Notificaciones · 🎨 Diseño).
- [ ] **Step 2: Orden de fuerza** — lista como Tarjetas compactas: badge circular con el nº OF (`bg-acento text-sobre-acento rounded-full`), nombre, ChipElo FIDE y FEDA; formulario de importación con inputs/textarea tokenizados y `<Banner>` para msg/tipo.
- [ ] **Step 3: Vinculaciones** — cada solicitud en Tarjeta con "X dice ser Y" y botones Aprobar (`bg-acento`)/Rechazar (secundario); vacío → EstadoVacio "No hay solicitudes pendientes".
- [ ] **Step 4: ELO** — botones principales con `bg-degradado-club`, nota de la lista FEDA como `<Banner tipo="aviso">`, subida manual en Tarjeta.
- [ ] **Step 5: Push** — botón de prueba restyled en Tarjeta.
- [ ] **Step 6: Verificar las 5 pantallas en ambos temas + commit** — `git commit -m "feat(ui): area de admin gandiblue"`

---

### Task 7: PWA e identidad de instalación

**Files:**
- Modify: `public/manifest.json`, `public/icon.svg`, `src/app/layout.tsx` (metadata themeColor)

**Interfaces:**
- Produces: icono ♞ gandiblue, colores de instalación coherentes.

- [ ] **Step 1: Icono** — `public/icon.svg`: fondo redondeado con el degradado del club (definir `<linearGradient>` de #0ea5e9 a #0369a1) y ♞ blanco centrado.
- [ ] **Step 2: Manifest** — `background_color: "#f0f9ff"`, `theme_color: "#0369a1"`, name/short_name sin cambios.
- [ ] **Step 3: Metadata** — en layout, exportar `viewport` con `themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0369a1" }, { media: "(prefers-color-scheme: dark)", color: "#0a1628" }]` (API `Viewport` de Next).
- [ ] **Step 4: Verificar** (manifest válido en DevTools → Application) **+ commit** — `git commit -m "feat(ui): icono y colores de instalacion gandiblue"`

---

### Task 8: Verificación integral y cierre del bloque

**Files:**
- Ninguno nuevo (correcciones que surjan).

- [ ] **Step 1: Pasada completa en navegador** — recorrer TODAS las pantallas en viewport móvil, en claro y oscuro, con las cuentas de prueba: login (+error), registro, home (3 estados: sin vincular / pendiente / vinculado), perfil, vincular, equipos, admin completo, showcase. Anotar y corregir cualquier desajuste (contraste, spacing, texto cortado).
- [ ] **Step 2: Suite y build** — `npm test` 18/18, `npm run build`, `npm run lint` verdes.
- [ ] **Step 3: Commit de ajustes** — `git commit -m "fix(ui): ajustes de la pasada integral gandiblue"` (si hubo cambios).
- [ ] **Step 4: GATE USUARIO — push + revisión visual.** El usuario pushea (Vercel redespliega) y revisa la app en su móvil en ambos temas. Sus comentarios se aplican antes de dar el bloque por cerrado.

---

## Autochequeo del plan (hecho)

- **Cobertura spec Bloque A:** tokens+doble tema+conmutador (T1), biblioteca completa incl. componentes que consumirá 1B (T2, con showcase para verificarlos aunque aún sin pantalla real), re-vestido de todas las pantallas Fase 0 (T3-T6), icono/manifest (T7), pasada integral (T8). La pestaña Equipos nace como placeholder (la spec la sitúa en la nav de 4 pestañas; su contenido es de 1B).
- **Placeholders:** ninguno — cada componente tiene su código completo; los re-vestidos definen composición exacta por pantalla sin tocar lógica.
- **Consistencia de tipos:** props de `BotonesDisponibilidad` y `ChipTablero` alineadas con los valores del modelo de datos de la spec 1 (§3: disponible/no_disponible/duda; blancas/negras).
