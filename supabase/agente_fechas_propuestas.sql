-- Un agente puede proponer FECHAS de evaluación. Aplícalo una vez en el SQL
-- Editor, después de `agente_notas_propuestas.sql`.
--
-- Mismo contrato que las otras propuestas: nace pendiente, no toca el ramo al
-- llegar, y la persona la acepta, edita o rechaza en la ficha del ramo. Acá el
-- riesgo es más bajo que con una nota —una fecha equivocada se nota al llegar
-- el día— pero el camino es el mismo a propósito: una sola bandeja, una sola
-- forma de confirmar.
--
-- Para qué sirve de verdad: el calendario del curso vive en un PDF, en un
-- correo o en una publicación, y transcribir diez fechas a mano es justo lo que
-- nadie hace. Sin fechas, la Agenda queda vacía.

alter table public.agent_pauta_proposals drop constraint if exists agent_pauta_proposals_tipo_chk;
alter table public.agent_pauta_proposals
  add constraint agent_pauta_proposals_tipo_chk check (tipo in ('pauta','notas','fechas'));

create or replace function public.proponer_fechas_agente(
  p_token text,
  p_ramo text,
  p_ramo_key text,
  p_fechas jsonb,
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
  if jsonb_typeof(p_fechas) <> 'array' or jsonb_array_length(p_fechas) = 0 then
    raise exception 'Propuesta vacía';
  end if;
  if jsonb_array_length(p_fechas) > 60 then raise exception 'Demasiadas fechas en una propuesta'; end if;
  if coalesce(btrim(p_fuente),'') = '' then raise exception 'Falta la fuente'; end if;
  -- Una pendiente por ramo y tipo: la nueva reemplaza a la anterior, para que
  -- un agente que reintenta no deje una cola de propuestas casi iguales.
  update public.agent_pauta_proposals
     set status='descartada', resolved_at=now()
   where user_id=v_user and status='pendiente' and tipo='fechas' and ramo_key=p_ramo_key;
  update public.agent_links set last_used_at = now() where token = p_token;
  insert into public.agent_pauta_proposals(user_id,tipo,ramo,ramo_key,evaluaciones,fuente)
  values (v_user,'fechas',left(p_ramo,120),left(p_ramo_key,160),p_fechas,left(btrim(p_fuente),300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.proponer_fechas_agente(text, text, text, jsonb, text) from public, authenticated;
grant execute on function public.proponer_fechas_agente(text, text, text, jsonb, text) to anon, authenticated;
