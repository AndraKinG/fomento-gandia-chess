@AGENTS.md

# Chess Club Manager — Fomento de Gandia · Guía de trabajo

App PWA del club de ajedrez Fomento de Gandia (Gandía). Propietario: J. Ribes ("Joan", admin del club, capitán del equipo A, ficha "Joan Martínez Ribes"). Idioma de trabajo: **español**.

> **Este repo es PÚBLICO en GitHub.** Nunca subas códigos de acceso, datos de contacto
> de socios ni nada que no publicarías en la web del club. Si algo entra por error,
> rota lo comprometido y decide si se reescribe historial (público = puede haber
> caches y forks).

## Dónde está todo

- **Estructura de rutas (2026-08-05, retocada el 2026-08-06):** `/` es la **web pública** del club; la app de socios vive bajo **`/club`**. Secciones en la navegación: Inicio, Interclubs (`/club/equipos`, `/club/disponibilidad`, `/club/jornadas`), **Torneos** (`/club/torneos/facv`, SOLO los de fuera: organización — si vas y coches), **Jugar** (`/club/jugar`, con dos pestañas: Retos y `/club/jugar/torneos` los torneos del club), Partidas y Perfil, más Admin. **REORGANIZADO el 2026-08-11 por decisión del propietario**: los torneos del club se mudaron de Torneos a Jugar — el criterio que separa es DÓNDE SE JUEGA (en la app → Jugar; fuera → Torneos), no cómo se llama la cosa. Las rutas viejas `/club/torneos/interno/*` redirigen con un catch-all a `/club/jugar/torneos/*` (hay push y avisos en bandejas apuntando allí — mismo trato que el redirect de `/club/torneos`). `/club/torneos` **redirige** a la pestaña de fuera y existe solo para no romper las notificaciones push ya enviadas, que apuntan ahí. `/login`, `/registro`, `/auth/confirm` y `/api` se quedan en la raíz. El gate de "sin ficha aprobada" es el layout del grupo `/club/(vinculado)`; `vincular` y `perfil` cuelgan de `/club` fuera del grupo. Rumbo completo en `docs/superpowers/specs/2026-08-05-arquitectura-objetivo.md`.
- **Producción:** https://fomento-gandia-chess-swart.vercel.app (Vercel despliega `main` automáticamente)
- **Repo:** https://github.com/AndraKinG/fomento-gandia-chess (cuenta GitHub principal del usuario)
- **Supabase:** proyecto `fomento-gandia-chess` en su cuenta Google secundaria (jony9vcf@...). Cuenta real del usuario en la app: jony9vcf@gmail.com (admin + capitán A)
- **Specs y planes:** `docs/superpowers/specs/` y `docs/superpowers/plans/` (Fases 0, 1A, 1B, 1C completadas)
- **Referencia de dominio:** `docs/referencia/` — reglamento RGC FACV extraído, verificación empírica de ambigüedades, guía SMTP Resend
- **`.env.local` NO está en el repo** (gitignorado): claves de Supabase (nuevas `sb_publishable_`/`sb_secret_`), VAPID pública/privada (deben ser LAS MISMAS en todas las máquinas — las suscripciones push dependen de ellas), `CRON_SECRET`, `GEMINI_API_KEY` y `LLM_MODEL` (opcional: fuerza otro modelo de Gemini si Google jubila el de por defecto). Al montar el proyecto en otra máquina, copiar el archivo por canal privado; el resto está en el README.

## Cómo trabajamos (reglas del propietario)

Complementan las **Reglas duras** del CLAUDE.md común (`~/proyectos/CLAUDE.md`) —
"nunca `git push`" y "datos de prueba etiquetados" viven allí, no las repito aquí.

1. **Migraciones SQL**: la skill `aplicar-migracion-sql` describe el procedimiento y las
   dos trampas duras (guarda por FORMA; cualificar columnas en policies). Aplicadas
   hasta ahora: 0001→0050. Regla nueva (2026-08-10): los avisos se mandan SIEMPRE con
   `avisar()` (`src/lib/avisos/enviar.ts`), nunca con push directo — el único sitio que
   sigue mandando push directo es el botón de prueba del admin (`/club/admin/push`), a
   propósito, porque no genera fila en la bandeja.
2. **Flujo de desarrollo**: brainstorm → spec escrita y aprobada → plan de tareas
   pequeñas → ejecución por subagentes con revisión (spec + calidad) por tarea,
   fix-loops hasta aprobar, y revisión global adversarial al final de cada fase (plugin
   `superpowers` de Claude Code; el ledger local vive en `.superpowers/sdd/progress.md`,
   gitignorado).
3. **Prioridad lógica sobre pulido** (decisión expresa del usuario): hallazgos visuales
   menores van al ledger para una pasada de pulido global futura, NO a fix-loops — salvo
   roturas de layout o accesibilidad grave. La lógica (validador, permisos, datos)
   mantiene el listón completo.
4. **Gates de usuario**: acciones que requieren sus cuentas (SQL Editor, Vercel, Resend,
   push de git) se le piden con pasos exactos clic a clic. Es desarrollador junior:
   instrucciones concretas, sin jerga innecesaria.
5. **Scripts de un solo uso que TOCAN LA BASE: nunca dentro de `src/**/*.test.ts`.** Es
   el `include` de vitest (`vitest.config.ts`), así que cualquier `npm test` los vuelve a
   ejecutar. Pasó el 2026-08-07: un fichero temporal que creaba una temporada de prueba
   se ejecutó otra vez en una pasada de tests y creó una segunda sin que nadie lo pidiera.
   Para escribir en la base desde local, usar un script en `scripts/` y lanzarlo a mano.

## Decisiones técnicas clave (no cambiar sin preguntar)

Una línea por decisión con la conclusión operativa. El **porqué** de cada una,
íntegro y sin resumir, en [docs/decisiones.md](docs/decisiones.md). Si algo choca con
lo que aquí resumo, manda `decisiones.md`.

- **Identidad visual**: blanco y azul "gandiblues", tokens en español; `--tinta-suave: #556577` por accesibilidad AA, no aclarar. [→](docs/decisiones.md#identidad-visual)
- **Ancho y navegación**: `Contenedor` con tres medidas (`formulario`/`lectura`/`panel`) y `Cabecera` con la MISMA medida; nav lateral desde `lg`, inferior por debajo. [→](docs/decisiones.md#ancho-y-navegación)
- **Velocidad percibida**: `loading.tsx` en cada sección de `/club`, `BotonAccion` (`useFormStatus`) en `<form action>`, consultas en `Promise.all` y `sesionActual()` memoizada. [→](docs/decisiones.md#velocidad-percibida)
- **FEDA retirada entera**: importador, botones y `xlsx` fuera; `players.elo_feda` se queda como dato. Restaurar solo si vuelve a publicar (skill `restaurar-feda`). [→](docs/decisiones.md#feda-retirada-entera)
- **Cruce de nombres con pasada tolerante**: `buscarFicha` acepta prefijos de 4+ letras cuando UNA sola ficha cumple; palabras extra en `players.alias` (0035), invisibles. [→](docs/decisiones.md#cruce-de-nombres-con-pasada-tolerante)
- **Página Admin "ELO de los socios"**: `/club/admin/orden-fuerza` gestiona la lista de ELO (sync FACV y actualizar FIDE lado a lado); la RUTA no cambia por enlaces. [→](docs/decisiones.md#página-admin-elo-de-los-socios)
- **Los tres ELOs distintos**: (1) FIDE de clásicas al día = ELO real; (2) `force_order` = documento estático del Interclubs; (3) ELO del club APAGADO en pantalla desde el 2026-08-13. Al pintar un ELO, decir SIEMPRE cuál es. [→](docs/decisiones.md#los-tres-elos-distintos)
- **El hero pasa a 3D de verdad**: `@react-three/fiber` + `three`, extruyendo los SVG de la app. Chunk de ~1 MB en portada pública — vigilar si hace falta afinar peso. [→](docs/decisiones.md#el-hero-pasa-a-3d-de-verdad)
- **La perspectiva del hero se calcula a mano**: `src/lib/inicio/proyeccion.ts` con tests. Regla: si una falsa-3D no sale a la primera con `rotateX` anidado, se proyecta a mano. [→](docs/decisiones.md#la-perspectiva-del-hero-se-calcula-a-mano)
- **El hero es una escena**: mesa vista a 68°, luz + profundidad de campo, cámara ±2° con `gsap.quickTo`, título tras máscara, todo apagado con `prefers-reduced-motion`. [→](docs/decisiones.md#el-hero-es-una-escena)
- **La home pública: perspectiva CSS y scroll con inercia**: tablero con `rotateX` + piezas contra-rotadas ("billboards"), cámara que cambia con scroll, `perspective` en el padre, Lenis solo en pública enganchado al ticker de GSAP. [→](docs/decisiones.md#la-home-pública-perspectiva-css-y-scroll-con-inercia)
- **La home pública, animada con GSAP**: `Revelar`/`Parallax`/`TableroMiniatura` en `src/components/inicio/`. Trampas: anclar con `sticky` (no `pin`), `immediateRender: false` en `fromTo`. [→](docs/decisiones.md#la-home-pública-animada-con-gsap)
- **El botón del asistente es una preferencia**: `profiles.asistente_boton` (`derecha`/`izquierda`/`oculto`) + contadores en `uso_diario`/`uso_socios_dia` vía `registrar_asistente()`. "Oculto" esconde el botón, no el asistente. [→](docs/decisiones.md#el-botón-del-asistente-es-una-preferencia)
- **El botón del asistente se arrastra**: `profiles.asistente_x`/`asistente_y` en fracciones (0–1), umbral 8 px, pointer events con `setPointerCapture`, guardar al soltar. [→](docs/decisiones.md#el-botón-del-asistente-se-arrastra)
- **La ventana de la tabla de uso**: `VENTANAS` con `dias` (se pide de más) y `filas` (se corta); media de conectados dividida por los días que LLEVA el periodo. [→](docs/decisiones.md#la-ventana-de-la-tabla-de-uso)
- **El buscador de partidas busca también por mote**: `filtroSocioPorNombreOMote` en `src/lib/partidas/buscar.ts`; nombre oficial también se acepta; `alias` NO se busca. [→](docs/decisiones.md#el-buscador-de-partidas-busca-también-por-mote)
- **Los PGN anotados de Lichess no se podían reproducir**: `src/lib/partidas/pgn-legible.ts` quita variantes A MANO (paréntesis anidados) y junta comentarios seguidos; solo capa de lectura, el PGN guardado se queda entero. [→](docs/decisiones.md#los-pgn-anotados-de-lichess-no-se-podían-reproducir)
- **Ninguna columna se llama "Oficial"**: en `/club/orden-fuerza` el documento se llama "O. fuerza"; en "Por ELO", el estimado ocupa el hueco. `eloParaOrdenar` = FIDE → estimado → orden de fuerza. [→](docs/decisiones.md#ninguna-columna-se-llama-oficial)
- **El ELO FIDE, automatizado en el PC del propietario**: `scripts/elo-fide-programado.cmd` + tarea de Windows; el `.cmd` fija cwd y logs porque el Programador no hereda ni PATH ni cwd. Skill `actualizar-elo-fide-local`. [→](docs/decisiones.md#el-elo-fide-automatizado-en-el-pc-del-propietario)
- **Los tres ELOs de la FIDE y la variación pendiente**: `players.elo_fide_rapidas`/`_blitz`/`variacion_*`/`elo_fide_leido_en`; parser en `src/lib/import/fide-perfil.ts`; variación `real` (no `int`); null ≠ 0. Actualiza el script local. [→](docs/decisiones.md#los-tres-elos-de-la-fide-y-la-variación-pendiente)
- **La FACV sí tiene página por torneo**: portada embute `list_calendario.php`; parser en `facv-fichas-torneo.ts`, sincronizador como 5º paso del cron del viernes. **Lección**: "esta fuente no lo tiene" solo vale para LA fuente que se miró. [→](docs/decisiones.md#la-facv-sí-tiene-página-por-torneo)
- **Un torneo de fuera: info nuestra**: `/club/torneos/facv/[id]` con info64 + calendario FACV + ficha a mano (edita la JUNTA). Buscador info64 usa `name`, corta a 2 palabras; no traduce sitios valencianos. [→](docs/decisiones.md#un-torneo-de-fuera-info-nuestra)
- **Guarda de migración por forma**: comparar por FORMA (`like 'PEGA%'`, longitud mínima), nunca por igualdad con el texto del hueco (buscar-y-reemplazar lo cambiaría). El error dice cuántos caracteres se leyeron. [→](docs/decisiones.md#guarda-de-migración-por-forma)
- **El suizo repite y ahora se dice**: `rondasSinRepetir(n)` y `avisoDeSuizo(...)` avisan ANTES; `generarRonda` devuelve `aviso` (no `error`) cuando lleva revanchas. [→](docs/decisiones.md#el-suizo-repite-y-ahora-se-dice)
- **Los datos de fuera se refrescan solos, pero solo con la pestaña delante**: `RefrescarCada` llama a `router.refresh()` cada 60 s y se para con `visibilitychange`; al volver pide una vez ya. [→](docs/decisiones.md#los-datos-de-fuera-se-refrescan-solos)
- **Se lee la página pública de chesspairings, no su API**: `chesspairings-publico.ts` con `&lang=en` + `Accept-Language: en`, columnas por NOMBRE, join por `id_giocatore`. `CHESSPAIRINGS_API_KEY` se puede quitar. Motivo NO técnico: libertad para los organizadores. [→](docs/decisiones.md#se-lee-la-página-pública-de-chesspairings-no-su-api)
- **Un torneo del club: app o chesspairings**: se decide al crearlo (0050). En chesspairings, nuestra pantalla es SOLO LECTURA para rondas/resultados, pero las inscripciones y avisos siguen siendo nuestros (`puedeOrganizar = esJunta && organizadoEn === 'app'`). [→](docs/decisiones.md#un-torneo-del-club-app-o-chesspairings)
- **`CRON_SECRET` dentro de cada tarea de pg_cron**: no se lee al dispararse — si se rota, el endpoint rechaza con 401 EN SILENCIO. Al rotar, ponerlo en Vercel + `.env.local` + reejecutar la 0049 (skill `rotar-cron-secret`). [→](docs/decisiones.md#cron_secret-dentro-de-cada-tarea-de-pg_cron)
- **Tres pasadas por los resultados el fin de semana**: sábado 22:00, sábado 23:55 y domingo 14:00 (Madrid), vía pg_cron, `?forzar=resultados` (pasada CORTA). Horas en UTC calculadas para INVIERNO. [→](docs/decisiones.md#tres-pasadas-por-los-resultados-el-fin-de-semana)
- **El cron se mueve al domingo y repite el lunes**: sync FACV el domingo (día tras la jornada) y otra vez el lunes (por si las actas se suben tarde), el lunes ANTES de pedir disponibilidad. [→](docs/decisiones.md#el-cron-se-mueve-al-domingo-y-repite-el-lunes)
- **Lista de socios ≠ orden de fuerza**: `/club/socios` sale de `players` (puerta a las fichas); `/club/orden-fuerza` es el documento FACV (inmutable). `crearFichaManual` con casilla opcional para meter en el orden. Bajas no salen en ninguna. [→](docs/decisiones.md#lista-de-socios-sale-del-club-no-del-documento-facv)
- **El calendario de torneos entra en el cron del viernes**: `sincronizarTorneosFACVCore` va como paso 5 y ANTES de los enlaces (paso 6). No avisa por push — 168 al año sería ruido. [→](docs/decisiones.md#el-calendario-de-torneos-entra-en-el-cron)
- **Un socio no se borra, se da de baja**: `cambiarActivoSocio` escribe `players.activo`. Baja se esconde en todo menos en `/club/orden-fuerza` (con chapa "baja"). Chapa "ya no está" se ve en toda la app. [→](docs/decisiones.md#un-socio-no-se-borra-se-da-de-baja)
- **Crear una ficha a mano, también la junta**: `crearFichaManual` pasa a `esJunta`; formulario en `FormularioFichaManual.tsx`, usado por admin y `/club/solicitudes`. Va en `details` cerrado. [→](docs/decisiones.md#crear-una-ficha-a-mano-también-la-junta)
- **La junta gestiona a un socio desde su ficha**, no desde `/club/admin` (que hace `redirect`). `EditorMote` vive en `src/components/club/`. Solo `elo_otro` (estimado) editable a mano; el resto lo reescribe la sync. [→](docs/decisiones.md#la-junta-gestiona-a-un-socio-desde-su-ficha)
- **El mote se pide y la junta lo aprueba**: `players.apodo_solicitado` (0043); reglas puras en `src/lib/club/mote.ts`. `moteOcupado()` cuenta también los pedidos. Se avisa al pedir y al resolver. [→](docs/decisiones.md#el-mote-se-pide-y-la-junta-lo-aprueba)
- **El mote del club**: `players.apodo` (0041); **`nombreVisible()` / `nombreDeFila()` en `src/lib/club/nombre-socio.ts`** es EL único sitio que decide el nombre. `players.nombre` (oficial) NO se toca — es la clave del cruce de actas. [→](docs/decisiones.md#el-mote-del-club)
- **Ficha de pruebas para la segunda cuenta del propietario**: `players.de_prueba` (0040) — ficha de SOCIO sin permisos, no admin. Solo la ven admins; no entra en ranking del club ni en presencia. [→](docs/decisiones.md#ficha-de-pruebas-para-la-segunda-cuenta-del-propietario)
- **Partidas privadas y favoritas**: `games.privada` + tabla `game_favorites` (0039). Privacidad sostenida por RLS (policy `for all` se partió); favoritas por `profile_id`, no por ficha. [→](docs/decisiones.md#partidas-privadas-y-favoritas)
- **Borrar un torneo lo puede hacer quien lo creó** (`tournaments.creado_por`, 0038). No se puede borrar: (a) los de la FACV; (b) interno con resultados; (c) interno con mesa abierta. [→](docs/decisiones.md#borrar-un-torneo-quien-lo-creó)
- **Hora de ronda y aviso "empieza en una hora"**: `club_rounds.fecha_hora` (0037); push por pg_cron una hora antes + tarjeta cliente `ProximaRonda`. `aviso_enviado_en` se escribe ANTES con `is null` (reserva atómica). [→](docs/decisiones.md#hora-de-ronda-y-aviso-empieza-en-una-hora)
- **Dos rankings, no se llaman igual a propósito**: oficial (`/club/orden-fuerza`, manda en convocatorias) y del club (`/club/torneos/interno/ranking`, apagado). `force_order.elo_oficial` es NULLABLE — NaN sin fallar. [→](docs/decisiones.md#dos-rankings-no-se-llaman-igual-a-propósito)
- **Fuerza del jugador** = `force_order.elo_oficial` (RGC art. 52.1). IDs FACV en `src/lib/import/facv-config.ts`, cambiar cada temporada (skill `arrancar-temporada`). [→](docs/decisiones.md#fuerza-del-jugador)
- **Validador RGC** (`src/lib/validador/`): módulo puro, flag `permitirInversionDentroMargen` **estricto (false) por defecto**. No relajar sin confirmación FACV. [→](docs/decisiones.md#validador-rgc)
- **Publicar convocatoria**: única puerta = server action con re-validación completa + escritura service_role (trigger de blindaje en 0007). El cliente valida solo como ayuda. [→](docs/decisiones.md#publicar-convocatoria)
- **Acta por tableros** (0018): parser en `src/lib/import/chessresults.ts` con 26 tests; tablas anidadas se aplanan; se guarda desde nuestro punto de vista. NO reutiliza `lineups`/`board_results` ni toca marcador de `matches`. [→](docs/decisiones.md#acta-por-tableros)
- **Marcadores**: los resultados por tablero del capitán SIEMPRE prevalecen sobre el marcador FACV (`marcadorPreferido`). [→](docs/decisiones.md#marcadores)
- **Permisos en 3 capas**: RLS dura + actions re-verifican + UI oculta. Matriz en anexo del plan 1B (+ adenda 1C). [→](docs/decisiones.md#permisos-en-3-capas)
- **Rangos** (0011): 4 roles **acumulables** (admin/capitan/jugador/junta). Helpers `is_admin()`, `tiene_rol()`, `es_junta()`, `esta_vinculado()`. `tiene_rol()` DEBE ser `security definer` o hay recursión. [→](docs/decisiones.md#rangos)
- **Acceso al club**: registro solo con código (tabla `access_codes`, uno activo), cuentas creadas con `auth.admin.createUser` ya confirmadas. **Interruptor "Allow new users to sign up" de Supabase DEBE estar desactivado**. [→](docs/decisiones.md#acceso-al-club)
- **fide.com bloquea IPs de datacenter**: ELO FIDE solo desde local. Cron director en Vercel (diario 9:00 UTC, multiplexado); pg_cron en Supabase para lo que no cabe en Vercel Hobby. Sync semanal son tres pasos en cadena, orden = dependencia. [→](docs/decisiones.md#fidecom-bloquea-ips-de-datacenter)

## Estado y pendientes

En [ESTADO.md](ESTADO.md).

## Auditoría 2026-08-26

En [docs/auditorias/2026-08-26.md](docs/auditorias/2026-08-26.md).
