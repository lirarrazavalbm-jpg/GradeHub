-- Un agente puede proponer los RAMOS del semestre. Aplícalo una vez en el SQL
-- Editor, después de `agente_fechas_propuestas.sql`.
--
-- Para qué sirve: armar el semestre es el momento en que más gente se cae. El
-- horario de la universidad trae sigla y sección de todos los ramos, y pasarlos
-- a mano uno por uno es justo lo que nadie hace. Pegando ese horario en el chat,
-- el agente los reconoce y los deja propuestos.
--
-- Mismo contrato que las otras tres propuestas, y por la misma razón: NO toca
-- `user_ramos` al llegar. El estado del semestre vive en un solo JSON que la app
-- sincroniza entera, así que si el servidor lo escribiera pisaría lo que la
-- persona tenga abierto en otro dispositivo. La propuesta espera, y es la app la
-- que crea los ramos —con su pauta y sus créditos del catálogo— cuando su dueña
-- acepta.
--
-- Lo que un agente sigue sin poder hacer: notas. Acá van nombre, sigla y
-- sección, que es lo que dice un horario, y nada más.

alter table public.agent_pauta_proposals drop constraint if exists agent_pauta_proposals_tipo_chk;
alter table public.agent_pauta_proposals
  add constraint agent_pauta_proposals_tipo_chk check (tipo in ('pauta','notas','fechas','ramos'));

create or replace function public.proponer_ramos_agente(
  p_token text,
  p_ramos jsonb,
  p_fuente text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_id uuid;
  v_ramo jsonb;
begin
  select user_id into v_user from public.agent_links
   where token = p_token and expires_at > now();
  if v_user is null then raise exception 'La conexión ya no es válida. Vuelve a vincular el agente.'; end if;

  if jsonb_typeof(p_ramos) <> 'array' or jsonb_array_length(p_ramos) = 0 then
    raise exception 'Propuesta inválida: entrega al menos un ramo.';
  end if;
  -- Un semestre no tiene veinte ramos. El tope es contra una lista pegada mal,
  -- no contra un estudiante con mucha carga.
  if jsonb_array_length(p_ramos) > 20 then
    raise exception 'Propuesta inválida: como máximo 20 ramos.';
  end if;
  if length(trim(coalesce(p_fuente,''))) not between 1 and 500 then
    raise exception 'Propuesta inválida: di de dónde salió la lista (el horario, el correo de inscripción).';
  end if;

  -- El cliente valida lo mismo antes de llamar. Esto se repite acá porque la
  -- RPC es la frontera de verdad: el endpoint se puede cambiar sin mirar este
  -- archivo, y lo que entra queda guardado igual.
  for v_ramo in select * from jsonb_array_elements(p_ramos) loop
    if jsonb_typeof(v_ramo) <> 'object'
       or jsonb_typeof(v_ramo->'nombre') <> 'string'
       or length(btrim(v_ramo->>'nombre')) not between 1 and 120 then
      raise exception 'Propuesta inválida: cada ramo necesita un nombre.';
    end if;
    if v_ramo ? 'sigla' and (jsonb_typeof(v_ramo->'sigla') <> 'string' or length(btrim(v_ramo->>'sigla')) > 40) then
      raise exception 'Propuesta inválida: la sigla no puede tener más de 40 caracteres.';
    end if;
    if v_ramo ? 'seccion' and (
         jsonb_typeof(v_ramo->'seccion') <> 'number'
         or (v_ramo->>'seccion')::numeric <> trunc((v_ramo->>'seccion')::numeric)
         or (v_ramo->>'seccion')::numeric not between 1 and 999) then
      raise exception 'Propuesta inválida: la sección es un número entero entre 1 y 999.';
    end if;
  end loop;

  -- Una pendiente por cuenta: la nueva reemplaza a la anterior, para que un
  -- agente que reintenta no deje una cola de listas casi iguales.
  update public.agent_pauta_proposals
     set status='descartada', resolved_at=now()
   where user_id=v_user and status='pendiente' and tipo='ramos';

  update public.agent_links set last_used_at = now() where token = p_token;

  -- `ramo` y `ramo_key` son NOT NULL y acá la propuesta no es de un ramo sino
  -- del semestre entero. Se guarda esa etiqueta fija para no inventar una clave
  -- que después alguien intente calzar con un ramo real.
  insert into public.agent_pauta_proposals(user_id,tipo,ramo,ramo_key,evaluaciones,fuente)
  values (v_user,'ramos','Tu semestre','__semestre__',p_ramos,left(btrim(p_fuente),300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.proponer_ramos_agente(text, jsonb, text) from public, authenticated;
grant execute on function public.proponer_ramos_agente(text, jsonb, text) to anon, authenticated;
