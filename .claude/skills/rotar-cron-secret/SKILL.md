---
name: rotar-cron-secret
description: Cómo rotar el CRON_SECRET del proyecto. Vive en TRES sitios que deben quedar consistentes o algún cron rechazará peticiones con 401 en silencio. Invocar cuando el propietario diga "rotar el secreto del cron" o cuando haya sospecha de que se filtró.
---

# Rotar el `CRON_SECRET`

El `CRON_SECRET` vive en tres sitios y todos deben quedar iguales o algo se cae en
silencio.

## Los tres sitios

1. **Vercel** (Settings → Environment Variables → `CRON_SECRET`) — lo lee el endpoint
   `/api/cron/*` al recibir la petición.
2. **`.env.local` del propietario** — lo usa para llamadas `?forzar=` desde local.
3. **Cada tarea de pg_cron** — el secreto queda ESCRITO DENTRO del comando de cada tarea
   (visto el 2026-08-26). pg_cron NO lo lee al dispararse. Si se rota Vercel pero no se
   reprograman las tareas, siguen mandando el viejo y el endpoint rechaza con **401 en
   silencio** (a pg_cron le da igual la respuesta).

Consecuencia sin la parte de pg_cron: el push "tu ronda empieza en una hora" y las tres
pasadas de resultados del fin de semana dejan de llegar sin que nadie se entere.

## Pasos

### 1. Generar un secreto nuevo

48 caracteres hex es lo actual. `openssl rand -hex 24` o equivalente. **No lo pegues en
el chat**; se lo mandas al propietario por canal privado.

### 2. Vercel

Propietario en Settings → Environment Variables → `CRON_SECRET` → edit → redeploy
(la variable no se aplica hasta el próximo deploy).

### 3. `.env.local`

Sustituir la línea `CRON_SECRET=...` con el valor nuevo. Verificar con una llamada a
`/api/cron/director?forzar=...` desde local — debe devolver 200 (o el status que toque
por lo que hace), no 401.

### 4. Reejecutar la migración 0049 entera

La 0049 reprograma las CUATRO tareas de pg_cron (incluida `avisar-rondas` de la 0037).
Es idempotente: hace `unschedule` y vuelve a programar con el secreto que le pongas en
el bloque.

Pasos:
- Abrir `supabase/migrations/0049_...sql`.
- Sustituir el hueco `PEGA_AQUI_TU_CRON_SECRET` por el valor nuevo.
- Pegar el SQL ENTERO en el chat en un bloque ```sql (regla habitual, ver skill
  `aplicar-migracion-sql`).
- Él la aplica en el SQL Editor.

### 5. Verificar

En Supabase SQL Editor:

```sql
select jobname, schedule, command from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

Las cuatro tareas deben aparecer y estar corriendo con `status = 'succeeded'`. Si sale
`failed` con HTTP 401, la 0049 se aplicó con el secreto viejo — repetir el paso 4.

## Después de rotar

- Aviso al propietario si el secreto viejo estuvo expuesto (rotarlo no borra el rastro
  del historial de git si el repo es público — ver aviso en `CLAUDE.md`).
- Actualizar cualquier otra máquina con `.env.local` distinto (PC de trabajo, portátil).

Contexto en [docs/decisiones.md#cron_secret-dentro-de-cada-tarea-de-pg_cron](../../../docs/decisiones.md#cron_secret-dentro-de-cada-tarea-de-pg_cron).
