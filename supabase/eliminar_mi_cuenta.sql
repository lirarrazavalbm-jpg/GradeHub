-- Borrar la cuenta. Es lo que llama `eliminarCuenta` en app.js.
--
-- Vive en Supabase, no en el navegador: borrar un usuario toca `auth.users`, y
-- eso necesita privilegios que el cliente no tiene ni debe tener. La función es
-- `security definer` con owner `postgres` justamente por eso.
--
-- POR QUÉ ESTÁ ACÁ. Durante dos días se creyó que el borrado no funcionaba, y
-- nadie pudo revisarlo: era la única pieza del sistema sin representación en el
-- repo. El borrado sí funciona (verificado el 2026-08-07, ver abajo). Este
-- archivo existe para que la próxima duda se conteste leyendo un PR y no
-- abriendo el panel de Supabase.
--
-- ESTE ARCHIVO NO SE APLICA SOLO. No hay migraciones automáticas: si lo editas,
-- corre el SQL en Supabase a mano y déjalo dicho en el PR. Un archivo que
-- diverge de la base es peor que no tenerlo.
--
-- NO LLEVA PARÁMETROS a propósito. El id sale de `auth.uid()`, o sea del token
-- de quien llama. Si recibiera un uuid, cualquier usuario autenticado podría
-- pasar el uuid de otro y borrarle la cuenta. Hay un test que lo ata
-- (tests/importar.test.js).
--
-- EL BORRADO EN CASCADA ES LA MITAD DEL MECANISMO. Esta función borra UNA fila,
-- la de `auth.users`. Todo lo demás se va porque las FKs de las tablas de la app
-- apuntan ahí con ON DELETE CASCADE:
--
--   profiles.id        → auth.users.id   CASCADE
--   user_ramos.user_id → auth.users.id   CASCADE
--   catalog_reports.user_id → auth.users.id   CASCADE
--
-- Verificado contra `pg_constraint` el 2026-08-07: las tres cascadean, y las
-- ocho tablas internas de `auth` también. Después de borrar una cuenta real
-- (gradehub.app+prueba1@gmail.com) no quedó ninguna fila suya en las tres
-- tablas, y `GET /auth/v1/user` con su token devolvió 403.
--
-- Consecuencia para quien agregue una tabla con datos de usuario: si la FK no
-- lleva ON DELETE CASCADE, esos datos SOBREVIVEN al borrado de la cuenta y la
-- política de privacidad —que promete que no quedan copias— pasa a ser mentira,
-- sin que falle nada. Es exactamente el tipo de error que esta app no detecta
-- sola: no lanza excepción, no rompe la pantalla, solo incumple la promesa.
--
-- Para revisar que siguen todas en cascada:
--
--   select c.conrelid::regclass as tabla, c.confdeltype
--   from pg_constraint c
--   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass;
--
-- ('c' es CASCADE. Cualquier otra letra en una tabla con datos de usuario es un
-- problema.)

create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay sesión activa';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
