-- Prueba de aislamiento entre cuentas (RLS) — punto 3 de la auditoría (#164).
-- Verificada en producción el 2026-08-18: las dos consultas dieron OK.
--
-- Se corre en Supabase → SQL Editor. Son DOS consultas y van de a una: borra el
-- panel entre medio, porque el editor ejecuta todo lo que haya escrito.
--
-- Reemplaza UUID-DE-A y UUID-DE-B por los de dos cuentas tuyas (Authentication
-- → Users → columna UID). Las dos tienen que tener al menos un ramo guardado, o
-- el control da falso negativo y la prueba no dice nada.
--
-- ── Por qué está partido en dos y con esta forma rara ────────────────────────
-- El SQL Editor muestra SOLO el resultado del último statement. Un script con
-- `begin … select … rollback` termina mostrando "Success. No rows returned",
-- que es la salida del rollback, y las pruebas quedan invisibles. Por eso:
--
--   A) lecturas: el último statement es el select, así que se ve.
--   B) escrituras: van dentro de un DO que termina en `raise exception`. El
--      error ES el resultado —trae los números y siempre se muestra— y de paso
--      revierte el update y el delete sin depender de que nadie se acuerde del
--      rollback. Autodeshacente por construcción.
--
-- ── Por qué cada bloqueo trae su control ─────────────────────────────────────
-- La prueba anónima no sirve: para `anon`, auth.uid() es NULL, ninguna política
-- calza y todo devuelve vacío. Ese vacío se ve idéntico al aislamiento
-- correcto. Cada 0 va acompañado de la mitad de control —que el dueño SÍ vea lo
-- suyo con la misma consulta—, porque si no, un 0 puede ser una política bien
-- puesta o un UID mal escrito, y no hay forma de distinguirlos. Esto no es
-- teórico: la primera corrida dio "A BORRÓ DATOS DE B" y era falso, los UID
-- traían el texto de ejemplo y todo corrió como dueño de la base, que se salta
-- RLS entero.

-- ═══ A. Lecturas ═════════════════════════════════════════════════════════════
-- No escribe nada. Esperado: 0 en lo de B, >0 en los controles, y el CONTEXTO
-- confirmando que auth.uid() es de verdad la cuenta A.

set request.jwt.claims = '{"sub":"UUID-DE-A","role":"authenticated"}';
set role authenticated;

select 'ramos · A lee lo de B' as prueba, count(*)::text as filas,
       case when count(*)=0 then 'OK — aislado' else 'FALLA — VE DATOS DE B' end as veredicto
from public.user_ramos where user_id = 'UUID-DE-B'
union all
select 'ramos · A lee lo suyo (control)', count(*)::text,
       case when count(*)>0 then 'OK — control responde' else 'INVÁLIDA — ni lo suyo ve' end
from public.user_ramos where user_id = 'UUID-DE-A'
union all
select 'perfil · A lee el de B', count(*)::text,
       case when count(*)=0 then 'OK — aislado' else 'FALLA — VE EL PERFIL DE B' end
from public.profiles where id = 'UUID-DE-B'
union all
select 'perfil · A lee el suyo (control)', count(*)::text,
       case when count(*)>0 then 'OK — control responde' else 'INVÁLIDA — ni el suyo ve' end
from public.profiles where id = 'UUID-DE-A'
union all
select 'CONTEXTO · auth.uid()', coalesce(auth.uid()::text,'NULL'),
       case when auth.uid()='UUID-DE-A' then 'OK — somos A' else 'INVÁLIDA — lo demás no vale' end;

-- ═══ B. Escrituras ═══════════════════════════════════════════════════════════
-- Termina en ERROR P0001 A PROPÓSITO: ese es el resultado. Tiene que decir
-- "editó 0 filas · borró 0 filas" y el auth.uid() de la cuenta A. Cualquier
-- número distinto de 0 es el agujero.
--
-- Se prueban las dos por separado porque una política con USING correcto y sin
-- WITH CHECK bloquea la lectura y deja pasar la escritura.

do $$
declare edito int; borro int;
begin
  perform set_config('request.jwt.claims','{"sub":"UUID-DE-A","role":"authenticated"}',true);
  perform set_config('role','authenticated',true);
  update public.user_ramos set data='{"hackeado":true}'::jsonb where user_id='UUID-DE-B';
  get diagnostics edito = row_count;
  delete from public.user_ramos where user_id='UUID-DE-B';
  get diagnostics borro = row_count;
  raise exception 'RESULTADO · auth.uid()=% · editó % filas · borró % filas', auth.uid(), edito, borro;
end $$;

-- ═══ C. Inventario, para el registro de la auditoría ═════════════════════════
-- Corre esto solo, sin lo de arriba. Es el respaldo de qué políticas había.
--
-- select tablename, policyname, cmd, roles, qual as usando, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename in ('user_ramos','profiles')
-- order by tablename, cmd;
