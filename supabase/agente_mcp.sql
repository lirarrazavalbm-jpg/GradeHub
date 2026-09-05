-- Conexión de GradeHub con el agente de IA del estudiante (MCP).
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llame a estas RPC. Cloudflare Pages despliega archivos estáticos y Functions,
-- pero no ejecuta SQL.
--
-- QUÉ RESUELVE. Que el agente del estudiante sepa sus notas y sus fechas sin
-- que él tenga que mandarle un archivo cada vez. La vinculación se hace una vez
-- y las respuestas salen del estado del momento.
--
-- POR QUÉ UN CÓDIGO Y NO UN TOKEN A LA VISTA. El token de un agente vale lo
-- mismo que la cuenta: quien lo tenga ve todas las notas. Si el estudiante lo
-- tiene en la mano, va a terminar pegado donde no corresponde. Por eso la app
-- muestra un código corto que vive cinco minutos y sirve una sola vez; el token
-- real lo emite el servidor al canjearlo y el estudiante nunca lo ve.
--
-- QUÉ PUEDE HACER UN AGENTE. Ver: ramos, notas, ponderaciones y fechas.
-- Escribir: agregar un ramo, y PROPONER una pauta que queda pendiente hasta que
-- el estudiante la confirme en la app. NUNCA notas, y nada destructivo. Una
-- nota que entra sin que él la teclee rompe lo único que sostiene el producto:
-- que el promedio que ve sea el suyo.

create table if not exists public.agent_links (
  -- ON DELETE CASCADE no es opcional: sin esto la vinculación sobrevive al
  -- borrado de cuenta y la política de privacidad pasa a ser mentira sin que
  -- nada falle.
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null unique,
  agente       text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  -- Un token sin vencimiento convierte "revocable" en una promesa que nadie
  -- ejerce. Noventa días y se renueva volviendo a vincular.
  expires_at   timestamptz not null default now() + interval '90 days'
);
create index if not exists agent_links_user on public.agent_links(user_id);

create table if not exists public.agent_link_codes (
  codigo     text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);

alter table public.agent_links      enable row level security;
alter table public.agent_link_codes enable row level security;

-- Cero políticas a propósito: nadie llega a estas tablas desde el cliente. Las
-- funciones de abajo son la única puerta, igual que en `calendar_feeds`.

-- Genera el código que la app muestra. Uno vivo por persona: pedir otro
-- invalida el anterior, así un código que quedó en pantalla deja de servir.
create or replace function public.crear_codigo_agente()
returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  delete from public.agent_link_codes where user_id = auth.uid();
  -- Seis caracteres sin 0/O ni 1/I: se dicta en voz alta y se copia a mano.
  v_codigo := upper(translate(substr(encode(gen_random_bytes(8),'base64'),1,6),'01OIl/+','23579XY'));
  insert into public.agent_link_codes(codigo, user_id) values (v_codigo, auth.uid());
  return v_codigo;
end $$;

-- El agente canjea el código por su token. Un solo uso: se borra al canjear.
create or replace function public.canjear_codigo_agente(p_codigo text, p_agente text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_token text;
begin
  delete from public.agent_link_codes where expires_at < now();
  select user_id into v_user from public.agent_link_codes where codigo = upper(p_codigo);
  if v_user is null then raise exception 'código inválido o vencido'; end if;
  delete from public.agent_link_codes where codigo = upper(p_codigo);
  v_token := encode(gen_random_bytes(32),'hex');
  insert into public.agent_links(user_id, token, agente) values (v_user, v_token, left(coalesce(p_agente,'Agente'),60));
  return v_token;
end $$;

-- Lo que ve el agente. Devuelve el estado del dueño de ESE token y de nadie
-- más: el user_id sale de la tabla, nunca de la petición.
create or replace function public.agente_datos(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_data jsonb;
begin
  select user_id into v_user from public.agent_links
   where token = p_token and expires_at > now();
  if v_user is null then return null; end if;
  update public.agent_links set last_used_at = now() where token = p_token;
  select u.data into v_data from public.user_ramos u where u.user_id = v_user;
  return coalesce(v_data, '{}'::jsonb);
end $$;

-- Para la pantalla de Ajustes: qué agentes están conectados y desde cuándo.
-- Sin el token, que no se muestra nunca.
create or replace function public.listar_agentes()
returns table(id uuid, agente text, created_at timestamptz, last_used_at timestamptz, expires_at timestamptz)
language sql security definer set search_path = public as $$
  select id, agente, created_at, last_used_at, expires_at
    from public.agent_links where user_id = auth.uid() order by created_at desc;
$$;

create or replace function public.revocar_agente(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.agent_links where id = p_id and user_id = auth.uid();
$$;

revoke all on function public.agente_datos(text) from public;
grant execute on function public.agente_datos(text) to anon, authenticated;
grant execute on function public.crear_codigo_agente() to authenticated;
grant execute on function public.canjear_codigo_agente(text, text) to anon, authenticated;
grant execute on function public.listar_agentes() to authenticated;
grant execute on function public.revocar_agente(uuid) to authenticated;
