# Plan — Onboarding del club (acceso restringido y vinculación segura)

**Spec:** `docs/superpowers/specs/2026-08-05-onboarding-club-design.md` (aprobada por el propietario el 2026-08-05)

**Decisiones de las preguntas abiertas §10, cerradas al aprobar:** el código no caduca por tiempo (solo se desactiva a mano), sin tope de usos (`max_usos = null`), y los emails mal escritos se corrigen desde el dashboard de Supabase en vez de construir pantalla de admin (fuera de alcance, fácil de añadir después).

---

## Tareas

| # | Tarea | Tipo |
|---|---|---|
| 1 | Migración `0009_acceso_club.sql`: `access_codes`, `registro_intentos`, helper `esta_vinculado()`, endurecer 10 policies de lectura | **gate usuario** (SQL Editor) |
| 2 | Desactivar "Allow new users to sign up" en Supabase | **gate usuario** (dashboard) |
| 3 | `src/lib/acceso/codigo.ts` — generación del código y normalización de la entrada (lógica pura, con tests) | código |
| 4 | `/registro`: campo "Código del club" + server action que valida, crea la cuenta con `admin.createUser` y entra | código |
| 5 | `/vincular`: lista desde el `force_order` de la temporada activa + pantalla de espera si hay solicitud pendiente | código |
| 6 | Redirigir a los no vinculados a `/vincular` (header `x-pathname` desde `proxy.ts` + comprobación en el layout raíz) | código |
| 7 | `/admin/acceso`: ver, copiar, regenerar y activar/desactivar el código | código |
| 8 | `robots.txt` con `noindex` | código |
| 9 | Verificación: tests, build y comprobación de los 8 criterios de aceptación contra el proyecto real | verificación |

## Orden de ejecución

Las tareas 3-8 son código y se pueden hacer en local sin tocar producción. La tarea 1 (migración) hay que aplicarla **antes** de probar nada en vivo, porque las tablas nuevas no existen hasta entonces. La tarea 2 es la última en aplicarse: en el momento en que se desactiva el registro, el `/registro` viejo deja de funcionar, así que el código nuevo tiene que estar ya desplegado.

**Secuencia segura de puesta en producción:** aplicar migración (1) → desplegar código (3-8) → desactivar signups (2) → verificar (9).

Si se desactivan los signups antes de desplegar, nadie puede registrarse en el hueco entre ambas cosas. No es grave (todavía no hay nadie invitado) pero conviene el orden.

## Notas de implementación

- **El código inicial va sembrado en la migración** para que el flujo funcione desde el primer minuto: `CDRL-85C3-CAP6` (12 caracteres de alfabeto sin `I/O/0/1`, ~60 bits de entropía, generado, no elegido). Se guarda sin guiones; la normalización de la entrada los ignora para que se pueda dictar por teléfono.
- **La comprobación de "no vinculado" va en el layout raíz, no en `proxy.ts`**: el layout ya consulta `profiles` para saber si eres admin, así que añadir `player_id` a ese mismo `select` sale gratis. Meterlo en el proxy costaría una consulta extra en cada petición.
- El redirect es **UX, no seguridad**: la barrera real son las policies de la tarea 1. Un no vinculado que llegue a una pantalla por URL directa la verá vacía aunque falle el redirect.
