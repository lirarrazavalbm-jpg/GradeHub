-- Registro comunitario de profesores de GradeHub.
--
-- APLICAR MANUALMENTE EN SUPABASE ANTES DE MERGEAR EL CLIENTE QUE LO USA.
-- Cloudflare Pages no ejecuta SQL. Este archivo no toca gradehub_v1 ni recibe
-- notas/promedios: guarda solo universidad, ramo, sección, nombre aportado y
-- reseñas. La identidad de auth se conserva únicamente para impedir votos y
-- reseñas duplicadas; ninguna RPC la devuelve al navegador.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.profesores (
  id                  uuid primary key default gen_random_uuid(),
  tenant              text not null check (tenant in ('fen','uc','uai','uandes')),
  nombre_publico      text not null check (char_length(btrim(nombre_publico)) between 3 and 100),
  nombre_normalizado  text not null check (char_length(nombre_normalizado) between 3 and 100),
  estado              text not null default 'activo' check (estado in ('activo','oculto')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant, nombre_normalizado)
);

create table if not exists public.profesor_menciones (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tenant              text not null check (tenant in ('fen','uc','uai','uandes')),
  ramo_clave          text not null check (char_length(ramo_clave) between 2 and 80),
  ramo_nombre         text not null check (char_length(btrim(ramo_nombre)) between 2 and 120),
  seccion             integer not null check (seccion between 1 and 999),
  periodo             text not null check (periodo ~ '^20[0-9]{2}-[12]$'),
  nombre_reportado    text not null check (char_length(btrim(nombre_reportado)) between 3 and 100),
  nombre_normalizado  text not null check (char_length(nombre_normalizado) between 3 and 100),
  profesor_id         uuid references public.profesores(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, tenant, ramo_clave, seccion, periodo)
);

-- Un ramo/sección/período tiene un profesor confirmado a la vez. Si el consenso baja
-- de tres o cambia, esta asociación desaparece o se reemplaza; las reseñas ya
-- publicadas del profesor siguen siendo parte de su historial.
create table if not exists public.profesor_asociaciones (
  id              uuid primary key default gen_random_uuid(),
  profesor_id     uuid not null references public.profesores(id) on delete cascade,
  tenant          text not null check (tenant in ('fen','uc','uai','uandes')),
  ramo_clave      text not null check (char_length(ramo_clave) between 2 and 80),
  ramo_nombre     text not null check (char_length(btrim(ramo_nombre)) between 2 and 120),
  seccion         integer not null check (seccion between 1 and 999),
  periodo         text not null check (periodo ~ '^20[0-9]{2}-[12]$'),
  confirmaciones  integer not null check (confirmaciones >= 3),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant, ramo_clave, seccion, periodo)
);

create table if not exists public.profesor_resenas (
  id              uuid primary key default gen_random_uuid(),
  profesor_id     uuid not null references public.profesores(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  comentario      text check (comentario is null or char_length(comentario) between 1 and 1000),
  oculta          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, profesor_id)
);

create table if not exists public.profesor_resena_reportes (
  id          uuid primary key default gen_random_uuid(),
  resena_id   uuid not null references public.profesor_resenas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  motivo      text not null check (char_length(btrim(motivo)) between 3 and 200),
  created_at  timestamptz not null default now(),
  unique (resena_id, user_id)
);

create index if not exists profesor_menciones_consenso
  on public.profesor_menciones (tenant, ramo_clave, seccion, periodo);
create index if not exists profesor_menciones_nombre_trgm
  on public.profesor_menciones using gin (nombre_normalizado extensions.gin_trgm_ops);
create index if not exists profesores_nombre_trgm
  on public.profesores using gin (nombre_normalizado extensions.gin_trgm_ops);
create index if not exists profesor_asociaciones_profesor
  on public.profesor_asociaciones (profesor_id, updated_at desc);
create index if not exists profesor_resenas_profesor
  on public.profesor_resenas (profesor_id, updated_at desc) where not oculta;

alter table public.profesores enable row level security;
alter table public.profesor_menciones enable row level security;
alter table public.profesor_asociaciones enable row level security;
alter table public.profesor_resenas enable row level security;
alter table public.profesor_resena_reportes enable row level security;

-- No hay acceso directo a tablas. Todas las lecturas y escrituras pasan por
-- RPC de lista blanca para que user_id no pueda terminar en una respuesta por
-- un select olvidado en el cliente.
revoke all on public.profesores from public, anon, authenticated;
revoke all on public.profesor_menciones from public, anon, authenticated;
revoke all on public.profesor_asociaciones from public, anon, authenticated;
revoke all on public.profesor_resenas from public, anon, authenticated;
revoke all on public.profesor_resena_reportes from public, anon, authenticated;

create or replace function public.profesor_texto_limpio(p_texto text, p_max integer)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v text := regexp_replace(coalesce(p_texto,''), '[[:cntrl:]]', ' ', 'g');
  cp integer;
begin
  -- Anulación bidireccional, marcas de ancho cero y BOM: no se ven, pero
  -- pueden alterar cómo se lee un nombre o comentario.
  foreach cp in array array[8203,8204,8205,8206,8207,8234,8235,8236,8237,8238,8294,8295,8296,8297,65279]
  loop
    v := replace(v, chr(cp), '');
  end loop;
  v := btrim(regexp_replace(v, '[[:space:]]+', ' ', 'g'));
  return left(v, greatest(0, least(p_max, 2000)));
end;
$$;

create or replace function public.profesor_nombre_normalizar(p_texto text)
returns text
language sql
immutable
set search_path = public, extensions, pg_catalog
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent(public.profesor_texto_limpio(p_texto, 100))),
    '[^[:alnum:]]+', ' ', 'g'
  ));
$$;

create or replace function public.profesor_nombres_coinciden(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = extensions, pg_catalog
as $$
  select p_a = p_b or (
    left(p_a,1) = left(p_b,1)
    and abs(char_length(p_a)-char_length(p_b)) <= 4
    and extensions.similarity(p_a,p_b) >= 0.72
  );
$$;

revoke all on function public.profesor_texto_limpio(text,integer) from public;
revoke all on function public.profesor_nombre_normalizar(text) from public;
revoke all on function public.profesor_nombres_coinciden(text,text) from public;

create or replace function public.profesor_ramo_estado(
  p_tenant text,
  p_ramo_clave text,
  p_seccion integer,
  p_periodo text
)
returns table (
  profesor_id uuid,
  nombre_publico text,
  confirmaciones integer,
  promedio numeric,
  total_resenas bigint,
  mi_nombre text,
  puede_resenar boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.id,
         p.nombre_publico,
         a.confirmaciones,
         r.promedio,
         coalesce(r.total,0),
         m.nombre_reportado,
         coalesce(m.profesor_id = p.id,false)
  from (select 1) base
  left join public.profesor_asociaciones a
    on a.tenant=p_tenant and a.ramo_clave=upper(btrim(p_ramo_clave)) and a.seccion=p_seccion and a.periodo=p_periodo
  left join public.profesores p on p.id=a.profesor_id and p.estado='activo'
  left join public.profesor_menciones m
   on m.user_id=(select auth.uid()) and m.tenant=p_tenant
   and m.ramo_clave=upper(btrim(p_ramo_clave)) and m.seccion=p_seccion and m.periodo=p_periodo
  left join lateral (
    select round(avg(pr.rating)::numeric,2) promedio, count(*) total
    from public.profesor_resenas pr
    where pr.profesor_id=p.id and not pr.oculta
  ) r on true
  where (select auth.uid()) is not null
    and p_tenant in ('fen','uc','uai','uandes')
    and p_seccion between 1 and 999
    and p_periodo ~ '^20[0-9]{2}-[12]$';
$$;

-- Interna: calcula el grupo más grande de nombres parecidos dentro de UN solo
-- ramo, sección y período. Nunca mezcla cohortes para alcanzar el umbral de tres.
create or replace function public.profesor_reconciliar(
  p_tenant text,
  p_ramo_clave text,
  p_seccion integer,
  p_periodo text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_base text;
  v_confirmaciones integer := 0;
  v_nombre_norm text;
  v_nombre_publico text;
  v_ramo_nombre text;
  v_profesor_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant||'|'||p_ramo_clave||'|'||p_seccion::text||'|'||p_periodo,0));

  select b.nombre_normalizado, count(distinct o.user_id)::integer
    into v_base, v_confirmaciones
  from public.profesor_menciones b
  join public.profesor_menciones o
    on o.tenant=b.tenant and o.ramo_clave=b.ramo_clave and o.seccion=b.seccion and o.periodo=b.periodo
   and public.profesor_nombres_coinciden(b.nombre_normalizado,o.nombre_normalizado)
  where b.tenant=p_tenant and b.ramo_clave=p_ramo_clave and b.seccion=p_seccion and b.periodo=p_periodo
  group by b.nombre_normalizado
  order by count(distinct o.user_id) desc, min(b.created_at), b.nombre_normalizado
  limit 1;

  update public.profesor_menciones set profesor_id=null
   where tenant=p_tenant and ramo_clave=p_ramo_clave and seccion=p_seccion and periodo=p_periodo;

  if v_base is null or v_confirmaciones < 3 then
    delete from public.profesor_asociaciones
     where tenant=p_tenant and ramo_clave=p_ramo_clave and seccion=p_seccion and periodo=p_periodo;
    return;
  end if;

  -- La escritura exacta más repetida gana como nombre visible. Tildes y
  -- mayúsculas se conservan; el normalizado sirve solo para comparar.
  select m.nombre_normalizado, m.nombre_reportado, m.ramo_nombre
    into v_nombre_norm, v_nombre_publico, v_ramo_nombre
  from public.profesor_menciones m
  where m.tenant=p_tenant and m.ramo_clave=p_ramo_clave and m.seccion=p_seccion and m.periodo=p_periodo
    and public.profesor_nombres_coinciden(v_base,m.nombre_normalizado)
  group by m.nombre_normalizado, m.nombre_reportado, m.ramo_nombre
  order by count(*) desc, min(m.created_at), m.nombre_reportado
  limit 1;

  insert into public.profesores (tenant,nombre_publico,nombre_normalizado)
  values (p_tenant,v_nombre_publico,v_nombre_norm)
  on conflict (tenant,nombre_normalizado) do update
    set updated_at=now()
  returning id into v_profesor_id;

  update public.profesor_menciones
     set profesor_id=v_profesor_id
   where tenant=p_tenant and ramo_clave=p_ramo_clave and seccion=p_seccion and periodo=p_periodo
     and public.profesor_nombres_coinciden(v_base,nombre_normalizado);

  insert into public.profesor_asociaciones
    (profesor_id,tenant,ramo_clave,ramo_nombre,seccion,periodo,confirmaciones)
  values
    (v_profesor_id,p_tenant,p_ramo_clave,v_ramo_nombre,p_seccion,p_periodo,v_confirmaciones)
  on conflict (tenant,ramo_clave,seccion,periodo) do update
    set profesor_id=excluded.profesor_id,
        ramo_nombre=excluded.ramo_nombre,
        confirmaciones=excluded.confirmaciones,
        updated_at=now();
end;
$$;

revoke all on function public.profesor_reconciliar(text,text,integer,text) from public;

-- Borrar una cuenta borra sus menciones por cascade. El consenso se vuelve a
-- calcular en la misma transacción para que una ficha no conserve “3” cuando
-- ya solo quedan dos cuentas reales detrás.
create or replace function public.profesor_mencion_borrada_reconciliar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.profesor_reconciliar(old.tenant,old.ramo_clave,old.seccion,old.periodo);
  return old;
end;
$$;

drop trigger if exists profesor_mencion_borrada_reconcilia on public.profesor_menciones;
create trigger profesor_mencion_borrada_reconcilia
after delete on public.profesor_menciones
for each row execute function public.profesor_mencion_borrada_reconciliar();

revoke all on function public.profesor_mencion_borrada_reconciliar() from public;

create or replace function public.profesor_reportar(
  p_tenant text,
  p_ramo_clave text,
  p_ramo_nombre text,
  p_seccion integer,
  p_periodo text,
  p_nombre text
)
returns table (
  profesor_id uuid,
  nombre_publico text,
  confirmaciones integer,
  promedio numeric,
  total_resenas bigint,
  mi_nombre text,
  puede_resenar boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clave text := upper(public.profesor_texto_limpio(p_ramo_clave,80));
  v_ramo text := public.profesor_texto_limpio(p_ramo_nombre,120);
  v_nombre text := public.profesor_texto_limpio(p_nombre,100);
  v_norm text := public.profesor_nombre_normalizar(p_nombre);
begin
  if v_uid is null then raise exception 'sin sesión'; end if;
  if p_tenant not in ('fen','uc','uai','uandes') then raise exception 'universidad inválida'; end if;
  if char_length(v_clave) not between 2 and 80 or char_length(v_ramo) not between 2 and 120 then raise exception 'ramo inválido'; end if;
  if p_seccion not between 1 and 999 then raise exception 'sección inválida'; end if;
  if p_periodo !~ '^20[0-9]{2}-[12]$' then raise exception 'período inválido'; end if;
  if char_length(v_norm) not between 3 and 100 then raise exception 'nombre inválido'; end if;

  insert into public.profesor_menciones
    (user_id,tenant,ramo_clave,ramo_nombre,seccion,periodo,nombre_reportado,nombre_normalizado)
  values
    (v_uid,p_tenant,v_clave,v_ramo,p_seccion,p_periodo,v_nombre,v_norm)
  on conflict (user_id,tenant,ramo_clave,seccion,periodo) do update
    set ramo_nombre=excluded.ramo_nombre,
        nombre_reportado=excluded.nombre_reportado,
        nombre_normalizado=excluded.nombre_normalizado,
        profesor_id=null,
        updated_at=now();

  perform public.profesor_reconciliar(p_tenant,v_clave,p_seccion,p_periodo);
  return query select * from public.profesor_ramo_estado(p_tenant,v_clave,p_seccion,p_periodo);
end;
$$;

create or replace function public.profesores_listar(p_tenant text, p_busqueda text default null)
returns table (
  id uuid,
  nombre_publico text,
  promedio numeric,
  total_resenas bigint,
  cursos jsonb
)
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select p.id,p.nombre_publico,r.promedio,coalesce(r.total,0),
    coalesce((
      select jsonb_agg(jsonb_build_object('clave',a.ramo_clave,'ramo',a.ramo_nombre,'seccion',a.seccion,'periodo',a.periodo) order by a.periodo desc,a.ramo_clave,a.seccion)
      from public.profesor_asociaciones a where a.profesor_id=p.id
    ),'[]'::jsonb)
  from public.profesores p
  left join lateral (
    select round(avg(pr.rating)::numeric,2) promedio,count(*) total
    from public.profesor_resenas pr where pr.profesor_id=p.id and not pr.oculta
  ) r on true
  where (select auth.uid()) is not null and p.tenant=p_tenant and p.estado='activo'
    and exists (select 1 from public.profesor_asociaciones a where a.profesor_id=p.id)
    and (
      nullif(btrim(coalesce(p_busqueda,'')),'') is null
      or p.nombre_normalizado % public.profesor_nombre_normalizar(p_busqueda)
      or exists (
        select 1 from public.profesor_asociaciones a
        where a.profesor_id=p.id and (
          lower(a.ramo_clave) like '%'||lower(btrim(p_busqueda))||'%'
          or lower(extensions.unaccent(a.ramo_nombre)) like '%'||lower(extensions.unaccent(btrim(p_busqueda)))||'%'
        )
      )
    )
  order by r.promedio desc nulls last,r.total desc,p.nombre_publico
  limit 100;
$$;

create or replace function public.profesor_detalle(p_profesor_id uuid)
returns table (
  id uuid,
  nombre_publico text,
  promedio numeric,
  total_resenas bigint,
  cursos jsonb,
  resenas jsonb,
  puede_resenar boolean,
  mi_resena jsonb
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p.id,p.nombre_publico,r.promedio,coalesce(r.total,0),
    coalesce((select jsonb_agg(jsonb_build_object('clave',a.ramo_clave,'ramo',a.ramo_nombre,'seccion',a.seccion,'periodo',a.periodo) order by a.periodo desc,a.ramo_clave,a.seccion) from public.profesor_asociaciones a where a.profesor_id=p.id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',pr.id,'rating',pr.rating,'comentario',pr.comentario,'fecha',pr.updated_at,
      'es_mia',pr.user_id=(select auth.uid())
    ) order by pr.updated_at desc) from (select * from public.profesor_resenas where profesor_id=p.id and not oculta order by updated_at desc limit 100) pr),'[]'::jsonb),
    (exists(select 1 from public.profesor_menciones m where m.user_id=(select auth.uid()) and m.profesor_id=p.id)
      or exists(select 1 from public.profesor_resenas mr where mr.user_id=(select auth.uid()) and mr.profesor_id=p.id)),
    (select jsonb_build_object('rating',mr.rating,'comentario',mr.comentario) from public.profesor_resenas mr where mr.user_id=(select auth.uid()) and mr.profesor_id=p.id)
  from public.profesores p
  left join lateral (
    select round(avg(pr.rating)::numeric,2) promedio,count(*) total
    from public.profesor_resenas pr where pr.profesor_id=p.id and not pr.oculta
  ) r on true
  where (select auth.uid()) is not null and p.id=p_profesor_id and p.estado='activo'
    and exists(select 1 from public.profesor_asociaciones a where a.profesor_id=p.id);
$$;

create or replace function public.profesor_resena_guardar(p_profesor_id uuid, p_rating integer, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_comentario text := nullif(public.profesor_texto_limpio(p_comentario,1000),'');
begin
  if v_uid is null then raise exception 'sin sesión'; end if;
  if p_rating not between 1 and 5 then raise exception 'rating inválido'; end if;

  if not exists(
    select 1 from public.profesor_menciones m
    where m.user_id=v_uid and m.profesor_id=p_profesor_id
  ) and not exists(
    select 1 from public.profesor_resenas r
    where r.user_id=v_uid and r.profesor_id=p_profesor_id
  ) then
    raise exception 'primero confirma a este profesor en tu ramo y sección';
  end if;

  insert into public.profesor_resenas (profesor_id,user_id,rating,comentario)
  values (p_profesor_id,v_uid,p_rating,v_comentario)
  on conflict (user_id,profesor_id) do update
    set rating=excluded.rating,comentario=excluded.comentario,updated_at=now();
end;
$$;

create or replace function public.profesor_resena_eliminar(p_profesor_id uuid)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  delete from public.profesor_resenas where user_id=(select auth.uid()) and profesor_id=p_profesor_id;
$$;

create or replace function public.profesor_resena_reportar(p_resena_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := (select auth.uid());
  v_motivo text := public.profesor_texto_limpio(p_motivo,200);
begin
  if v_uid is null then raise exception 'sin sesión'; end if;
  if char_length(v_motivo) not between 3 and 200 then raise exception 'motivo inválido'; end if;
  if not exists(select 1 from public.profesor_resenas where id=p_resena_id and not oculta and user_id<>v_uid) then
    raise exception 'reseña no disponible';
  end if;
  insert into public.profesor_resena_reportes (resena_id,user_id,motivo)
  values (p_resena_id,v_uid,v_motivo)
  on conflict (resena_id,user_id) do update set motivo=excluded.motivo,created_at=now();
end;
$$;

revoke all on function public.profesor_ramo_estado(text,text,integer,text) from public;
revoke all on function public.profesor_reportar(text,text,text,integer,text,text) from public;
revoke all on function public.profesores_listar(text,text) from public;
revoke all on function public.profesor_detalle(uuid) from public;
revoke all on function public.profesor_resena_guardar(uuid,integer,text) from public;
revoke all on function public.profesor_resena_eliminar(uuid) from public;
revoke all on function public.profesor_resena_reportar(uuid,text) from public;

grant execute on function public.profesor_ramo_estado(text,text,integer,text) to authenticated;
grant execute on function public.profesor_reportar(text,text,text,integer,text,text) to authenticated;
grant execute on function public.profesores_listar(text,text) to authenticated;
grant execute on function public.profesor_detalle(uuid) to authenticated;
grant execute on function public.profesor_resena_guardar(uuid,integer,text) to authenticated;
grant execute on function public.profesor_resena_eliminar(uuid) to authenticated;
grant execute on function public.profesor_resena_reportar(uuid,text) to authenticated;
