-- Marketplace de clases particulares.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- lo consume. Cloudflare Pages solo publica archivos estáticos: no ejecuta
-- migraciones de Supabase por sí sola.
--
-- PRIVACIDAD QUE NO SE NEGOCIA. La segmentación de anuncios ocurre en el
-- navegador. El servidor entrega los anuncios publicados de una universidad,
-- pero nunca recibe los ramos, notas ni riesgos del estudiante que los mira.
--
-- `auth.uid()` en registrar_metrica_anuncio SOLO autoriza la llamada. No se
-- guarda en anuncio_metricas ni en ninguna otra fila de métricas: contar
-- personas distintas exigiría conservar esa identidad, que es justamente lo
-- que este modelo evita.

-- Ser estudiante no convierte la cuenta en cuenta de profesor. La persona
-- postula con esta ficha y el equipo la aprueba por separado. El navegador no
-- tiene permisos para escribir `estado` ni las marcas de revisión.
create table if not exists public.tutor_perfiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  nombre_publico   text not null check (char_length(btrim(nombre_publico)) between 2 and 100),
  presentacion     text not null check (char_length(btrim(presentacion)) between 20 and 1500),
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'aprobado', 'rechazado', 'suspendido')),
  solicitado_at    timestamptz not null default now(),
  revisado_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint tutor_perfiles_revision_coherente check (
    (estado = 'pendiente' and revisado_at is null)
    or (estado <> 'pendiente' and revisado_at is not null)
  )
);

alter table public.tutor_perfiles enable row level security;
revoke all on public.tutor_perfiles from public, anon, authenticated;
grant select (user_id, nombre_publico, presentacion, estado, solicitado_at, revisado_at, created_at)
  on public.tutor_perfiles to authenticated;
grant insert (user_id, nombre_publico, presentacion)
  on public.tutor_perfiles to authenticated;
grant update (nombre_publico, presentacion)
  on public.tutor_perfiles to authenticated;

drop policy if exists tutor_perfiles_select_propio on public.tutor_perfiles;
create policy tutor_perfiles_select_propio
on public.tutor_perfiles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists tutor_perfiles_insert_pendiente_propio on public.tutor_perfiles;
create policy tutor_perfiles_insert_pendiente_propio
on public.tutor_perfiles
for insert
to authenticated
with check ((select auth.uid()) = user_id and estado = 'pendiente' and revisado_at is null);

drop policy if exists tutor_perfiles_update_contenido_propio on public.tutor_perfiles;
create policy tutor_perfiles_update_contenido_propio
on public.tutor_perfiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- La función no entrega la ficha ni la identidad: solo permite que las
-- políticas comprueben la aprobación aun cuando quien mira es anónimo.
create or replace function public.tutor_aprobado(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tutor_perfiles
    where user_id = p_user_id and estado = 'aprobado'
  );
$$;

revoke all on function public.tutor_aprobado(uuid) from public;
grant execute on function public.tutor_aprobado(uuid) to anon, authenticated;

create table if not exists public.tutor_anuncios (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid not null references auth.users(id) on delete cascade,
  tenant          text not null check (tenant in ('fen', 'uc', 'uai', 'uandes')),
  ramos_siglas    text[] not null check (cardinality(ramos_siglas) between 1 and 12),
  modalidad       text not null check (modalidad in ('individual', 'grupal')),
  ubicacion       text not null check (ubicacion in ('online', 'presencial', 'hibrido')),
  precio_clp      integer not null check (precio_clp between 1000 and 500000),
  descripcion     text not null check (char_length(btrim(descripcion)) between 20 and 1500),
  contacto_tipo   text not null check (contacto_tipo in ('whatsapp', 'instagram', 'email')),
  contacto_valor  text not null check (char_length(btrim(contacto_valor)) between 3 and 160),
  estado          text not null default 'borrador'
                  check (estado in ('borrador', 'en_revision', 'publicado', 'pausado', 'expirado')),
  revisado_at     timestamptz,
  pagado_at       timestamptz,
  publicado_at    timestamptz,
  vence_at        timestamptz,
  created_at      timestamptz not null default now(),
  constraint tutor_anuncios_publicado_revisado_pagado check (
    estado <> 'publicado' or (revisado_at is not null and pagado_at is not null and publicado_at is not null)
  ),
  constraint tutor_anuncios_vencimiento_valido check (
    vence_at is null or publicado_at is null or vence_at > publicado_at
  )
);

-- Aditivo: si existía un aviso queda con criterios NULL y sigue siendo general.
-- No reinterpreta ni rellena campañas anteriores. Sin criterios explícitos el
-- cliente no usa notas para recomendarlo. La tarifa se acuerda al publicar: el
-- alcance único ya se registra más abajo, pero la tarifa no queda fijada en el
-- aviso ni hay presupuesto exigido en el servidor, así que todavía no se cobra
-- solo.
alter table public.tutor_anuncios add column if not exists criterios jsonb
  check (
    criterios is null or case
      when jsonb_typeof(criterios) = 'object'
       and jsonb_typeof(criterios->'promedioMenorA') = 'number'
       and jsonb_typeof(criterios->'avanceMinimo') = 'number'
       and (criterios - 'promedioMenorA' - 'avanceMinimo') = '{}'::jsonb
      then (criterios->>'promedioMenorA')::numeric > 1
       and (criterios->>'promedioMenorA')::numeric <= 7
       and (criterios->>'avanceMinimo')::numeric >= 0
       and (criterios->>'avanceMinimo')::numeric < 100
      else false
    end
  );

-- El título es aditivo: un anuncio antiguo sin él conserva su descripción.
alter table public.tutor_anuncios add column if not exists titulo text
  check (titulo is null or char_length(btrim(titulo)) between 5 and 90);

-- El flyer es opcional y vive en un bucket privado. La fila guarda solo el
-- path; nunca una URL firmada que vaya a vencer ni el nombre que subió la
-- persona. La carpeta tiene que corresponder a ESTA fila y su dueño.
alter table public.tutor_anuncios add column if not exists flyer_path text
  check (
    flyer_path is null or (
      flyer_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
      and split_part(flyer_path, '/', 1) = autor_id::text
      and split_part(flyer_path, '/', 2) = id::text
    )
  );

-- FORMATO, LUGAR Y DETALLES A MEDIDA. Pedido de Lucas del 2026-09-25: las
-- alternativas fijas no calzan con todas las clases. Formato y lugar pasan a
-- ser opcionales, y cada uno acepta 'otra' con un texto propio. Además cada
-- anuncio puede llevar hasta cuatro detalles "etiqueta: valor" (texto, nunca
-- enlaces: el contacto sigue siendo solo WhatsApp, Instagram o correo).
--
-- Aditivo y compatible: relaja restricciones, no reinterpreta nada. Una fila
-- existente sigue siendo válida tal como está. Si en producción la restricción
-- tiene otro nombre, el drop no la encuentra y 'otra' falla al guardar: se
-- nota al tiro y no corrompe nada.
alter table public.tutor_anuncios alter column modalidad drop not null;
alter table public.tutor_anuncios alter column ubicacion drop not null;
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_modalidad_check;
alter table public.tutor_anuncios add constraint tutor_anuncios_modalidad_check
  check (modalidad is null or modalidad in ('individual', 'grupal', 'otra'));
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_ubicacion_check;
alter table public.tutor_anuncios add constraint tutor_anuncios_ubicacion_check
  check (ubicacion is null or ubicacion in ('online', 'presencial', 'hibrido', 'otra'));

alter table public.tutor_anuncios add column if not exists modalidad_otra text
  check (modalidad_otra is null or char_length(btrim(modalidad_otra)) between 2 and 40);
alter table public.tutor_anuncios add column if not exists ubicacion_otra text
  check (ubicacion_otra is null or char_length(btrim(ubicacion_otra)) between 2 and 40);
-- El texto propio existe si y solo si se eligió 'otra'.
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_otra_coherente;
alter table public.tutor_anuncios add constraint tutor_anuncios_otra_coherente check (
  (coalesce(modalidad, '') = 'otra') = (modalidad_otra is not null)
  and (coalesce(ubicacion, '') = 'otra') = (ubicacion_otra is not null)
);

create or replace function public.detalles_clase_validos(d jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when d is null then true
    when jsonb_typeof(d) <> 'array' then false
    when jsonb_array_length(d) > 4 then false
    else not exists (
      select 1 from jsonb_array_elements(d) e
      where jsonb_typeof(e) <> 'object'
         or (e - 'etiqueta' - 'valor') <> '{}'::jsonb
         or coalesce(jsonb_typeof(e->'etiqueta'), '') <> 'string'
         or coalesce(jsonb_typeof(e->'valor'), '') <> 'string'
         or char_length(btrim(e->>'etiqueta')) not between 1 and 30
         or char_length(btrim(e->>'valor')) not between 1 and 80
    )
  end;
$$;

alter table public.tutor_anuncios add column if not exists detalles jsonb
  check (public.detalles_clase_validos(detalles));

create index if not exists tutor_anuncios_publicados_por_tenant
  on public.tutor_anuncios (tenant, publicado_at desc)
  where estado = 'publicado';
create index if not exists tutor_anuncios_siglas_gin
  on public.tutor_anuncios using gin (ramos_siglas);

alter table public.tutor_anuncios enable row level security;

-- Los avisos publicados son información que el tutor decidió hacer pública.
-- Aun así no se entrega autor_id ni las marcas internas de revisión/pago:
-- los permisos de columna de abajo dejan fuera esos campos.
revoke all on public.tutor_anuncios from public, anon, authenticated;
grant select (id, tenant, ramos_siglas, criterios, modalidad, ubicacion, precio_clp, titulo, descripcion,
              flyer_path,
              contacto_tipo, contacto_valor, estado, publicado_at, vence_at, created_at)
  on public.tutor_anuncios to anon, authenticated;
grant insert (autor_id, tenant, ramos_siglas, criterios, modalidad, ubicacion, precio_clp,
              titulo, descripcion, contacto_tipo, contacto_valor)
  on public.tutor_anuncios to authenticated;
grant update (ramos_siglas, criterios, modalidad, ubicacion, precio_clp, titulo, descripcion, flyer_path,
              contacto_tipo, contacto_valor, estado)
  on public.tutor_anuncios to authenticated;
grant select (modalidad_otra, ubicacion_otra, detalles) on public.tutor_anuncios to anon, authenticated;
grant insert (modalidad_otra, ubicacion_otra, detalles) on public.tutor_anuncios to authenticated;
grant update (modalidad_otra, ubicacion_otra, detalles) on public.tutor_anuncios to authenticated;

drop policy if exists tutor_anuncios_select_publicados_o_propios on public.tutor_anuncios;
create policy tutor_anuncios_select_publicados_o_propios
on public.tutor_anuncios
for select
to anon, authenticated
using (
  (estado = 'publicado' and (vence_at is null or vence_at > now())
    and public.tutor_aprobado(autor_id))
  or (select auth.uid()) = autor_id
);

-- Solo una cuenta cuya postulación de profesor ya fue aprobada puede crear
-- borradores. Aun así no puede aprobar el aviso ni marcarlo como pagado desde
-- el navegador: esas columnas ni siquiera tienen grant.
drop policy if exists tutor_anuncios_insert_borrador_propio on public.tutor_anuncios;
create policy tutor_anuncios_insert_borrador_propio
on public.tutor_anuncios
for insert
to authenticated
with check (
  (select auth.uid()) = autor_id
  and estado = 'borrador'
  and public.tutor_aprobado((select auth.uid()))
);

-- Puede editar su borrador o pausarlo/mandarlo a revisión, pero nunca publicar
-- ni expirar por sí mismo. El equipo marca revisión, pago y publicación a mano.
drop policy if exists tutor_anuncios_update_propio_sin_publicar on public.tutor_anuncios;
create policy tutor_anuncios_update_propio_sin_publicar
on public.tutor_anuncios
for update
to authenticated
using ((select auth.uid()) = autor_id)
with check (
  (select auth.uid()) = autor_id
  and public.tutor_aprobado((select auth.uid()))
  and estado in ('borrador', 'en_revision', 'pausado')
);

-- Storage privado: 5 MB y solo formatos raster. SVG queda fuera porque puede
-- contener scripts y no hace falta aceptar ese riesgo para mostrar un flyer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutor-flyers', 'tutor-flyers', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.flyer_clase_editable(p_path text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_user_id is not null
    and p_user_id = auth.uid()
    and (storage.foldername(p_path))[1] = p_user_id::text
    and exists (
      select 1 from public.tutor_anuncios a
      where a.id::text = (storage.foldername(p_path))[2]
        and a.autor_id = p_user_id
        and a.estado in ('borrador','en_revision','pausado')
        and public.tutor_aprobado(p_user_id)
    );
$$;

create or replace function public.flyer_clase_visible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tutor_anuncios a
    where a.flyer_path = p_path
      and a.estado = 'publicado'
      and (a.vence_at is null or a.vence_at > now())
      and public.tutor_aprobado(a.autor_id)
  );
$$;

revoke all on function public.flyer_clase_editable(text, uuid) from public;
revoke all on function public.flyer_clase_visible(text) from public;
-- La política SELECT se evalúa también para visitantes anónimos. Con uid
-- nulo esta función devuelve false; sin EXECUTE la lectura pública fallaría.
grant execute on function public.flyer_clase_editable(text, uuid) to anon, authenticated;
grant execute on function public.flyer_clase_visible(text) to anon, authenticated;

drop policy if exists tutor_flyers_insert_propio on storage.objects;
create policy tutor_flyers_insert_propio
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutor-flyers'
  and public.flyer_clase_editable(name, (select auth.uid()))
);

drop policy if exists tutor_flyers_select_visible_o_propio on storage.objects;
create policy tutor_flyers_select_visible_o_propio
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'tutor-flyers'
  and (
    public.flyer_clase_visible(name)
    or public.flyer_clase_editable(name, (select auth.uid()))
  )
);

drop policy if exists tutor_flyers_delete_propio on storage.objects;
create policy tutor_flyers_delete_propio
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutor-flyers'
  and public.flyer_clase_editable(name, (select auth.uid()))
);

-- ─── LOGO DEL PROFESOR ──────────────────────────────────────────────────────
--
-- Uno por profesor, y sale en todos sus anuncios publicados. Como aparece en
-- anuncios que ya se aprobaron, un logo nuevo NO se muestra hasta revisarlo:
-- `logo_path` es el que subió, `logo_aprobado_path` el que se ve. Solo el
-- equipo copia uno al otro (admin.aprobar_logo).
--
-- La ruta es logos/<logo_id>/<uuid>.<ext>. `logo_id` es un identificador
-- propio y no el user_id: el catálogo es público y no tiene por qué saber qué
-- cuenta está detrás de un anuncio.
alter table public.tutor_perfiles add column if not exists logo_id uuid not null default gen_random_uuid();
alter table public.tutor_perfiles add column if not exists logo_path text
  check (logo_path is null or (
    logo_path ~ '^logos/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
    and split_part(logo_path, '/', 2) = logo_id::text));
alter table public.tutor_perfiles add column if not exists logo_aprobado_path text
  check (logo_aprobado_path is null or (
    logo_aprobado_path ~ '^logos/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
    and split_part(logo_aprobado_path, '/', 2) = logo_id::text));

grant select (logo_id, logo_path, logo_aprobado_path) on public.tutor_perfiles to authenticated;
-- Puede proponer uno (la política de update ya lo ata a su propia fila y el
-- check, a su propio logo_id). No puede aprobarlo ni cambiar su logo_id.
grant update (logo_path) on public.tutor_perfiles to authenticated;

-- Quitar sí es inmediato: sacar una imagen nunca necesita revisión.
create or replace function public.quitar_mi_logo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  update public.tutor_perfiles
     set logo_path = null, logo_aprobado_path = null
   where user_id = auth.uid();
end;
$$;

-- Propio: está en la carpeta del logo de quien pregunta, y su ficha está
-- aprobada. Sirve para ver su propio logo, aprobado o no.
create or replace function public.logo_profesor_propio(p_path text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_user_id is not null
    and p_user_id = auth.uid()
    and (storage.foldername(p_path))[1] = 'logos'
    and exists (
      select 1 from public.tutor_perfiles p
      where p.user_id = p_user_id
        and p.estado = 'aprobado'
        and p.logo_id::text = (storage.foldername(p_path))[2]
    );
$$;

-- Editable: propio y que no sea el que se está mostrando. Borrar el aprobado
-- dejaría anuncios publicados con un logo roto; para sacarlo está
-- quitar_mi_logo(), que primero lo desasigna.
create or replace function public.logo_profesor_editable(p_path text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.logo_profesor_propio(p_path, p_user_id)
    and not exists (
      select 1 from public.tutor_perfiles p
      where p.user_id = p_user_id and p.logo_aprobado_path = p_path
    );
$$;

-- Se ve el logo APROBADO de un profesor aprobado con al menos un anuncio
-- publicado y vigente. Un logo propuesto solo lo ve su dueño (arriba).
create or replace function public.logo_profesor_visible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tutor_perfiles p
    where p.logo_aprobado_path = p_path
      and p.estado = 'aprobado'
      and exists (
        select 1 from public.tutor_anuncios a
        where a.autor_id = p.user_id
          and a.estado = 'publicado'
          and (a.vence_at is null or a.vence_at > now())
      )
  );
$$;

-- El catálogo no conoce al autor de cada anuncio, así que pide los logos por
-- anuncio. Devuelve solo rutas de logos aprobados de anuncios visibles.
create or replace function public.logos_de_anuncios(p_ids uuid[])
returns table (anuncio_id uuid, logo_path text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, p.logo_aprobado_path
  from public.tutor_anuncios a
  join public.tutor_perfiles p on p.user_id = a.autor_id
  where a.id = any(p_ids[1:100])
    and a.estado = 'publicado'
    and (a.vence_at is null or a.vence_at > now())
    and p.estado = 'aprobado'
    and p.logo_aprobado_path is not null;
$$;

revoke all on function public.quitar_mi_logo() from public, anon;
revoke all on function public.logo_profesor_propio(text, uuid) from public;
revoke all on function public.logo_profesor_editable(text, uuid) from public;
revoke all on function public.logo_profesor_visible(text) from public;
revoke all on function public.logos_de_anuncios(uuid[]) from public;
grant execute on function public.quitar_mi_logo() to authenticated;
grant execute on function public.logo_profesor_propio(text, uuid) to anon, authenticated;
grant execute on function public.logo_profesor_editable(text, uuid) to anon, authenticated;
grant execute on function public.logo_profesor_visible(text) to anon, authenticated;
grant execute on function public.logos_de_anuncios(uuid[]) to anon, authenticated;

drop policy if exists tutor_logos_insert_propio on storage.objects;
create policy tutor_logos_insert_propio
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutor-flyers'
  and public.logo_profesor_editable(name, (select auth.uid()))
);

drop policy if exists tutor_logos_select_visible_o_propio on storage.objects;
create policy tutor_logos_select_visible_o_propio
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'tutor-flyers'
  and (
    public.logo_profesor_visible(name)
    or public.logo_profesor_propio(name, (select auth.uid()))
  )
);

drop policy if exists tutor_logos_delete_propio on storage.objects;
create policy tutor_logos_delete_propio
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutor-flyers'
  and public.logo_profesor_editable(name, (select auth.uid()))
);

-- Cada fila suma eventos, no personas. La dimensión es deliberadamente gruesa:
-- anuncio, día, tipo, universidad y sigla. No hay carrera, semestre, nota,
-- riesgo, usuario ni identificador de dispositivo.
create table if not exists public.anuncio_metricas (
  anuncio_id      uuid not null references public.tutor_anuncios(id) on delete cascade,
  dia             date not null,
  tipo            text not null check (tipo in ('impresion', 'clic', 'contacto')),
  tenant          text not null check (tenant in ('fen', 'uc', 'uai', 'uandes')),
  ramo_sigla      text not null check (char_length(btrim(ramo_sigla)) between 2 and 24),
  eventos         integer not null default 0 check (eventos >= 0),
  updated_at      timestamptz not null default now(),
  primary key (anuncio_id, dia, tipo, tenant, ramo_sigla)
);

alter table public.anuncio_metricas enable row level security;
revoke all on public.anuncio_metricas from public, anon, authenticated;

-- Solo se escribe por RPC. El límite es GLOBAL por corte cada 10 segundos:
-- sin identidad no se puede deduplicar por persona, y preferimos subcontar
-- antes que empezar a guardar quién vio qué anuncio.
create or replace function public.registrar_metrica_anuncio(
  p_anuncio_id uuid,
  p_tipo text,
  p_ramo_sigla text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  anuncio public.tutor_anuncios%rowtype;
  filas_escritas integer := 0;
  sigla text := upper(btrim(coalesce(p_ramo_sigla, '')));
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if p_tipo not in ('impresion', 'clic', 'contacto') then
    raise exception 'tipo de métrica inválido';
  end if;
  if char_length(sigla) not between 2 and 24 then
    raise exception 'sigla inválida';
  end if;

  select * into anuncio
  from public.tutor_anuncios
  where id = p_anuncio_id
    and estado = 'publicado'
    and (vence_at is null or vence_at > now())
    and public.tutor_aprobado(autor_id)
  for key share;

  if not found then
    raise exception 'anuncio no disponible';
  end if;
  if not (sigla = any(anuncio.ramos_siglas)) then
    raise exception 'la sigla no corresponde al anuncio';
  end if;

  -- auth.uid() se descartó arriba: esta inserción no tiene ni puede recibir
  -- una columna de espectador. Solo queda el contador agregado.
  insert into public.anuncio_metricas (anuncio_id, dia, tipo, tenant, ramo_sigla, eventos)
  values (anuncio.id, current_date, p_tipo, anuncio.tenant, sigla, 1)
  on conflict (anuncio_id, dia, tipo, tenant, ramo_sigla) do update
    set eventos = public.anuncio_metricas.eventos + 1,
        updated_at = now()
    where public.anuncio_metricas.updated_at <= now() - interval '10 seconds';

  get diagnostics filas_escritas = row_count;
  return filas_escritas = 1;
end;
$$;

-- El tutor consulta sus propios agregados. El umbral es de EVENTOS, no de
-- personas distintas: contar personas implicaría guardar identidad. Con menos
-- de quince el corte no sale de esta función, aunque otro cliente la invoque.
create or replace function public.resumen_metricas_anuncio(p_anuncio_id uuid)
returns table (dia date, tipo text, tenant text, ramo_sigla text, eventos integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if not exists (
    select 1 from public.tutor_anuncios
    where id = p_anuncio_id and autor_id = auth.uid()
  ) then
    raise exception 'no puedes ver las métricas de este anuncio';
  end if;

  return query
  select m.dia, m.tipo, m.tenant, m.ramo_sigla, m.eventos
  from public.anuncio_metricas m
  where m.anuncio_id = p_anuncio_id
    and m.eventos >= 15
  order by m.dia desc, m.tipo, m.ramo_sigla;
end;
$$;

revoke all on function public.registrar_metrica_anuncio(uuid, text, text) from public, anon;
revoke all on function public.resumen_metricas_anuncio(uuid) from public, anon;
grant execute on function public.registrar_metrica_anuncio(uuid, text, text) to authenticated;
grant execute on function public.resumen_metricas_anuncio(uuid) to authenticated;

-- Cada fila es UNA inscripción que el tutor declara. No guardamos el nombre,
-- correo ni user_id del alumno: la app no ve la conversación que ocurre fuera
-- de ella y no pretende verificarla. El cobro por alumno es una declaración.
create table if not exists public.anuncio_inscritos (
  id              uuid primary key default gen_random_uuid(),
  anuncio_id      uuid not null references public.tutor_anuncios(id) on delete cascade,
  autor_id        uuid not null references auth.users(id) on delete cascade,
  declarado_at    timestamptz not null default now()
);

create index if not exists anuncio_inscritos_por_anuncio
  on public.anuncio_inscritos (anuncio_id, declarado_at desc);

alter table public.anuncio_inscritos enable row level security;
revoke all on public.anuncio_inscritos from public, anon, authenticated;
grant select (id, anuncio_id, declarado_at) on public.anuncio_inscritos to authenticated;
grant insert (anuncio_id, autor_id) on public.anuncio_inscritos to authenticated;
grant delete on public.anuncio_inscritos to authenticated;

drop policy if exists anuncio_inscritos_select_propios on public.anuncio_inscritos;
create policy anuncio_inscritos_select_propios
on public.anuncio_inscritos
for select
to authenticated
using ((select auth.uid()) = autor_id);

drop policy if exists anuncio_inscritos_insert_propios on public.anuncio_inscritos;
create policy anuncio_inscritos_insert_propios
on public.anuncio_inscritos
for insert
to authenticated
with check (
  (select auth.uid()) = autor_id
  and exists (
    select 1 from public.tutor_anuncios a
    where a.id = anuncio_id and a.autor_id = (select auth.uid())
  )
);

drop policy if exists anuncio_inscritos_delete_propios on public.anuncio_inscritos;
create policy anuncio_inscritos_delete_propios
on public.anuncio_inscritos
for delete
to authenticated
using ((select auth.uid()) = autor_id);

-- ─── ALCANCE ÚNICO: LO QUE SE PUEDE COBRAR ──────────────────────────────────
--
-- Se factura por CUENTAS DISTINTAS que vieron un aviso, no por veces que se
-- mostró: quien abre la app cinco veces se cobra una sola. `anuncio_metricas`
-- no sirve para esto —cuenta eventos— y por eso existe esta tabla aparte.
--
-- QUÉ GUARDA Y QUÉ NO. Guarda cuenta, campaña y día. No guarda el criterio con
-- que se eligió el aviso, ni el ramo, ni la nota, ni el promedio: la fila dice
-- "esta cuenta vio este aviso" y nada más. Sin el criterio guardado, la fila no
-- se puede leer al revés para deducir cómo le va a nadie.
--
-- QUIÉN LA LEE: nadie. Cero políticas y cero grants, ni siquiera de select. El
-- tutor recibe un total por `alcance_anuncio()`, y ese total es lo único que
-- sale de acá. Se borra con la cuenta y con el aviso.
create table if not exists public.anuncio_alcance (
  anuncio_id      uuid not null references public.tutor_anuncios(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  dia             date not null default current_date,
  -- La llave es (aviso, cuenta): una cuenta cuenta UNA vez por campaña, aunque
  -- vea el aviso todos los días. Cobrar por día sería cobrar por frecuencia.
  primary key (anuncio_id, user_id)
);

alter table public.anuncio_alcance enable row level security;
revoke all on public.anuncio_alcance from public, anon, authenticated;

-- POR QUÉ CAMINO LLEGÓ. Cada camino se cobra distinto (docs/marketplace-clases.md):
-- la recomendación al precio del público segmentado, el catálogo a una fracción
-- de la base que sube si la persona buscó el ramo. Una cuenta sigue siendo UNA
-- fila por campaña; si llega por un camino más caro, la fila sube y nunca baja.
-- Aditivo: una fila anterior queda como 'recomendacion', que era el único
-- camino que existía cuando se diseñó la tabla. No guarda qué se buscó.
alter table public.anuncio_alcance add column if not exists canal text not null default 'recomendacion'
  check (canal in ('recomendacion', 'busqueda', 'lista'));

create or replace function public.rango_canal_alcance(p_canal text)
returns integer
language sql
immutable
as $$
  select case p_canal when 'recomendacion' then 3 when 'busqueda' then 2 when 'lista' then 1 else 0 end;
$$;

-- Devuelve true la PRIMERA vez que esta cuenta ve el aviso, o cuando llega por
-- un camino más caro que el registrado. El cliente no decide si cuenta: el
-- servidor lo resuelve con la llave primaria y el rango del canal.
--
-- La firma cambió de (uuid) a (uuid, text). La vieja se borra antes: con las
-- dos, una llamada de un solo argumento sería ambigua. El default mantiene a
-- los clientes que todavía llaman sin canal.
drop function if exists public.registrar_alcance_anuncio(uuid);
create or replace function public.registrar_alcance_anuncio(p_anuncio_id uuid, p_canal text default 'recomendacion')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if public.rango_canal_alcance(p_canal) = 0 then
    raise exception 'canal inválido';
  end if;

  if not exists (
    select 1 from public.tutor_anuncios
    where id = p_anuncio_id
      and estado = 'publicado'
      and (vence_at is null or vence_at > now())
  ) then
    raise exception 'anuncio no disponible';
  end if;

  insert into public.anuncio_alcance (anuncio_id, user_id, canal)
  values (p_anuncio_id, auth.uid(), p_canal)
  on conflict (anuncio_id, user_id) do update
    set canal = excluded.canal
    where public.rango_canal_alcance(excluded.canal) > public.rango_canal_alcance(public.anuncio_alcance.canal);

  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;

-- El total de su propia campaña, y nada más: un número, sin fechas por persona
-- ni forma de recorrer quiénes son. Es el número que se factura.
create or replace function public.alcance_anuncio(p_anuncio_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if not exists (
    select 1 from public.tutor_anuncios
    where id = p_anuncio_id and autor_id = auth.uid()
  ) then
    raise exception 'no puedes ver el alcance de este anuncio';
  end if;

  return (select count(*)::integer from public.anuncio_alcance where anuncio_id = p_anuncio_id);
end;
$$;

-- Lo mismo, separado por camino: es lo que el panel necesita para aplicar el
-- precio de cada uno. Siguen siendo solo totales de la propia campaña.
create or replace function public.alcance_anuncio_por_canal(p_anuncio_id uuid)
returns table (canal text, cuentas integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if not exists (
    select 1 from public.tutor_anuncios
    where id = p_anuncio_id and autor_id = auth.uid()
  ) then
    raise exception 'no puedes ver el alcance de este anuncio';
  end if;

  return query
  select a.canal, count(*)::integer
  from public.anuncio_alcance a
  where a.anuncio_id = p_anuncio_id
  group by a.canal;
end;
$$;

-- El registro existe para poder cobrar, así que se borra cuando ya no hay nada
-- que cobrar: 90 días después de que la campaña venció, como dice
-- docs/marketplace-clases.md. La ejecuta el equipo (o pg_cron) y devuelve
-- cuántas filas soltó. No la puede llamar un cliente.
create or replace function public.limpiar_alcance_anuncios(p_dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  filas integer := 0;
begin
  if p_dias is null or p_dias < 30 then
    raise exception 'el plazo mínimo de conservación es 30 días';
  end if;
  delete from public.anuncio_alcance as a
   using public.tutor_anuncios as t
   where t.id = a.anuncio_id
     and t.vence_at is not null
     and t.vence_at < now() - make_interval(days => p_dias);
  get diagnostics filas = row_count;
  return filas;
end;
$$;

revoke all on function public.registrar_alcance_anuncio(uuid, text) from public, anon;
revoke all on function public.alcance_anuncio(uuid) from public, anon;
revoke all on function public.alcance_anuncio_por_canal(uuid) from public, anon;
revoke all on function public.rango_canal_alcance(text) from public, anon;
revoke all on function public.limpiar_alcance_anuncios(integer) from public, anon, authenticated;
grant execute on function public.registrar_alcance_anuncio(uuid, text) to authenticated;
grant execute on function public.alcance_anuncio(uuid) to authenticated;
grant execute on function public.alcance_anuncio_por_canal(uuid) to authenticated;
