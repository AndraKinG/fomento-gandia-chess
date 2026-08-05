# Plan — Fase 2: torneos y coches

**Spec:** `docs/superpowers/specs/2026-08-05-fase-2-torneos-coches-design.md`, aprobada por el propietario el 2026-08-05.

**Decisiones de las preguntas abiertas §10, cerradas al aprobar la spec:**

1. Crear torneos a mano y marcarlos "de interés": **solo admin**. Fácil de abrir a capitanes después si hace falta.
2. Ofrecer coche: **solo quien va** al torneo (`voy` o `duda`). Ofrecer coche a un torneo al que no vas no tiene sentido.
3. Punto de recogida: **por coche, en texto libre**. Cubre tanto "en el local a las 8:30" como "te recojo en tu casa" sin inventar estructura.
4. Torneos pasados: **se ven en un histórico**, porque en la Fase 3 las partidas se vincularán a su torneo.

---

## Tareas — TODAS COMPLETADAS (2026-08-05)

| # | Tarea | Estado |
|---|---|---|
| 1 | Migración `0010_torneos_coches.sql` | ✅ aplicada y verificada por comportamiento |
| 2 | Parser del calendario de torneos FACV + tests | ✅ 19 tests contra fixture real |
| 3 | Módulo de reglas de coches + tests | ✅ 39 tests |
| 4 | Sincronizador `facv-torneos-apply.ts` | ✅ 147 torneos reales importados |
| 5 | Server actions de asistencia y coches | ✅ |
| 6 | `/club/torneos` y `/club/torneos/[id]` | ✅ |
| 7 | `/club/admin/torneos` | ✅ |
| 8 | Push de los tres avisos | ✅ incluido en la tarea 5 |
| 9 | Próximos torneos en la home | ✅ |
| 10 | Verificación de los criterios de aceptación | ✅ 7 de 8; ver abajo |

### Estado de los criterios de aceptación

| # | Criterio | Cómo se comprobó |
|---|---|---|
| 1 | El parser excluye Interclubs y conserva el resto de lo organizado por la FACV | Tests contra fixture real: 23 torneos, 11 de la FACV conservados |
| 2 | Re-sincronizar no duplica ni pisa lo que escribió el admin | En vivo: 147 filas, segunda sync 0 creados / 147 actualizados, los 5 campos manuales intactos |
| 3 | Un coche nunca acepta más pasajeros que plazas, ni con escrituras concurrentes | En vivo: dos peticiones simultáneas a la última plaza → entra 1 de 2 |
| 4 | Nadie en dos coches del mismo torneo | En vivo: rechazado por el índice único |
| 5 | Apuntarse pone la asistencia en `voy`; `no_voy` libera la plaza y avisa | Tests del módulo puro |
| 6 | Borrar un coche deja a los pasajeros sin plaza pero con su asistencia | Tests del módulo puro |
| 7 | Un socio sin ficha aprobada no ve ningún torneo | En vivo con JWT real: 0 filas en las 4 tablas |
| 8 | Los tests siguen pasando | 257 tests |

**Lo único que no se ha podido verificar: el aspecto real de las pantallas en un
móvil.** Requiere sesión y no hay acceso a la contraseña del propietario. La
lógica y los permisos sí están verificados contra la base de datos real con JWT
de socio, incluidas las nueve escrituras que deben fallar (marcar la asistencia
de otro, apuntar a otro en un coche, ofrecer coche en nombre de otro, borrar el
coche de otro y editar un torneo sin ser admin).

## Huecos de la spec encontrados al implementar

1. **Un conductor con pasajeros podía decir "no voy"** y dejaba el coche en pie
   sin nadie que conduzca. Ahora se bloquea con un mensaje que le pide borrar el
   coche a propósito; si el coche está vacío, sí puede y el coche se retira solo.
2. **El calendario de la FACV repite los torneos que cruzan de mes**, porque está
   partido en una tabla por mes. 10 de las 157 filas de 2026. Se deduplican en el
   parser; antes el resumen del panel decía "157 actualizados" sobre 147 filas.
3. **Filtrar Interclubs por organizador habría borrado un tercio del
   calendario**: 53 de los 168 torneos del año los organiza la FACV y casi todos
   interesan al club. El filtro va por nombre.

**Orden de ejecución:** las tareas 2 y 3 son módulos puros, no dependen de la base de datos y se pueden hacer y testear enteras antes de tocar nada. Se empieza por ahí: es donde está la lógica que importa y donde los tests dan valor real. La 1 va en paralelo (la escribo yo, la aplicas tú) y desbloquea el resto.

---

## 1. Migración `0010_torneos_coches.sql` · gate usuario

Tablas `tournaments`, `tournament_attendance`, `cars` y `car_seats` según §5 de la spec, con RLS que exige `esta_vinculado() or is_admin()` en lectura, escritura de asistencia solo del propio jugador (misma forma que la policy de `availability`), y escritura de un coche solo de su conductor o del admin.

Tres puntos donde la base de datos tiene que hacer de barrera, no la aplicación:

**a) Un coche no puede aceptar más pasajeros que plazas.** El criterio de aceptación 3 exige que aguante **dos socios apuntándose a la vez**, y eso una comprobación en la server action no lo garantiza: entre el `select` de plazas libres y el `insert` cabe otra petición. Se resuelve con un **trigger `before insert on car_seats`** que cuenta las plazas ocupadas y lanza excepción si se pasa — mismo patrón que el trigger de blindaje de la migración 0007.

**b) Nadie en dos coches del mismo torneo.** No se puede expresar con un índice único sobre `car_seats(car_id, player_id)`, porque la unicidad tiene que ser por **torneo**, que abarca varios coches. Solución: **desnormalizar** `tournament_id` y `match_id` en `car_seats`, rellenados por el mismo trigger a partir del coche, con índices únicos parciales `(tournament_id, player_id)` y `(match_id, player_id)`. Es redundancia deliberada y documentada: el trigger la mantiene coherente y a cambio la regla la garantiza el motor.

**c) `plazas` nunca por debajo de las ocupadas.** `check (plazas > 0)` no basta; hace falta un **trigger `before update on cars`** que rechace bajar `plazas` por debajo de los asientos ya ocupados.

Verificación al final del fichero, como en 0009: que las 4 tablas existen, que los 3 triggers están y que las policies nuevas exigen `esta_vinculado`.

## 2. Parser del calendario de torneos · `src/lib/import/facv-calendario-torneos.ts`

Entrada: HTML. Salida: `{ nombre, fechaInicio, fechaFin, lugar, organizador }[]`.

Todo lo que la fixture ya demostró que hace falta, y que los tests deben cubrir uno a uno:

- Leer **solo** las tablas `table-hover`, ignorando las rejillas `table-bordered`.
- Extraer el nombre **de la segunda celda**, descartando insignias (`★ Oficial`) y sin caer en el `<span>` de la última celda (`⛔ A nivel Autonómico`).
- **Excluir por nombre** lo que empiece por `Interclubs` (incluida `Interclubs. Ronda 6 Aplazada`), y **conservar** el resto de lo organizado por la FACV.
- Fechas `dd/mm/yyyy` → ISO. `fechaFin` siempre presente.
- Decodificar entidades (`L&#039;olleria` → `L'olleria`) y limpiar comas sobrantes del lugar (`"Olleria,"` → `"Olleria"`).

Tests contra `fixtures/facv-calendario-torneos.html`: 34 filas, cuenta de Interclubs excluidos, y un caso por cada rareza de la lista.

## 3. Reglas de coches · `src/lib/torneos/coches.ts`

Módulo puro, sin BD ni UI, como `src/lib/validador/`. Funciones sobre estructuras en memoria:

- `plazasLibres(coche, asientos)` — nunca negativo.
- `puedeApuntarse(socio, coche, asientos, asistencias)` — con el motivo del rechazo cuando no puede: coche lleno, ya va en otro coche de ese torneo, es el conductor de otro coche, ya es el conductor de este.
- `efectosDeApuntarse(...)` / `efectosDeCambiarAsistencia(...)` / `efectosDeBorrarCoche(...)` — devuelven la lista de cambios y de avisos a enviar, **sin ejecutarlos**. Así las reglas 2, 3 y 5 de la spec (apuntarse implica ir, decir que no libera plaza, borrar el coche no toca la asistencia) se testean sin base de datos.
- `resumenTransporte(torneo, asistencias, coches, asientos)` — quién va sin plaza, plazas libres totales, y si falta sitio.

Es el corazón de la fase: si esto está bien, las server actions son un envoltorio fino.

## 4. Sincronizador · `src/lib/import/facv-torneos-apply.ts`

Patrón de los otros `*-apply.ts`: **sin gate de autorización dentro** (lo comprueba quien llama) y con el comentario de aviso correspondiente.

Clave de deduplicación `(nombre_normalizado, fecha_inicio)`. En un torneo que ya existe actualiza solo `lugar` y `organizador`; **nunca pisa** `hora`, `ritmo`, `info_extra`, `url_bases` ni `de_interes`. Devuelve un resumen `{ creados, actualizados, ignorados }` para poder mostrarlo en el panel.

## 5. Server actions · `src/app/torneos/actions.ts`

`marcarAsistencia`, `ofrecerCoche`, `apuntarseACoche`, `bajarseDeCoche`, `borrarCoche`, `editarCoche`. Cada una: comprueba sesión, aplica las reglas del módulo 3, escribe, y dispara los push de la tarea 8 **sin que un fallo de push tumbe la operación**.

`ofrecerCoche` exige que el socio vaya al torneo (decisión 2 de arriba).

## 6. Pantallas de socio

`/torneos` — próximos torneos de interés con su "¿voy?" en la tarjeta, enlace al calendario completo y al histórico.
`/torneos/[id]` — ficha, "¿Vas?" con `BotonesDisponibilidad` reutilizado, quién va, y el bloque de coches con plazas libres y botón de apuntarse.

## 7. `/admin/torneos`

Sincronizar con la FACV mostrando el resumen, marcar de interés, rellenar hora/ritmo/info/bases, crear a mano, y el resumen de transporte de cada torneo próximo. Enlace nuevo en el índice de `/admin`.

## 8. Push

Los tres de §8 de la spec, con `enviarPushAMuchos`: torneo marcado de interés → al club; coche ofrecido → a quien va y no tiene plaza; coche borrado → a los que se quedan sin sitio.

## 9. Home

Cuando no hay jornada de Interclubs próxima, mostrar el próximo torneo de interés en lugar del estado vacío. Es lo que hace que la app se abra de abril a enero.

## 10. Verificación

Los 8 criterios de la spec. Dos exigen algo más que mirar la interfaz:

- **Criterio 3 (concurrencia):** lanzar dos `insert` simultáneos sobre la última plaza y comprobar que uno falla por el trigger. Se prueba contra la base real con datos etiquetados de prueba, y se limpia después.
- **Criterio 7 (RLS):** cuenta temporal sin ficha aprobada, comprobar por REST que no ve ningún torneo, y borrarla. Mismo procedimiento que se usó con la migración 0009.

Datos de prueba, si hacen falta: torneo con nombre `PRUEBA - BORRAR`, como se acordó en el `CLAUDE.md`.
