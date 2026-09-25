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
