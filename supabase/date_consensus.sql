-- Consenso agregado de fechas y horas de evaluaciones.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a esta RPC. Cloudflare Pages no ejecuta migraciones SQL.
--
-- La fuente es el blob privado de user_ramos, pero la función proyecta solo la
-- identidad del ramo/evaluación y fecha/hora. Nunca devuelve user_id, notas ni
-- candidatos bajo el umbral. Solo cuentan decisiones explícitas cuyo origen es
-- `usuario`: catálogo y consenso no pueden hacerse eco a sí mismos.

create or replace function public.gradehub_consensus_norm(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(p_value, ''))), 'áéíóúüñ', 'aeiouun'),
    '[[:space:]]+', ' ', 'g'
  );
$$;

create or replace function public.date_consensus(p_tenant text)
returns table (
  ramo_key text,
  categoria_key text,
  nota_key text,
  fecha text,
  fecha_respaldos integer,
  hora text,
  hora_respaldos integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with raw as (
    -- Fecha de la categoría completa.
    select
      u.user_id,
      nullif(r->'origen'->>'ramoKey', '') as ramo_key,
      public.gradehub_consensus_norm(c->>'nombre') as categoria_key,
      null::text as nota_key,
      nullif(c->>'fecha', '') as fecha,
      nullif(c->>'hora', '') as hora,
      c->>'fechaOrigen' as fecha_origen,
      c->>'horaOrigen' as hora_origen
    from public.user_ramos as u
    cross join lateral jsonb_array_elements(coalesce(u.data->'ramos', '[]'::jsonb)) as r
    cross join lateral jsonb_array_elements(coalesce(r->'categorias', '[]'::jsonb)) as c
    where auth.uid() is not null
      and r->'origen'->>'tenant' = p_tenant

    union all

    -- Fecha propia de una nota dentro de una categoría.
    select
      u.user_id,
      nullif(r->'origen'->>'ramoKey', '') as ramo_key,
      public.gradehub_consensus_norm(c->>'nombre') as categoria_key,
      public.gradehub_consensus_norm(n->>'nombre') as nota_key,
      nullif(n->>'fecha', '') as fecha,
      nullif(n->>'hora', '') as hora,
      n->>'fechaOrigen' as fecha_origen,
      n->>'horaOrigen' as hora_origen
    from public.user_ramos as u
    cross join lateral jsonb_array_elements(coalesce(u.data->'ramos', '[]'::jsonb)) as r
    cross join lateral jsonb_array_elements(coalesce(r->'categorias', '[]'::jsonb)) as c
    cross join lateral jsonb_array_elements(coalesce(c->'notas', '[]'::jsonb)) as n
    where auth.uid() is not null
      and r->'origen'->>'tenant' = p_tenant
  ),
  valid as (
    select *
    from raw
    where ramo_key is not null
      and categoria_key <> ''
      and (nota_key is null or nota_key <> '')
      and fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and to_char(to_date(fecha, 'YYYY-MM-DD'), 'YYYY-MM-DD') = fecha
      -- Las fechas se reaprenden por semestre. Se conserva algo de pasado para
      -- evaluaciones recién rendidas y cinco meses hacia delante para el curso.
      and to_date(fecha, 'YYYY-MM-DD') between current_date - 42 and current_date + 150
  ),
  date_votes as (
    select
      v.ramo_key,
      v.categoria_key,
      v.nota_key,
      v.fecha,
      count(distinct user_id)::integer as respaldos
    from valid as v
    where fecha_origen = 'usuario'
    group by v.ramo_key, v.categoria_key, v.nota_key, v.fecha
    having count(distinct user_id) >= 5
  ),
  date_top as (
    select ramo_key, categoria_key, nota_key, max(respaldos) as respaldos
    from date_votes
    group by ramo_key, categoria_key, nota_key
  ),
  date_winners as (
    -- Si dos fechas empatan en el mayor respaldo no se elige ninguna.
    select
      d.ramo_key,
      d.categoria_key,
      d.nota_key,
      min(d.fecha) as fecha,
      t.respaldos
    from date_votes as d
    join date_top as t
      on t.ramo_key = d.ramo_key
     and t.categoria_key = d.categoria_key
     and t.nota_key is not distinct from d.nota_key
     and t.respaldos = d.respaldos
    group by d.ramo_key, d.categoria_key, d.nota_key, t.respaldos
    having count(*) = 1
  ),
  hour_votes as (
    select
      v.ramo_key,
      v.categoria_key,
      v.nota_key,
      v.fecha,
      v.hora,
      count(distinct user_id)::integer as respaldos
    from valid as v
    join date_winners as d
      on d.ramo_key = v.ramo_key
     and d.categoria_key = v.categoria_key
     and d.nota_key is not distinct from v.nota_key
     and d.fecha = v.fecha
    where v.hora_origen = 'usuario'
      and v.hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    group by v.ramo_key, v.categoria_key, v.nota_key, v.fecha, v.hora
    having count(distinct user_id) >= 5
  ),
  hour_top as (
    select ramo_key, categoria_key, nota_key, fecha, max(respaldos) as respaldos
    from hour_votes
    group by ramo_key, categoria_key, nota_key, fecha
  ),
  hour_winners as (
    -- La hora tiene su propio umbral y su propio empate. Una fecha puede ganar
    -- aunque todavía no exista una hora compartida.
    select
      h.ramo_key,
      h.categoria_key,
      h.nota_key,
      h.fecha,
      min(h.hora) as hora,
      t.respaldos
    from hour_votes as h
    join hour_top as t
      on t.ramo_key = h.ramo_key
     and t.categoria_key = h.categoria_key
     and t.nota_key is not distinct from h.nota_key
     and t.fecha = h.fecha
     and t.respaldos = h.respaldos
    group by h.ramo_key, h.categoria_key, h.nota_key, h.fecha, t.respaldos
    having count(*) = 1
  )
  select
    d.ramo_key,
    d.categoria_key,
    d.nota_key,
    d.fecha,
    d.respaldos as fecha_respaldos,
    h.hora,
    h.respaldos as hora_respaldos
  from date_winners as d
  left join hour_winners as h
    on h.ramo_key = d.ramo_key
   and h.categoria_key = d.categoria_key
   and h.nota_key is not distinct from d.nota_key
   and h.fecha = d.fecha
  order by d.ramo_key, d.categoria_key, d.nota_key;
$$;

revoke all on function public.gradehub_consensus_norm(text) from public, anon, authenticated;
revoke all on function public.date_consensus(text) from public, anon;
grant execute on function public.date_consensus(text) to authenticated;

