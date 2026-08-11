-- Hora de juego de cada ronda, y el aviso "empieza en una hora".
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0036. OJO: hay que rellenar dos líneas
-- del bloque final (la URL y el secreto) antes de ejecutar; están marcadas.
--
-- QUÉ RESUELVE (pedido por el propietario el 2026-08-11): un torneo interno puede
-- durar una semana con una ronda por día, así que hace falta decir a qué hora se
-- juega cada ronda y avisar a quien juega una hora antes.
--
-- LA HORA VA EN LA RONDA Y NO EN CADA CRUCE (decisión del propietario): en un
-- torneo el horario es del torneo. Si cada mesa tuviera el suyo habría que
-- rellenar N horas por ronda y dos mesas de la misma ronda podrían jugarse en días
-- distintos, que ya no es una ronda. Mismo criterio que la cadencia de la 0023.
--
-- POR QUÉ pg_cron Y NO EL CRON DE VERCEL: el aviso tiene que salir una hora antes
-- de una hora CUALQUIERA (las 19:00 de un martes, las 10:30 de un domingo), así que
-- el programador tiene que despertarse cada pocos minutos. El plan gratuito de
-- Vercel solo permite una ejecución AL DÍA — el cron de `vercel.json` va a las 9:00
-- y ahí se queda —, y pasar al plan de pago son ~20 $/mes para el club. pg_cron
-- vive dentro de Supabase, entra en el plan gratuito y despierta cuando se le pida.
-- El cron diario de Vercel NO se toca: sigue con lo semanal (disponibilidad y las
-- sincronizaciones con la FACV).

-- ---------------------------------------------------------------------------
-- 1. Las dos columnas
-- ---------------------------------------------------------------------------
alter table public.club_rounds
  -- Instante de comienzo de la ronda. `timestamptz` y no `date` + `time`: el
  -- organizador la pone en hora de Madrid y aquí se guarda el instante absoluto,
  -- que es lo único con lo que se puede comparar "¿falta una hora?" sin pelearse
  -- con el cambio de hora de marzo y octubre.
  add column if not exists fecha_hora timestamptz,
  -- Cuándo se mandó el aviso de esta ronda. ES LA MARCA QUE EVITA REPETIRLO: el
  -- programador pasa cada cinco minutos, así que sin esto una ronda de las 19:00
  -- recibiría doce avisos entre las 18:00 y las 19:00. Se pone ANTES de enviar
  -- (ver `avisarRondasProximas`), no después: así dos pasadas que se solapen no
  -- pueden mandar el mismo aviso dos veces.
  add column if not exists aviso_enviado_en timestamptz;

-- Índice parcial: la consulta del aviso y la de "mi próxima ronda" buscan siempre
-- por hora, y las rondas sin hora (todas las de antes de esta migración) no
-- interesan a ninguna de las dos.
create index if not exists club_rounds_fecha_hora
  on public.club_rounds (fecha_hora)
  where fecha_hora is not null;

-- ---------------------------------------------------------------------------
-- 2. El programador
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- CADA CINCO MINUTOS. Con el aviso a 60 minutos (ver `MINUTOS_DE_AVISO`), el
-- margen real de un aviso es "entre 60 y 55 minutos antes", que para quedar con
-- alguien a jugar es exacto de sobra. Bajar a cada minuto serían 1.440 peticiones
-- al día para no ganar nada.
--
-- La petición la manda pg_net y no espera nada útil de vuelta: el endpoint hace su
-- trabajo y contesta un JSON que aquí no lee nadie. Si una pasada falla, la
-- siguiente lo recoge cinco minutos después mientras la ronda siga dentro de la
-- ventana.
do $ejecutar$
declare
  -- ↓↓↓ RELLENA ESTAS DOS LÍNEAS ANTES DE EJECUTAR ↓↓↓
  v_url text := 'https://fomento-gandia-chess-swart.vercel.app/api/cron/rondas';
  v_secreto text := 'PEGA_AQUI_TU_CRON_SECRET';
  -- ↑↑↑ el secreto es el MISMO `CRON_SECRET` que tienes en Vercel ↑↑↑
begin
  if v_secreto = 'PEGA_AQUI_TU_CRON_SECRET' then
    raise exception 'Falta poner el CRON_SECRET en la línea de arriba.';
  end if;

  -- Idempotente: si la migración se ejecuta dos veces, la tarea se reemplaza en
  -- lugar de duplicarse (dos tareas iguales serían dos peticiones cada cinco
  -- minutos, no dos avisos — la marca de la ronda lo impide — pero sobran).
  if exists (select 1 from cron.job where jobname = 'avisar-rondas') then
    perform cron.unschedule('avisar-rondas');
  end if;

  perform cron.schedule(
    'avisar-rondas',
    '*/5 * * * *',
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 30000);',
      v_url,
      json_build_object(
        'Authorization', 'Bearer ' || v_secreto,
        'Content-Type', 'application/json'
      )::text
    )
  );
end
$ejecutar$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Se consulta `pg_catalog` y no `information_schema`: ver el comentario de la 0036
-- (aquella versión se partió al copiarla y dio "syntax error at or near table").
select 'columnas nuevas (esperado 2)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.club_rounds'::regclass
    and attname in ('fecha_hora', 'aviso_enviado_en')
    and attnum > 0 and not attisdropped
union all
select 'indice de fecha_hora (esperado 1)', count(*)::text
  from pg_class where relname = 'club_rounds_fecha_hora'
union all
select 'extensiones pg_cron y pg_net (esperado 2)', count(*)::text
  from pg_extension where extname in ('pg_cron', 'pg_net')
union all
select 'tarea programada (esperado */5 * * * *)', coalesce(max(schedule), 'NO - REVISAR')
  from cron.job where jobname = 'avisar-rondas';
