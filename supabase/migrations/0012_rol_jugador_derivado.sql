-- El rol `jugador` deja de guardarse: se deduce.
--
-- Decidido por el propietario el 2026-08-05. Su definición de jugador es "todo
-- socio del club que tenga su cuenta", y eso es exactamente lo que ya responde
-- `esta_vinculado()` (`profiles.player_id is not null`). Guardarlo además como
-- fila en `member_roles` era la misma verdad en dos sitios.
--
-- Y ya se sabía por dónde se iban a separar: `aprobarVinculo` escribe
-- `profiles.player_id` al aprobar una vinculación, pero no insertaba el rol. El
-- traspaso de la 0011 cuadró solo porque había un único socio; el siguiente
-- aprobado habría tenido ficha sin fila de rol.
--
-- A partir de aquí `member_roles` guarda SOLO concesiones explícitas —las que
-- alguien tiene que otorgar a dedo— y nada que se pueda deducir de otro dato.
--
-- GATE USUARIO: copiar al SQL Editor de Supabase y ejecutar a mano.

begin;

delete from public.member_roles where rol = 'jugador';

-- El check de la 0011 se creó en línea, así que Postgres lo nombró
-- `member_roles_rol_check`. Se sustituye por uno que ya no admite 'jugador',
-- para que no pueda volver a colarse.
alter table public.member_roles drop constraint if exists member_roles_rol_check;
alter table public.member_roles
  add constraint member_roles_rol_check check (rol in ('junta', 'admin'));

commit;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
select 'filas jugador (debe ser 0)' as comprobacion, count(*)::text as valor
  from public.member_roles where rol = 'jugador'
union all
select 'roles que quedan', coalesce(string_agg(distinct rol, ', '), '(ninguno)')
  from public.member_roles
union all
select 'el check ya no admite jugador',
       case when exists (
         select 1 from pg_constraint
         where conname = 'member_roles_rol_check'
           and pg_get_constraintdef(oid) not like '%jugador%'
       ) then 'si' else 'NO - REVISAR' end
union all
select 'socios con ficha (jugadores, ya derivado)', count(*)::text
  from public.profiles where player_id is not null;
