-- Aprobar profesores y publicar sus clases, desde el SQL Editor de Supabase.
--
-- Hasta ahora aprobar era escribir UPDATE a mano y acertarle a la restricción
-- `tutor_anuncios_publicado_revisado_pagado`: un anuncio publicado necesita
-- revisado_at, pagado_at y publicado_at a la vez, y vence_at posterior. Estas
-- funciones hacen ese paso completo, validan el estado de partida y dejan
-- registro de cada publicación con lo que se cobró.
--
-- DÓNDE VIVEN Y POR QUÉ. En el esquema `admin`, no en `public`. La API de
-- Supabase expone `public`, y Supabase le concede EXECUTE a anon y
-- authenticated sobre toda función nueva que se cree ahí. Fuera de ese esquema
-- no hay endpoint que las llame, y además se revoca todo a mano. Son
-- `security invoker` (lo normal): corren con los permisos de quien las llama,
-- así que desde el SQL Editor funcionan y desde el navegador no tendrían con
-- qué, aunque alguien las alcanzara.
--
-- Requiere clases_particulares.sql aplicado antes. Es aditivo: no cambia
-- ninguna tabla existente ni ninguna política.
--
-- USO (SQL Editor):
--   select * from admin.pendientes();
--   select admin.revisar_profesor('<user_id>', 'aprobado');   -- o 'rechazado', 'suspendido'
--   select admin.publicar_anuncio('<anuncio_id>', 0);         -- cargo en pesos; 0 = piloto sin cargo
--   select admin.publicar_anuncio('<anuncio_id>', 3000, 30);  -- con cargo y días explícitos
--   select admin.devolver_anuncio('<anuncio_id>');            -- vuelve a borrador para corregir
--   select admin.aprobar_logo('<user_id>');                   -- o admin.rechazar_logo

create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- Una fila por cada vez que se publicó un anuncio. Un anuncio que se pausa, se
-- edita y se vuelve a aprobar tiene dos filas: el cobro de la primera campaña
-- no se pisa con el de la segunda. No guarda nada del estudiante ni del
-- profesor además del anuncio, y se va con él (y el anuncio, con la cuenta).
create table if not exists admin.anuncio_publicaciones (
  id            uuid primary key default gen_random_uuid(),
  anuncio_id    uuid not null references public.tutor_anuncios(id) on delete cascade,
  cargo_clp     integer not null check (cargo_clp between 0 and 10000000),
  dias          integer not null check (dias between 1 and 90),
  publicado_at  timestamptz not null default now(),
  vence_at      timestamptz not null,
  check (vence_at > publicado_at)
);
create index if not exists anuncio_publicaciones_por_anuncio
  on admin.anuncio_publicaciones (anuncio_id, publicado_at desc);

-- Cero políticas: fuera del dueño (el equipo en el SQL Editor), nadie la lee.
alter table admin.anuncio_publicaciones enable row level security;
revoke all on admin.anuncio_publicaciones from public, anon, authenticated;

-- Lo que está esperando una decisión, con lo necesario para tomarla. Trae el
-- correo de la cuenta porque aprobar exige comprobar que el contacto sea
-- plausible; por eso mismo esta función no puede quedar al alcance de nadie más.
create or replace function admin.pendientes()
returns table (
  tipo      text,
  id        uuid,
  profesor  text,
  correo    text,
  desde     timestamptz,
  detalle   jsonb
)
language sql
stable
set search_path = public, admin
as $$
  select 'profesor', p.user_id, p.nombre_publico, u.email::text, p.solicitado_at,
         jsonb_build_object('presentacion', p.presentacion)
    from public.tutor_perfiles p
    join auth.users u on u.id = p.user_id
   where p.estado = 'pendiente'
  union all
  select 'anuncio', a.id, p.nombre_publico, u.email::text, a.created_at,
         jsonb_build_object(
           'estado_profesor', p.estado,
           'titulo', a.titulo,
           'descripcion', a.descripcion,
           'tenant', a.tenant,
           'ramos', a.ramos_siglas,
           'precio_clase_clp', a.precio_clp,
           'modalidad', coalesce(a.modalidad_otra, a.modalidad),
           'ubicacion', coalesce(a.ubicacion_otra, a.ubicacion),
           'detalles', a.detalles,
           'contacto', a.contacto_tipo || ': ' || a.contacto_valor,
           'criterios', a.criterios,
           'tiene_flyer', a.flyer_path is not null,
           'publicaciones_anteriores',
             (select count(*) from admin.anuncio_publicaciones x where x.anuncio_id = a.id)
         )
    from public.tutor_anuncios a
    join auth.users u on u.id = a.autor_id
    left join public.tutor_perfiles p on p.user_id = a.autor_id
   where a.estado = 'en_revision'
  union all
  -- Un logo propuesto que todavía no se muestra. Se revisa abriendo la ruta
  -- en Storage → tutor-flyers.
  select 'logo', p.user_id, p.nombre_publico, u.email::text, p.revisado_at,
         jsonb_build_object('ruta', p.logo_path, 'reemplaza', p.logo_aprobado_path)
    from public.tutor_perfiles p
    join auth.users u on u.id = p.user_id
   where p.logo_path is not null
     and p.logo_path is distinct from p.logo_aprobado_path
  order by 5;
$$;

-- Aprobar, rechazar o suspender una ficha. Suspender oculta de inmediato todos
-- sus anuncios publicados (la política de lectura exige `tutor_aprobado`) sin
-- borrarlos ni tocar su estado: al reaprobar vuelven los que no hayan vencido.
create or replace function admin.revisar_profesor(p_user_id uuid, p_decision text)
returns text
language plpgsql
set search_path = public, admin
as $$
declare
  actual text;
begin
  if p_decision not in ('aprobado', 'rechazado', 'suspendido') then
    raise exception 'la decisión tiene que ser aprobado, rechazado o suspendido';
  end if;

  select estado into actual from public.tutor_perfiles where user_id = p_user_id for update;
  if actual is null then
    raise exception 'no hay ficha de profesor para %', p_user_id;
  end if;
  if actual = p_decision then
    return 'sin cambios: ya estaba ' || actual;
  end if;
  if p_decision = 'suspendido' and actual <> 'aprobado' then
    raise exception 'solo se suspende a un profesor aprobado (está %)', actual;
  end if;

  update public.tutor_perfiles
     set estado = p_decision, revisado_at = now()
   where user_id = p_user_id;
  return actual || ' → ' || p_decision;
end;
$$;

-- Publica un anuncio en revisión. El cargo es obligatorio y explícito —0 es
-- una decisión, "piloto sin cargo", no un valor por omisión— porque la tarifa
-- todavía no está decidida y no puede quedar decidida por un default.
create or replace function admin.publicar_anuncio(p_anuncio_id uuid, p_cargo_clp integer, p_dias integer default 30)
returns text
language plpgsql
set search_path = public, admin
as $$
declare
  a public.tutor_anuncios%rowtype;
  ahora timestamptz := now();
  vence timestamptz;
begin
  if p_cargo_clp is null or p_cargo_clp < 0 then
    raise exception 'el cargo va en pesos y no puede ser negativo (0 si es sin cargo)';
  end if;
  if p_dias is null or p_dias not between 1 and 90 then
    raise exception 'la campaña dura entre 1 y 90 días';
  end if;

  select * into a from public.tutor_anuncios where id = p_anuncio_id for update;
  if not found then
    raise exception 'no existe el anuncio %', p_anuncio_id;
  end if;
  if a.estado <> 'en_revision' then
    raise exception 'solo se publica un anuncio en revisión (está %)', a.estado;
  end if;
  if not public.tutor_aprobado(a.autor_id) then
    raise exception 'el profesor de este anuncio no está aprobado';
  end if;
  if a.titulo is null then
    raise exception 'el anuncio no tiene título';
  end if;

  vence := ahora + make_interval(days => p_dias);

  update public.tutor_anuncios
     set estado = 'publicado',
         revisado_at = ahora,
         pagado_at = ahora,
         publicado_at = ahora,
         vence_at = vence
   where id = p_anuncio_id;

  insert into admin.anuncio_publicaciones (anuncio_id, cargo_clp, dias, publicado_at, vence_at)
  values (p_anuncio_id, p_cargo_clp, p_dias, ahora, vence);

  return 'publicado hasta ' || to_char(vence at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI');
end;
$$;

-- Devuelve un anuncio en revisión a borrador para que el profesor lo corrija.
-- No hay columna de motivo todavía: el motivo se le dice por fuera.
create or replace function admin.devolver_anuncio(p_anuncio_id uuid)
returns text
language plpgsql
set search_path = public, admin
as $$
declare
  actual text;
begin
  select estado into actual from public.tutor_anuncios where id = p_anuncio_id for update;
  if actual is null then
    raise exception 'no existe el anuncio %', p_anuncio_id;
  end if;
  if actual <> 'en_revision' then
    raise exception 'solo se devuelve un anuncio en revisión (está %)', actual;
  end if;

  update public.tutor_anuncios set estado = 'borrador' where id = p_anuncio_id;
  return 'en_revision → borrador';
end;
$$;

-- El logo propuesto pasa a ser el que se ve en todos sus anuncios.
create or replace function admin.aprobar_logo(p_user_id uuid)
returns text
language plpgsql
set search_path = public, admin
as $$
declare
  propuesto text;
begin
  select logo_path into propuesto from public.tutor_perfiles where user_id = p_user_id for update;
  if propuesto is null then
    raise exception 'ese profesor no tiene un logo propuesto';
  end if;
  update public.tutor_perfiles set logo_aprobado_path = propuesto where user_id = p_user_id;
  return 'logo aprobado: ' || propuesto;
end;
$$;

-- Descarta el propuesto: vuelve al que ya se mostraba (o a ninguno).
create or replace function admin.rechazar_logo(p_user_id uuid)
returns text
language plpgsql
set search_path = public, admin
as $$
begin
  update public.tutor_perfiles set logo_path = logo_aprobado_path where user_id = p_user_id;
  if not found then
    raise exception 'no hay ficha de profesor para %', p_user_id;
  end if;
  return 'logo propuesto descartado';
end;
$$;

revoke all on all functions in schema admin from public, anon, authenticated;
