-- Políticas de las dos tablas con datos de estudiantes: user_ramos y profiles.
--
-- Este archivo es la FUENTE DE VERDAD de quién alcanza esas filas. Existe
-- porque hasta el 2026-08-18 no existía: las políticas se habían creado a mano
-- en el panel, así que nadie podía revisarlas leyendo el repo ni notar si
-- cambiaban. `supabase/prueba_aislamiento.sql` es lo que comprueba que esto
-- quedó realmente aplicado.
--
-- Se aplica entero en Supabase → SQL Editor. Es idempotente: se puede volver a
-- correr las veces que haga falta.
--
-- OJO: borra TODAS las políticas que existan hoy en esas dos tablas antes de
-- crear las de acá. Es deliberado — el objetivo es dejarlas en un estado
-- conocido y no acumular una política vieja y permisiva debajo de una nueva y
-- correcta. Una política de más manda tanto como una de menos: en Postgres las
-- de tipo PERMISSIVE se SUMAN, así que basta una con `using (true)` para que
-- todas las demás dejen de importar.
--
-- Corre el inventario de `prueba_aislamiento.sql` antes y después: la salida de
-- antes es el respaldo de qué había, y la de después, de qué quedó.

begin;

-- ─── Cuatro políticas por tabla, una por operación ──────────────────────────
-- No se usa `for all`: agrupa las cuatro en una sola con un único USING, y el
-- WITH CHECK de escritura queda implícito. Separadas se lee de un vistazo qué
-- permite cada operación, que es lo que una auditoría necesita comprobar.
--
-- USING filtra las filas que la operación alcanza a VER (select, update, delete).
-- WITH CHECK valida las filas que quedarían ESCRITAS (insert, update). Hacen
-- falta los dos en update: sin WITH CHECK, alguien puede tomar una fila suya y
-- reasignarla a otro user_id.

-- ── user_ramos: las notas ───────────────────────────────────────────────────
alter table public.user_ramos enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'user_ramos'
  loop
    execute format('drop policy %I on public.user_ramos', p.policyname);
    raise notice 'user_ramos · política eliminada: %', p.policyname;
  end loop;
end $$;

create policy user_ramos_select_own on public.user_ramos
  for select to authenticated using (user_id = auth.uid());

create policy user_ramos_insert_own on public.user_ramos
  for insert to authenticated with check (user_id = auth.uid());

create policy user_ramos_update_own on public.user_ramos
  for update to authenticated using (user_id = auth.uid())
                                with check (user_id = auth.uid());

create policy user_ramos_delete_own on public.user_ramos
  for delete to authenticated using (user_id = auth.uid());

-- ── profiles: nombre, universidad, carrera y semestre ───────────────────────
alter table public.profiles enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', p.policyname);
    raise notice 'profiles · política eliminada: %', p.policyname;
  end loop;
end $$;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid())
                              with check (id = auth.uid());

create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = auth.uid());

-- ─── Cómo queda ─────────────────────────────────────────────────────────────
select tablename as tabla, policyname as politica, cmd as operacion,
       roles, qual as usando, with_check as al_escribir
from pg_policies
where schemaname = 'public' and tablename in ('user_ramos', 'profiles')
order by tablename, cmd;

-- Revisa la salida de arriba ANTES de confirmar. Si algo no calza, `rollback`
-- en vez de `commit` y nada de esto queda aplicado.
commit;
