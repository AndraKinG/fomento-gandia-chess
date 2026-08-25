-- El enlace a la página de cada torneo en la FACV, y el de sus resultados.
--
-- GATE USUARIO: este fichero NO se aplica automáticamente. Copiar al SQL Editor de
-- Supabase y ejecutarlo a mano, como 0001-0046.
--
-- ESTO CORRIGE UNA CONCLUSIÓN EQUIVOCADA DE HACE DOS DÍAS, y queda escrito para no
-- repetirla: se dijo que "la FACV no tiene página por torneo" tras comprobar
-- `calendario_oficial.php`, que publica siete columnas y CERO enlaces. Era verdad de esa
-- página y falso del sitio: **la portada de facv.org embute otro widget**
-- (`staff/torneos/list_calendario.php`) cuyas tarjetas SÍ enlazan la entrada con las
-- bases —facv.org/xii-torneo-de-ajedrez-ciutat-de-burjassot-sub-2400— y a veces info64 o
-- la retransmisión. Lo encontró el propietario. LECCIÓN: "esta fuente no lo tiene" solo
-- vale para la fuente que se miró.
--
-- DOS COLUMNAS Y NO UNA: la página de la FACV son las BASES (cuándo, dónde, premios,
-- inscripción) y la otra es SEGUIR EL TORNEO (emparejamientos y resultados en info64 o
-- chess-results). Son dos preguntas distintas y en la app se enseñan por separado.
--
-- NO PISAN `url_bases`, que es la que se rellena a mano: si alguien se tomó la molestia
-- de pegar el enlace bueno, una sincronización no se lo puede tirar. Las tres conviven.
--
-- SE RELLENAN SOLAS, y esta es la diferencia con los ELOs de la FIDE: facv.org SÍ se
-- puede descargar desde Vercel (es lo que ya hace la sync del viernes con el orden de
-- fuerza y el ranking), así que esto entra en el cron semanal y no hace falta tocar
-- nada nunca más. fide.com, en cambio, bloquea las IPs de centro de datos y por eso
-- aquello sigue siendo un script a mano.
alter table public.tournaments
  add column if not exists url_facv text,
  add column if not exists url_resultados text;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'columnas nuevas (esperado 2)' as comprobacion, count(*)::text as valor
  from pg_attribute
  where attrelid = 'public.tournaments'::regclass
    and attname in ('url_facv', 'url_resultados')
    and attnum > 0 and not attisdropped;
