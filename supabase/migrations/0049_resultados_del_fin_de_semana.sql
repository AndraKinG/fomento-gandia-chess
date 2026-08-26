-- Tres pasadas por los resultados el fin de semana de jornada.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0048. HAY QUE RELLENAR EL CRON_SECRET abajo.
--
-- QUÉ SE PIDIÓ Y POR QUÉ (propietario, 2026-08-26): las jornadas de Interclubs se juegan
-- el SÁBADO a las 17:00 —medido: 28 de las 31 de la temporada 2026, y las otras 3 en
-- domingo— y la FACV publica los resultados esa misma noche o al día siguiente. Con una
-- sola pasada, si en ese momento no están, la app se queda con la clasificación vieja
-- hasta la siguiente. Sus horas: **sábado 22:00, sábado 23:55 y domingo 14:00**.
--
-- POR QUÉ pg_cron Y NO VERCEL: el plan Hobby de Vercel permite **una ejecución al día**,
-- y aquí hacen falta tres a horas concretas. pg_cron vive dentro de Supabase y no tiene
-- ese límite; es el mismo mecanismo que ya avisa de las rondas cada 5 min (0037).
--
-- LA PASADA ES LA CORTA (`?forzar=resultados`): solo resultados y actas. Recién acabada
-- la jornada, el orden de fuerza, el ELO de la lista, el calendario de torneos y sus
-- enlaces son los mismos que por la mañana — volver a pedirlos serían tres cuartos de las
-- peticiones para traer lo que ya tenemos. La sync COMPLETA la sigue haciendo el cron de
-- Vercel el domingo y el lunes.
--
-- LAS HORAS VAN EN UTC, que es como corre pg_cron en Supabase, y **están calculadas para
-- INVIERNO (UTC+1)** porque la temporada de Interclubs es de enero a marzo (medido: del
-- 10 de enero al 28 de marzo de 2026). En verano, con UTC+2, estas mismas tareas caerían
-- una hora más tarde en hora local — da igual, en verano no hay jornadas.
--
--   sábado 22:00 Madrid = 21:00 UTC sábado   → '0 21 * * 6'
--   sábado 23:55 Madrid = 22:55 UTC sábado   → '55 22 * * 6'
--   domingo 14:00 Madrid = 13:00 UTC domingo → '0 13 * * 0'
--
-- CORREN TODO EL AÑO. Fuera de temporada no hay jornadas nuevas que traer: la pasada no
-- encuentra nada y termina. Apagarlas y encenderlas por meses sería otra fecha que
-- mantener a cambio de nada.
--
-- ---------------------------------------------------------------------------
-- REPROGRAMA TAMBIÉN EL AVISO DE RONDAS DE LA 0037, Y ESO ES A PROPÓSITO
-- ---------------------------------------------------------------------------
--
-- Aquí hay una trampa que conviene entender antes de tocar el secreto: **el CRON_SECRET
-- queda escrito DENTRO de cada tarea de pg_cron**, en el comando que ejecuta. No lo lee
-- de ningún sitio al dispararse. Así que si algún día se rota el secreto en Vercel, las
-- tareas ya programadas siguen mandando el viejo y el endpoint las rechaza con 401 —
-- **en silencio**, porque a pg_cron le da igual la respuesta: el aviso de "tu ronda
-- empieza en una hora" simplemente dejaría de llegar y nadie se enteraría.
--
-- Por eso esta migración reprograma LAS CUATRO tareas con el mismo valor: se pega el
-- secreto una vez y todo queda consistente. Si se rota el secreto, se vuelve a ejecutar
-- este fichero entero (es idempotente) y ya está.

do $ejecutar$
declare
  -- ↓↓↓ RELLENA ESTA LÍNEA ANTES DE EJECUTAR ↓↓↓
  v_secreto text := 'PEGA_AQUI_TU_CRON_SECRET';
  -- ↑↑↑ el mismo `CRON_SECRET` que está en Vercel ↑↑↑
  v_base text := 'https://fomento-gandia-chess-swart.vercel.app';
  v_cabeceras text;
  v_tarea record;
begin
  if v_secreto = 'PEGA_AQUI_TU_CRON_SECRET' then
    raise exception 'Falta poner el CRON_SECRET en la línea de arriba.';
  end if;

  v_cabeceras := json_build_object(
    'Authorization', 'Bearer ' || v_secreto,
    'Content-Type', 'application/json'
  )::text;

  -- Idempotente: si esto se ejecuta dos veces, las tareas se reemplazan en vez de
  -- duplicarse. Dos tareas iguales no harían daño (la importación crea o actualiza,
  -- nunca duplica una jornada) pero serían el doble de peticiones a la FACV.
  for v_tarea in
    select unnest(array[
      'avisar-rondas',
      'resultados-sabado-noche',
      'resultados-sabado-cierre',
      'resultados-domingo-tarde'
    ]) as nombre
  loop
    if exists (select 1 from cron.job where jobname = v_tarea.nombre) then
      perform cron.unschedule(v_tarea.nombre);
    end if;
  end loop;

  -- El aviso de ronda, igual que en la 0037: cada 5 min. Se reprograma aquí solo para
  -- que lleve el mismo secreto que las de abajo.
  perform cron.schedule(
    'avisar-rondas',
    '*/5 * * * *',
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 30000);',
      v_base || '/api/cron/rondas',
      v_cabeceras
    )
  );

  -- Sábado 22:00 Madrid: la jornada empezó a las 17:00, así que a esta hora ya ha
  -- terminado incluso la partida más larga.
  perform cron.schedule(
    'resultados-sabado-noche',
    '0 21 * * 6',
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 120000);',
      v_base || '/api/cron/director?forzar=resultados',
      v_cabeceras
    )
  );

  -- Sábado 23:55 Madrid: por si el árbitro subió el acta ya de noche.
  perform cron.schedule(
    'resultados-sabado-cierre',
    '55 22 * * 6',
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 120000);',
      v_base || '/api/cron/director?forzar=resultados',
      v_cabeceras
    )
  );

  -- Domingo 14:00 Madrid: la red de las redes. Si el sábado no había nada, a mediodía
  -- del domingo ya está publicado casi siempre.
  perform cron.schedule(
    'resultados-domingo-tarde',
    '0 13 * * 0',
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, timeout_milliseconds := 120000);',
      v_base || '/api/cron/director?forzar=resultados',
      v_cabeceras
    )
  );
end
$ejecutar$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'tareas programadas (esperado 4)' as comprobacion, count(*)::text as valor
  from cron.job
  where jobname in (
    'avisar-rondas',
    'resultados-sabado-noche',
    'resultados-sabado-cierre',
    'resultados-domingo-tarde'
  )
union all
select 'horarios', string_agg(jobname || ' = ' || schedule, ' | ' order by jobname)
  from cron.job
  where jobname in (
    'avisar-rondas',
    'resultados-sabado-noche',
    'resultados-sabado-cierre',
    'resultados-domingo-tarde'
  );
