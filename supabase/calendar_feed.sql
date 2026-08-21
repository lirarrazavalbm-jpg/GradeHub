-- Feed de calendario suscribible.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a estas RPC. Cloudflare Pages despliega los archivos estáticos, pero
-- no ejecuta migraciones de Supabase por sí sola.
--
-- QUÉ RESUELVE. El .ics que la app descarga es una foto: si después cambias una
-- fecha, el archivo ya bajado no se entera. Un feed es una URL que Google
-- consulta cada 8–24 horas, así que la suscripción se hace una vez y queda.
--
-- POR QUÉ HAY UN TOKEN Y NO UN LOGIN. Google consulta la URL desde sus
-- servidores, sin sesión y sin cookies. La única forma de que sepa de quién es
-- el calendario es que el secreto vaya en la propia URL.
--
-- QUÉ VE QUIEN TENGA LA URL. Nombre de ramo, nombre de evaluación, cuánto vale
-- y su fecha. NUNCA notas: `calendar_feed_data` las descarta al armar la
-- respuesta, no las devuelve para que otro las filtre. Un token filtrado
-- expone en qué anda el estudiante, no cómo le va.

create table if not exists public.calendar_feeds (
  -- ON DELETE CASCADE no es opcional: sin esto el feed sobrevive al borrado de
  -- cuenta y la política de privacidad pasa a ser mentira sin que nada falle.
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

-- Nadie llega a esta tabla desde el cliente: las tres funciones de abajo son la
-- única puerta. Sin políticas, RLS deja todo fuera.
revoke all on public.calendar_feeds from anon, authenticated;

-- Dos UUID v4 concatenados: ~244 bits de entropía, sin depender de pgcrypto.
create or replace function public.calendar_feed_new_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text, '-', '') ||
         replace(gen_random_uuid()::text, '-', '');
$$;

-- Devuelve el token del usuario que llama, creándolo la primera vez.
create or replace function public.calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t   text;
begin
  if uid is null then
    raise exception 'hay que haber iniciado sesión';
  end if;

  insert into public.calendar_feeds (user_id, token)
  values (uid, public.calendar_feed_new_token())
  on conflict (user_id) do nothing;

  select token into t from public.calendar_feeds where user_id = uid;
  return t;
end;
$$;

-- Regenera el token: la URL anterior deja de funcionar al instante.
create or replace function public.calendar_feed_revoke()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t   text := public.calendar_feed_new_token();
begin
  if uid is null then
    raise exception 'hay que haber iniciado sesión';
  end if;

  insert into public.calendar_feeds (user_id, token)
  values (uid, t)
  on conflict (user_id) do update set token = excluded.token, created_at = now();

  return t;
end;
$$;

-- La lee la Cloudflare Pages Function con la clave publishable, sin sesión.
--
-- Devuelve SOLO evaluaciones con fecha, y de cada una solo lo que un evento de
-- calendario necesita. El blob de `user_ramos` trae las notas adentro: se
-- quedan acá y no cruzan nunca la frontera.
-- OJO al reaplicar: agregar `hora` cambia el tipo de retorno, y Postgres no
-- deja hacerlo con `create or replace`. Hay que soltarla primero. Los permisos
-- de más abajo se vuelven a otorgar en el mismo archivo, así que basta con
-- correrlo entero.
drop function if exists public.calendar_feed_data(text);

create function public.calendar_feed_data(p_token text)
returns table (ramo text, evaluacion text, peso numeric, fecha text, hora text)
language sql
security definer
set search_path = public
as $$
  select
    r->>'nombre'                       as ramo,
    c->>'nombre'                       as evaluacion,
    coalesce((c->>'peso')::numeric, 0) as peso,
    c->>'fecha'                        as fecha,
    -- La hora es opcional y vive aparte de la fecha. El feed la valida acá
    -- también: el blob lo escribe el navegador del estudiante, así que llega
    -- como venga y no como uno espera.
    nullif(c->>'hora', '')             as hora
  from public.calendar_feeds f
  join public.user_ramos u on u.user_id = f.user_id
  cross join lateral jsonb_array_elements(coalesce(u.data->'ramos', '[]'::jsonb)) r
  cross join lateral jsonb_array_elements(coalesce(r->'categorias', '[]'::jsonb)) c
  where f.token = p_token
    and nullif(c->>'fecha', '') is not null
  order by c->>'fecha', coalesce(c->>'hora', '');
$$;

revoke all on function public.calendar_feed_data(text) from public;
grant execute on function public.calendar_feed_data(text) to anon, authenticated;
grant execute on function public.calendar_feed_token()   to authenticated;
grant execute on function public.calendar_feed_revoke()  to authenticated;
