-- Huellas canónicas de reportes de pauta.
--
-- EJECUTAR UNA VEZ en Supabase SQL Editor ANTES de mergear el PR que agrega
-- `nombreHuella()` al cliente. Cloudflare Pages no ejecuta este archivo.
--
-- Qué cambia: solo `catalog_reports.huella` y la RPC agregada que las agrupa.
-- La estructura que escribió cada estudiante queda intacta; es evidencia del
-- reporte y nunca se reescribe por una diferencia tipográfica.
--
-- Orden obligatorio:
--   1. Ejecutar este archivo completo y confirmar que termina sin error.
--   2. Revisar el conteo final que devuelve.
--   3. Mergear el PR inmediatamente después.
-- Si se mergea primero, reportes nuevos usan la huella nueva y dejan de sumar
-- con las huellas históricas que todavía llevan el espacio distinto.

begin;

-- `normName()` del cliente elimina tildes. Esta extensión hace el mismo paso
-- sobre los nombres guardados antes de compactar espacios y letra+número.
create extension if not exists unaccent with schema extensions;

with piezas as (
  select
    -- `catalog_reports` nació antes de tener una clave técnica publicada. El
    -- identificador físico sirve solo dentro de esta misma sentencia: evita
    -- asumir una columna `id` que no es parte del contrato de la tabla.
    cr.ctid as fila,
    e.orden,
    regexp_replace(
      regexp_replace(
        regexp_replace(trim(extensions.unaccent(lower(e.valor->>'nombre'))), '[[:space:]]+', ' ', 'g'),
        '([[:alpha:]])([[:digit:]])', '\1 \2', 'g'
      ),
      '([[:digit:]])([[:alpha:]])', '\1 \2', 'g'
    ) as nombre_huella,
    trim(extensions.unaccent(lower(e.valor->>'nombre'))) as nombre_orden,
    e.valor
  from public.catalog_reports as cr
  cross join lateral jsonb_array_elements(cr.estructura) with ordinality as e(valor, orden)
), huellas as (
  select
    fila,
    string_agg(
      nombre_huella || '~' || (valor->>'peso') || '~' || coalesce(valor->>'slots', '1') || '~' ||
      coalesce(valor->>'min', '0') || '~' || coalesce(valor->>'cap', '0'),
      '|' order by nombre_huella, nombre_orden, orden
    ) as huella
  from piezas
  group by fila
)
update public.catalog_reports as cr
   set huella = h.huella
  from huellas as h
 where cr.ctid = h.fila
   and cr.huella is distinct from h.huella;

-- La estructura no entra al GROUP BY: una variante tipográfica no puede partir
-- el consenso. Se devuelve la versión más reciente solo para mostrar una pauta
-- representativa; los pesos y campos que definen la decisión ya viven en la
-- huella canónica.
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
  with estructuras as (
    select
      min(cr.ramo) as ramo,
      coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm) as ramo_key,
      cr.huella,
      cr.estructura,
      count(distinct cr.user_id)::integer as respaldos_estructura,
      max(cr.updated_at) as ultimo_reporte
    from public.catalog_reports as cr
    where cr.tenant = p_tenant
    group by coalesce(nullif(cr.ramo_sigla, ''), cr.ramo_norm), cr.huella, cr.estructura
  ), grupos as (
    select
      min(ramo) as ramo,
      ramo_key,
      (array_agg(estructura order by respaldos_estructura desc, ultimo_reporte desc, estructura::text))[1] as estructura,
      huella,
      sum(respaldos_estructura)::integer as respaldos
    from estructuras
    group by ramo_key, huella
    having sum(respaldos_estructura) >= 3
  )
  select ramo, ramo_key, estructura, huella, respaldos
  from grupos
  order by respaldos desc, ramo_key;
$$;

commit;

-- Deja una evidencia mínima para confirmar que el recálculo alcanzó a todos
-- los reportes que podían tener huella antes de abrir el merge.
select count(*) as reportes_con_huella from public.catalog_reports where huella <> '';
