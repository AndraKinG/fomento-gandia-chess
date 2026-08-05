# Onboarding del club — acceso restringido y vinculación segura · Documento de diseño

**Fecha:** 2026-08-05
**Estado:** PENDIENTE DE APROBACIÓN por el propietario (J. Ribes)
**Base:** extiende `2026-07-13-chess-club-manager-design.md` (§4 flujos) y la Fase 0, que ya implementó el flujo `registro → /vincular → aprobación admin`. Las Fases 0/1A/1B/1C están en producción.

---

## 1. Problema

El objetivo del propietario es pasar una URL al club para que **solo sus socios** se registren y cada uno quede asociado a su ficha de jugador, sin que nadie pueda apropiarse de la ficha de otro.

El flujo de vinculación ya existe y es correcto (auto-selección + aprobación del admin, con `profiles.player_id` único y un índice único que impide dos solicitudes pendientes sobre la misma ficha). **Lo que falta es la puerta de entrada.** Estado verificado el 2026-08-05 contra el proyecto de producción:

1. **El registro está abierto a todo internet** (`disable_signup: false` en los ajustes de auth). Cualquiera que tenga o adivine la URL se crea una cuenta.
2. **Una cuenta sin ficha aprobada lo ve todo.** Las policies de lectura de `players`, `force_order`, `seasons`, `teams`, `team_captains`, `matches`, `standings`, `board_results` y `lineups` publicadas son `to authenticated using (true)`. Un desconocido recién registrado, sin que el admin apruebe nada, ya lee **los 46 nombres reales de los socios con sus ELOs**, el calendario completo, las convocatorias publicadas y los resultados.
3. **`/vincular` ofrece fichas que no son del club.** Lista `players where activo = true`, que incluye las 4 fichas residuales de probar los importadores de ELO (Carlsen, Nakamura, Aalbersberg, Aalders). Hoy alguien podría reclamar "Carlsen, Magnus".

### 1.1 Trampa a evitar (motivo de una decisión de diseño)

Validar un código de club **solo** en la server action de `/registro` no aporta seguridad: `NEXT_PUBLIC_SUPABASE_ANON_KEY` está por definición en el navegador, y con ella cualquiera puede llamar directamente a `POST /auth/v1/signup` de Supabase saltándose el formulario. El gate solo es real si se cierra el registro **en Supabase** y las cuentas se crean desde el servidor con la clave de servicio.

---

## 2. Alcance

Tres capas, cada una respondiendo a una pregunta distinta. Las dos últimas ya existen y no se rediseñan.

| Capa | Pregunta | Estado |
|---|---|---|
| Código de acceso del club | ¿eres del club? | **nuevo** |
| Auto-selección en `/vincular` | ¿qué ficha dices que eres? | existe, se ajusta la fuente de datos |
| Aprobación del admin | ¿eres realmente esa persona? | existe, sin cambios |

Más el cierre del agujero de lectura del punto 1.2, que es independiente y ya está abierto en producción.

**Fuera de alcance:** SSO/Google, códigos personales por jugador (evaluado y descartado por el reparto de 46 códigos; queda anotado como evolución si el código único da problemas), y auto-aprobación sin admin.

---

## 3. Decisiones tomadas en brainstorming (2026-08-05)

1. **Un único código de club**, no uno por jugador. Se comparte por el grupo de WhatsApp del club. Si se filtra, se rota y las cuentas ya creadas no se ven afectadas.
2. **Sin confirmación de email.** Las cuentas se crean ya confirmadas desde el servidor. El código del club es la prueba de pertenencia; la identidad la verifica el admin al aprobar la ficha. Motivo: el SMTP compartido de Supabase permite muy pocos envíos por hora y 46 jugadores registrándose la misma tarde no funcionaría. **Esto desacopla el onboarding de la tarea pendiente de Resend.**
3. El código vive **en base de datos, no en una variable de entorno**, para poder rotarlo y desactivarlo desde `/admin` sin un redespliegue de Vercel.

### 3.1 Consecuencia aceptada de la decisión 2

Un email no confirmado es un email no verificado: si un jugador teclea mal su correo, **no podrá recuperar su contraseña por sí mismo**. Mitigación: acción de admin para corregir el email de una cuenta (§6), y el aviso correspondiente en la pantalla de registro. Cuando Resend esté configurado se puede volver a exigir confirmación sin tocar este diseño.

---

## 4. Modelo de datos (migración aditiva `0009`)

**`access_codes`** — códigos de acceso al club:

- `id`, `codigo` (text, unique), `activo` (bool, default true), `usos` (int, default 0), `max_usos` (int null = ilimitado), `created_at`, `notas` (text null).
- El código se guarda **en claro**: el admin tiene que poder leerlo para repartirlo. RLS lo restringe a admin y nunca se sirve al cliente. Es un secreto de valor bajo, vida corta y rotable.
- Generado por el sistema, no elegido a mano: 12 caracteres de alfabeto sin ambigüedades (sin `0/O`, `1/I/l`). Un código tipo `AJEDREZ2026` es adivinable; uno generado no.

**`registro_intentos`** — freno anti-fuerza-bruta: `ip` (text), `created_at`. Máximo 10 intentos fallidos por IP y hora. No es la defensa principal (la entropía del código lo es), pero evita que se pueda martillear el endpoint gratis.

**Helper de RLS:**

```sql
create or replace function public.esta_vinculado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and player_id is not null
  );
$$;
```

**Cambio de policies de lectura** (`alter policy`, no recrear): en `players`, `force_order`, `seasons`, `teams`, `team_captains`, `matches`, `standings`, `board_results`, `lineups` y `lineup_boards`, la condición `using (true)` pasa a `using (public.esta_vinculado() or public.is_admin())`. Se mantiene `or public.is_admin()` para que un admin sin ficha propia siga administrando. `availability` no cambia: su lectura ya está restringida a capitán/admin, que están vinculados por definición.

---

## 5. Flujo de registro nuevo

**Gate usuario previo (imprescindible, y va primero):** en Supabase, *Authentication → Sign In / Providers → Email*, desactivar **"Allow new users to sign up"** (`disable_signup: true`). A partir de ese momento `supabase.auth.signUp()` deja de funcionar y la única vía de alta es la del servidor.

`/registro` pide **email + contraseña + código del club**. La server action:

1. Comprueba el freno por IP en `registro_intentos`.
2. Valida el código con la clave de servicio: existe, `activo`, y `usos < max_usos` si hay tope.
3. Si el código no vale → error **genérico** ("El código de acceso no es válido"), sin distinguir entre inexistente, caducado o agotado: no se le regala información a quien prueba.
4. Crea la cuenta con `auth.admin.createUser({ email, password, email_confirm: true })`. El trigger `on_auth_user_created` de la migración 0001 le crea su `profiles` con `player_id = null` — funciona igual con cuentas creadas por el admin API.
5. Incrementa `usos` con un `UPDATE ... set usos = usos + 1` atómico (no leer-y-escribir).
6. Inicia sesión y redirige a `/vincular`.

Notas de implementación:
- `disable_signup: true` **no** bloquea `auth.admin.createUser`: el admin API es la vía exenta. Es el mecanismo, no un efecto colateral. Verificado contra la documentación de Supabase el 2026-08-05: "desactivar signups + cliente de servicio llamando a `admin.createUser()`" es su patrón recomendado de acceso solo-por-invitación. Aun así, el criterio de aceptación 1 lo comprueba empíricamente en el proyecto real antes de dar el flujo por bueno: todo este diseño se apoya en ese detalle.
- Email ya existente → "Ya existe una cuenta con ese email". Es un oráculo de enumeración, aceptado a cambio de que un socio confundido entienda qué le pasa.
- Si el alta va bien pero el inicio de sesión falla, la cuenta existe: el usuario entra por `/login` con normalidad. No hay estado inconsistente.

---

## 6. Pantallas

**`/registro`** — tercer campo "Código del club" y una línea de aviso: "Usa un email al que tengas acceso: lo necesitarás si olvidas la contraseña".

**`/vincular`** — la lista de "¿Quién eres?" pasa a salir del **`force_order` de la temporada activa** (unido a `players`), ordenada por número de orden de fuerza en vez de por nombre. Esto responde a la distinción que planteó el propietario: el orden de fuerza es el censo del club a principio de año, y los registrados son un subconjunto. Quien no use la web nunca reclama su ficha y su ficha sigue existiendo para convocatorias. Efecto secundario deseable: las 4 fichas residuales de los importadores desaparecen de la lista sin borrarlas.

Con las policies nuevas, un usuario sin vincular no puede leer `players`, así que esta pantalla pasa a construir la lista con el cliente de servicio, devolviendo **solo** `id`, `nombre` y `elo_oficial`. Es una excepción estrecha y deliberada, del mismo tipo que la que ya usa la pantalla para calcular qué fichas están ocupadas (ver comentario en `src/app/vincular/page.tsx`).

**Pantalla de espera** — el usuario con solicitud pendiente no debe aterrizar en pantallas vacías. Todo lo que no sea `/vincular` o `/perfil` le redirige a un estado "Solicitud enviada, pendiente de que el admin te confirme". La comprobación va en el layout autenticado, no en `proxy.ts`: el proxy corre en cada petición y hoy no consulta la BD; añadirle una consulta encarecería todas las rutas, incluidas las estáticas.

**`/admin/acceso`** (nueva, o pestaña dentro de `/admin/vinculaciones`) — ver el código vigente, copiarlo al portapapeles, regenerarlo, activar/desactivar, y el contador de cuentas creadas con él. **Desactivarlo es el botón de "ya está todo el club dentro, cierro el registro"**, que es la forma de que la app quede accesible solo a los ya registrados.

**Nice to have** (no bloqueante): push al admin cuando entra una solicitud de vinculación. La infraestructura de Web Push ya existe y el propietario ya tiene suscripción activa.

---

## 7. Fuera de la app pero parte del objetivo

`robots.txt` + `noindex` para que la app no acabe indexada en Google. No es un control de seguridad (la seguridad la dan las tres capas), pero no tiene sentido que el club salga en búsquedas.

---

## 8. Qué NO cambia

El flujo de `link_requests`, la aprobación en `/admin/vinculaciones`, los índices únicos de la migración 0003, `profiles.player_id` único y el modelo de permisos en 3 capas. Este diseño **añade una puerta antes** del flujo existente y **cierra la lectura** a quien aún no ha pasado por él.

---

## 9. Criterios de aceptación

1. Con el registro cerrado en Supabase, un `POST` directo a `/auth/v1/signup` con la clave anónima **falla**. (Prueba explícita: es la vulnerabilidad de §1.1.)
2. Sin código válido no se puede crear cuenta por ningún camino.
3. Una cuenta recién creada y **sin aprobar** no puede leer ni un nombre de `players`, ni `force_order`, ni `matches`, ni `standings` — comprobado por REST con el JWT de esa cuenta, no solo por la UI.
4. La lista de `/vincular` contiene exactamente los jugadores del `force_order` de la temporada activa menos los ya ocupados; Carlsen, Nakamura, Aalbersberg y Aalders no aparecen.
5. Dos usuarios no pueden acabar con la misma ficha, ni por carrera ni por doble aprobación.
6. Tras la aprobación, el jugador ve la app completa con los permisos de jugador (solo su disponibilidad).
7. Desactivar el código impide nuevos registros sin afectar a los ya registrados.
8. Los 166 tests existentes siguen pasando.

---

## 10. Preguntas abiertas para el propietario

1. **¿El código caduca por tiempo o solo lo desactivas tú a mano?** Propuesta: solo a mano, más simple y tú controlas cuándo cierras.
2. **¿Tope de usos?** Propuesta: `max_usos = null` (ilimitado) durante el onboarding y desactivación manual al acabar. Un tope de 46 se queda corto en cuanto alguien se equivoque y repita.
3. **Emails mal escritos:** ¿añadimos la acción de admin para corregir el email de una cuenta (§3.1) en este alcance, o se resuelve pidiéndotelo y lo tocas en el dashboard de Supabase?
