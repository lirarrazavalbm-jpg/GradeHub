-- ARREGLO: conectar un agente era imposible. Aplícalo UNA VEZ en el SQL Editor
-- de Supabase, sobre la base que ya tiene aplicado agente_mcp.sql.
--
-- QUÉ PASABA. Las dos funciones generaban sus secretos con gen_random_bytes(),
-- que es de pgcrypto. Estas funciones declaran `set search_path = public` —una
-- medida de seguridad, no un descuido— y pgcrypto no vive ahí, así que la
-- llamada moría con:
--
--   42883: function gen_random_bytes(integer) does not exist
--
-- La app solo alcanzaba a decir "No pudimos generar el código. Intenta de
-- nuevo.", y el canje estaba roto por lo mismo sin que nadie llegara a
-- descubrirlo, porque nunca hubo un código válido que canjear.
--
-- POR QUÉ NO SE DETECTÓ ANTES. Probar la RPC sin sesión devuelve "sin sesión",
-- que es su primera guarda y parece una respuesta sana. El error real estaba
-- dos líneas más abajo, detrás de esa guarda: para verlo hay que llamarla
-- autenticado. Lo mismo con el canje, que contesta "código inválido o vencido"
-- antes de llegar a generar el token.
--
-- QUÉ CAMBIA. Los secretos salen de gen_random_uuid(), que es de Postgres y no
-- de una extensión. No es una idea nueva: es exactamente como calendar_feed.sql
-- genera su token desde que existe, y ya es el default de la columna `id` de
-- estas mismas tablas.
--
-- NO TOCA NINGUNA TABLA. Solo reemplaza las dos funciones, así que no hay nada
-- que migrar ni vinculación que se pierda.

create or replace function public.crear_codigo_agente()
returns text
language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  delete from public.agent_link_codes where user_id = auth.uid();
  -- Seis caracteres sin 0/O ni 1/I: se dicta en voz alta y se copia a mano.
  -- Seis letras sin las que se confunden al dictar (nada de I, O, L ni S).
  --
  -- Sale de gen_random_uuid() y NO de gen_random_bytes(): lo segundo es de
  -- pgcrypto, que no vive en el search_path de esta función, así que el insert
  -- reventaba con "function gen_random_bytes(integer) does not exist" y la app
  -- solo alcanzaba a decir "no pudimos generar el código". gen_random_uuid es
  -- de Postgres, ya es el default de la columna `id` de esta misma tabla y es
  -- como calendar_feed.sql genera su token desde que existe.
  v_codigo := translate(substr(replace(gen_random_uuid()::text,'-',''),1,6),
                        '0123456789abcdef','ABCDEFGHJKMNPRTW');
  insert into public.agent_link_codes(codigo, user_id) values (v_codigo, auth.uid());
  return v_codigo;
end $$;

create or replace function public.canjear_codigo_agente(p_codigo text, p_agente text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_token text;
begin
  delete from public.agent_link_codes where expires_at < now();
  select user_id into v_user from public.agent_link_codes where codigo = upper(p_codigo);
  if v_user is null then raise exception 'código inválido o vencido'; end if;
  delete from public.agent_link_codes where codigo = upper(p_codigo);
  -- 64 hex, mismo formato que valida el endpoint, con dos uuid. Por lo mismo
  -- que el código de arriba: pgcrypto no se alcanza desde acá.
  v_token := replace(gen_random_uuid()::text,'-','') ||
             replace(gen_random_uuid()::text,'-','');
  insert into public.agent_links(user_id, token, agente) values (v_user, v_token, left(coalesce(p_agente,'Agente'),60));
  return v_token;
end $$;

grant execute on function public.crear_codigo_agente() to authenticated;
grant execute on function public.canjear_codigo_agente(text, text) to anon, authenticated;
