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

-- La huella que agrupa reportes: dos estudiantes que describen la MISMA pauta
-- tienen que sumar al mismo grupo aunque la escriban distinto. La calcula el
-- servidor desde `estructura`, no la que manda el cliente: así un navegador con
-- la versión vieja en caché no puede volver a partir los grupos.
--
-- Espeja `huellaEstructura()` de app.js. Si cambias una regla acá, cámbiala allá.
--   · Filas en 0% fuera: no son parte de la pauta.
--   · Nombre sin mayúsculas ni tildes, "Solemne3" = "Solemne 3", y cada palabra
--     de 4+ letras en singular ("Controles" = "Control").
--   · 3+ evaluaciones numeradas del mismo nombre y el mismo peso, sin casillas
--     ni compuerta propia, son una categoría con casillas: "Control 1, 2 y 3" de
--     10% = "Controles" de 30% con 3 casillas. Con pesos distintos no se juntan.
create or replace function public.huella_catalogo(p_estructura jsonb)
returns text
language sql
stable
set search_path = public
as $$
  with items as (
    select
      (
        select string_agg(
          case when w ~ '^[a-z]{4,}$'
            then regexp_replace(regexp_replace(replace(w, 'zz', 'z'), 's$', ''), '([lrndjz])e$', '\1')
            else w end,
          ' ' order by i)
        from regexp_split_to_table(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(normalize(lower(e.valor->>'nombre'), NFD), '[\u0300-\u036f]', '', 'g'),
                '[[:space:]]+', ' ', 'g'),
              '([a-z])([0-9])', '\1 \2', 'g'),
            '([0-9])([a-z])', '\1 \2', 'g'),
          ' ') with ordinality as t(w, i)
        where w <> ''
      ) as clave,
      (e.valor->>'peso')::numeric as peso,
      coalesce((e.valor->>'slots')::numeric, 1) as slots,
      coalesce((e.valor->>'min')::numeric, 0) as min,
      coalesce((e.valor->>'cap')::numeric, 0) as cap
    from jsonb_array_elements(p_estructura) as e(valor)
    where (e.valor->>'peso')::numeric > 0
  ), marcadas as (
    select items.*,
           substring(clave from '^(.+) [0-9]+$') as base,
           slots <= 1 and min = 0 and cap = 0 as agrupable
    from items
  ), series as (
    select base, count(*) as n, sum(peso) as total
    from marcadas
    where base is not null and agrupable
    group by base
    having count(*) >= 3 and max(peso) - min(peso) <= 0.011
  ), canon as (
    select clave, peso, slots, min, cap
    from marcadas as m
    where not (m.agrupable and exists (select 1 from series as s where s.base = m.base))
    union all
    -- 3 × 6,67 = 20,01 es el 20% repartido en tres: cada peso viene redondeado
    -- a dos decimales, así que la suma puede correrse hasta 0,005 por casilla.
    select base,
           case when abs(total - round(total)) <= 0.005 * n + 0.001 then round(total) else round(total, 2) end,
           n, 0, 0
    from series
  )
  select string_agg(fila, '|' order by fila collate "C")
  from (
    select clave || '~' || trim_scale(peso)::text || '~' || trim_scale(slots)::text || '~' ||
           trim_scale(min)::text || '~' || trim_scale(cap)::text as fila
    from canon
  ) as filas;
$$;

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

  -- La interfaz trae maxlength, pero cualquiera puede llamar la RPC directo.
  -- Estos límites son la frontera real contra spam y payloads desproporcionados.
  if length(p_tenant) > 20
     or length(coalesce(p_carrera, '')) > 80
     or length(p_ramo) > 160
     or length(p_ramo_norm) > 160
     or length(coalesce(p_ramo_sigla, '')) > 40
     or length(p_huella) > 4000
     or length(coalesce(p_nota, '')) > 500 then
    raise exception 'El reporte excede el largo permitido';
  end if;

  if jsonb_typeof(p_estructura) <> 'array'
     or jsonb_array_length(p_estructura) not between 1 and 30
     or octet_length(p_estructura::text) > 32768 then
    raise exception 'La estructura debe tener entre 1 y 30 evaluaciones y un tamaño razonable';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_estructura) as e(valor)
    where jsonb_typeof(e.valor) <> 'object'
       or jsonb_typeof(e.valor->'nombre') <> 'string'
       or length(trim(e.valor->>'nombre')) not between 1 and 120
       or jsonb_typeof(e.valor->'peso') <> 'number'
       or case when jsonb_typeof(e.valor->'peso') = 'number'
          then (e.valor->>'peso')::numeric not between 0 and 100 else false end
       or (e.valor ? 'slots' and (
         jsonb_typeof(e.valor->'slots') <> 'number'
         or case when jsonb_typeof(e.valor->'slots') = 'number'
            then (e.valor->>'slots')::numeric <> trunc((e.valor->>'slots')::numeric)
              or (e.valor->>'slots')::numeric not between 1 and 100
            else false end
       ))
       or (e.valor ? 'min' and (
         jsonb_typeof(e.valor->'min') <> 'number'
         or case when jsonb_typeof(e.valor->'min') = 'number'
            then (e.valor->>'min')::numeric not between 1 and 7 else false end
       ))
       or (e.valor ? 'cap' and (
         jsonb_typeof(e.valor->'cap') <> 'number'
         or case when jsonb_typeof(e.valor->'cap') = 'number'
            then (e.valor->>'cap')::numeric not between 1 and 7 else false end
       ))
  ) then
    raise exception 'La estructura contiene una evaluación inválida';
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
         huella = public.huella_catalogo(p_estructura),
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
       p_estructura, public.huella_catalogo(p_estructura), nullif(trim(p_nota), ''));
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
  -- Agrupa SOLO por la huella: `estructura` es lo que escribió cada estudiante
  -- ("controles" o "Control 1, 2, 3") y no puede partir un grupo. Se cuentan
  -- personas distintas del grupo entero, y para mostrar se devuelve la variante
  -- que más personas escribieron; si empatan, la más reciente.
  with grupos as (
    select
      coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm) as ramo_key,
      cr.huella,
      min(cr.ramo) as ramo,
      count(distinct cr.user_id)::integer as respaldos
    from public.catalog_reports as cr
    where cr.tenant = p_tenant
    group by 1, 2
    having count(distinct cr.user_id) >= 3
  ), variantes as (
    select
      coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm) as ramo_key,
      cr.huella,
      cr.estructura,
      count(distinct cr.user_id) as personas,
      max(cr.updated_at) as ultimo
    from public.catalog_reports as cr
    where cr.tenant = p_tenant
    group by 1, 2, 3
  )
  select
    g.ramo,
    g.ramo_key,
    (select v.estructura from variantes as v
      where v.ramo_key = g.ramo_key and v.huella = g.huella
      order by v.personas desc, v.ultimo desc, v.estructura::text
      limit 1) as estructura,
    g.huella,
    g.respaldos
  from grupos as g
  order by g.respaldos desc, g.ramo_key;
$$;

revoke all on function public.submit_catalog_report(text, text, text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.catalog_consensus(text) from public, anon;
-- Solo la usan las dos RPC de arriba, que corren como dueño.
revoke all on function public.huella_catalogo(jsonb) from public, anon, authenticated;
grant execute on function public.submit_catalog_report(text, text, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.catalog_consensus(text) to authenticated;

-- Los reportes que ya existen se guardaron con la huella que mandó el cliente.
-- Se recalculan una vez con la función de arriba para que sumen con los nuevos.
-- Solo cambia `huella`: `estructura`, notas y pautas de estudiantes no se tocan.
-- Correr este archivo de nuevo no cambia nada: solo actualiza las distintas.
update public.catalog_reports
   set huella = coalesce(public.huella_catalogo(estructura), '')
 where huella is distinct from coalesce(public.huella_catalogo(estructura), '');
