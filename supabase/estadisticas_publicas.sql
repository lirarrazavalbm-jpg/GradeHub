-- Números públicos para la pantalla de login.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a esta RPC. Cloudflare Pages no ejecuta SQL.
--
-- QUÉ ES. Quien llega a gradehub.cl sin cuenta ve un login y nada más. Una
-- línea del tipo "1.240 estudiantes ya llevan sus notas acá" responde "¿esto lo
-- usa alguien?" antes de pedirle una cuenta.
--
-- QUÉ EXPONE Y QUÉ NO. Solo agregados: cuántas cuentas hay, cuántas entraron
-- esta semana, cuántos ramos y notas hay guardados en total. No sale ningún
-- user_id, correo, nombre, ramo ni nota. La llama la clave publishable sin
-- sesión, así que cualquiera puede leerla — y cualquiera lee lo mismo.
--
-- `activas_7d` cuenta por `last_sign_in_at`, que Supabase actualiza solo al
-- iniciar sesión, no al refrescar un token: quien queda logueado semanas no se
-- cuenta. Es una cota inferior honesta, no el número real de gente que entra.
-- Por eso la pantalla muestra cuentas y notas, que sí son exactas.
--
-- ponytail: recorre user_ramos entero en cada login. Con cientos de filas es
-- nada; si algún día pesa, cachear en una tabla que se refresque cada hora.
create or replace function public.estadisticas_publicas()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'cuentas',    (select count(*) from auth.users),
    'activas_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'ramos',      coalesce((select sum(jsonb_array_length(coalesce(u.data->'ramos', '[]'::jsonb))) from public.user_ramos u), 0),
    'notas',      coalesce((
      select count(*)
      from public.user_ramos u
      cross join lateral jsonb_array_elements(coalesce(u.data->'ramos', '[]'::jsonb)) r
      cross join lateral jsonb_array_elements(coalesce(r->'categorias', '[]'::jsonb)) c
      cross join lateral jsonb_array_elements(coalesce(c->'notas', '[]'::jsonb)) n
      where (n->>'valor') is not null
    ), 0)
  );
$$;

revoke all on function public.estadisticas_publicas() from public;
grant execute on function public.estadisticas_publicas() to anon, authenticated;
