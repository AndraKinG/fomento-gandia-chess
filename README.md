# Fomento de Gandia — app del club de ajedrez

App web (Next.js + Supabase) para gestionar el club de ajedrez Fomento de
Gandia: ficha de jugadores, orden de fuerza, equipos de Interclubs FACV,
disponibilidad, convocatorias con validación en vivo del RGC, resultados y
clasificación, notificaciones push y sincronización automática con las
páginas públicas de FACV/FEDA/FIDE.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions) + React 19.
- **Supabase**: Postgres + Auth + RLS. `@supabase/ssr` para el cliente de
  servidor/navegador, cliente `service_role` sólo para acciones ya gateadas.
- **Vitest** para el núcleo de lógica (parsers, validador RGC, ELO, marcador).
- **PWA** con service worker propio y Web Push (`web-push`).
- **xlsx** (build de [SheetJS](https://cdn.sheetjs.com), no el paquete npm
  desactualizado) para exportar/leer hojas de cálculo.
- Desplegado en **Vercel**, con un cron diario para el director de partida.

## Setup local

### 1. Variables de entorno

Copia `.env.example` a `.env.local` y rellena:

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (secreta, **nunca** en el cliente) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generar par de claves VAPID (`web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Idem, la mitad privada (secreta) |
| `CRON_SECRET` | Cadena aleatoria propia; protege `/api/cron/*` de invocaciones externas |
| `GEMINI_API_KEY` | Clave de Google AI Studio (https://aistudio.google.com/apikey). Mueve el asistente del club. Sin ella el asistente avisa de que no está configurado y el resto de la app funciona igual |

### 2. Base de datos

En el SQL Editor de Supabase, ejecuta las migraciones de `supabase/migrations/`
**en orden estricto** (cada una asume el esquema de la anterior):

```
0001_init.sql            -- players, profiles, seasons, force_order, link_requests + RLS base
0002_push.sql            -- suscripciones push
0003_link_requests_indices.sql
0004_interclubs.sql      -- teams, matches, availability
0005_convocatorias.sql   -- convocatorias/lineups
0006_marcadores.sql      -- resultados/marcadores por tablero
0007_blindaje_convocatorias.sql  -- trigger anti-publicación por REST directa
0008_limpieza_datos_prueba.sql   -- limpieza puntual, SALTAR en una BD nueva
0009_acceso_club.sql     -- código de acceso + lectura solo para vinculados
```

`0008` borra datos de prueba concretos de la base de datos original: en una
instalación nueva no hay nada que borrar, así que se puede saltar sin más.

No hay migrador automático: cópialas y pégalas en el SQL Editor una a una.

### 3. Arrancar

```bash
npm install
npm run dev      # servidor de desarrollo (Turbopack)
npm test         # suite Vitest (lógica pura, sin red ni BD)
npm run build    # build de producción
npm run lint     # ESLint
```

## Arquitectura

- **`src/lib/`** — lógica de negocio pura, con tests unitarios junto a cada
  módulo:
  - `validador/` — validador del Reglamento General de Competiciones (RGC)
    para convocatorias: `nucleo.ts` (reglas puras), `contexto.ts` (reglas que
    necesitan datos de BD), `colores.ts` (asignación de color por tablero).
  - `import/` — parsers y sincronizadores contra fuentes externas: FACV
    (orden de fuerza, calendario, resultados/clasificación — ids centralizados
    en `facv-config.ts`), FEDA y FIDE (ELO oficial). Cada `*-apply.ts` es la
    lógica de sincronización (sin gate de autorización: la comprueba quien lo
    llama) y cada parser tiene fixtures HTML reales en `import/fixtures/`.
  - `push/` — envío de notificaciones Web Push y cálculo de disponibilidad.
  - `elo/`, `convocatorias/`, `auth/` — cálculo de fuerza/ELO, contexto de BD
    para convocatorias, helpers `esAdmin()`/`esCapitan()`.
- **`src/app/`** — rutas de Next (App Router): páginas de jugador
  (`equipos`, `disponibilidad`, `jornadas`, `perfil`), `admin/*` (orden de
  fuerza, equipos, ELO, vinculaciones, push), `api/cron/*` (crons) y
  `api/push/subscribe`.
- **`src/proxy.ts`** — Proxy de Next 16 (antes `middleware.ts`): exige sesión
  para toda ruta salvo login/registro/auth, refrescando cookies de Supabase.

### Modelo de permisos (3 capas)

1. **RLS en Postgres** (migraciones `000N_*.sql`): cada tabla tiene políticas
   que ya restringen qué fila puede leer/escribir cada rol, es la barrera de
   verdad aunque falle todo lo demás.
2. **Gate en la Server Action**: cada acción que toca datos sensibles
   comprueba `esAdmin()` / `esCapitan()` **antes** de hacer nada (ver
   comentarios "NO exportar directamente sin comprobar..." en los `*-apply.ts`
   de `src/lib/import/`).
3. **Cliente `service_role`** (`src/lib/supabase/admin.ts`): sólo se usa
   dentro de una acción ya gateada en la capa 2, para operaciones que
   necesitan saltarse RLS (altas/bajas administrativas, sincronizadores FACV).
   Nunca se expone al navegador.

## Sincronización FACV

Desde `admin/equipos` hay botones para sincronizar contra las páginas
públicas de la FACV: **calendario** (crea/actualiza jornadas sin pisar las ya
jugadas) y **resultados + clasificación** (marcadores por tablero y tabla de
posiciones). Los ids de club/temporada están centralizados en
`src/lib/import/facv-config.ts` — **actualizar `TEMPORADA_ID_FACV` cada
temporada** (la FACV asigna un id nuevo cada año).

## Notificaciones push y crons

`/api/cron/director` corre diariamente en horario Vercel (ver `vercel.json`) y
avisa a capitanes/jugadores de disponibilidad pendiente o convocatorias por
publicar. `/api/cron/elo-fide` y `/api/cron/elo-feda` existen como rutas
manually-invocables (sin cron automático en Vercel: fide.com bloquea peticiones
desde Vercel) — se invocan desde los botones manuales en `/admin/elo` o desde
`scripts/actualizar-elo-fide.mjs` en local.

## Deploy (Vercel)

1. Importa el repo en Vercel, framework Next.js (autodetectado).
2. Configura las mismas variables de entorno del paso "Setup local" en
   **Project Settings → Environment Variables**.
3. En Supabase, **Authentication → URL Configuration**, añade la URL de
   producción de Vercel a *Site URL* y *Redirect URLs* (si no, la confirmación
   de email y los enlaces mágicos redirigen a `localhost`).
4. En Supabase, **Authentication → Sign In / Providers → Email**, desactiva
   **"Allow new users to sign up"**. **Sin este paso el registro está abierto a
   todo internet** y el código de acceso del club no sirve para nada: la clave
   anónima vive en el navegador, así que cualquiera puede llamar a
   `POST /auth/v1/signup` y saltarse el formulario de la app. Ver la sección
   "Acceso al club" más abajo.
5. Los crons de `vercel.json` se activan solos al desplegar; verifica en
   Vercel → Cron Jobs que aparecen y que `CRON_SECRET` coincide con la env var.
6. Configura SMTP propio para los emails de Auth (ver
   `docs/referencia/configurar-smtp-resend.md`) — con el SMTP compartido de
   Supabase la plantilla no se puede personalizar y el límite de envíos es muy
   bajo para producción real. **El registro de socios no depende de esto** (las
   cuentas se crean ya confirmadas), pero la recuperación de contraseña sí.

## Acceso al club

La app es privada del club: solo se puede crear cuenta con un **código de
acceso** que reparte el admin. Tres capas, cada una respondiendo a algo
distinto:

1. **El código** dice *"eres del club"*. Vive en la tabla `access_codes`, solo
   puede haber uno activo, y se gestiona en `/admin/acceso`: verlo, copiarlo,
   regenerarlo (el anterior deja de valer al instante) y **cerrar el registro**
   cuando ya está todo el club dentro. Los socios ya registrados no se ven
   afectados por ninguna de esas operaciones.
2. **`/vincular`** pregunta *"qué ficha dices que eres"*. La lista sale del
   `force_order` de la temporada activa —el censo oficial del club—, no de
   `players` entera, para que no se puedan reclamar fichas que no son de
   socios. Quien no use la app nunca reclama su ficha y su ficha sigue
   existiendo para convocatorias.
3. **`/admin/vinculaciones`** confirma *"eres realmente esa persona"*. Es la
   barrera anti-suplantación: el admin conoce a sus socios.

Las cuentas se crean desde el servidor con `auth.admin.createUser` y ya
confirmadas (ver `src/lib/acceso/registro.ts`). Motivo: el circuito de
confirmación por email no aguanta a 46 socios registrándose la misma tarde con
el SMTP compartido de Supabase. Contrapartida: un email mal escrito deja a ese
socio sin recuperar su contraseña, y hay que corregírselo desde el dashboard de
Supabase (*Authentication → Users → Update user*).

Mientras una cuenta no tenga ficha aprobada **no puede leer nada**: la
migración 0009 exige `esta_vinculado()` en la lectura de `players`,
`force_order`, `seasons`, `teams`, `team_captains`, `matches`, `standings`,
`board_results` y las convocatorias publicadas. El redirect a `/vincular` del
layout raíz es solo comodidad; la barrera es la RLS.

## Cuentas de prueba

En desarrollo se usaron cuentas `*.prueba@fomentogandia.test` sembradas a mano
para probar flujos de admin/jugador (ver `docs/superpowers/plans/`). **Ya están
borradas** de la base de datos compartida junto con sus fichas y el encuentro
de prueba (migración `0008_limpieza_datos_prueba.sql`). Si vuelves a sembrar
cuentas de prueba, usa el mismo dominio `@fomentogandia.test` para que sean
fáciles de localizar y bórralas antes de dar acceso real a los socios.

Las cuatro fichas que quedaban de probar los sincronizadores de ELO ("Carlsen",
"Nakamura", "Aalbersberg" y "Aalders") **también están borradas** (migración
`0016_limpieza_fichas_no_socias.sql`), junto con un torneo de prueba creado a
mano. A partir de ahí, `players` y el orden de fuerza de la temporada activa
contienen exactamente lo mismo: los 46 socios reales.
