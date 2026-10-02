-- Base del registro de docentes, rescatada de #445 sin perfiles ni reseñas.
-- Aplicación manual: no ejecutar contra producción como parte de este PR.
-- Reaplicable. user_ramos(user_id, data) ya existe en Supabase; solo se lee.
-- El semestre activo es data.ramos; data.historial nunca habilita un aporte.
-- RPC recibe id local, sección, período y nombre: nunca notas ni datos de cuenta.
begin;

create table if not exists public.profesor_aportes (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant text not null check (tenant in ('uc','fen','uai','uandes')),
  ramo_clave text not null check (char_length(ramo_clave) between 1 and 200),
  seccion integer not null check (seccion between 1 and 999),
  periodo text not null check (periodo ~ '^20[0-9]{2}-[12]$'),
  nombre text not null check (char_length(nombre) between 3 and 100),
  primary key (user_id, tenant, ramo_clave, seccion, periodo)
);
create index if not exists profesor_aportes_curso
  on public.profesor_aportes(tenant, ramo_clave, seccion, periodo);
alter table public.profesor_aportes enable row level security;
-- Sin acceso directo, incluso al propio aporte: las RPC proyectan solo nombres.
revoke all on public.profesor_aportes from public, anon, authenticated;

create or replace function public.profesor_normalizar(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(lower(normalize(coalesce(p_texto,''), NFC)),
    'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Adaptación conservadora de la distancia de edición de #445. Una errata en
-- nombres de al menos diez letras; no agrupa nombres por parecido transitivo.
create or replace function public.profesor_coinciden(a text, b text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare x text := public.profesor_normalizar(a); y text := public.profesor_normalizar(b);
  fila integer[]; arriba integer; diagonal integer; i integer; j integer;
begin
  if x = '' or y = '' then return false; end if;
  if x = y then return true; end if;
  if least(length(x),length(y)) < 10 or abs(length(x)-length(y)) > 1
     or left(x,1) <> left(y,1) then return false; end if;
  select array_agg(n) into fila from generate_series(0,length(y)) n;
  for i in 1..length(x) loop
    diagonal := fila[1]; fila[1] := i;
    for j in 1..length(y) loop
      arriba := fila[j+1];
      fila[j+1] := least(arriba+1,fila[j]+1,diagonal+case when substr(x,i,1)=substr(y,j,1) then 0 else 1 end);
      diagonal := arriba;
    end loop;
  end loop;
  return fila[length(y)+1] <= 1;
end;
$$;

create or replace function public.profesor_periodo_actual()
returns text language sql stable set search_path = '' as $$
  -- Igual a semester(): enero/febrero cierran el segundo semestre anterior.
  select case when extract(month from d) <= 2 then (extract(year from d)::int-1)::text||'-2'
    when extract(month from d) <= 7 then extract(year from d)::int::text||'-1'
    else extract(year from d)::int::text||'-2' end
  from (select current_timestamp at time zone 'America/Santiago' as d) fecha;
$$;

create or replace function public.profesor_contexto(p_ramo_id text, p_seccion integer)
returns table(tenant text, ramo_clave text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  return query
    select u.data->>'tenant', public.profesor_normalizar(coalesce(
      nullif(r->>'sigla',''), nullif(r->'origen'->>'ramoKey',''),r->>'nombre'))
    from public.user_ramos u
    cross join lateral jsonb_array_elements(case when jsonb_typeof(u.data->'ramos')='array'
      then u.data->'ramos' else '[]'::jsonb end) r
    where u.user_id=auth.uid() and r->>'id'=p_ramo_id
      and p_seccion between 1 and 999 and r->>'seccion'=p_seccion::text
      and u.data->>'tenant' in ('uc','fen','uai','uandes')
      and coalesce(r->'origen'->>'tenant',u.data->>'tenant')=u.data->>'tenant'
    limit 1;
  if not found then raise exception 'ramo o sección no sincronizados en tu semestre actual'; end if;
end;
$$;

create or replace function public.profesor_docente_estado(p_ramo_id text, p_seccion integer, p_periodo text)
returns table(nombre_publico text, mi_nombre text)
language sql stable security definer set search_path = '' as $$
  with contexto as (select * from public.profesor_contexto(p_ramo_id,p_seccion)),
  aportes as materialized (
    select a.* from public.profesor_aportes a join contexto c using(tenant,ramo_clave)
    where a.seccion=p_seccion and a.periodo=p_periodo
  ), grupos as (
    select b.nombre, count(distinct a.user_id) as cantidad
    from (select distinct nombre from aportes) b join aportes a
      on public.profesor_coinciden(b.nombre,a.nombre)
    group by b.nombre having count(distinct a.user_id)>=3
  ), ganadores as (
    select * from grupos where cantidad=(select max(cantidad) from grupos)
  )
  select (select g.nombre from ganadores g
    -- Un empate entre docentes distintos no publica uno por azar.
    where not exists(select 1 from ganadores otro where not public.profesor_coinciden(g.nombre,otro.nombre))
    order by (select count(*) from aportes a where a.nombre=g.nombre) desc, g.nombre limit 1),
    (select a.nombre from aportes a where a.user_id=auth.uid())
  from contexto;
$$;

create or replace function public.profesor_docente_informar(p_ramo_id text, p_seccion integer, p_periodo text, p_nombre text)
returns void language plpgsql security definer set search_path = '' as $$
declare c record; nombre_limpio text; cp integer;
begin
  if p_periodo is distinct from public.profesor_periodo_actual() then raise exception 'período no vigente'; end if;
  select * into strict c from public.profesor_contexto(p_ramo_id,p_seccion);
  nombre_limpio := regexp_replace(coalesce(p_nombre,''),'[[:cntrl:]]',' ','g');
  foreach cp in array array[8203,8204,8205,8206,8207,8234,8235,8236,8237,8238,8294,8295,8296,8297,65279]
  loop nombre_limpio := replace(nombre_limpio,chr(cp),''); end loop;
  nombre_limpio := btrim(regexp_replace(nombre_limpio,'[[:space:]]+',' ','g'));
  if length(nombre_limpio) not between 3 and 100 or length(public.profesor_normalizar(nombre_limpio))<3
    then raise exception 'nombre inválido'; end if;
  insert into public.profesor_aportes(user_id,tenant,ramo_clave,seccion,periodo,nombre)
    values(auth.uid(),c.tenant,c.ramo_clave,p_seccion,p_periodo,nombre_limpio)
    on conflict(user_id,tenant,ramo_clave,seccion,periodo) do update set nombre=excluded.nombre;
end;
$$;

revoke all on function public.profesor_normalizar(text) from public, anon, authenticated;
revoke all on function public.profesor_coinciden(text,text) from public, anon, authenticated;
revoke all on function public.profesor_periodo_actual() from public, anon, authenticated;
revoke all on function public.profesor_contexto(text,integer) from public, anon, authenticated;
revoke all on function public.profesor_docente_estado(text,integer,text) from public, anon, authenticated;
revoke all on function public.profesor_docente_informar(text,integer,text,text) from public, anon, authenticated;
grant execute on function public.profesor_docente_estado(text,integer,text) to authenticated;
grant execute on function public.profesor_docente_informar(text,integer,text,text) to authenticated;
commit;
