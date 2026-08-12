-- Consenso de cambios de pauta del catálogo.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a estas RPC. Cloudflare Pages despliega los archivos estáticos, pero
-- no ejecuta migraciones de Supabase por sí sola.
--
-- Diseño: una coincidencia es universidad + ramo compartido. No intervienen
-- carrera ni semestre: un estudiante puede adelantar, atrasar o repetir un
-- ramo y sigue cursando el mismo curso. En UC, `ramo_sigla` es la identidad
-- canónica para no confundir ramos con el mismo nombre de otra facultad.
--
-- La tabla mantiene RLS: nadie lee reportes ajenos. `catalog_consensus` es la
-- única salida agregada y solo devuelve estructura, huella y número de
-- respaldos; nunca usuario, comentario ni nota.

alter table public.catalog_reports
  add column if not exists ramo_sigla text;

alter table public.catalog_reports
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.submit_catalog_report(
  p_tenant text,
  p_carrera text,
  p_ramo text,
  p_ramo_norm text,
  p_ramo_sigla text,
  p_estructura jsonb,
  p_huella text,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  total numeric;
  sigla text := nullif(upper(trim(p_ramo_sigla)), '');
begin
  if uid is null then
    raise exception 'No hay sesión activa';
  end if;

  if coalesce(trim(p_tenant), '') = ''
     or coalesce(trim(p_ramo), '') = ''
     or coalesce(trim(p_ramo_norm), '') = ''
     or coalesce(trim(p_huella), '') = '' then
    raise exception 'Faltan datos del reporte';
  end if;

  if jsonb_typeof(p_estructura) <> 'array' or jsonb_array_length(p_estructura) = 0 then
    raise exception 'La estructura debe tener al menos una evaluación';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_estructura) as e(valor)
    where jsonb_typeof(e.valor) <> 'object'
       or jsonb_typeof(e.valor->'peso') <> 'number'
  ) then
    raise exception 'Cada evaluación debe tener un peso numérico';
  end if;

  select coalesce(sum((e.valor->>'peso')::numeric), 0)
    into total
    from jsonb_array_elements(p_estructura) as e(valor);

  if abs(total - 100) >= 0.05 then
    raise exception 'Las ponderaciones deben sumar 100%%';
  end if;

  -- Si el estudiante ya reportó ese ramo, actualiza su aporte. La carrera se
  -- guarda como contexto, pero nunca decide si dos estudiantes coinciden.
  -- También toma reportes antiguos sin sigla por nombre, para migrarlos al
  -- identificador canónico la próxima vez que su autor los actualice.
  update public.catalog_reports
     set carrera = coalesce(p_carrera, ''),
         ramo = p_ramo,
         ramo_norm = p_ramo_norm,
         ramo_sigla = sigla,
         estructura = p_estructura,
         huella = p_huella,
         nota = nullif(trim(p_nota), ''),
         updated_at = now()
   where user_id = uid
     and tenant = p_tenant
     and (
       (sigla is not null and ramo_sigla = sigla)
       or (ramo_sigla is null and ramo_norm = p_ramo_norm)
     );

  if not found then
    insert into public.catalog_reports
      (user_id, tenant, carrera, ramo, ramo_norm, ramo_sigla, estructura, huella, nota)
    values
      (uid, p_tenant, coalesce(p_carrera, ''), p_ramo, p_ramo_norm, sigla,
       p_estructura, p_huella, nullif(trim(p_nota), ''));
  end if;
end;
$$;

create or replace function public.catalog_consensus(p_tenant text)
returns table (
  ramo text,
  ramo_key text,
  estructura jsonb,
  huella text,
  respaldos integer
)
language sql
security definer
set search_path = public
as $$
  select
    min(cr.ramo) as ramo,
    coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm) as ramo_key,
    cr.estructura,
    cr.huella,
    count(distinct cr.user_id)::integer as respaldos
  from public.catalog_reports as cr
  where cr.tenant = p_tenant
  group by coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm), cr.estructura, cr.huella
  having count(distinct cr.user_id) >= 3
  order by respaldos desc, ramo_key;
$$;

revoke all on function public.submit_catalog_report(text, text, text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.catalog_consensus(text) from public, anon;
grant execute on function public.submit_catalog_report(text, text, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.catalog_consensus(text) to authenticated;
