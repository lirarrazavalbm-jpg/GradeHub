-- Conectar ChatGPT, Claude o Gemini "normales": una URL y nada más.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase. No toca tablas: solo agrega
-- una función. El flujo del código de 6 caracteres sigue igual para los agentes
-- que sí pueden correr comandos.
--
-- POR QUÉ HACE FALTA. El diseño original escondía el token a propósito: la app
-- mostraba un código de un solo uso y el agente lo canjeaba. Eso funciona con
-- un agente que tiene terminal, y con ningún otro. ChatGPT, Claude y Gemini
-- aceptan un conector remoto como UNA URL pegada en su configuración: no pueden
-- canjear nada, así que sin ver el token no hay forma de conectarlos.
--
-- QUÉ SIGNIFICA ESO, dicho sin adornos: la URL que la app va a mostrar vale lo
-- mismo que una llave de lectura de las notas de esa persona. Quien la tenga ve
-- ramos, notas y fechas, y puede agregar un ramo. No puede escribir notas, no
-- puede borrar nada y no puede aplicar una pauta sin confirmación en la app.
--
-- LO QUE SE CONSERVA. El vínculo sigue venciendo a los 90 días, sigue
-- apareciendo en Ajustes con su nombre y su último uso, y sigue pudiendo
-- desconectarse en un clic. El token no queda guardado en el dispositivo: la
-- app lo muestra y lo olvida al cerrar la pantalla.
--
-- POR QUÉ UNA FUNCIÓN NUEVA Y NO REUSAR canjear_codigo_agente. Esa es `anon`
-- —tiene que serlo, la llama el agente sin sesión— y devuelve un token a quien
-- presente un código válido. Esta exige sesión y entrega el token al dueño de
-- la cuenta, que es una autorización distinta y merece una puerta distinta.

create or replace function public.crear_vinculo_agente(p_agente text default null)
returns table(token text, expira timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_token text; v_expira timestamptz;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  -- Un techo por persona. Sin esto, un botón que entrega llaves permanentes
  -- deja crecer una lista que nadie revisa, y revocar deja de ser realista.
  if (select count(*) from public.agent_links
       where user_id = auth.uid() and expires_at > now()) >= 10 then
    raise exception 'ya tienes 10 agentes conectados: desconecta uno antes de agregar otro';
  end if;
  -- gen_random_uuid y NO gen_random_bytes: pgcrypto no está en este
  -- search_path y ya rompió las otras dos funciones de este mismo archivo.
  v_token := replace(gen_random_uuid()::text,'-','') ||
             replace(gen_random_uuid()::text,'-','');
  insert into public.agent_links(user_id, token, agente)
  values (auth.uid(), v_token, left(coalesce(nullif(btrim(p_agente),''),'Agente'),60))
  returning agent_links.expires_at into v_expira;
  return query select v_token, v_expira;
end $$;

revoke all on function public.crear_vinculo_agente(text) from public, anon;
grant execute on function public.crear_vinculo_agente(text) to authenticated;
