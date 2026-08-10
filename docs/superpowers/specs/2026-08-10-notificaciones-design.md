# Notificaciones que llegan de verdad · Documento de diseño

**Fecha:** 2026-08-10
**Estado:** Aprobado en brainstorming con el propietario (J. Ribes)
**Origen:** punto 2 del bloque pedido el 2026-08-09 (ver "Estado y pendientes" en CLAUDE.md)

## El problema

Hoy un aviso es un disparo al aire. La app manda el push y lo que pasa después es un
misterio: si el móvil estaba apagado, si el socio aún no dio permiso en ese navegador, o
si simplemente lo ignoró, **ese aviso no vuelve**. Conviven tres caminos que nunca se han
probado juntos —el push (VAPID, suscripción por dispositivo), las tarjetas flotantes de
`Avisos.tsx` y el número rojo del menú— y ninguno deja rastro de lo enviado.

El propietario priorizó dos cosas de ese punto: **que los avisos lleguen sí o sí** y
**que cada socio elija qué le avisa**.

## La idea

**Una tabla es la verdad; el push es solo el mensajero.** Cada aviso se guarda primero en
la base y después se intenta el push. Si el push llega, enterarte al instante; si no
llega, el aviso sigue esperándote y lo ves al abrir la app.

De esa única pieza salen las dos prioridades, y de propina el historial para diagnosticar
("¿a mí no me llegó nada?") y una bandeja para el socio.

**Lo que NO se hace** (YAGNI, decisión expresa): emails, resúmenes diarios, agrupar avisos
parecidos, "marcar todos como leídos", filtros ni buscador en la bandeja. Si hacen falta,
se añaden después.

**Lo que no se toca**: las tarjetas flotantes de los retos siguen siendo tarjetas (son
inmediatez de partida en vivo, no bandeja) y la difusión sigue siendo el motor de lo que
tiene que llegar rápido — regla ya establecida en el proyecto.

## Datos

**Tabla `notifications`** — una fila = un aviso para una persona:

- destinatario (perfil), grupo, tipo concreto, título, cuerpo, enlace
- `creado_en`, `leido_en` (nulo = sin leer)
- estado del push: `pendiente` | `entregado` | `fallido` | `no_tocaba`

`no_tocaba` cubre dos casos que no son un fallo: el socio tiene ese grupo silenciado, o no
tiene ninguna suscripción activa. Distinguirlo de `fallido` es lo que permite diagnosticar
sin adivinar, y evita reintentar lo que no tiene sentido reintentar.

**Grupos y tipos** (los 9 avisos que ya existen hoy):

| Grupo | Tipos |
|---|---|
| `interclubs` | convocatoria publicada · petición de disponibilidad (lunes) · recordatorio (jueves) |
| `torneos` | torneo de interés · primer apuntado · plaza de coche liberada · te quedas sin coche |
| `partidas` | reto aceptado |
| `gestion` | solicitud de ingreso · solicitud de vinculación · fichas nuevas del orden de fuerza |

**Preferencias**: cuatro interruptores en el perfil (uno por grupo), **encendidos por
defecto** — quien no toque nada recibe lo de siempre.

**Excepción acordada**: la convocatoria avisa **siempre**, aunque `interclubs` esté
apagado. Es información con consecuencias deportivas: si el capitán te alinea para el
sábado, enterarte no es opcional. La pantalla de ajustes lo dice explícitamente, sin letra
pequeña.

**Grupo `gestion`**: solo lo reciben quienes tengan el papel (admin, junta). Si alguien deja
de ser junta, deja de recibirlos, pero **los antiguos siguen en su bandeja**: son historia,
no permisos.

**Seguridad** (patrón ya establecido en el proyecto, permisos en tres capas): cada socio
lee y marca como leídos solo **sus** avisos; escribirlos es exclusivo del servidor con
clave de servicio (nadie puede fabricar un aviso, ni para otro ni para sí mismo); el admin
puede leerlos todos para diagnosticar. Las preferencias, cada uno las suyas.

## Entrega garantizada

1. Cuando pasa algo, el servidor **guarda el aviso** y solo después intenta el push.
2. Si guardar falla, **la operación principal no se rompe** (publicar la convocatoria,
   aceptar el reto): un aviso perdido nunca puede tumbar la acción. Es como se comporta hoy
   el push y se mantiene.
3. El push respeta las preferencias; la bandeja siempre recibe (no molesta a nadie).
4. Fallo temporal del servicio de push → `fallido`, y el **cron diario lo reintenta una
   vez**. Suscripción caducada o revocada (404/410) → se borra la suscripción y se marca
   `no_tocaba`: reintentar no serviría de nada.
5. Respaldo final: aunque el push no llegue nunca, el aviso está en la bandeja. **Eso es lo
   que hace que "llegue sí o sí".**

## Pantallas

- **Número rojo del menú**: pasa a contar los avisos sin leer (hoy cuenta solo retos
  pendientes). Sigue calculándose en el cliente, como ahora, porque un número pintado en el
  servidor se queda congelado hasta la siguiente navegación.
- **Bandeja**: lista de tus avisos, los no leídos destacados, con su título, su cuerpo y el
  enlace que ya llevan hoy. Tocar uno te lleva a la jornada/torneo/partida y lo marca
  leído. Sin filtros ni buscador.
- **Perfil**: los cuatro interruptores, con la nota de la convocatoria.

### Mientras juegas, nada se pone delante

Hallazgo del propietario durante el brainstorming, verificado en el código: las tarjetas
salen `fixed ... bottom-20 z-30` (centradas y a lo ancho en móvil, esquina inferior derecha
en escritorio) y el componente conoce la ruta pero **no la usa para decidir si molesta**.
En la mesa de juego esa zona inferior es justo donde están el chat, el reloj y los botones.

Regla nueva: **con una partida en juego (reloj corriendo), no salen tarjetas.** El aviso va
a la bandeja y al número rojo, y se ve al acabar. Un reto que caduque no es grave; perder
por tiempo mirando una tarjeta, sí. Si la partida ya terminó y sigues en la pantalla
(repasando), las tarjetas vuelven con normalidad. Y en la pantalla de partida, cualquier
cosa que haya que mostrar va **arriba**, porque abajo es zona de juego. Coherente con la
regla de presencia ya vigente ("nunca encima del tablero: empuja las piezas").

## Verificación

**Lógica pura y testeada** — la decisión de *a quién se avisa y por qué vía*: preferencias,
la excepción de la convocatoria, el papel requerido para el grupo `gestion`, y qué hacer con
cada tipo de fallo de push (reintentar, descartar, borrar suscripción). Es la parte que se
puede equivocar sin que se note, así que va aparte y con tests.

**En vivo, los dos escenarios que hoy nadie ha probado juntos:**

1. **Push activado**: llega la notificación al dispositivo, y el aviso aparece en la bandeja
   y se marca leído al abrirlo.
2. **Push desactivado o denegado**: no llega nada al móvil, pero el número rojo y la bandeja
   tienen el aviso. Es exactamente el caso que hoy se pierde para siempre.

**Migración**: fichero nuevo en `supabase/migrations/`, aplicado a mano por el propietario
pegando el SQL desde el chat (regla 2 del CLAUDE.md).

## Decisiones registradas

1. Enfoque A de los tres propuestos: la tabla es la verdad, el push es el mensajero.
2. Preferencias por grupos (cuatro), no por tipo (nueve) ni un único interruptor.
3. La convocatoria no se puede silenciar.
4. Historial y bandeja no eran prioridad del propietario, pero salen prácticamente gratis
   al existir la tabla, así que entran.
5. Con partida en juego, las tarjetas flotantes se callan.
