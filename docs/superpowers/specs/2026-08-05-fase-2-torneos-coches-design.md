# Fase 2 — Torneos y coches · Documento de diseño

**Fecha:** 2026-08-05
**Estado:** PENDIENTE DE APROBACIÓN por el propietario (J. Ribes)
**Base:** desarrolla la Fase 2 de `2026-07-13-chess-club-manager-design.md` §7
("Comunidad y coches"). Las Fases 0, 1A, 1B, 1C y el onboarding del club están
en producción.

---

## 1. Problema

El club se desplaza a torneos durante todo el año, y hoy eso se organiza por
WhatsApp: quién va, quién lleva coche, cuántas plazas quedan, a qué hora y de
dónde se sale. La información se pierde en el scroll y nadie sabe el estado real
hasta que alguien lo pregunta otra vez.

Además el Interclubs está **dormido de abril a enero**: fuera de esa ventana la
app no tiene nada que ofrecer, aunque el club siga compitiendo en torneos.

---

## 2. Alcance

**Bloque A — Torneos.** Calendario de torneos con su información, sincronizado
de la FACV y completable a mano, y "¿quién va?" por socio.

**Bloque B — Coches.** Quien lleva coche ofrece plazas, hora y punto de salida;
el resto se apunta al que le convenga.

**Fuera de alcance, a propósito:**

- **Posts/anuncios con push**, que la spec original también metía en Fase 2. Se
  deja para un segundo tramo: el propietario ha priorizado torneos y coches, y
  los posts son independientes.
- Reparto de gastos de gasolina. Se puede anotar en el campo de notas del coche;
  cuadrar cuentas es otro problema.
- Inscripciones al torneo. Las gestiona cada socio en la web del organizador; la
  app enlaza a las bases, no inscribe.

---

## 3. Decisiones tomadas en brainstorming (2026-08-05)

1. **Las plazas de coche se auto-organizan**: el conductor ofrece, los demás se
   apuntan. Sin asignación del admin, que sería trabajo suyo en cada torneo. El
   admin puede corregir casos raros, pero no es el camino normal.
2. **Empezamos por esta fase** y no por partidas (Fase 3) ni torneos internos
   (Fase 4), porque es la única con uso inmediato: a torneos se va todo el año.
3. Registrada para más adelante, no en esta fase: el propietario quiere que la
   Fase 4 llegue a **jugar de verdad en el navegador** (mover piezas, reloj,
   validación de jugadas), no solo organizar torneos que se juegan en el club.
   Queda anotado con la advertencia de que es, con diferencia, la pieza más
   grande del proyecto y que Lichess ya cubre ese terreno; la decisión es suya y
   se replanteará al llegar a la Fase 4.

---

## 4. Fuente de datos FACV (verificado el 2026-08-05)

**Calendario oficial:**
`https://www.facv.org/appwebfacv/public/staff/torneos/calendario_oficial.php`

Accesible **sin login** (igual que `of_publico.php`, que también vive bajo
`/staff/`). Es una sucesión de tablas HTML por mes con las columnas *#, Nombre,
Inicio, Final, Lugar, Organizador, Bloquea*.

La fixture ya está descargada en
`src/lib/import/fixtures/facv-calendario-torneos.html` (tres meses de 2026 más
una rejilla mensual, 80 KB). Analizarla antes de escribir la spec ha corregido
tres suposiciones que habrían costado caro:

1. **El filtro NO puede ir por organizador.** Mi primera idea era descartar las
   filas cuyo organizador es la FACV, porque las jornadas de Interclubs lo son.
   Con los datos reales delante: de 168 torneos del año, **53 los organiza la
   FACV**, y casi todos interesan al club — Provincial Individual, Autonómico
   Blitz, Copa Federación, Open Igualdad, Zonal Jocs… Filtrar por organizador
   habría borrado un tercio del calendario. El filtro correcto es **por nombre
   que empiece por "Interclubs"** (11 filas: `Interclubs 2026`,
   `Interclubs. Jornada 2`… incluida `Interclubs. Ronda 6 Aplazada`).
2. **El nombre hay que extraerlo por celda, no por fila.** La segunda celda
   lleva insignias (`★ Oficial`) antes del nombre, y **la última celda
   (*Bloquea*) también lleva un `<span>` con insignia** (`⛔ A nivel
   Autonómico`). Un "coge el último `<span>` de la fila" devuelve la insignia de
   bloqueo en vez del nombre — comprobado: es exactamente lo que me pasó al
   primer intento.
3. **`fecha_fin` viene siempre**, igual a `fecha_inicio` en los torneos de un
   día; no llega vacía. Así que se guardan las dos y "es de un día" se deduce de
   que sean iguales, en vez de dejar un `null` que habría que interpretar.

Más limpieza que exige el HTML real: **entidades** (`Blitz de L&#039;olleria`) y
**comas sobrantes en el lugar** (`"Olleria,"`).

Y un límite del que no hay escapatoria: **no hay página de detalle por torneo.**
Hora exacta, ritmo, inscripción y bases **no son importables**; los rellena el
admin. La sincronización aporta el esqueleto, no la ficha completa.

**Deduplicación:** la tabla no expone ningún id, así que la clave estable es
`(nombre_normalizado, fecha_inicio)`. Al re-sincronizar, **nunca se pisan los
campos que ha rellenado el admin** (hora, ritmo, info extra, bases) ni lo que ha
puesto el club (asistencias, coches) — mismo principio que el importador de
calendario, que no pisa las jornadas ya jugadas.

La fixture incluye a propósito una rejilla `table-bordered` además de las tablas
de datos `table-hover`: si el selector del parser es demasiado laxo, la rejilla
le mete filas basura y el test lo caza.

---

## 5. Modelo de datos (migración `0010`)

**`tournaments`**
`id`, `nombre`, `fecha_inicio` (date), `fecha_fin` (date **not null**: la FACV la
manda siempre, igual a la de inicio si es de un día),
`lugar`, `organizador`, `hora` (text null, la pone el admin), `ritmo` (text null:
"clásico", "blitz", "rápido"…), `info_extra` (text null), `url_bases` (text null),
`de_interes` (bool, default false), `origen` ('facv' | 'manual'),
`clave_facv` (text null, unique — el `(nombre, fecha)` normalizado para el
re-sync), `created_at`.

`de_interes` es el interruptor del admin para decir "a este vamos como club".
Sin él, importar el calendario oficial entero (decenas de torneos de toda la
Comunitat) enterraría los tres o cuatro que le importan al club. **La pantalla
del socio muestra por defecto solo los marcados**, con la lista completa a un
toque de distancia.

**`tournament_attendance`** — `tournament_id` × `player_id`, `estado`
(`voy` | `no_voy` | `duda`), `updated_at`. Sin fila = sin responder. Mismo
vocabulario y misma forma que `availability`, para que el socio reconozca el
gesto y podamos reutilizar `BotonesDisponibilidad`.

**`cars`** — `id`, `tournament_id` (null), `match_id` (null), `conductor_id`
(→ players), `plazas` (int > 0, plazas para pasajeros sin contar al conductor),
`hora_salida` (text null), `punto_salida` (text null), `notas` (text null),
`created_at`.

Con un `check` de que **exactamente uno** de `tournament_id`/`match_id` esté
puesto. Motivo: la spec original dice que los coches aplican también a las
jornadas de Interclubs fuera de casa, y el modelo lo soporta desde el principio
para no tener que migrar después. **En esta fase la interfaz solo se conecta a
torneos**; el camino de Interclubs queda abierto sin coste. Se descartó una tabla
`events` genérica (refactor grande de `matches`) y también un par
`evento_tipo`/`evento_id` polimórfico, que renuncia a la integridad referencial.

**`car_seats`** — `car_id` × `player_id`, `created_at`. Con un índice único de
`player_id` **por torneo** (vía el `car_id`): no puedes ir en dos coches al mismo
torneo. Es la regla que evita el caso "me apunto a todos por si acaso" que
dejaría coches fantasma medio llenos.

Todas las lecturas exigen `esta_vinculado() or is_admin()`, coherente con la
migración 0009: un socio sin ficha aprobada no ve tampoco los torneos.

---

## 6. Reglas de negocio (el núcleo lógico, con tests)

Módulo puro en `src/lib/torneos/`, sin BD ni UI, siguiendo el patrón de
`src/lib/validador/`:

1. **Plazas libres** = `plazas − ocupadas`. Nunca negativo; si el conductor baja
   `plazas` por debajo de las ya ocupadas, la escritura se rechaza con un mensaje
   claro en vez de dejar el coche en números rojos.
2. **Apuntarse a un coche implica ir al torneo**: si el socio no había respondido
   o había dicho `no_voy`, al coger plaza su asistencia pasa a `voy`. Sería
   absurdo tener un pasajero que "no va".
3. **Cambiar la asistencia a `no_voy` libera su plaza** automáticamente, y avisa
   al conductor. Sin esto, los coches se quedan con plazas ocupadas por gente que
   ya dijo que no viene, que es exactamente el problema del WhatsApp.
4. **El conductor no ocupa plaza de pasajero** y no puede apuntarse como pasajero
   de otro coche del mismo torneo.
5. **Si el conductor borra su coche**, sus pasajeros vuelven a "sin coche" y
   reciben aviso. Su asistencia al torneo no se toca: querer ir sigue siendo
   verdad aunque te hayas quedado sin transporte.
6. **Resumen de transporte** de un torneo: quién va sin plaza asignada, plazas
   libres totales, y si hay más gente que quiere ir que plazas disponibles. Es lo
   que el admin necesita ver de un vistazo para saber si hace falta otro coche.

---

## 7. Pantallas

**`/torneos`** (socio) — próximos torneos marcados de interés, con fechas, lugar
y su propio "¿voy?" en la tarjeta. Enlace a "ver todos los del calendario".

**`/torneos/[id]`** — ficha del torneo: datos, info extra, enlace a bases;
"¿Vas?" con los tres botones de siempre; lista de quién va; y el bloque de
coches: cada coche con conductor, hora, punto de salida, plazas libres y botón
de apuntarse. Botón de "ofrezco coche" si no eres ya conductor ni pasajero.

**`/admin/torneos`** — sincronizar con la FACV, marcar torneos de interés,
rellenar hora/ritmo/info/bases, crear torneos a mano (los que no estén en el
calendario oficial), y el resumen de transporte.

**Home** — cuando no hay jornada de Interclubs próxima (o sea, de abril a enero),
mostrar el próximo torneo de interés en lugar del estado vacío actual. Es lo que
convierte la app en algo que se abre todo el año.

---

## 8. Notificaciones push

Modestas a propósito: la app ya manda push de disponibilidad y convocatorias, y
sumar avisos de torneos es la vía rápida a que la gente los silencie.

1. Al marcar un torneo como **de interés** → push al club: "Torneo X el día Y,
   ¿vas?".
2. Al **ofrecerse un coche** → push solo a quien dijo `voy` o `duda` y no tiene
   plaza.
3. Al **quedarse sin coche** porque el conductor lo borró → push a los afectados.

Se apoya en `enviarPushAMuchos`, que ya existe. **Ningún push puede hacer fallar
la operación que lo dispara**, igual que en el aviso de vinculación.

---

## 9. Criterios de aceptación

1. El parser saca los 34 torneos de la fixture real, **excluye las jornadas de
   Interclubs por nombre** y **conserva los demás torneos organizados por la
   FACV** (Zonal Jocs, Provinciales…), que son un tercio del calendario. Nombres
   con entidades decodificados (`Blitz de L'olleria`) y lugares sin comas
   sobrantes. Ignora la rejilla `table-bordered` de la fixture.
2. Re-sincronizar dos veces no duplica torneos ni pisa la hora, el ritmo, la info
   extra ni el enlace a bases que puso el admin.
3. Un coche nunca acepta más pasajeros que plazas, ni con dos socios apuntándose
   a la vez (probado con escrituras concurrentes, no solo por la interfaz).
4. Nadie puede ir en dos coches del mismo torneo.
5. Apuntarse a un coche pone la asistencia en `voy`; pasar a `no_voy` libera la
   plaza y avisa al conductor.
6. Borrar un coche deja a sus pasajeros sin plaza pero **con su asistencia
   intacta**.
7. Un socio sin ficha aprobada no ve ningún torneo (RLS, comprobado por REST).
8. Los 180 tests actuales siguen pasando, más los nuevos del módulo de torneos.

---

## 10. Preguntas abiertas para el propietario

1. **¿Quién puede crear torneos a mano y marcarlos de interés: solo admin, o
   también los capitanes?** Propuesta: solo admin, para que la lista no se
   ensucie; es fácil abrirlo después.
2. **¿Puede ofrecer coche cualquier socio, o solo quien va al torneo?**
   Propuesta: cualquiera que vaya (`voy`/`duda`), porque ofrecer coche sin ir no
   tiene sentido.
3. **¿Quieres punto de recogida por coche, o un punto de encuentro común del
   club (p. ej. el local) con la hora de cada coche?** Propuesta: por coche, en
   texto libre, que cubre los dos casos sin inventar estructura.
4. **¿Los torneos pasados se archivan o se ven?** Propuesta: se ven en un
   histórico, porque en la Fase 3 las partidas se vincularán a su torneo.
