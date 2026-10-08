# Copias de seguridad

Montadas el 2026-10-08 tras la auditoría de ese día (punto 10): desde el lanzamiento hay
datos que no se pueden volver a sacar de ningún sitio, y no existía ninguna copia que el
propietario pudiera restaurar.

## Cómo funciona

- **`scripts/copia-seguridad.mjs`** copia por la API de Supabase: todas las tablas (la lista
  sale de las migraciones, así que una tabla nueva entra sola), las cuentas sin contraseña
  y las fotos de perfil. Con `comprobar`, revisa que la última copia esté entera.
- **`scripts/copia-seguridad-programada.cmd`** hace la copia y la comprueba seguidas. Es lo
  que lanza la tarea de Windows **"Fomento - Copia de seguridad"**, una vez al día. Deja
  registro en `logs/copia-seguridad.log` (solo cuentas de filas, ningún dato de socios).
- **Dónde**: `../copias-fomento-gandia/`, una carpeta HERMANA del proyecto. Fuera del repo a
  propósito, y el script se niega a escribir dentro: el repo es público y la copia lleva
  los correos de los socios, el **código de acceso del club** y las claves de las
  suscripciones push. Esa carpeta tampoco debe acabar en una nube compartida.
- Se guardan las **30 últimas**. Toda la base son unos 260 KB.

## Qué se pierde y qué no

Por la API y no con `pg_dump` (decisión del propietario: no instalar nada). La API no da
las **contraseñas**. Todo lo demás vuelve:

- **Las cuentas se recrean con su MISMO identificador.** `auth.admin.createUser` acepta
  `id` (en la propia librería: *"Allows you to overwrite the default id set for the
  user"*). Eso es lo que salva todo lo que cuelga de la cuenta: la ficha vinculada
  (`profiles`), los avisos, las favoritas, los rangos, quién creó cada torneo. Con ids
  nuevos, todo eso quedaría huérfano.
- **Las contraseñas**: a cada socio se le manda un enlace de un solo uso para poner una
  nueva, con `auth.admin.generateLink({ type: "recovery" })` — la receta está en
  `configurar-smtp-resend.md`. Es lo único que el socio tiene que hacer.

## Cómo se restauraría

**No se ha ensayado todavía**, y una copia que nunca se ha restaurado no se sabe si sirve.
Para ensayarlo sin riesgo hace falta un **segundo proyecto de Supabase, gratuito y
vacío**, en la misma región (`eu-west-1`). El código de restaurar se escribe y se prueba
ese día contra ese proyecto — no antes, porque código que escribe en una base y nunca se
ha ejecutado es justo lo que no se quiere tener a mano en una emergencia.

El orden, para entonces:

1. **El esquema sale de las migraciones**, no de la copia: aplicar `0001` → la última, en
   orden. Ojo con las que SIEMBRAN filas (el código de acceso de la `0009`, la ficha de
   pruebas de la `0040`): chocarían con las de la copia. Hay que vaciar esas tablas antes
   de volcar, o volcar con *upsert*.
2. **Las cuentas primero**, con su `id` de `cuentas.json` y `email_confirm: true`.
3. **Las tablas en orden de dependencias**: primero las que no apuntan a nadie (`seasons`,
   `players`, `tournaments`...), después las que apuntan a ellas. Las claves ajenas lo
   imponen; el orden sale de los `references` de las migraciones.
4. **Las fotos** al bucket `fotos`, con la misma ruta.
5. **Los crons**: la `0049` lleva el `CRON_SECRET` dentro (ver skill `rotar-cron-secret`).
6. Un enlace de contraseña nueva a cada socio.

## Comprobar que sigue funcionando

```bash
node scripts/copia-seguridad.mjs comprobar
```

Dice si la última copia está entera, cuántas horas tiene —**más de 48 es que la tarea no
está corriendo**— y cuánto ha cambiado la base desde entonces, que es lo que se perdería
si hubiera que restaurar hoy.

Si deja de copiar, mirar **primero** `logs/copia-seguridad.log`: sin cabecera nueva con la
fecha, el fallo está en la tarea de Windows (ruta movida, batería), no en el script. Es la
misma trampa que tuvo el ELO FIDE en septiembre.
