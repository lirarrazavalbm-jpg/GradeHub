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
