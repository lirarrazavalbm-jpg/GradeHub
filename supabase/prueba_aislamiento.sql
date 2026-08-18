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
-- Los UID viajan como parámetros de sesión y no como una tabla temporal: al
-- cambiarse al rol `authenticated` se pierde el acceso a los objetos creados
-- como dueño, y la prueba moría con "permission denied" antes de probar nada.
--
-- ANTES DE CORRER: reemplaza los dos UID de abajo —y solo esos— por los de dos
-- cuentas tuyas (Authentication → Users → columna UID). Las dos tienen que
-- tener al menos un ramo guardado, o el control da falso negativo.

begin;

set local gh.uid_a = '00000000-0000-0000-0000-000000000000';  -- ← cuenta A
set local gh.uid_b = '11111111-1111-1111-1111-111111111111';  -- ← cuenta B

-- ─── 0. Inventario: qué tiene RLS activa y con qué políticas ────────────────
-- Va antes del cambio de rol: leer el catálogo necesita los permisos de ahora.
select 'INVENTARIO' as bloque, c.relname as tabla,
       c.relrowsecurity as rls_activa,
       coalesce(count(p.polname), 0) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by 1, 2, 3
order by rls_activa, tabla;

select 'POLÍTICAS' as bloque, tablename as tabla, policyname as politica,
       cmd as operacion, qual as usando, with_check as al_escribir
from pg_policies where schemaname = 'public'
order by tablename, cmd;

-- ─── Ponerse en los zapatos de la cuenta A ──────────────────────────────────
-- Así ve la base a un cliente autenticado: mismo rol y mismo auth.uid() que
-- tendría el navegador de A. Es la única forma de probar lo que importa.
-- El claim se arma desde el parámetro para no repetir el UID en dos sitios y
-- que no se puedan desincronizar.
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('gh.uid_a'), 'role', 'authenticated')::text,
    true);
end $$;
set local role authenticated;

-- Que auth.uid() sea quien creemos. Si esto no calza, lo de abajo no vale nada.
select 'CONTEXTO' as bloque, auth.uid() as auth_uid,
       current_setting('gh.uid_a')::uuid as esperado,
       case when auth.uid() = current_setting('gh.uid_a')::uuid then 'OK — somos A'
            else 'INVÁLIDA — auth.uid() no quedó puesto' end as veredicto;

-- 1. A no alcanza los datos de B (LECTURA)
select 'user_ramos · A lee lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — aislado' else 'FALLA — A VE DATOS DE B' end as veredicto
from public.user_ramos where user_id = current_setting('gh.uid_b')::uuid;

-- 1b. CONTROL: A sí ve lo suyo. Sin esto, el 0 de arriba no prueba nada.
select 'user_ramos · A lee lo suyo (control)' as prueba, count(*) as filas,
       case when count(*) > 0 then 'OK — el control responde'
            else 'INVÁLIDA — A no ve ni lo suyo: revisa el UID o carga un ramo' end as veredicto
from public.user_ramos where user_id = current_setting('gh.uid_a')::uuid;

-- 2. Lo mismo en el perfil, que lleva nombre y carrera
select 'profiles · A lee el de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — aislado' else 'FALLA — A VE EL PERFIL DE B' end as veredicto
from public.profiles where id = current_setting('gh.uid_b')::uuid;

select 'profiles · A lee el suyo (control)' as prueba, count(*) as filas,
       case when count(*) > 0 then 'OK — el control responde'
            else 'INVÁLIDA — A no ve ni el suyo: revisa el UID' end as veredicto
from public.profiles where id = current_setting('gh.uid_a')::uuid;

-- 3. A no puede EDITAR lo de B. Leer bloqueado y escribir abierto es un caso
--    real: basta una política USING correcta sin WITH CHECK.
with intento as (
  update public.user_ramos set data = '{"hackeado":true}'::jsonb
  where user_id = current_setting('gh.uid_b')::uuid returning 1
)
select 'user_ramos · A edita lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — no pudo' else 'FALLA — A EDITÓ DATOS DE B' end as veredicto
from intento;

-- 4. A no puede BORRAR lo de B
with intento as (
  delete from public.user_ramos where user_id = current_setting('gh.uid_b')::uuid returning 1
)
select 'user_ramos · A borra lo de B' as prueba, count(*) as filas,
       case when count(*) = 0 then 'OK — no pudo' else 'FALLA — A BORRÓ DATOS DE B' end as veredicto
from intento;

-- 5. A no puede escribir una fila A NOMBRE de B (suplantación).
--    Lo esperado es que la política lo rechace. Sale como NOTICE o WARNING en
--    el panel de mensajes, no como tabla de resultados.
do $$
begin
  insert into public.user_ramos(user_id, data)
  values (current_setting('gh.uid_b')::uuid, '{"suplantado":true}'::jsonb);
  raise warning 'FALLA — A INSERTÓ UNA FILA A NOMBRE DE B';
exception
  when insufficient_privilege or check_violation then
    raise notice 'OK — la política rechazó el insert a nombre de otro';
end $$;

rollback;  -- nada de lo anterior queda escrito
