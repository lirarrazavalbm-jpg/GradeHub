-- Cómo vas respecto de toda tu universidad. Lo usa el resumen de fin de
-- semestre (el "Wrapped", en render-main.js).
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a esta RPC. Cloudflare Pages no ejecuta SQL. Requiere que
-- curso_posicion.sql ya esté aplicado: lee su tabla.
--
-- NO HAY TABLA NUEVA A PROPÓSITO. Los promedios por ramo ya suben a
-- `curso_notas` (ver curso_posicion.sql), así que esto solo los agrupa por
-- persona. Una tabla nueva reabriría la auditoría de RLS y de borrado.
--
-- QUÉ SE COMPARA. El promedio SIMPLE de los ramos de cada persona, calculado
-- igual para todos. No es el promedio ponderado por créditos que ve en Inicio:
-- ese no está en el servidor, y mezclar el número del cliente con los del resto
-- compararía dos fórmulas distintas. Como la pantalla muestra solo el
-- porcentaje, y el mismo criterio se aplica a todos, la comparación es justa.
-- ponytail: promedio simple; si hace falta ponderar, subir créditos a curso_notas.
--
-- EL MÍNIMO DE CINCO Y LOS EMPATES siguen las mismas reglas que
-- curso_posicion, por las mismas razones: bajo cinco el agregado deja de ser
-- anónimo, y un empate cuenta a favor.
create or replace function public.universidad_posicion(p_tenant text)
returns table (total integer, mejor_que integer)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_tenant text := nullif(lower(trim(p_tenant)), '');
  mi numeric;
  n integer;
  debajo_o_igual integer;
begin
  if uid is null or v_tenant is null then
    return;
  end if;

  select avg(promedio) into mi from public.curso_notas
    where user_id = uid and tenant = v_tenant;
  if mi is null then
    return;   -- no tiene ramos con sigla en esta universidad
  end if;

  -- Una sola pasada: cuántas personas hay y cuántas quedan en o bajo `mi`.
  -- `<=` incluye a quien pregunta: por eso se le resta uno.
  with personas as (
    select avg(promedio) as promedio
    from public.curso_notas
    where tenant = v_tenant
    group by user_id
  )
  select count(*), count(*) filter (where promedio <= mi) - 1
    into n, debajo_o_igual
    from personas;

  -- Cinco contándose a sí mismo, igual que curso_posicion.
  if n < 5 then
    return;
  end if;

  total := n;
  mejor_que := round(100.0 * debajo_o_igual / nullif(n - 1, 0));
  return next;
end;
$$;

-- `from public` no basta: Supabase le da EXECUTE a `anon` explícitamente en
-- cada función nueva de `public`, y ese permiso sobrevive a revocar `public`.
-- Pasó al aplicarlo el 2026-09-28: `anon` quedó pudiendo llamarla. No se
-- filtraba nada (sin sesión corta en la primera línea), pero la puerta se cierra.
revoke all on function public.universidad_posicion(text) from public, anon;
grant execute on function public.universidad_posicion(text) to authenticated;
