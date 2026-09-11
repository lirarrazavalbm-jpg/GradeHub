-- Cómo vas respecto de la gente que tiene tu mismo ramo.
--
-- APLÍCALO UNA VEZ en el SQL Editor de Supabase ANTES de mergear el PR que
-- llama a estas RPC. Cloudflare Pages despliega los archivos estáticos, pero no
-- ejecuta migraciones de Supabase por sí sola.
--
-- QUÉ VE EL ESTUDIANTE. Su lugar entre quienes cursan el mismo ramo: "vas mejor
-- que el 70%". Nunca un nombre, nunca una nota ajena, nunca cuántos están sobre
-- él por separado.
--
-- POR QUÉ EL PROMEDIO LO MANDA EL CLIENTE Y NO SE CALCULA ACÁ. Calcular el
-- promedio de un ramo no es sumar y dividir: hay ponderaciones, casillas
-- eximidas, laboratorios vinculados y notas puestas a mano. Esa fórmula ya vive
-- en `ramoAvg` y acaba de costarnos un bug por tenerla duplicada en el
-- simulador, donde el mismo semestre daba 6,03 en una pantalla y 6,22 en otra.
-- Reescribirla en SQL garantiza que las dos versiones se separen. El cliente
-- manda el número que el estudiante ya ve, y acá solo se comparan números.
--
-- LA IDENTIDAD ES LA SIGLA, igual que en catalog_consensus: "Dinámica" de
-- Física y "Dinámica" de Ingeniería son ramos distintos y no deben mezclarse.
-- Por eso solo participan los ramos que traen sigla del catálogo.
--
-- EL MÍNIMO DE CINCO NO ES DECORATIVO. Con dos personas, el agregado deja de
-- ser anónimo: si conoces al otro, le despejas la nota. Con cinco hay margen.
-- La función devuelve `null` bajo ese piso, y no dice cuántos faltan para
-- llegar: ese número también es información sobre quiénes están.

create table if not exists public.curso_notas (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tenant     text not null,
  ramo_sigla text not null,
  promedio   numeric not null check (promedio >= 1.0 and promedio <= 7.0),
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant, ramo_sigla)
);

-- Sin este índice, cada consulta recorre la tabla entera para juntar un curso.
create index if not exists curso_notas_ramo_idx
  on public.curso_notas (tenant, ramo_sigla);

alter table public.curso_notas enable row level security;

-- Nadie lee esta tabla desde el cliente. Las dos funciones de abajo son la
-- única puerta, y ninguna devuelve una nota que no sea la de quien pregunta.
revoke all on public.curso_notas from anon, authenticated;

-- El estudiante deja su propio promedio de un ramo. Solo el suyo: `auth.uid()`
-- no es un parámetro, así que no hay forma de escribir por otro.
create or replace function public.curso_nota_set(
  p_tenant text,
  p_sigla text,
  p_promedio numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sigla text := nullif(upper(trim(p_sigla)), '');
  tenant text := nullif(lower(trim(p_tenant)), '');
begin
  if uid is null then
    raise exception 'hay que haber iniciado sesión';
  end if;
  if sigla is null or tenant is null then
    return;   -- un ramo sin sigla no participa: no se puede saber cuál es
  end if;
  if p_promedio is null then
    -- El ramo se borró o se quedó sin notas: sale del curso en vez de
    -- quedarse congelado en su última nota.
    delete from public.curso_notas
      where user_id = uid and tenant = curso_nota_set.tenant and ramo_sigla = curso_nota_set.sigla;
    return;
  end if;
  if p_promedio < 1.0 or p_promedio > 7.0 then
    return;   -- fuera de escala: se ignora en vez de ensuciar el agregado
  end if;

  insert into public.curso_notas (user_id, tenant, ramo_sigla, promedio, updated_at)
  values (uid, tenant, sigla, round(p_promedio, 2), now())
  on conflict (user_id, tenant, ramo_sigla)
    do update set promedio = excluded.promedio, updated_at = now();
end;
$$;

-- Devuelve el lugar de quien llama entre los de su mismo ramo.
--
-- `mejor_que` es el porcentaje de compañeros que tiene una nota MENOR que la
-- suya. Se redondea a entero: un decimal acá, con pocos participantes, permite
-- deducir cuántos son y de ahí tirar del hilo.
create or replace function public.curso_posicion(
  p_tenant text,
  p_sigla text
)
returns table (total integer, mejor_que integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sigla text := nullif(upper(trim(p_sigla)), '');
  tenant text := nullif(lower(trim(p_tenant)), '');
  mi numeric;
  n integer;
  debajo integer;
begin
  if uid is null or sigla is null or tenant is null then
    return;
  end if;

  select promedio into mi from public.curso_notas
    where user_id = uid and tenant = curso_posicion.tenant and ramo_sigla = curso_posicion.sigla;
  if mi is null then
    return;   -- no participa de este ramo: no hay con qué ubicarlo
  end if;

  select count(*) into n from public.curso_notas
    where tenant = curso_posicion.tenant and ramo_sigla = curso_posicion.sigla;

  -- Cinco contándose a sí mismo: cuatro compañeros no alcanzan para que el
  -- agregado sea anónimo.
  if n < 5 then
    return;
  end if;

  select count(*) into debajo from public.curso_notas
    where tenant = curso_posicion.tenant and ramo_sigla = curso_posicion.sigla
      and promedio < mi;

  total := n;
  mejor_que := round(100.0 * debajo / nullif(n - 1, 0));
  return next;
end;
$$;

revoke all on function public.curso_nota_set(text, text, numeric) from public;
revoke all on function public.curso_posicion(text, text) from public;
grant execute on function public.curso_nota_set(text, text, numeric) to authenticated;
grant execute on function public.curso_posicion(text, text) to authenticated;
