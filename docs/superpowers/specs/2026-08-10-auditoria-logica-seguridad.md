# Auditoría de lógica y seguridad (2026-08-10)

Cinco auditores en paralelo, solo lectura, sobre las cinco dimensiones de riesgo de la app.
Hallazgos verificados por el coordinador antes de escribir este documento; los que
dependían de configuración (no de código) se comprobaron **contra el proyecto real**.

Base auditada: commit `350e934` · 26 migraciones · 55+ policies · 20 ficheros de
server actions · 6 rutas API · suite 703 tests en verde.

## Resumen

| Dimensión | Crítico | Importante | Menor |
|---|:-:|:-:|:-:|
| Políticas RLS | **2** | 2 | 3 |
| Acciones con clave de servicio | 0 | 1 | 1 |
| Auth y rangos | 0 | 0 | 1 |
| Jugar en vivo | 0 | 3 | 1 |
| Entradas e inyección | 0 | 3 | 3 |

**Lo que está bien** (y conviene no romper): las 20 server actions comprueban identidad
y rol correctos ANTES de escribir y toman siempre el jugador de la sesión, nunca de un
argumento del cliente; el modelo de rangos es coherente en las cinco capas (SQL, sesión,
layouts, acciones, asistente) y en ningún sitio se decide en el cliente; las ocho vías
clásicas de trampa en las partidas en vivo (mover fuera de turno, forjar reloj o
resultado, jugada ilegal, aceptar retos ajenos, duplicar partida de torneo…) están
cerradas; el patrón del bug de la 0024 (columna sin cualificar) **no se repite** en
ninguna otra policy.

---

## Crítico 1 — El blindaje del histórico se puede rodear (RLS)

**Qué pasa.** El trigger `blindaje_lineups` (migración 0007) protege la tabla `lineups`
de encuentros ya jugados, pero **no a sus tablas hijas**: `lineup_boards` y
`board_results` no comprueban `matches.estado`. Y la policy `matches edita capitan`
(0004) deja la columna `estado` libre, así que un capitán puede poner su encuentro
jugado en `pendiente`, editar entonces la convocatoria (el trigger ya no aplica) y
devolverlo a `jugado`.

**Por qué importa.** La app promete que la convocatoria y los resultados de una jornada
disputada son registro histórico inmutable. Hoy esa promesa no la sostiene la base de
datos: un capitán puede reescribir tableros y resultados de una jornada pasada con su
sesión normal, sin pasar por el validador ni dejar rastro.

**Estado actual.** No hay ninguna convocatoria en la base (la de prueba se borró en la
0020), así que el daño posible hoy es nulo. **Se vuelve real en cuanto los capitanes
publiquen convocatorias de la 2027.**

**Arreglo propuesto.** Migración nueva: extender el blindaje a `lineup_boards` y
`board_results` (mismo criterio: si el `match` está jugado, no se toca salvo
`service_role`), y restringir en la policy de `matches` qué columnas puede cambiar un
capitán — `estado` y los marcadores no deberían estar entre ellas (para eso están las
acciones de servidor, que validan).

## Crítico 2 — El capitán puede escribir el marcador a mano (RLS)

La misma policy de `matches` permite fijar `marcador_propio`/`marcador_rival` directamente
desde una sesión de capitán, sin la validación del servidor y sin coherencia con los
resultados por tablero. Se arregla con la misma restricción de columnas del punto anterior.
(El auditor lo clasificó como Importante; se sube a Crítico porque comparte causa y
arreglo con el 1 y afecta a un dato que la app presenta como oficial.)

## Importante — Cualquiera puede escuchar las partidas en vivo (VERIFICADO)

Los canales de tiempo real (`partida-<id>`, `avisos-<ficha>`, presencia) no son privados
y no hay políticas sobre `realtime.messages`. **Comprobado empíricamente contra el
proyecto real**: un cliente con solo la clave pública, sin sesión y sin ficha, se
suscribió al canal de una partida y recibió el mensaje difundido.

Consecuencia: jugadas y chat de una partida son escuchables por cualquiera que conozca
(o adivine) el id, aunque la app cierre la lectura de las tablas a los no vinculados.
No permite escribir ni alterar nada.

**Arreglo.** Canales privados de Supabase Realtime (`private: true` al abrirlos) con
política sobre `realtime.messages` que exija socio vinculado; o, como mínimo, asumirlo
por escrito como aceptado (una partida del club no es un secreto) para que no se
descubra otra vez desde cero.

## Importante — Avisos falsos en el chat de la partida

La policy del chat no impide que un jugador inserte su propio `player_id` junto a un
`evento` no nulo, y la mesa pinta como aviso del sistema todo lo que trae `evento`. Se
puede fabricar un "el rival abandona" sin que el estado real cambie. Arreglo: exigir en
la policy que `evento` solo venga con `player_id` nulo (los eventos los pone el
servidor), y que la mesa distinga por `player_id === null`, no por `evento` presente.

## Importante — Silencios que esconden fallos

1. `cerrarEnElTorneo` marca el resultado en el torneo sin comprobar si falló el `insert`
   del PGN en `games`: el torneo queda con resultado y sin partida, sin avisar.
2. El cron semanal hace `fetch` con privilegio de servidor a URLs sacadas del HTML
   scrapeado de la FACV sin comprobar que el host sea `chess-results.com` (SSRF de baja
   probabilidad, pero sin guarda estructural).
3. La ruta `api/cron/sonda-fide` le falta el guard de secreto no vacío que sí tienen las
   otras tres (no escribe nada, solo diagnostica).

## Menores (para la pasada de pulido)

- El asistente reconstruye el historial que le manda el navegador sin firmarlo: se puede
  fabricar conversación previa falsa como vía de jailbreak de estilo. Los datos siguen
  protegidos por RLS y por el rango de la sesión, así que no hay fuga.
- Policy `retos: cancelar el mio` sólo fija `estado` en el `WITH CHECK`; el resto de
  columnas quedan reescribibles (sin cadena de explotación encontrada).
- `push_subscriptions`: el upsert por `endpoint` no comprueba que el endpoint fuera ya
  del mismo usuario.
- Sin freno por usuario en las acciones de escritura frecuente (spam de notificaciones).
- Parsers con ELO sin techo en algún camino; importación en lote de partidas que se salta
  los límites de `validarPartida`.
- El freno por IP confía en el primer valor de `x-forwarded-for`.

## Estado de los arreglos (2026-08-10)

**Migración 0027 aplicada y VERIFICADA EN VIVO.** Se montó un capitán temporal (ficha
libre + capitanía del equipo C, ambas retiradas al terminar) y se atacó desde su propia
sesión una jornada jugada real. Resultado:

| Ataque desde sesión de capitán | Antes | Ahora |
|---|---|---|
| Reabrir la jornada jugada (`jugado → pendiente`) | posible | **bloqueado** |
| Escribir el marcador a mano | posible | **bloqueado** |
| Cambiar la ronda (identidad de la jornada) | posible | **bloqueado** |
| Cambiar la sede (debe seguir pudiendo) | permitido | **permitido** ✔ |
| Mensaje normal en su propia partida (debe poder) | permitido | **permitido** ✔ |
| El MISMO mensaje pero con `evento` (aviso falso) | posible | **bloqueado** |

Las dos últimas filas son la prueba aislada de que actúa la regla nueva y no otra
condición: mismo autor, misma partida, solo cambia `evento`.

**Lo que no se pudo probar en vivo**: los triggers de `lineup_boards`/`board_results`, porque
hoy no hay ninguna convocatoria en la base (0 filas). Su lógica es idéntica a la del
trigger de `matches` ya verificado y quedó revisada línea a línea; conviene repetir la
prueba con la primera convocatoria real de la 2027.

**Aviso falso por difusión** (la cara "en vivo" del hallazgo del chat): cerrado también en
el cliente — un mensaje difundido sin autor ya no se pinta, dispara una relectura de la
base, que es donde solo escribe el servidor. De paso se arregló que el servidor difunde
`player_id` y el navegador `playerId`, y solo se miraba una de las dos formas.

**Los tres "Silencios" cerrados (2026-08-10, segunda tanda)**: (1) `cerrarEnElTorneo`
traza cuando el PGN no entra en el repositorio — el resultado se apunta igual, pero "el
torneo tiene resultado y no partida" ya no es indistinguible de que nadie subiera nada;
(2) los enlaces scrapeados del HTML de la FACV solo se siguen si apuntan de verdad a
chess-results.com (`esUrlDeChessResults` en red.ts, con tests; se comprueba en la
clasificación y en las actas); (3) `sonda-fide` lleva la misma guarda de CRON_SECRET
vacío que las otras rutas de cron.

**Pendiente de decisión del propietario**: canales de tiempo real privados (hoy cualquiera
con la clave pública puede ESCUCHAR una partida; escribir no altera nada). Y los menores
de la lista de abajo, para la pasada de pulido.

## Informes completos

`.superpowers/auditoria/` (gitignorado): `rls.md`, `acciones.md`, `auth-rangos.md`,
`jugar-vivo.md`, `entradas.md` — con fichero:línea y escenario de explotación de cada
hallazgo.
