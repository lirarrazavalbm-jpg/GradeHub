-- Propuestas de pauta recibidas desde un agente MCP.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase DESPUÉS de
-- `supabase/agente_mcp.sql` y ANTES de mergear el PR. El primero crea
-- `agent_links`, que autentica al agente; este archivo crea la bandeja que la
-- persona revisa en GradeHub. Cloudflare Pages no ejecuta SQL al desplegar.
--
-- La propuesta no toca `user_ramos` ni `catalog_reports` al llegar. Se guarda
-- pendiente hasta que su dueña la ve completa y decide aplicarla. Solo esa
-- confirmación desde la app alimenta el consenso existente de tres personas.

create table if not exists public.agent_pauta_proposals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ramo          text not null,
  ramo_key      text not null,
  evaluaciones  jsonb not null,
  fuente        text not null,
  status        text not null default 'pendiente' check (status in ('pendiente','aplicada','descartada')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists agent_pauta_proposals_pending_user
  on public.agent_pauta_proposals(user_id, created_at desc)
  where status = 'pendiente';

alter table public.agent_pauta_proposals enable row level security;

-- Cero políticas: ni el navegador ni el agente acceden a la tabla. Las RPC
-- acotan quién escribe (el token vigente) y quién revisa (la cuenta dueña).

create or replace function public.proponer_pauta_agente(
  p_token text,
  p_ramo text,
  p_ramo_key text,
  p_evaluaciones jsonb,
  p_fuente text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_limpias jsonb;
  v_total numeric;
  v_id uuid;
begin
  select user_id into v_user
    from public.agent_links
   where token = p_token and expires_at > now();
  if v_user is null then raise exception 'La conexión ya no es válida. Vuelve a vincular el agente.'; end if;

  if length(trim(coalesce(p_ramo,''))) not between 1 and 160
     or length(trim(coalesce(p_ramo_key,''))) not between 1 and 160 then
    raise exception 'Propuesta inválida: falta el ramo al que pertenece la pauta.';
  end if;
  if length(trim(coalesce(p_fuente,''))) not between 1 and 500 then
    raise exception 'Propuesta inválida: explica de qué documento o sección salió la pauta.';
  end if;
  if jsonb_typeof(p_evaluaciones) <> 'array'
     or jsonb_array_length(p_evaluaciones) not between 1 and 30
     or octet_length(p_evaluaciones::text) > 32768 then
    raise exception 'Propuesta inválida: entrega entre 1 y 30 evaluaciones.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_evaluaciones) as e(valor)
    where jsonb_typeof(e.valor) <> 'object'
       or jsonb_typeof(e.valor->'nombre') <> 'string'
       or length(trim(e.valor->>'nombre')) not between 1 and 120
       or jsonb_typeof(e.valor->'peso') <> 'number'
       or (e.valor->>'peso')::numeric <= 0
       or (e.valor->>'peso')::numeric > 100
       or (e.valor ? 'casillas' and (
         jsonb_typeof(e.valor->'casillas') <> 'number'
         or (e.valor->>'casillas')::numeric <> trunc((e.valor->>'casillas')::numeric)
         or (e.valor->>'casillas')::numeric not between 2 and 100
       ))
  ) then
    raise exception 'Propuesta inválida: cada evaluación necesita un nombre y un peso entre 0 y 100; las casillas, si existen, son un entero entre 2 y 100.';
  end if;
  if exists (
    select 1 from (
      select translate(lower(trim(e.valor->>'nombre')),'áéíóúüñ','aeiouun') as nombre
      from jsonb_array_elements(p_evaluaciones) as e(valor)
    ) nombres group by nombre having count(*) > 1
  ) then
    raise exception 'Propuesta inválida: no repitas una evaluación con el mismo nombre.';
  end if;

  select coalesce(sum((e.valor->>'peso')::numeric),0) into v_total
    from jsonb_array_elements(p_evaluaciones) as e(valor);
  if abs(v_total-100) >= 0.05 then
    raise exception 'Propuesta inválida: los pesos suman %; deben sumar 100.', v_total;
  end if;

  -- Se guarda una versión limpia: no viajan campos extra que un agente haya
  -- recibido desde el PDF ni ninguna nota de la cuenta.
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'nombre', trim(e.valor->>'nombre'),
    'peso', round((e.valor->>'peso')::numeric,2),
    'casillas', case when e.valor ? 'casillas' then (e.valor->>'casillas')::integer else null end
  )) order by e.ord)
  into v_limpias
  from jsonb_array_elements(p_evaluaciones) with ordinality as e(valor,ord);

  insert into public.agent_pauta_proposals(user_id,ramo,ramo_key,evaluaciones,fuente)
  values(v_user,trim(p_ramo),trim(p_ramo_key),v_limpias,trim(p_fuente))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.listar_propuestas_pauta_agente()
returns table(id uuid, ramo text, ramo_key text, evaluaciones jsonb, fuente text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select id,ramo,ramo_key,evaluaciones,fuente,created_at
    from public.agent_pauta_proposals
   where user_id = auth.uid() and status = 'pendiente'
   order by created_at asc;
$$;

create or replace function public.resolver_propuesta_pauta_agente(p_id uuid, p_accion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión activa'; end if;
  if p_accion not in ('aplicada','descartada') then raise exception 'Acción inválida'; end if;
  update public.agent_pauta_proposals
     set status=p_accion,resolved_at=now()
   where id=p_id and user_id=auth.uid() and status='pendiente';
  if not found then raise exception 'La propuesta ya no está disponible'; end if;
end;
$$;

revoke all on table public.agent_pauta_proposals from public, anon, authenticated;
revoke all on function public.proponer_pauta_agente(text, text, text, jsonb, text) from public, authenticated;
revoke all on function public.listar_propuestas_pauta_agente() from public, anon;
revoke all on function public.resolver_propuesta_pauta_agente(uuid, text) from public, anon;
grant execute on function public.proponer_pauta_agente(text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.listar_propuestas_pauta_agente() to authenticated;
grant execute on function public.resolver_propuesta_pauta_agente(uuid, text) to authenticated;
