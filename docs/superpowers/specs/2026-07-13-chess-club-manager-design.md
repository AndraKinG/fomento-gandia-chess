# Chess Club Manager — Fomento de Gandia · Documento de diseño

**Fecha:** 2026-07-13
**Estado:** Aprobado en brainstorming con el propietario del proyecto (J. Ribes, admin del club)
**Alcance de este documento:** visión completa del producto y diseño detallado de la Fase 0 (cimientos) y Fase 1 (Interclubs, MVP). Las fases 2–4 se describen a nivel funcional y tendrán su propia spec detallada cuando llegue su turno.

---

## 1. Visión

PWA móvil-first para el club de ajedrez **Fomento de Gandia**, donde cada jugador tiene su cuenta vinculada a su ficha federativa. Crece por módulos; cada fase termina con la app desplegada y usable.

| Fase | Módulo | Resumen |
|---|---|---|
| 0 | Cimientos | Fichas de jugadores, cuentas, roles, ELO automático, PWA + push |
| 1 | Interclubs (MVP) | Temporadas, equipos, jornadas, disponibilidad, convocatorias con validador reglamentario, resultados, clasificaciones |
| 2 | Comunidad y coches | Posts con notificaciones, "¿quién va?", organización de coches para torneos y jornadas |
| 3 | Base de datos de partidas | Registro personal (datos + PGN opcional con tablero interactivo) y base global del club filtrable por rival |
| 4 | Torneos de club + ELO interno | Organizador de torneos internos (suizo/round-robin) y ELO propio del club |

**Objetivo temporal:** Fases 0+1 operativas antes del inicio del Interclubs (enero).

**Coste:** 0 €/mes (planes gratuitos de Vercel y Supabase). Dominio propio opcional (~10 €/año).

---

## 2. Usuarios y roles

- **Admin** (J. Ribes): gestiona todo — orden de fuerza, temporadas, equipos, capitanes, aprobación de vinculaciones.
- **Capitán**: rol ligado a un equipo y una temporada. Gestiona disponibilidad, convocatorias y resultados de su equipo.
- **Jugador**: marca su disponibilidad, ve convocatorias, gestiona su perfil y (fases futuras) sus partidas.

**Registro — "reclama tu ficha":** el admin importa el orden de fuerza del club (todos los federados) al crear la temporada; las fichas de jugador existen desde el día uno aunque el jugador no se registre. Al registrarse con email (o Google), el jugador busca su nombre en la lista y solicita vincularse a su ficha; el admin aprueba la vinculación. Esto permite convocar a jugadores que aún no usan la app.

---

## 3. Modelo de datos (cimientos)

Entidades principales y relaciones:

- **Jugador (ficha)** — nombre, ID FIDE, ID FEDA, ELO FIDE, ELO FEDA, ELO autonómico/extranjero (opcional), foto, estado (activo/inactivo), marcadores de excepción reglamentaria (joven de tecnificación autorizado / mayor de 75 autorizado, art. 52.3.d-e). Existe sin cuenta de usuario. **Fuerza del jugador = max(FEDA, FIDE)**; sin ELO → autonómico/extranjero; sin ninguno → 1400 ficticio (art. 52.1-52.2).
- **Usuario (cuenta)** — email/Google vía Supabase Auth; vínculo 1:1 con Jugador tras aprobación; preferencias de notificación.
- **Rol** — admin | capitán(equipo, temporada) | jugador.
- **Temporada** — p. ej. "Interclubs 2026". Contiene el **orden de fuerza** de esa temporada: lista ordenada de jugadores con posición numérica y soporte de posiciones **bis** (7bis va tras el 7; art. 50). El orden es de la temporada, no del jugador (se fija con el ELO de enero y no cambia durante el año). Ampliable con bises hasta el 50% de rondas, nunca modificable (art. 50.1).
- **Equipo** — pertenece a temporada: nombre (A/B/C), categoría/liga, **margen ELO de su categoría** (ver §5), capitanes, nº de tableros (8 o 4).
- **Jornada (encuentro)** — pertenece a equipo: ronda, fecha/hora, rival, local/visitante, dirección del local.
- **Disponibilidad** — jugador × jornada: disponible / no disponible / duda / sin responder.
- **Convocatoria** — alineación de una jornada: hasta N tableros ordenados, estado borrador → publicada. Push a convocados al publicar. Color de cada tablero calculado automáticamente (art. 59): local = blancas en tablero 1 y alternando; visitante = negras en tablero 1.
- **Resultado** — por tablero: 1 / ½ / 0; marcador del encuentro calculado. Clasificación de liga por equipo (importada de chess-results/FACV; edición manual siempre disponible como respaldo).

Fases futuras (partidas, posts, coches, torneos internos, ELO interno) se apoyan sobre Jugador/Usuario sin modificar lo anterior.

---

## 4. Flujos y pantallas del MVP

- **Inicio (jugador):** próxima jornada de sus equipos, disponibilidad pendiente, su convocatoria (tablero + color) si está convocado.
- **Disponibilidad:** lista de próximas jornadas, tres botones (✅ / ❌ / 🤔). Tiempo real para el capitán.
- **Convocatoria (capitán):** lista de disponibles ordenada por orden de fuerza con ELO; arrastrar a tableros 1–N; **validación en vivo** (ver §5) con mensajes que citan el artículo; aviso de conflictos de misma fecha/misma sede; botón Publicar → push a convocados.
- **Resultados (capitán):** 1/½/0 por tablero; marcador y clasificación se actualizan.
- **Equipo/Liga:** clasificación, calendario, historial de encuentros con alineaciones.
- **Panel de admin:** importar/editar orden de fuerza (pegar lista o subir fichero), añadir bises, aprobar vinculaciones, nombrar capitanes, crear temporada/equipos/calendario, marcar excepciones reglamentarias.

**Estilo visual:** interfaz tipo app nativa, móvil-first, identidad del club (escudo/colores), tarjetas grandes, ELO siempre visible junto al nombre, detalles de ajedrez cuidados.

---

## 5. Validador de alineaciones (corazón del MVP)

Módulo **puro e independiente** (sin BD ni UI). Entrada: orden de fuerza de la temporada + categoría del equipo + alineación propuesta + convocatorias del club en la misma fecha/sede + historial de alineaciones de la temporada. Salida: lista de infracciones `{tablero, regla, artículo, mensaje}` y avisos no bloqueantes.

Reglas implementadas (RGC FACV, texto de referencia en `docs/referencia/rgc-facv-2018-texto-extraido.txt`):

1. **Orden estricto dentro de la alineación** (art. 51.2): nunca un jugador detrás de otro con orden de fuerza superior. N-bis inmediatamente detrás de N.
2. **Margen ELO por categoría** (art. 52.3): División de Honor ≥100; 1ª/2ª Autonómica ≥200; resto sin margen. Un jugador no puede ir por delante de otro que le supere en ese margen o más. Exenciones marcadas en ficha (tecnificación, +75 autorizados). La fuerza es max(FEDA, FIDE).
3. **Bloques de titulares** (art. 51.1): 1–8 solo equipo A; 9–16 titulares del B, pueden subir al A para cubrir ausencias; 17–24 del C, etc. Nunca alinearse en equipo inferior al propio. Con equipos a menos de 8 tableros, los bloques se ajustan (art. 51.4).
4. **Límites por equipo en divisiones autonómicas** (art. 51.5.c): equipo A solo 1–18 (contando bises); equipo B solo 9–28 menos uno por bis intercalado (si el club solo tiene dos equipos, del 9 al final); C y sucesivos sin restricción.
5. **Regla del 50%** (art. 51.3): titular que juegue ≥50% de rondas en equipos superiores no puede volver al inferior. El validador lleva el contador y **avisa antes** de que un jugador quede bloqueado ("si convocas a X con el A, ya no podrá volver al B").
6. **Máximo 2 bises alineados por encuentro** (art. 50.3).
7. **Misma fecha** (arts. 54-55): un jugador no puede constar en dos convocatorias de la misma fecha.
8. **Misma sede** (art. 52.4): equipos del club que jueguen de locales el mismo día en el mismo local se validan como un solo equipo (orden de fuerza cruzado).

Toda infracción se muestra en vivo en la pantalla de convocatoria con el motivo exacto y el artículo. Consecuencia real de un error: encuentro perdido 0–8 (art. 56) — por eso este módulo tendrá la mayor cobertura de tests de la app.

**Colores** (art. 59): local → blancas en tableros impares; visitante → blancas en pares. Cada convocado ve "Tablero 3 · Negras".

---

## 6. Fuentes de datos externas (verificadas)

| Dato | Fuente | Mecanismo | Frecuencia | Fiabilidad |
|---|---|---|---|---|
| ELO FIDE | ratings.fide.com/download_lists.phtml | XML oficial descargable | Mensual (cron) | Alta |
| ELO FEDA | feda.org — Lista Elo FEDA | Excel mensual descargable | Mensual (cron) | Alta |
| Calendario/resultados interclubs | facv.org/appwebfacv (páginas públicas) | Parser HTML | Semanal en temporada (cron) | Media-alta |
| Clasificaciones/alineaciones por grupo | chess-results.com (plataforma oficial FACV) | Parser HTML / export Excel | Semanal en temporada | Media-alta |
| Orden de fuerza del club | Publicación FACV anual | Importación asistida por el admin (pegar/subir) | 1 vez por temporada | Manual asistido |

**Principio de respaldo:** toda importación automática tiene su equivalente de edición manual en la UI. Si un parser se rompe por un rediseño web, la operativa del club no se detiene.

Verificado en la web FACV (temporada 2026): Fomento de Gandía en 1ª Autonómica Sur (margen 200), B en 1ª Prov. Valencia Sur y C en 2ª Prov. 8T Valencia Sur 1 (ambos sin margen ELO, orden estricto).

---

## 7. Arquitectura técnica

- **Frontend + backend:** Next.js (App Router, React, TypeScript) desplegado en Vercel (plan gratuito).
- **Datos/Auth:** Supabase — Postgres, Auth (email + Google), Storage (fotos), Realtime (disponibilidad en vivo).
- **PWA:** instalable, Web Push (VAPID) para convocatorias, jornadas y (fase 2) posts.
- **Cron jobs:** Vercel Cron → descarga FIDE (mensual), FEDA (mensual), sync FACV/chess-results (semanal en temporada).
- **Seguridad:** Row Level Security en Postgres — jugador edita solo lo suyo; capitán solo su equipo; admin todo. Datos personales mínimos (nombre, email, ELOs públicos).
- **Validador:** paquete TypeScript puro (`lib/validador-alineaciones`), testeado con Vitest contra casos del reglamento real.

---

## 8. Estrategia de pruebas y verificación

- **Tests unitarios exhaustivos del validador** (prioridad máxima): casos por cada artículo, incluidos bises, regla del 50%, misma sede, márgenes 100/200/sin margen, excepciones.
- **Tests de lógica de negocio:** cálculo de colores, marcadores, estados de convocatoria.
- **Verificación visual:** cada pantalla se comprueba en navegador con viewport móvil antes de cerrar su tarea.
- **Cierre de fase:** despliegue real + prueba de aceptación con el admin antes de empezar la fase siguiente.
- Metodología: TDD para lógica crítica; plan de implementación por tareas pequeñas y revisables.

---

## 9. Fases futuras (resumen funcional, spec pendiente)

- **Fase 2 — Comunidad y coches:** posts/anuncios con suscripción y push; eventos con "¿quién va?"; coches (conductor, plazas, hora, punto de salida, asignación de pasajeros). Aplica a torneos externos y a jornadas de interclubs como visitante.
- **Fase 3 — Partidas:** registro personal (rival, fecha, ELOs, color, resultado, torneo, apertura, notas + PGN opcional con tablero reproducible); base global del club con filtro por rival.
- **Fase 4 — Torneos de club + ELO interno:** creación de torneos (suizo/round-robin), emparejamientos automáticos, rondas, clasificación; ELO interno del club calculado con las partidas de torneos internos, con ranking propio. Las partidas de estos torneos alimentan también la base de datos de la fase 3.

---

## 10. Decisiones tomadas (registro)

1. MVP = Interclubs; stack = Next.js + Supabase + Vercel (opción A).
2. Móvil-first PWA con push real.
3. Coste objetivo 0 €/mes.
4. Registro con "reclama tu ficha" + aprobación del admin.
5. Fuerza del jugador = max(FEDA, FIDE) conforme al art. 52.1 (obliga a importar ambos ELOs).
6. Margen ELO configurable por categoría del equipo (100/200/ninguno).
7. Partidas (fase 3): datos siempre, PGN opcional.
8. Importaciones automáticas siempre con respaldo manual.
