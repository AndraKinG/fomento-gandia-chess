# Fase 1 — Diseño gandiblue + Módulo Interclubs · Documento de diseño

**Fecha:** 2026-07-14
**Estado:** Aprobado en brainstorming con el propietario (J. Ribes)
**Base:** extiende la spec general `2026-07-13-chess-club-manager-design.md` (§4 flujos, §5 validador, §6 fuentes). La Fase 0 está en producción (https://fomento-gandia-chess-swart.vercel.app).

---

## 1. Alcance

Dos bloques secuenciales en un mismo plan:

1. **Bloque A — Sistema de diseño gandiblue**: identidad visual completa con doble tema y re-vestido de todas las pantallas de la Fase 0.
2. **Bloque B — Módulo Interclubs**: equipos, calendario, disponibilidad, convocatorias con validador RGC, resultados y clasificaciones, con importadores de la web oficial FACV.

---

## 2. Bloque A — Sistema de diseño

**Identidad**: blanco y azul ("gandiblues"). Sin escudo por ahora → icono provisional ♞ azul; se sustituirá cuando exista imagen.

**Doble tema** (sigue `prefers-color-scheme` + conmutador manual en Perfil, persistido):
- **Claro "Mediterráneo"**: acentos celeste #0ea5e9 → azul #0369a1 (degradado en cabeceras), fondos blanco/#f0f9ff, bordes #bae6fd, texto #0c4a6e.
- **Oscuro "Azul profundo"**: fondo #0a1628/#0f2137, tarjetas #132c4d con borde #1e3a5f, acentos #60a5fa/#2563eb, texto #e2ecf7.

**Implementación**: tokens CSS centralizados (variables + config Tailwind), tema aplicado por clase en `<html>` con script anti-flash. Biblioteca de componentes propios en `src/components/ui/`: tarjeta de jornada, chip de ELO, chip tablero/color (♟ Blancas/Negras), botones de disponibilidad (✅/❌/🤔), banner de estado (ok/error/aviso), cabecera de página, estado vacío con personalidad, lista de jugadores con posición OF.

**Re-vestido Fase 0**: login, registro, home, perfil, vincular, admin (índice, orden de fuerza, vinculaciones, ELO, push) — ninguna pantalla conserva el aspecto actual. La barra de navegación pasa a 4 pestañas: Inicio · Equipos · Perfil · Admin (esta última solo admins/capitanes según permisos).

---

## 3. Bloque B — Modelo de datos nuevo

Sobre las tablas de Fase 0, sin modificarlas (solo migraciones aditivas):

- **teams** — season_id, nombre (A/B/C), categoría (texto libre: "1ª Autonómica Sur"...), margen_elo (100 | 200 | null = sin margen), num_tableros (8|4).
- **team_captains** — team_id × player_id: el capitán gana permisos de gestión SOLO sobre su equipo (disponibilidad, convocatoria, resultados). Un jugador puede capitanear varios equipos; el admin nombra/quita.
- **matches (jornadas)** — team_id, ronda, fecha_hora, rival, es_local, sede (texto), estado (pendiente/jugado).
- **availability** — match_id × player_id: disponible | no_disponible | duda | (sin fila = sin responder). El jugador solo edita la suya; visible para capitanes/admin.
- **lineups (convocatorias)** — match_id, estado (borrador | publicada); **lineup_boards**: lineup_id, tablero (1-8), player_id, color (calculado art. 59: local→blancas impares). Publicar = push a convocados + visible para todo el club.
- **board_results** — lineup_board_id: resultado (1 | 0.5 | 0) desde el punto de vista del jugador del club. Marcador del encuentro calculado.
- **standings** — team_id: posición, club, puntos (sincronizado FACV; editable por admin como respaldo).

RLS: lectura de todo lo anterior para autenticados; escritura de disponibilidad solo el propio jugador; convocatorias/resultados solo capitanes de ese equipo (vía tabla team_captains) y admin; teams/matches/standings escritura admin (+ capitán para resultados de su equipo).

---

## 4. Bloque B — Importadores FACV (con respaldo manual siempre)

1. **Orden de fuerza oficial** — `https://www.facv.org/appwebfacv/public/staff/of_club/of_publico.php?id=56` (id de club configurable). Parsea por jugador: posición OF (incl. bises), nombre, **ELO oficial FACV** e ID FIDE (del enlace a ratings.fide.com). Botón admin "Sincronizar con FACV": crea/actualiza fichas y orden de fuerza de la temporada activa; las altas nuevas (bises) se incorporan. **Sustituye el pegado manual** (que se mantiene como respaldo). Estructura HTML de referencia: `<tr data-search=...>` con `badge` (nº OF), `.cut` (nombre), `td.col-elo`, enlace `ratings.fide.com/profile/{id}`.
2. **Calendario** — `calendario_publico.php?id={temporada}&club_id=...`: jornadas de los equipos del club (ronda, fecha, rival, local/visitante y sede si figura). Importación admin al crear la temporada + re-sincronizable.
3. **Resultados y clasificación** — sincronización semanal: marcadores de encuentros y tabla de posiciones de cada grupo desde la web FACV; los resultados por tablero anotados por el capitán prevalecen (la sync solo completa/corrige lo vacío o discrepante, marcando discrepancias para revisión del admin).

**Fixtures reales**: cada parser se testea contra HTML real descargado de facv.org (método validado en Fase 0). facv.org es accesible desde Vercel (verificado). Si la FACV rediseña su web, la operativa manual cubre el hueco.

---

## 5. Bloque B — Flujos

**Disponibilidad (automática con push):**
- Lunes (cron): push a todos los jugadores activos con jornada esa semana → "¿Puedes jugar el sábado?" con deep-link a la pantalla de disponibilidad (✅/❌/🤔, un toque).
- Jueves (cron): recordatorio SOLO a quien no respondió.
- El capitán ve su plantilla en tiempo real (respondido/pendiente).

**Cron director de orquesta** (límite Vercel Hobby = 2 crons): UN cron diario que según el día de la semana ejecuta: lunes → petición de disponibilidad; jueves → recordatorio; viernes → sync FACV (resultados/clasificación). Fuera de temporada no hace nada (comprueba si hay jornadas próximas).

**Convocatoria (capitán):** lista de disponibles ordenada por OF con ELO oficial → asignar a tableros → validación EN VIVO (motivo + artículo RGC por infracción, aviso preventivo de la regla del 50%, cruces misma fecha/sede) → Publicar → push a convocados ("Convocado con el B · Tablero 3 · ♟ Negras · Sábado 17:00 en Silla") → visible para todo el club. Editable tras publicar (re-push solo a afectados).

**Resultados (capitán):** 1/½/0 por tablero al acabar; marcador y clasificación se actualizan al momento.

**Validador:** según spec base §5 (arts. 50-59 RGC, 8 reglas). Novedad única: **fuerza = ELO oficial del orden de fuerza FACV**; fallback `max(FEDA, FIDE)` (módulo `fuerza` de Fase 0) para jugadores aún no publicados. Regla del 50% con contador de alineaciones por jugador/equipo de la temporada.

**Pantallas:** Inicio renovado (próxima jornada + disponibilidad pendiente + tu convocatoria), Equipos (calendario/clasificación/historial por equipo), Jornada (convocatoria, colores, resultados, marcador), Convocatoria del capitán, Resultados del capitán, Admin ampliado (temporada/equipos/capitanes, sincronizar FACV, excepciones reglamentarias 52.3.d-e).

---

## 6. Pendientes heredados que este plan absorbe

- SMTP propio (Resend u otro gratuito) antes de invitar al club: emails en español y sin límite 2/hora. Tarea al final del plan (gate usuario: crear cuenta).
- Migrar `xlsx` a la distribución segura de cdn.sheetjs.com (CVEs conocidos).
- README con setup, orden de migraciones y checklist de deploy.
- Renombrar `middleware.ts` → convención `proxy` de Next 16 (aviso de deprecación).
- Borrar usuarios/jugadores de prueba antes del lanzamiento real al club.

## 7. Fuera de alcance (fases futuras)

Posts/coches (Fase 2), base de datos de partidas y tablero blanquiazul (Fase 3), torneos internos y ELO de club (Fase 4). El diseño del tablero blanco/azul queda anotado para la Fase 3.

## 8. Decisiones registradas

1. Doble tema: claro Mediterráneo / oscuro Azul profundo, por preferencia del sistema + conmutador.
2. Disponibilidad: push automático lunes + recordatorio jueves a no-respondidos.
3. Resultados: capitán anota (inmediatez) + sync FACV semanal (corrección/clasificación).
4. Fuerza del validador: ELO oficial FACV; max(FEDA,FIDE) como fallback.
5. Un solo cron diario multiplexado por día de semana (límite Hobby).
6. Capitanes: rol por equipo+temporada vía team_captains, nombrados por el admin.
