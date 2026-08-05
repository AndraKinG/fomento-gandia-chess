@AGENTS.md

# Chess Club Manager — Fomento de Gandia · Guía de trabajo

App PWA del club de ajedrez Fomento de Gandia (Gandía). Propietario: J. Ribes ("Joan", admin del club, capitán del equipo A, ficha "Joan Martínez Ribes"). Idioma de trabajo: **español**.

## Dónde está todo

- **Estructura de rutas (cambió el 2026-08-05):** `/` es la **web pública** del club; la app de socios vive bajo **`/club`** (inicio, equipos, disponibilidad, jornadas, torneos, perfil, vincular, admin). `/login`, `/registro`, `/auth/confirm` y `/api` se quedan en la raíz. El gate de "sin ficha aprobada" es el layout del grupo de rutas `/club/(vinculado)`; `vincular` y `perfil` cuelgan de `/club` fuera del grupo. Rumbo completo en `docs/superpowers/specs/2026-08-05-arquitectura-objetivo.md`.
- **Producción:** https://fomento-gandia-chess-swart.vercel.app (Vercel despliega `main` automáticamente)
- **Repo:** https://github.com/AndraKinG/fomento-gandia-chess (cuenta GitHub principal del usuario)
- **Supabase:** proyecto `fomento-gandia-chess` en su cuenta Google secundaria (jony9vcf@...). Cuenta real del usuario en la app: jony9vcf@gmail.com (admin + capitán A)
- **Specs y planes:** `docs/superpowers/specs/` y `docs/superpowers/plans/` (Fases 0, 1A, 1B, 1C completadas)
- **Referencia de dominio:** `docs/referencia/` — reglamento RGC FACV extraído, verificación empírica de ambigüedades, guía SMTP Resend
- **`.env.local` NO está en el repo** (gitignorado): claves de Supabase (nuevas `sb_publishable_`/`sb_secret_`), VAPID pública/privada (deben ser LAS MISMAS en todas las máquinas — las suscripciones push dependen de ellas), `CRON_SECRET`. Al montar el proyecto en otra máquina, copiar el archivo por canal privado; el resto está en el README.

## Cómo trabajamos (reglas del propietario)

1. **Claude NUNCA hace `git push`.** Se commitea en local y se avisa al usuario con un bloque de comandos copy-paste que SIEMPRE empieza por `cd "<ruta del proyecto>"`. Él pushea con su cuenta.
2. **Migraciones SQL**: Claude escribe el fichero en `supabase/migrations/` (numeradas, en orden) y se lo deja al usuario en el portapapeles (`Set-Clipboard`) para que lo pegue en el SQL Editor de Supabase. Verificar después vía REST que las tablas/columnas existen. Aplicadas hasta ahora: 0001→0009. **Al pasar SQL al portapapeles usar `Get-Content -Raw -Encoding UTF8`**: PowerShell 5.1 lee los ficheros sin BOM como ANSI y corrompe los acentos (`ó` → `Ã³`), que en un literal de texto acaba guardado mal en la BD.
3. **Flujo de desarrollo**: brainstorm → spec escrita y aprobada → plan de tareas pequeñas → ejecución por subagentes con revisión (spec + calidad) por tarea, fix-loops hasta aprobar, y revisión global adversarial al final de cada fase (plugin `superpowers` de Claude Code; el ledger local vive en `.superpowers/sdd/progress.md`, gitignorado).
4. **Prioridad lógica sobre pulido** (decisión expresa del usuario): hallazgos visuales menores van al ledger para una pasada de pulido global futura, NO a fix-loops — salvo roturas de layout o accesibilidad grave. La lógica (validador, permisos, datos) mantiene el listón completo.
5. **Gates de usuario**: acciones que requieren sus cuentas (SQL Editor, Vercel, Resend, push de git) se le piden con pasos exactos clic a clic. Es desarrollador junior: instrucciones concretas, sin jerga innecesaria.
6. **Verificación en vivo con datos reales** siempre que sea posible (la BD compartida tiene el orden de fuerza real de 46 jugadores, calendario y resultados 2026 reales). No borrar/alterar datos reales sin permiso; los datos de prueba se etiquetan claramente (p. ej. rival "PRUEBA - BORRAR").

## Decisiones técnicas clave (no cambiar sin preguntar)

- **Identidad visual**: blanco y azul "gandiblues". Doble tema: claro *Mediterráneo* / oscuro *Azul profundo* (tokens en `globals.css`, en español: `bg-fondo`, `text-tinta`, `text-acento-texto`...). Tablero de ajedrez blanquiazul cuando llegue la Fase 3. **`--tinta-suave` del tema claro es `#556577` por accesibilidad, no por gusto**: el `#64748b` original daba 4.46 de contraste sobre `--fondo` y AA pide 4.50. No aclararlo. Los 18 pares medidos de ambos temas pasan AA (ver `docs/superpowers/plans/2026-08-05-deuda-pulido.md`).
- **Fuerza del jugador** = `force_order.elo_oficial` (orden de fuerza oficial FACV, sincronizado de `of_publico.php?id=56`); fallback `max(FEDA, FIDE)` (RGC art. 52.1). IDs de club/temporada FACV en `src/lib/import/facv-config.ts` (actualizar cada temporada).
- **Validador RGC** (`src/lib/validador/`): módulo puro, flag REQUERIDO `permitirInversionDentroMargen` — **estricto (false) por defecto**; dos ambigüedades del reglamento documentadas en `docs/referencia/verificacion-empirica-rgc.md` (0 inversiones en 11 rondas reales de 2026). No relajar sin confirmación FACV del usuario.
- **Publicar convocatoria**: única puerta = server action con re-validación completa + escritura service_role (trigger de blindaje en migración 0007). El cliente valida en vivo solo como ayuda.
- **Marcadores**: los resultados por tablero del capitán SIEMPRE prevalecen sobre el marcador FACV (`marcadorPreferido` en `src/lib/marcador.ts`).
- **Permisos en 3 capas** (RLS dura + actions re-verifican + UI oculta): matriz vinculante en el anexo del plan 1B (+ adenda 1C). Jugador solo su disponibilidad; capitán solo SU equipo; admin todo.
- **Acceso al club** (spec `2026-08-05-onboarding-club-design.md`): registro solo con **código de acceso** (tabla `access_codes`, uno activo, se gestiona en `/admin/acceso`), cuentas creadas por el servidor con `auth.admin.createUser` **ya confirmadas** (sin depender del SMTP), lista de `/vincular` desde el `force_order` de la temporada activa, y **lectura cerrada a los no vinculados** vía `esta_vinculado()` en 10 policies (migración 0009). **El interruptor "Allow new users to sign up" de Supabase DEBE estar desactivado**: sin él el código no sirve de nada, porque con la clave anónima cualquiera llama a `POST /auth/v1/signup` y se salta el formulario.
- **fide.com bloquea IPs de datacenter** (Vercel Y GitHub Actions): el ELO FIDE en vivo es cosmético — botón manual en local o `scripts/actualizar-elo-fide.mjs`. El cron de Vercel es único (`/api/cron/director`, diario, multiplexado por día: lunes pedir disponibilidad, jueves recordar, viernes sync FACV).

## Estado y pendientes (actualizar al avanzar)

- Fases 0 (cimientos), 1A (diseño), 1B (equipos/calendario/disponibilidad) y 1C (validador/convocatorias/resultados) **completas y aprobadas** (última revisión global: "Ready to deploy", 166/166 tests).
- Pendiente de usuario al cierre de 1C: **SMTP Resend** (guía en docs/referencia). La prueba de convocatoria en móvil se hizo (jornada A/R99 "Amistoso de prueba") y la limpieza de datos de prueba está hecha (migración 0008, 2026-08-05): borradas las 2 cuentas `*.prueba@fomentogandia.test` con sus profiles/link_requests, las 3 fichas "Jugador Prueba *" y el encuentro R99 con su convocatoria y resultados. Queda 1 sola cuenta (jony9vcf@gmail.com, admin + capitán A). **Sobreviven a propósito** 4 fichas fuera del orden de fuerza, restos de probar los imports de ELO: "Carlsen, Magnus" y "Nakamura, Hikaru" (FIDE), "Aalbersberg Kroon, Pedro" y "Aalders, Hendricus" (FEDA). No salen en convocatorias ni cuentan para la fuerza, pero sí en listados que lean `players` en crudo.
- **Fase 2 (torneos y coches) COMPLETA (2026-08-05)**: migración 0010 aplicada, 147 torneos del calendario FACV importados (ninguno marcado de interés todavía), pantallas `/club/torneos`, `/club/torneos/[id]` y `/club/admin/torneos`, y tarjetas de próximos torneos en la home. 257 tests. 7 de los 8 criterios de aceptación verificados en vivo con JWT de socio; **el único pendiente es mirar las pantallas en un móvil de verdad**, que requiere sesión.
- **Onboarding del club (2026-08-05)**: spec y plan escritos y aprobados, código implementado (180 tests). Migración 0009 **aplicada**. Código de acceso inicial: `CDRL-85C3-CAP6`. **Pendiente del usuario**: (a) desplegar el código a Vercel, (b) desactivar "Allow new users to sign up" en Supabase, (c) verificar después el criterio de aceptación 1 de la spec (que un POST directo a `/auth/v1/signup` con la clave anónima falle) y el 3 (que una cuenta sin aprobar no lea nada, hace falta una cuenta temporal de prueba).
- Fases futuras: **2** posts/torneos/coches · **3** BD de partidas + tablero blanquiazul · **4** torneos internos + ELO de club. Antes de invitar al club: pasada de pulido global con la deuda menor del ledger.
