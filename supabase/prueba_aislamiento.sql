-- Prueba de aislamiento entre cuentas (RLS) — punto 3 de la auditoría (#164).
--
-- Se corre en Supabase → SQL Editor, pegado entero. NO cambia datos: todo pasa
-- dentro de una transacción que termina en ROLLBACK.
--
-- Por qué existe este archivo y no basta "mirar las políticas": `user_ramos` y
-- `profiles` son las dos tablas con datos de estudiantes y sus políticas nunca
-- se versionaron acá — se crearon a mano en el panel. Leyendo el repo no hay
-- forma de saber qué protege hoy a esas dos tablas. Esto lo pregunta directo.
--
-- La prueba anónima no sirve: para `anon`, auth.uid() es NULL, ninguna política
-- calza y todo devuelve vacío. Un vacío así se ve igual que el aislamiento
-- correcto. Por eso cada prueba de bloqueo viene con su mitad de CONTROL: que
-- el dueño SÍ vea lo suyo con la misma consulta. Sin el control, un `[]` puede
-- ser una política bien puesta o un UID mal escrito, y no se distinguen.
--
-- ANTES DE CORRER: reemplaza los dos UID de abajo por los de dos cuentas tuyas
-- (Authentication → Users → columna UID). Las dos tienen que tener al menos un
-- ramo guardado, o el control da falso negativo y la prueba no dice nada.

begin;

-- ─── Los dos sujetos de la prueba ───────────────────────────────────────────
create temporary table _prueba(a uuid, b uuid) on commit drop;
insert into _prueba values (
  '00000000-0000-0000-0000-000000000000',  -- ← UID de la cuenta A
  '11111111-1111-1111-1111-111111111111'   -- ← UID de la cuenta B
);

-- ─── 0. Inventario: qué tiene RLS activa y con qué políticas ────────────────
select 'INVENTARIO' as bloque, c.relname as tabla,
       c.relrowsecurity as rls_activa,
       coalesce(count(p.polname), 0) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
group by 1, 2, 3
order by rls_activa, tabla;

select 'POLÍTICAS' as bloque, tablename as tabla, policyname as politica,
       cmd as operacion, qual as usando, with_check as al_escribir
from pg_policies where schemaname = 'public'
order by tablename, cmd;

-- ─── Ponerse en los zapatos de la cuenta A ──────────────────────────────────
-- Así ve la base a un cliente autenticado: mismo rol y mismo auth.uid() que
-- tendría el navegador de A. Es la única forma de probar lo que importa.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';

-- 1. A no alcanza los datos de B (LECTURA)
select 'user_ramos · A lee lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — aislado' else 'FALLA — A VE DATOS DE B' end as veredicto
from public.user_ramos where user_id = (select b from _prueba);

-- 1b. CONTROL: A sí ve lo suyo. Sin esto, el 0 de arriba no prueba nada.
select 'user_ramos · A lee lo suyo (control)' as prueba, count(*) as filas,
       case when count(*) > 0 then 'OK — el control responde'
            else 'INVÁLIDA — A no ve ni lo suyo: revisa el UID o carga un ramo' end as veredicto
from public.user_ramos where user_id = (select a from _prueba);

-- 2. Lo mismo en el perfil, que lleva nombre y carrera
select 'profiles · A lee el de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — aislado' else 'FALLA — A VE EL PERFIL DE B' end as veredicto
from public.profiles where id = (select b from _prueba);

select 'profiles · A lee el suyo (control)' as prueba, count(*) as filas,
       case when count(*) > 0 then 'OK — el control responde'
            else 'INVÁLIDA — A no ve ni el suyo: revisa el UID' end as veredicto
from public.profiles where id = (select a from _prueba);

-- 3. A no puede EDITAR lo de B. Leer bloqueado y escribir abierto es un caso
--    real: basta una política USING correcta sin WITH CHECK.
with intento as (
  update public.user_ramos set data = '{"hackeado":true}'::jsonb
  where user_id = (select b from _prueba) returning 1
)
select 'user_ramos · A edita lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — no pudo' else 'FALLA — A EDITÓ DATOS DE B' end as veredicto
from intento;

-- 4. A no puede BORRAR lo de B
with intento as (
  delete from public.user_ramos where user_id = (select b from _prueba) returning 1
)
select 'user_ramos · A borra lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — no pudo' else 'FALLA — A BORRÓ DATOS DE B' end as veredicto
from intento;

-- 5. A no puede escribir una fila A NOMBRE de B (suplantación).
--    Acá lo esperado es que la consulta REVIENTE con "row-level security
--    policy". Si en vez de eso devuelve "insertó", la política de INSERT no
--    está atada a auth.uid() y cualquiera puede escribir en la cuenta de otro.
do $$
begin
  insert into public.user_ramos(user_id, data)
  values ((select b from _prueba), '{"suplantado":true}'::jsonb);
  raise warning 'FALLA — A INSERTÓ UNA FILA A NOMBRE DE B';
exception
  when insufficient_privilege or check_violation then
    raise notice 'OK — la política rechazó el insert a nombre de otro';
end $$;

rollback;  -- nada de lo anterior queda escrito
