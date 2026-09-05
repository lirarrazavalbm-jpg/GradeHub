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
grant select (id, tenant, ramos_siglas, modalidad, ubicacion, precio_clp, descripcion,
              contacto_tipo, contacto_valor, estado, publicado_at, vence_at, created_at)
  on public.tutor_anuncios to anon, authenticated;
grant insert (autor_id, tenant, ramos_siglas, modalidad, ubicacion, precio_clp,
              descripcion, contacto_tipo, contacto_valor)
  on public.tutor_anuncios to authenticated;
grant update (ramos_siglas, modalidad, ubicacion, precio_clp, descripcion,
              contacto_tipo, contacto_valor, estado)
  on public.tutor_anuncios to authenticated;

drop policy if exists tutor_anuncios_select_publicados_o_propios on public.tutor_anuncios;
create policy tutor_anuncios_select_publicados_o_propios
on public.tutor_anuncios
for select
to anon, authenticated
using (
  (estado = 'publicado' and (vence_at is null or vence_at > now()))
  or (select auth.uid()) = autor_id
);

-- Un tutor solo crea borradores propios: no puede autoaprobarse ni marcarse
-- como pagado desde el navegador. Esas columnas ni siquiera tienen grant.
drop policy if exists tutor_anuncios_insert_borrador_propio on public.tutor_anuncios;
create policy tutor_anuncios_insert_borrador_propio
on public.tutor_anuncios
for insert
to authenticated
with check ((select auth.uid()) = autor_id and estado = 'borrador');

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
  and estado in ('borrador', 'en_revision', 'pausado')
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
-- de cinco el corte no sale de esta función, aunque otro cliente la invoque.
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
    and m.eventos >= 5
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
