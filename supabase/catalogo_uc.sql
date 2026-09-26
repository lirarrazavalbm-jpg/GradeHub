-- Catálogo de cursos UC en la base, para buscar sin descargarlo entero.
--
-- Hasta el 2026-09-26, "Agregar ramo" bajaba cursos-uc.js (618 KB, ~12 mil
-- cursos) apenas se abría, y en un iPhone eso se sentía pegado. Ahora la app:
--   1. muestra al tiro la malla y los cursos que más toman quienes estudian la
--      misma carrera (`cursos_frecuentes_uc`), y
--   2. busca el resto acá mientras la persona escribe.
-- Si esta tabla no existe o no hay conexión, la app vuelve sola a descargar el
-- archivo como antes: el deploy no depende de que este SQL esté aplicado.
--
-- APLICAR (una vez, a mano, en el SQL Editor):
--   1. Correr este archivo completo.
--   2. Table Editor → catalogo_uc → Insert → "Import data from CSV" con
--      supabase/catalogo_uc.csv. Ese CSV lo genera `node bin/catalogo-uc-csv.js`
--      desde cursos-uc.js; no se escribe a mano.
--   Para actualizar el catálogo después: truncate public.catalogo_uc; y volver
--   a importar el CSV nuevo.
--
-- SEGURIDAD. Es información pública (catalogo.uc.cl): cualquiera puede leerla y
-- nadie puede escribirla desde la app. No tiene datos de personas, así que no
-- necesita FK a auth.users ni entra en el borrado de cuenta.

create table if not exists public.catalogo_uc (
  sigla     text primary key check (sigla ~ '^[A-Z0-9_]{3,12}$'),
  nombre    text not null check (char_length(btrim(nombre)) between 1 and 200),
  creditos  integer check (creditos between 0 and 1000),
  -- El nombre en minúsculas, sin tildes y con los números romanos escritos en
  -- cifras ("calculo 2"), igual que normBusqueda(normName()) en app.js. Lo
  -- calcula el generador del CSV para que el servidor compare exactamente lo
  -- mismo que la búsqueda local.
  busqueda  text not null
);

alter table public.catalogo_uc enable row level security;
revoke all on public.catalogo_uc from public, anon, authenticated;
grant select on public.catalogo_uc to anon, authenticated;

drop policy if exists catalogo_uc_lectura_publica on public.catalogo_uc;
create policy catalogo_uc_lectura_publica
on public.catalogo_uc
for select
to anon, authenticated
using (true);

-- Los cursos que más toman quienes declararon la misma carrera. Solo cuenta
-- personas DISTINTAS y solo devuelve cursos con al menos tres: nunca quién los
-- toma ni cuántos exactamente. El nombre y los créditos salen del catálogo
-- oficial, no de lo que escribió cada estudiante.
create or replace function public.cursos_frecuentes_uc(p_carrera text)
returns table (sigla text, nombre text, creditos integer)
language sql
stable
security definer
set search_path = ''
as $$
  with tomados as (
    select distinct
      u.user_id,
      upper(coalesce(nullif(r->>'sigla', ''), nullif(r->'origen'->>'ramoKey', ''))) as sigla
    from public.user_ramos as u
    cross join lateral jsonb_array_elements(coalesce(u.data->'ramos', '[]'::jsonb)) as r
    where auth.uid() is not null
      and u.data->>'tenant' = 'uc'
      and u.data->>'carrera' = p_carrera
      and r->'origen'->>'tenant' = 'uc'
  ),
  conteo as (
    select t.sigla, count(distinct t.user_id) as personas
    from tomados as t
    where t.sigla is not null
    group by t.sigla
    having count(distinct t.user_id) >= 3
  )
  select c.sigla, c.nombre, c.creditos
  from conteo as f
  join public.catalogo_uc as c on c.sigla = f.sigla
  order by f.personas desc, c.nombre
  limit 60;
$$;

revoke all on function public.cursos_frecuentes_uc(text) from public, anon;
grant execute on function public.cursos_frecuentes_uc(text) to authenticated;
