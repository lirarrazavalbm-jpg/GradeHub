-- Lo que Supabase ya trae puesto y nuestros .sql dan por hecho. No es una
-- réplica de Supabase: es el mínimo para que un archivo del repo pueda aplicarse
-- contra un Postgres vacío y se vea si tiene errores.
--
-- Si un .sql empieza a usar algo de Supabase que no está acá, `npm run sql`
-- falla diciendo qué falta. Agrégalo acá, no en el archivo que estás probando.

create schema if not exists auth;
create schema if not exists storage;

-- auth.users es la tabla real a la que apuntan todas nuestras llaves foráneas.
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- En Supabase auth.uid() lee el JWT de la petición. Acá lee una variable de
-- sesión, así que una prueba puede decir "ahora soy esta persona" con
--   select set_config('request.jwt.claim.sub', '<uuid>', false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create table storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- Parte el nombre por "/" y devuelve todo menos el archivo, igual que Supabase.
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

grant usage on schema public, auth, storage to anon, authenticated;

-- LO QUE FALTA A PROPÓSITO: las tres tablas históricas (`user_ramos`,
-- `profiles`, `catalog_reports`) no tienen archivo en el repo — se crearon a
-- mano antes de que existiera supabase/. Por eso `catalog_consensus.sql` y
-- compañía fallan acá con "relation does not exist". No se inventan: escribir
-- una forma supuesta sería peor que no tenerla, porque el OK diría algo falso.
-- Si alguien exporta su definición real desde Supabase, va en un archivo aparte
-- de supabase/ y esto deja de ser un hueco.
