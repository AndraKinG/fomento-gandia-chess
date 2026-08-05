# Arquitectura objetivo del proyecto · Documento de rumbo

**Fecha:** 2026-08-05
**Estado:** PENDIENTE DE APROBACIÓN por el propietario (J. Ribes)
**Qué es:** el destino al que va el proyecto, descrito por el propietario en
brainstorming. **No es un plan de ejecución**: sirve para que las decisiones que
se tomen desde hoy no cierren puertas que luego haya que reabrir a martillazos.

---

## 1. La visión

**Web pública (dominio base).** Página de presentación del club: quién es, dónde
está, cómo se juega. Con un **formulario de solicitud de ingreso** que llega a
los admins (presidente y junta) para que la validen; después se habla del pago,
que en el futuro debería ir solo.

**Zona de socios (`/club`).** Todo lo que existe hoy, reorganizado:

| Apartado | Contenido |
|---|---|
| **Inicio** | Resumen en tarjetas de lo que está pasando: torneos creados para jugar en el club u online, desplazamientos organizados a torneos de fuera, resultados de unos y otros, resultados de cada ronda de Interclubs al terminar, actualizaciones de ELO… |
| **Interclubs** | Lo que ya existe: equipos, calendario, disponibilidad, convocatorias con validador RGC, resultados y clasificación. |
| **Club** | Torneos locales jugables, **con ELO propio del club**, y el **repositorio de partidas** que cada socio sube o importa, con importación/exportación entre plataformas. |
| **Torneos** | Torneos externos con coches, punto de recogida e información. |
| **Perfil** | Lo que ya existe. |
| **Admin** | Para admin y capitanes, **con opciones distintas según el rango**. |

**Datos siempre al día.** Las llamadas a fuentes externas (ELO y demás) con la
recurrencia que haga falta para que la información no se quede vieja.

---

## 2. Lo que esto cambia respecto a hoy

Hoy la app **es** el dominio: la raíz `/` es el inicio del socio y el proxy exige
sesión en todo salvo login, registro y `/auth`. La visión mete una web pública
delante y baja la app a `/club`.

Eso toca más cosas de las que parece:

- **Todas las rutas** de socio y de admin.
- **`src/proxy.ts`**: hoy protege todo por defecto y abre excepciones. Con web
  pública hay que invertirlo: público por defecto, protegido bajo `/club`.
- **El `start_url` y el `scope` del manifest PWA**. Quien ya tenga la app
  instalada en la pantalla de inicio abriría la web pública en vez de su inicio
  de socio.
- **Los enlaces de las notificaciones push**, que se guardan como rutas absolutas
  (`/torneos`, `/admin/vinculaciones`). Las ya enviadas quedarían apuntando a
  sitios que no existen.
- **Las Redirect URLs de Supabase Auth**.

### 2.1 Por eso hay una decisión de calendario, no solo de diseño

**Mover la app a `/club` cuesta poco hoy y mucho dentro de tres meses.** Ahora
mismo hay **una sola cuenta** (la del propietario), ninguna notificación push
enviada al club y nadie con la PWA instalada. En cuanto los 46 socios entren,
instalen la app y empiecen a recibir avisos, el mismo cambio implica romperles
el acceso directo y los enlaces de las notificaciones.

Recomendación: **hacer el movimiento antes de dar el código de acceso al club**,
aunque la web pública se quede en un esqueleto de "próximamente" durante un
tiempo. Lo caro es la reubicación, no el contenido.

---

## 3. Web pública y código de acceso: no se pisan

Hay una duda razonable al leer la visión: si hay un formulario público de
solicitud de ingreso, ¿para qué sirve el código de acceso que se acaba de
construir? Son dos puertas distintas y las dos hacen falta:

- **El formulario público** es para quien **no es socio todavía**: pide entrar en
  el club como entidad, la junta lo valida y se habla de la cuota. El resultado
  es una persona nueva en el club, que a partir de ahí estará en el orden de
  fuerza.
- **El código de acceso** es para quien **ya es socio** y solo quiere entrar en
  la app. Su ficha ya existe en el orden de fuerza y lo único que falta es
  vincularla a una cuenta.

Mezclarlas obligaría a los 46 socios actuales a "solicitar el ingreso" en un
club en el que ya llevan años.

---

## 4. Rangos — DECIDIDO (2026-08-05)

**Cuatro roles: `jugador`, `capitan`, `junta`, `admin`.** Una persona puede tener
varios a la vez.

Definiciones del propietario (2026-08-05), que son las que gobiernan qué puede
hacer cada uno:

| Rol | Quién es | Alcance |
|---|---|---|
| **admin** | Solo el propietario | Todo |
| **capitan** | Los que se eligen en cada equipo, **para cada temporada** | Su equipo, esa temporada |
| **jugador** | Todos los jugadores del club **que tengan su cuenta** | Lo suyo |
| **junta** | Los que gestionan el club a nivel de gente nueva que se inscribe y demás | Solicitudes de ingreso y gestión de socios |

Dos consecuencias que se leen directamente de esa tabla:

- **`capitan` es por equipo Y por temporada.** `team_captains` cuelga de `teams`,
  que a su vez cuelga de `seasons`, así que la caducidad por temporada ya sale
  gratis: al crear los equipos de la temporada siguiente se nombran capitanes de
  nuevo y los del año pasado dejan de tener alcance sin borrar nada.
- **`jugador` es, por definición, "tiene cuenta y tiene ficha del club"** — que es
  exactamente lo que ya responde `esta_vinculado()`. Ver §4.2.

**Los permisos se suman, nunca se restan.** Si alguno de tus roles te permite
hacer algo, puedes; si ninguno te lo permite, no puedes. Cuando uno dice sí y
otro dice no, gana el sí. No hay roles que quiten permisos.

Esto encaja de forma natural con Postgres: **las policies de RLS permisivas ya se
combinan con OR entre ellas**, así que "si algún rol te lo permite, puedes" es
exactamente cómo funciona el motor. No hay que inventar precedencias ni ordenar
reglas: se escribe una policy por rol que pueda hacer algo y el resultado sale
solo.

**Ojo con un detalle al implementarlo:** `capitan` no es un rol global, es **por
equipo** (hoy `team_captains`). Volcarlo a una tabla plana de roles perdería el
alcance y un capitán del B podría gestionar el A. Así que el modelo es: tabla de
roles globales (`jugador`, `junta`, `admin`) **más** `team_captains` como está,
y el helper de RLS de capitán sigue recibiendo el equipo.

**Estado: migración `0011_roles.sql` escrita, PENDIENTE de aplicar.** Está hecha
para no romper nada: `profiles.is_admin` sigue existiendo y funcionando, e
`is_admin()` pasa a devolver true si lo dice la columna vieja **o** la tabla
nueva. Como esa función la usan las policies de casi todas las tablas,
redefinirla es lo que hace la migración indolora: en el momento de ejecutarla,
todas empiezan a entender el rol nuevo sin tocar ni una policy. El código
desplegado no necesita cambiar; la conversión a roles se puede hacer poco a poco.

Añade también `tiene_rol()` y `es_junta()`, que es lo que necesitará el
formulario de ingreso.

### 4.2 Problema abierto: `jugador` guardado es verdad duplicada

La definición del propietario es "todos los jugadores del club que tengan su
cuenta", y eso es literalmente lo que ya responde `esta_vinculado()`
(`profiles.player_id is not null`). Guardar además una fila `jugador` en
`member_roles` significa tener la misma verdad en dos sitios, y las dos verdades
se separan en cuanto una de las dos no se actualiza.

**Y ya hay por dónde se separa:** `aprobarVinculo` (la acción que vincula la ficha
al aprobar una solicitud) escribe `profiles.player_id` pero **no** inserta el rol.
El traspaso de la migración cubrió a los socios existentes, así que hoy cuadra —
pero solo porque hay un socio. El siguiente que apruebes tendrá ficha y no
tendrá fila `jugador`.

Dos salidas, las dos baratas porque todavía nada consume el rol:

1. **Tratar `jugador` como derivado** y quitarlo de la tabla: una fuente de
   verdad, imposible que se desincronice. Es la que encaja con la definición.
2. **Concederlo al aprobar la vinculación**, dejando la tabla como el sitio único
   donde se leen los rangos, a cambio de mantener los dos sitios en sintonía.

Pendiente de decidir por el propietario.

### 4.3 Falta cómo repartir rangos

Nadie tiene `junta` todavía y no hay ninguna pantalla para conceder o quitar
roles; la migración solo repartió lo que ya se deducía de `is_admin`. Hace falta
una pantalla de admin para nombrar junta **antes** del formulario de ingreso, que
es lo primero que necesita ese rol para funcionar.

### 4.1 Por qué el booleano actual no llega

Hoy hay `profiles.is_admin` (booleano) y `team_captains` (por equipo). La visión
habla de **presidente y junta** validando ingresos, y de un panel de admin con
opciones **según el rango**. Eso son al menos tres niveles.

Antes de añadir un segundo booleano (`is_presidente`) conviene parar: dos
booleanos son cuatro combinaciones, tres son ocho, y las policies de RLS se
vuelven ilegibles. La forma que aguanta es una tabla de roles por persona
(`socio`, `capitan`, `junta`, `admin`) y funciones de RLS que pregunten por rol.
No es urgente, pero **sí conviene decidirlo antes de escribir el formulario de
ingreso**, que es lo primero que necesita el rango "junta".

---

## 5. Límites técnicos reales que la visión tiene que asumir

**"ELO siempre al día" no se puede cumplir hoy para FIDE.** No es una decisión de
diseño: `fide.com` bloquea las IPs de centro de datos, tanto de Vercel como de
GitHub Actions (verificado en la Fase 1C, ver `CLAUDE.md`). Ningún cron alojado
va a poder leer perfiles de FIDE.

Salida probable: FIDE publica la **lista mensual completa** de ELO como fichero
descargable, y bajar un fichero estático no es lo mismo que rascar perfiles uno a
uno. Es el patrón que ya se usa con FEDA, cuyo importador trabaja sobre la lista
oficial en `.xlsx`.

Comprobado el 2026-08-05:
`https://ratings.fide.com/download/standard_rating_list_xml.zip` responde
**HTTP 200, `application/zip`, 14 MB en menos de un segundo**. Y como el ELO FIDE
solo cambia una vez al mes, esa es la frecuencia real que hace falta.

Quedan **dos incógnitas antes de darlo por resuelto**, y ninguna se puede
despachar desde el portátil:

1. **Si Vercel puede descargarlo.** La prueba de arriba sale de una IP doméstica;
   el bloqueo que documenta el `CLAUDE.md` es a IPs de centro de datos. Averiguarlo
   exige desplegar una ruta de sondeo y llamarla desde producción. Diez minutos.
2. **Si cabe procesarlo en una función serverless.** 14 MB comprimidos son
   cientos de megas de XML descomprimido, y el plan Hobby limita memoria y
   duración. Habría que parsearlo en streaming filtrando solo los ~46 ids FIDE
   del club, en vez de cargarlo entero en memoria. Es factible pero no gratis.

Mientras eso no se resuelva, el ELO FIDE se sigue actualizando a mano con
`scripts/actualizar-elo-fide.mjs`, que es lo que hay hoy y funciona.

**Los crons no son el cuello de botella que parece.** El plan Hobby de Vercel
permite 2 y solo se usa 1, y además ese uno ya está multiplexado por día de la
semana (lunes pedir disponibilidad, jueves recordar, viernes sincronizar FACV).
Ese patrón admite todo lo que haga falta sin tocar el límite: un cron diario que
decide qué hacer según el día y el mes.

**Jugar online en el navegador sigue siendo la pieza más grande del proyecto**,
por encima de todo lo demás junto: tablero, validación de jugadas legales, jaque
mate y ahogado, tablas por repetición, reloj sincronizado, reconexión y abandono
por tiempo. Decisión del propietario tomada y registrada; la advertencia también.

**Importar/exportar partidas entre plataformas sí es asequible.** Lichess y
Chess.com tienen API pública para descargar las partidas de un usuario, y el PGN
es un formato de texto estándar. El repositorio de partidas puede nacer con
importación real desde el primer día.

---

## 6. Orden que propongo

1. **Terminar la Fase 2** (torneos y coches): está a tres tareas de interfaz.
2. **Mover la app a `/club`** con la web pública en esqueleto. Antes de invitar
   al club, por lo dicho en §2.1.
3. **Decidir el modelo de rangos** y migrar `is_admin` a él.
4. **Formulario público de ingreso** con validación de la junta.
5. **Fase 3: repositorio de partidas** con importación de Lichess/Chess.com. Trae
   el tablero, que hace falta para todo lo que viene después.
6. **Fase 4: torneos internos y ELO de club**, primero organizados y jugados en
   el club.
7. **Jugar online**, cuando el resto esté asentado.
8. **Pago de cuotas automático**, lo último: mete pasarela de pago, datos
   fiscales y responsabilidad legal.

El inicio con tarjetas de resumen no es un paso aparte: cada fase añade sus
tarjetas al inicio a medida que tiene algo que contar. Construirlo antes sería
diseñar el resumen de cosas que aún no existen.

---

## 7. Preguntas abiertas

1. ~~¿Se mueve la app a `/club` ya o después de invitar al club?~~ **DECIDIDO:
   ya, antes de invitar al club.** La web pública arranca como esqueleto.
2. ~~¿Qué rangos exactamente?~~ **DECIDIDO: ver §4.**
3. **¿La web pública va en este mismo proyecto de Next o aparte?** Recomendación:
   el mismo, comparte dominio, despliegue y estilos; separarlo duplica trabajo
   sin ganar nada a esta escala.
4. **¿El ELO del club se calcula solo con torneos internos, o también con
   Interclubs?** Afecta al diseño de la Fase 4.
