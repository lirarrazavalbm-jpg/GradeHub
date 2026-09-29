-- Esquema anterior a #515, fijado en 2a6118e. Solo para pruebas locales.
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(current_setting('audit.aal',true),'aal1')) $$;
create table public.user_ramos(user_id uuid);

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

-- QUÉ VA BAJO EL TÍTULO en la recomendación de Inicio. Pedido de Lucas del
-- 2026-09-25: el profesor marca de 1 a 3 datos entre formato, lugar, precio y
-- sus detalles ('detalle:<etiqueta>'). No es texto libre: solo claves, así que
-- no abre nada que haya que revisar. null = los de siempre (formato, lugar y
-- precio), que es como se ven los anuncios que ya existen.
create or replace function public.linea_datos_clase_valida(l text[])
returns boolean
language sql
immutable
as $$
  select l is null or (
    cardinality(l) between 1 and 3
    and not exists (
      select 1 from unnest(l) x
      where x is null
         or not (x in ('modalidad', 'ubicacion', 'precio')
                 or (x like 'detalle:%' and char_length(x) between 9 and 38))
    )
  );
$$;

alter table public.tutor_anuncios add column if not exists linea_datos text[]
  check (public.linea_datos_clase_valida(linea_datos));

-- CLASES GRATIS. Pedido de Lucas del 2026-09-25: $0 es una clase gratis y se
-- muestra como "Gratis". Relaja la restricción; toda fila existente sigue
-- siendo válida. Si en producción la restricción tiene otro nombre, el drop no
-- la encuentra y $0 sigue rechazándose al guardar: se nota al tiro.
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_precio_clp_check;
alter table public.tutor_anuncios add constraint tutor_anuncios_precio_clp_check
  check (precio_clp = 0 or precio_clp between 1000 and 500000);

-- SOLO WHATSAPP desde el 2026-09-25 (decisión de Lucas): es el canal común, el
-- número no se muestra y el chat parte con un mensaje escrito. Al decidirlo no
-- había anuncios con Instagram ni correo; si apareciera uno, este ADD falla y
-- no se aplica a medias.
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_contacto_tipo_check;
alter table public.tutor_anuncios add constraint tutor_anuncios_contacto_tipo_check
  check (contacto_tipo = 'whatsapp');

-- Una clase GRATIS puede llevar a un Instagram o a un link de inscripción
-- (decisión de Lucas del 2026-09-25). Las pagadas siguen solo con WhatsApp.
-- El link lo valida la app (https, sin credenciales) y lo revisa quien aprueba.
alter table public.tutor_anuncios drop constraint if exists tutor_anuncios_contacto_tipo_check;
alter table public.tutor_anuncios add constraint tutor_anuncios_contacto_tipo_check
  check (contacto_tipo = 'whatsapp'
         or (precio_clp = 0 and contacto_tipo in ('instagram', 'enlace')));

-- UN RAMO POR ANUNCIO desde el 2026-09-25, HASTA DOS desde el 2026-09-26
-- (decisiones de Lucas: la misma clase puede servir a dos siglas, como
-- Dinámica ICE1514 y FIS1514). Es un trigger
-- y no un CHECK a propósito: un CHECK revisa la fila entera en cada UPDATE, y
-- un anuncio antiguo con dos ramos quedaría trabado —ni pausarlo se podría—.
-- El trigger mira solo cuando se ESCRIBEN los ramos: crear o editarlos exige
-- uno, y cambiar el estado de un anuncio viejo sigue funcionando.
create or replace function public.anuncio_un_ramo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if cardinality(new.ramos_siglas) not between 1 and 2 then
    raise exception 'cada anuncio es para uno o dos ramos'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.anuncio_un_ramo() from public, anon, authenticated;

drop trigger if exists tutor_anuncios_un_ramo on public.tutor_anuncios;
create trigger tutor_anuncios_un_ramo
before insert or update of ramos_siglas on public.tutor_anuncios
for each row
execute function public.anuncio_un_ramo();

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
grant select (linea_datos) on public.tutor_anuncios to anon, authenticated;
grant insert (linea_datos) on public.tutor_anuncios to authenticated;
grant update (linea_datos) on public.tutor_anuncios to authenticated;
-- El formulario manda la universidad también al editar un borrador. Sin este
-- grant, TODA edición de un borrador ya guardado fallaba con "permission
-- denied": Postgres rechaza el UPDATE entero por una sola columna. Encontrado
-- el 2026-09-25 en producción. Cambiarla es seguro por lo mismo que las otras
-- columnas: la política solo deja editar en borrador, revisión o pausa.
grant update (tenant) on public.tutor_anuncios to authenticated;

-- La política de lectura de los anuncios está al final del archivo, en
-- CAMPAÑAS: depende de funciones que se definen allá (programación y tope).

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
-- Uno por profesor, y sale en todos sus anuncios publicados. `logo_path` es
-- el que subió y `logo_aprobado_path` el que se ve. Nacieron separados para
-- revisarlos antes de mostrarlos; desde el 2026-09-25 un trigger (más abajo)
-- los iguala al tiro, y el cliente no puede escribir la segunda columna.
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

-- SIN REVISIÓN DESDE EL 2026-09-25. Decisión de Lucas: el logo que sube el
-- profesor se muestra al tiro. Se conservan las dos columnas —la propuesta y
-- la que se ve— para poder volver a revisarlos sin migrar nada: basta con
-- borrar este trigger. Si un logo resulta inapropiado, suspender al profesor
-- oculta todos sus anuncios y admin.rechazar_logo() no aplica: se quita con
-- un update directo desde el SQL Editor.
--
-- El trigger corre con los permisos de quien actualiza, pero los permisos de
-- columna solo miran lo que el UPDATE escribe (logo_path), no lo que el
-- trigger completa. La política de update ya lo ata a su propia fila.
create or replace function public.logo_sin_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.logo_aprobado_path := new.logo_path;
  return new;
end;
$$;
revoke all on function public.logo_sin_revision() from public, anon, authenticated;

drop trigger if exists tutor_perfiles_logo_sin_revision on public.tutor_perfiles;
create trigger tutor_perfiles_logo_sin_revision
before update of logo_path on public.tutor_perfiles
for each row
when (new.logo_path is distinct from old.logo_path)
execute function public.logo_sin_revision();

-- Los que quedaron esperando revisión antes del trigger pasan a mostrarse.
update public.tutor_perfiles
   set logo_aprobado_path = logo_path
 where logo_path is not null
   and logo_path is distinct from logo_aprobado_path;

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

-- Totales para los gráficos del profesor. `resumen_metricas_anuncio` corta por
-- día, tipo y ramo a la vez, y con poco tráfico casi ningún corte llega a
-- quince: el panel quedaba vacío. Esto suma por UNA dimensión a la vez —tipo,
-- día o ramo— y aplica el mismo umbral de quince EVENTOS a cada total. No
-- revela más que antes: un total de quince o más no identifica a nadie, y los
-- que no llegan siguen sin salir.
create or replace function public.totales_metricas_anuncio(p_anuncio_id uuid)
returns table (vista text, clave text, tipo text, eventos integer)
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
  with m as (select * from public.anuncio_metricas where anuncio_id = p_anuncio_id)
  select 'total'::text, ''::text, m.tipo, sum(m.eventos)::integer from m group by m.tipo having sum(m.eventos) >= 15
  union all
  select 'dia', m.dia::text, m.tipo, sum(m.eventos)::integer from m group by m.dia, m.tipo having sum(m.eventos) >= 15
  union all
  select 'ramo', m.ramo_sigla, m.tipo, sum(m.eventos)::integer from m group by m.ramo_sigla, m.tipo having sum(m.eventos) >= 15;
end;
$$;

revoke all on function public.totales_metricas_anuncio(uuid) from public, anon;
grant execute on function public.totales_metricas_anuncio(uuid) to authenticated;

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
  -- Desde CAMPAÑAS (2026-09-25): no cuenta un anuncio programado o que ya
  -- llegó a su tope, ni el propio profesor, ni una cuenta sin ramos.
  if not public.cuenta_para_campana(p_anuncio_id, auth.uid()) then
    return false;
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

-- ─── CAMPAÑAS ───────────────────────────────────────────────────────────────
--
-- Decidido por Lucas el 2026-09-25. Una campaña dura los días que elige el
-- profesor, puede empezar en una fecha futura (queda programada) y tiene un
-- TOPE: lo máximo que pagaría. Cuesta:
--
--   $100 por día que estuvo visible
--   $10 por persona que la vio, $50 por persona que la abrió,
--   $1.000 por persona que la contactó
--
-- Cada persona cuenta una vez por anuncio en cada cosa. No cuentan el propio
-- profesor ni una cuenta sin ramos guardados. Al llegar al tope deja de
-- mostrarse sola. En el piloto nada de esto se cobra: se muestra.

-- La configuración de la campaña va en su propia tabla y no en el anuncio: el
-- anuncio publicado lo lee cualquiera, y el tope es un dato del profesor.
create table if not exists public.anuncio_campanas (
  anuncio_id   uuid primary key references public.tutor_anuncios(id) on delete cascade,
  dias         integer not null check (dias between 1 and 60),
  inicio       date,
  tope_clp     integer not null check (tope_clp between 1000 and 5000000),
  -- Cuándo dejó de mostrarse antes de tiempo (pausa). Los días se cobran hasta
  -- acá. Lo marca el trigger de abajo, nunca el cliente.
  detenido_at  timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.anuncio_campanas enable row level security;
revoke all on public.anuncio_campanas from public, anon, authenticated;
grant select (anuncio_id, dias, inicio, tope_clp, detenido_at) on public.anuncio_campanas to authenticated;
grant insert (anuncio_id, dias, inicio, tope_clp) on public.anuncio_campanas to authenticated;
grant update (dias, inicio, tope_clp) on public.anuncio_campanas to authenticated;

-- Las políticas preguntan por el dueño con una función: `autor_id` no tiene
-- permiso de lectura para nadie (a propósito), así que una subconsulta directa
-- sobre tutor_anuncios fallaría con "permission denied".
create or replace function public.anuncio_propio(p_anuncio_id uuid, p_editable boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tutor_anuncios t
    where t.id = p_anuncio_id and t.autor_id = auth.uid()
      and (not p_editable or t.estado in ('borrador', 'en_revision', 'pausado'))
  );
$$;
revoke all on function public.anuncio_propio(uuid, boolean) from public, anon;
grant execute on function public.anuncio_propio(uuid, boolean) to authenticated;

drop policy if exists anuncio_campanas_select_propia on public.anuncio_campanas;
create policy anuncio_campanas_select_propia on public.anuncio_campanas
for select to authenticated
using (public.anuncio_propio(anuncio_id, false));

-- Se escribe mientras el anuncio no está publicado: cambiar el tope o los
-- días de una campaña en curso es otra revisión.
drop policy if exists anuncio_campanas_insert_propia on public.anuncio_campanas;
create policy anuncio_campanas_insert_propia on public.anuncio_campanas
for insert to authenticated
with check (public.anuncio_propio(anuncio_id, true));
drop policy if exists anuncio_campanas_update_propia on public.anuncio_campanas;
create policy anuncio_campanas_update_propia on public.anuncio_campanas
for update to authenticated
using (public.anuncio_propio(anuncio_id, true))
with check (public.anuncio_propio(anuncio_id, true));

-- Aperturas y contactos por PERSONA, igual que anuncio_alcance para las
-- vistas: una fila por (anuncio, cuenta, tipo). Nadie la lee; sale solo como
-- totales. Se borra con la cuenta y con el anuncio.
create table if not exists public.anuncio_interacciones (
  anuncio_id  uuid not null references public.tutor_anuncios(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('apertura', 'contacto')),
  dia         date not null default current_date,
  primary key (anuncio_id, user_id, tipo)
);
alter table public.anuncio_interacciones enable row level security;
revoke all on public.anuncio_interacciones from public, anon, authenticated;

-- La tarifa, en un solo lugar del servidor. marketplace.js tiene la misma
-- (TARIFA_CAMPANA) y un test exige que coincidan.
create or replace function public.tarifa_campana_clp(p_concepto text)
returns integer
language sql
immutable
as $$
  select case p_concepto
    when 'dia' then 100 when 'vista' then 10 when 'apertura' then 50 when 'contacto' then 1000
  end;
$$;

-- Lo que lleva una campaña. Uso interno: no tiene grant.
create or replace function public.costo_campana(p_anuncio_id uuid)
returns table (dias integer, inicio date, tope_clp integer, dias_cobrados integer,
               vistas integer, aperturas integer, contactos integer, costo_bruto integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.tutor_anuncios%rowtype;
  c public.anuncio_campanas%rowtype;
  hasta timestamptz;
begin
  select * into a from public.tutor_anuncios where id = p_anuncio_id;
  if not found then return; end if;
  select * into c from public.anuncio_campanas where anuncio_id = p_anuncio_id;

  dias := coalesce(c.dias, case when a.publicado_at is not null and a.vence_at is not null
                                then ceil(extract(epoch from (a.vence_at - a.publicado_at)) / 86400)::integer end);
  inicio := c.inicio;
  tope_clp := c.tope_clp;
  dias_cobrados := 0;
  if a.publicado_at is not null and a.publicado_at <= now() then
    hasta := least(now(), coalesce(a.vence_at, 'infinity'), coalesce(c.detenido_at, 'infinity'));
    dias_cobrados := greatest(0, ceil(extract(epoch from (hasta - a.publicado_at)) / 86400)::integer);
    if dias is not null then dias_cobrados := least(dias_cobrados, dias); end if;
  end if;
  select count(*)::integer into vistas from public.anuncio_alcance where anuncio_id = p_anuncio_id;
  select count(*) filter (where tipo = 'apertura')::integer, count(*) filter (where tipo = 'contacto')::integer
    into aperturas, contactos
    from public.anuncio_interacciones where anuncio_id = p_anuncio_id;
  costo_bruto := dias_cobrados * public.tarifa_campana_clp('dia')
               + vistas * public.tarifa_campana_clp('vista')
               + aperturas * public.tarifa_campana_clp('apertura')
               + contactos * public.tarifa_campana_clp('contacto');
  return next;
end;
$$;
revoke all on function public.costo_campana(uuid) from public, anon, authenticated;

-- ¿Se puede mostrar hoy? Publicado, ya empezado, sin vencer, con profesor
-- aprobado y sin haber llegado al tope. Un anuncio sin campaña (de antes de
-- esto) no tiene tope.
create or replace function public.campana_visible(p_anuncio_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.tutor_anuncios%rowtype;
  k record;
begin
  select * into a from public.tutor_anuncios where id = p_anuncio_id;
  if not found or a.estado <> 'publicado' then return false; end if;
  if a.publicado_at is not null and a.publicado_at > now() then return false; end if;
  if a.vence_at is not null and a.vence_at <= now() then return false; end if;
  if not public.tutor_aprobado(a.autor_id) then return false; end if;
  select * into k from public.costo_campana(p_anuncio_id);
  return k.tope_clp is null or k.costo_bruto < k.tope_clp;
end;
$$;
revoke all on function public.campana_visible(uuid) from public;
grant execute on function public.campana_visible(uuid) to anon, authenticated;

-- ¿Cuenta esta persona para la campaña? Solo si se puede mostrar, no es el
-- profesor y tiene ramos guardados. Uso interno de los registros.
create or replace function public.cuenta_para_campana(p_anuncio_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null or not public.campana_visible(p_anuncio_id) then return false; end if;
  if exists (select 1 from public.tutor_anuncios where id = p_anuncio_id and autor_id = p_user_id) then
    return false;
  end if;
  return exists (select 1 from public.user_ramos where user_id = p_user_id);
end;
$$;
revoke all on function public.cuenta_para_campana(uuid, uuid) from public, anon, authenticated;

-- La lectura pública de anuncios, ahora con programación y tope.
drop policy if exists tutor_anuncios_select_publicados_o_propios on public.tutor_anuncios;
create policy tutor_anuncios_select_publicados_o_propios
on public.tutor_anuncios
for select
to anon, authenticated
using (
  (estado = 'publicado' and (vence_at is null or vence_at > now())
    and public.tutor_aprobado(autor_id)
    and public.campana_visible(id))
  or (select auth.uid()) = autor_id
);

-- Abrió la clase o tocó contactar. Devuelve true solo la primera vez que esa
-- persona lo hace en ese anuncio: es lo que se cobraría.
create or replace function public.registrar_interaccion_anuncio(p_anuncio_id uuid, p_tipo text)
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
  if p_tipo not in ('apertura', 'contacto') then
    raise exception 'tipo inválido';
  end if;
  if not public.cuenta_para_campana(p_anuncio_id, auth.uid()) then
    return false;
  end if;
  insert into public.anuncio_interacciones (anuncio_id, user_id, tipo)
  values (p_anuncio_id, auth.uid(), p_tipo)
  on conflict do nothing;
  get diagnostics filas = row_count;
  return filas = 1;
end;
$$;
revoke all on function public.registrar_interaccion_anuncio(uuid, text) from public, anon;
grant execute on function public.registrar_interaccion_anuncio(uuid, text) to authenticated;

-- La campaña del propio anuncio, para el panel del profesor: totales, nunca
-- personas. `costo` ya viene topeado.
create or replace function public.campana_anuncio(p_anuncio_id uuid)
returns table (dias integer, inicio date, tope_clp integer, dias_cobrados integer,
               vistas integer, aperturas integer, contactos integer, costo integer, agotada boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  k record;
begin
  if auth.uid() is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if not exists (select 1 from public.tutor_anuncios where id = p_anuncio_id and autor_id = auth.uid()) then
    raise exception 'no puedes ver esta campaña';
  end if;
  select * into k from public.costo_campana(p_anuncio_id);
  dias := k.dias; inicio := k.inicio; tope_clp := k.tope_clp; dias_cobrados := k.dias_cobrados;
  vistas := k.vistas; aperturas := k.aperturas; contactos := k.contactos;
  costo := case when k.tope_clp is null then k.costo_bruto else least(k.costo_bruto, k.tope_clp) end;
  agotada := k.tope_clp is not null and k.costo_bruto >= k.tope_clp;
  return next;
end;
$$;
revoke all on function public.campana_anuncio(uuid) from public, anon;
grant execute on function public.campana_anuncio(uuid) to authenticated;

-- Al dejar de estar publicado antes de tiempo, los días se dejan de contar.
-- Al volver a publicarse, se retoma.
create or replace function public.anuncio_marca_detencion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado = 'publicado' and new.estado <> 'publicado' then
    update public.anuncio_campanas set detenido_at = now()
     where anuncio_id = new.id and detenido_at is null;
  elsif new.estado = 'publicado' and old.estado <> 'publicado' then
    update public.anuncio_campanas set detenido_at = null where anuncio_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.anuncio_marca_detencion() from public, anon, authenticated;
drop trigger if exists tutor_anuncios_marca_detencion on public.tutor_anuncios;
create trigger tutor_anuncios_marca_detencion
after update of estado on public.tutor_anuncios
for each row
execute function public.anuncio_marca_detencion();

-- Las interacciones se van con el mismo plazo que el alcance.
create or replace function public.limpiar_interacciones_anuncios(p_dias integer default 90)
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
  delete from public.anuncio_interacciones as i
   using public.tutor_anuncios as t
   where t.id = i.anuncio_id
     and t.vence_at is not null
     and t.vence_at < now() - make_interval(days => p_dias);
  get diagnostics filas = row_count;
  return filas;
end;
$$;
revoke all on function public.limpiar_interacciones_anuncios(integer) from public, anon, authenticated;


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
-- Desde CAMPAÑAS (2026-09-25) los días y el inicio los elige el profesor: si
-- el anuncio tiene campaña, se usan esos y `p_dias` queda de respaldo para los
-- anuncios de antes. Con inicio futuro queda PROGRAMADO: publicado, pero no se
-- muestra hasta ese día (medianoche de Chile). La firma cambió su default, y
-- Postgres no deja cambiarlo con create or replace: por eso el drop.
drop function if exists admin.publicar_anuncio(uuid, integer, integer);
create or replace function admin.publicar_anuncio(p_anuncio_id uuid, p_cargo_clp integer, p_dias integer default null)
returns text
language plpgsql
set search_path = public, admin
as $$
declare
  a public.tutor_anuncios%rowtype;
  ahora timestamptz := now();
  desde timestamptz;
  vence timestamptz;
  c public.anuncio_campanas%rowtype;
  dias integer;
begin
  if p_cargo_clp is null or p_cargo_clp < 0 then
    raise exception 'el cargo va en pesos y no puede ser negativo (0 si es sin cargo)';
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

  select * into c from public.anuncio_campanas where anuncio_id = p_anuncio_id;
  dias := coalesce(c.dias, p_dias, 30);
  if dias not between 1 and 90 then
    raise exception 'la campaña dura entre 1 y 90 días';
  end if;
  desde := greatest(ahora, coalesce((c.inicio::timestamp at time zone 'America/Santiago'), ahora));
  vence := desde + make_interval(days => dias);

  update public.tutor_anuncios
     set estado = 'publicado',
         revisado_at = ahora,
         pagado_at = ahora,
         publicado_at = desde,
         vence_at = vence
   where id = p_anuncio_id;

  insert into admin.anuncio_publicaciones (anuncio_id, cargo_clp, dias, publicado_at, vence_at)
  values (p_anuncio_id, p_cargo_clp, dias, desde, vence);

  return case when desde > ahora then 'programado desde ' || to_char(desde at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI') || ' ' else 'publicado ' end
    || 'hasta ' || to_char(vence at time zone 'America/Santiago', 'YYYY-MM-DD HH24:MI');
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

-- ADMINISTRADORES DE GRADEHUB · verificación en dos pasos.
--
-- Pedido de Lucas del 2026-09-25: una página para ver y administrar las
-- campañas de todos los profesores, que aparezca solo en su cuenta. Que la
-- pestaña se vea solo ahí es cosmético —el repositorio es público—: lo que
-- protege es esto. Las funciones de la página preguntan en el servidor si
-- quien llama está en la lista Y entró con su segundo factor (aal2). AGENTS.md
-- lo exige: con un panel administrativo, la verificación en dos pasos deja de
-- ser opcional.
--
-- Se aplica a mano y es aditivo. Después hay que anotarse en la lista, también
-- a mano y con el correo propio (nunca queda escrito en el repositorio):
--
--   insert into admin.administradores (user_id)
--   select id from auth.users where email = 'TU CORREO';

create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- La lista. Vive en `admin`, que la API no expone: nadie la lee ni la escribe
-- desde el navegador. Se borra con la cuenta.
create table if not exists admin.administradores (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table admin.administradores enable row level security;
revoke all on admin.administradores from public, anon, authenticated;

-- ¿Esta cuenta es administradora? Solo para decidir si se muestra la pestaña:
-- no da acceso a nada. Responde por la propia cuenta y nada más.
create or replace function public.soy_administrador()
returns boolean
language sql
stable
security definer
set search_path = public, admin
as $$
  select auth.uid() is not null
     and exists (select 1 from admin.administradores where user_id = auth.uid());
$$;
revoke all on function public.soy_administrador() from public, anon;
grant execute on function public.soy_administrador() to authenticated;

-- La llave de verdad: administradora Y con el segundo factor verificado en esta
-- sesión. Toda función de la página la llama primero. No tiene grant: se usa
-- desde otras funciones security definer, nunca directo.
create or replace function public.administrador_verificado()
returns boolean
language sql
stable
security definer
set search_path = public, admin
as $$
  select public.soy_administrador()
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.administrador_verificado() from public, anon, authenticated;

-- ─── LA PÁGINA DE ADMINISTRACIÓN DE CLASES ──────────────────────────────────
--
-- Pedido de Lucas del 2026-09-25: ver a todos los profesores con sus anuncios
-- activos y programados, sus números y lo que llevan gastado; marcar cada
-- campaña como cobrada o en deuda; pausar un aviso y pausar a un profesor.
-- Toda función empieza por administrador_verificado(): sin la lista y el
-- segundo factor, error. Toda acción queda registrada en admin.acciones.
--
-- Depende de supabase/clases_particulares.sql (con su sección CAMPAÑAS).

-- Cobrado o en deuda, por campaña: una campaña es un anuncio en una
-- publicación (anuncio + fecha en que se publicó). "Pendiente" es no tener fila.
create table if not exists admin.cobros (
  anuncio_id      uuid not null references public.tutor_anuncios(id) on delete cascade,
  publicado_at    timestamptz not null,
  estado          text not null check (estado in ('cobrado', 'deuda')),
  monto_clp       integer not null check (monto_clp between 0 and 5000000),
  actualizado_at  timestamptz not null default now(),
  primary key (anuncio_id, publicado_at)
);
alter table admin.cobros enable row level security;
revoke all on admin.cobros from public, anon, authenticated;

-- Quién hizo qué y cuándo. Si un profesor reclama que le pausaron un aviso,
-- acá está. Quien actuó queda en null si su cuenta se borra.
create table if not exists admin.acciones (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users(id) on delete set null,
  accion      text not null,
  objetivo    uuid,
  detalle     jsonb,
  created_at  timestamptz not null default now()
);
alter table admin.acciones enable row level security;
revoke all on admin.acciones from public, anon, authenticated;

create or replace function admin.exigir_administrador()
returns void
language plpgsql
stable
security definer
set search_path = public, admin
as $$
begin
  if not public.administrador_verificado() then
    raise exception 'sin acceso' using errcode = '42501';
  end if;
end;
$$;

-- Todo lo que la página muestra, en una sola lectura. El costo va bruto: la
-- app aplica el tope con la misma cuenta que ve el profesor.
create or replace function public.admin_panel_clases()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
begin
  perform admin.exigir_administrador();
  return coalesce((
    select jsonb_agg(prof order by (prof ->> 'estado') = 'pendiente' desc, prof ->> 'nombre')
    from (
      select jsonb_build_object(
        'user_id', p.user_id,
        'nombre', p.nombre_publico,
        'estado', p.estado,
        'correo', u.email,
        'solicitado_at', p.solicitado_at,
        'anuncios', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'titulo', a.titulo,
            'estado', a.estado,
            'ramos_siglas', a.ramos_siglas,
            'precio_clp', a.precio_clp,
            'publicado_at', a.publicado_at,
            'vence_at', a.vence_at,
            'created_at', a.created_at,
            'campana', (select to_jsonb(k) from public.costo_campana(a.id) k),
            'cobro', (select jsonb_build_object('estado', c.estado, 'monto_clp', c.monto_clp, 'actualizado_at', c.actualizado_at)
                        from admin.cobros c where c.anuncio_id = a.id and c.publicado_at = a.publicado_at)
          ) order by a.created_at desc)
          from public.tutor_anuncios a where a.autor_id = p.user_id), '[]'::jsonb)
      ) as prof
      from public.tutor_perfiles p
      left join auth.users u on u.id = p.user_id
    ) x), '[]'::jsonb);
end;
$$;

-- Pausa un aviso publicado o programado. Para volver a mostrarse pasa por
-- revisión, igual que cuando lo pausa el profesor.
create or replace function public.admin_pausar_anuncio(p_anuncio_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  filas integer := 0;
begin
  perform admin.exigir_administrador();
  update public.tutor_anuncios set estado = 'pausado'
   where id = p_anuncio_id and estado = 'publicado';
  get diagnostics filas = row_count;
  if filas = 1 then
    insert into admin.acciones (admin_id, accion, objetivo) values (auth.uid(), 'pausar_anuncio', p_anuncio_id);
  end if;
  return filas = 1;
end;
$$;

-- Pausar a un profesor oculta todos sus avisos de una vez sin borrar nada
-- (la política de lectura exige profesor aprobado). Se revierte con 'aprobado'.
create or replace function public.admin_estado_profesor(p_user_id uuid, p_estado text)
returns boolean
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  filas integer := 0;
begin
  perform admin.exigir_administrador();
  if p_estado not in ('aprobado', 'suspendido') then
    raise exception 'estado inválido';
  end if;
  update public.tutor_perfiles set estado = p_estado, revisado_at = now()
   where user_id = p_user_id and estado in ('aprobado', 'suspendido') and estado <> p_estado;
  get diagnostics filas = row_count;
  if filas = 1 then
    insert into admin.acciones (admin_id, accion, objetivo, detalle)
    values (auth.uid(), 'estado_profesor', p_user_id, jsonb_build_object('estado', p_estado));
  end if;
  return filas = 1;
end;
$$;

-- Cobrado, en deuda o pendiente (sin fila), para la publicación actual del
-- anuncio. El monto lo escribe quien administra: en el piloto no hay cobro
-- automático.
create or replace function public.admin_marcar_cobro(p_anuncio_id uuid, p_estado text, p_monto_clp integer)
returns boolean
language plpgsql
security definer
set search_path = public, admin
as $$
declare
  desde timestamptz;
begin
  perform admin.exigir_administrador();
  if p_estado not in ('cobrado', 'deuda', 'pendiente') then
    raise exception 'estado de cobro inválido';
  end if;
  select publicado_at into desde from public.tutor_anuncios where id = p_anuncio_id;
  if desde is null then
    raise exception 'ese anuncio no se ha publicado';
  end if;
  if p_estado = 'pendiente' then
    delete from admin.cobros where anuncio_id = p_anuncio_id and publicado_at = desde;
  else
    if p_monto_clp is null or p_monto_clp not between 0 and 5000000 then
      raise exception 'monto inválido';
    end if;
    insert into admin.cobros (anuncio_id, publicado_at, estado, monto_clp)
    values (p_anuncio_id, desde, p_estado, p_monto_clp)
    on conflict (anuncio_id, publicado_at) do update
      set estado = excluded.estado, monto_clp = excluded.monto_clp, actualizado_at = now();
  end if;
  insert into admin.acciones (admin_id, accion, objetivo, detalle)
  values (auth.uid(), 'marcar_cobro', p_anuncio_id, jsonb_build_object('estado', p_estado, 'monto_clp', p_monto_clp));
  return true;
end;
$$;

revoke all on function admin.exigir_administrador() from public, anon, authenticated;
revoke all on function public.admin_panel_clases() from public, anon;
revoke all on function public.admin_pausar_anuncio(uuid) from public, anon;
revoke all on function public.admin_estado_profesor(uuid, text) from public, anon;
revoke all on function public.admin_marcar_cobro(uuid, text, integer) from public, anon;
grant execute on function public.admin_panel_clases() to authenticated;
grant execute on function public.admin_pausar_anuncio(uuid) to authenticated;
grant execute on function public.admin_estado_profesor(uuid, text) to authenticated;
grant execute on function public.admin_marcar_cobro(uuid, text, integer) to authenticated;
