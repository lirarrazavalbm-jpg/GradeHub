-- Un agente puede PROPONER notas. Aplícalo una vez en el SQL Editor, después de
-- `agente_propuestas.sql`.
--
-- LA REGLA NO CAMBIA, SE MANTIENE POR OTRO CAMINO. Un agente sigue sin escribir
-- notas: deja una propuesta y la nota entra recién cuando su dueña la acepta en
-- la app, con el valor y la evaluación a la vista. Eso es lo que sostiene el
-- producto —que el promedio que alguien ve sea el suyo— y por eso el estado
-- inicial es 'pendiente' y no hay ningún camino que lo salte.
--
-- POR QUÉ EN LA TABLA QUE YA EXISTE. La bandeja de propuestas ya está armada,
-- con su RLS sin políticas, sus RPC acotadas y su índice de pendientes. Una
-- tabla nueva duplicaría las cuatro cosas y daría dos lugares donde revisar si
-- algo quedó sin confirmar. Se agrega `tipo` y la columna `evaluaciones` guarda
-- lo propuesto: para 'pauta' son nombres y pesos, para 'notas' son nombres y
-- valores.
--
-- LAS COLUMNAS SE AGREGAN, NADA SE RENOMBRA NI SE BORRA. Las propuestas de
-- pauta que estén pendientes ahora siguen válidas y se leen igual: `tipo` nace
-- con default 'pauta', que es lo que son.

alter table public.agent_pauta_proposals
  add column if not exists tipo text not null default 'pauta';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_pauta_proposals_tipo_chk') then
    alter table public.agent_pauta_proposals
      add constraint agent_pauta_proposals_tipo_chk check (tipo in ('pauta','notas'));
  end if;
end $$;

-- El listado pasa a devolver `tipo`, así que cambia su tipo de retorno y
-- Postgres no lo acepta con create or replace. El drop va primero a propósito:
-- es la misma trampa que ya documentó calendar_feed_data.
drop function if exists public.listar_propuestas_pauta_agente();
create or replace function public.listar_propuestas_pauta_agente()
returns table(id uuid, tipo text, ramo text, ramo_key text, evaluaciones jsonb, fuente text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select id,tipo,ramo,ramo_key,evaluaciones,fuente,created_at
    from public.agent_pauta_proposals
   where user_id = auth.uid() and status = 'pendiente'
   order by created_at asc;
$$;

-- Propone notas para un ramo. Mismo contrato que proponer_pauta_agente: el
-- user_id sale del token y nunca de la petición.
create or replace function public.proponer_notas_agente(
  p_token text,
  p_ramo text,
  p_ramo_key text,
  p_notas jsonb,
  p_fuente text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_id uuid;
begin
  select user_id into v_user from public.agent_links
   where token = p_token and expires_at > now();
  if v_user is null then raise exception 'Conexión no válida'; end if;
  if jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'Propuesta vacía';
  end if;
  if jsonb_array_length(p_notas) > 60 then raise exception 'Demasiadas notas en una propuesta'; end if;
  if coalesce(btrim(p_fuente),'') = '' then raise exception 'Falta la fuente'; end if;
  -- Una propuesta pendiente por ramo y tipo: la nueva reemplaza a la anterior.
  -- Sin esto, un agente que reintenta deja una cola de propuestas casi iguales
  -- y la persona tiene que resolverlas una por una para llegar a la última.
  update public.agent_pauta_proposals
     set status='descartada', resolved_at=now()
   where user_id=v_user and status='pendiente' and tipo='notas' and ramo_key=p_ramo_key;
  update public.agent_links set last_used_at = now() where token = p_token;
  insert into public.agent_pauta_proposals(user_id,tipo,ramo,ramo_key,evaluaciones,fuente)
  values (v_user,'notas',left(p_ramo,120),left(p_ramo_key,160),p_notas,left(btrim(p_fuente),300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.proponer_notas_agente(text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.proponer_notas_agente(text, text, text, jsonb, text) to anon, authenticated;
revoke all on function public.listar_propuestas_pauta_agente() from public, anon;
grant execute on function public.listar_propuestas_pauta_agente() to authenticated;
