-- Reversión operativa de #515 con respaldo_campanas_515.sql previo.
-- Nunca restaura cuentas, anuncios o cobros desde una foto antigua.
-- Guarda TODO el detalle nuevo en respaldo_515.*_posterior y deja operativo
-- el conjunto de la publicación actual con las llaves que el SQL viejo usa.
-- Los históricos quedan en el archivo privado para conciliación, no se suman
-- a la campaña actual. Los cobros y publicaciones permanecen intactos.
-- Ejecutar una vez, completo, como propietario en SQL Editor. Sin CASCADE.
begin;
lock table public.tutor_anuncios, public.tutor_perfiles, public.anuncio_metricas,
  public.anuncio_alcance, public.anuncio_interacciones, public.anuncio_campanas,
  admin.cobros, admin.anuncio_publicaciones in access exclusive mode;
do $$ begin
  if to_regclass('respaldo_515.funciones') is null then
    raise exception 'Falta el respaldo anterior. No se modifica nada.';
  end if;
  if (select count(*) from respaldo_515.funciones) <> 13 then
    raise exception 'Respaldo de funciones incompleto. No se modifica nada.';
  end if;
end $$;
create table respaldo_515.anuncio_metricas_posterior as select * from public.anuncio_metricas;
create table respaldo_515.anuncio_alcance_posterior as select * from public.anuncio_alcance;
create table respaldo_515.anuncio_interacciones_posterior as select * from public.anuncio_interacciones;
alter table respaldo_515.anuncio_alcance_posterior add foreign key(user_id) references auth.users(id) on delete cascade;
alter table respaldo_515.anuncio_interacciones_posterior add foreign key(user_id) references auth.users(id) on delete cascade;
do $$ declare t text; begin
  foreach t in array array['anuncio_metricas_posterior','anuncio_alcance_posterior','anuncio_interacciones_posterior'] loop
    execute format('alter table respaldo_515.%I add foreign key(anuncio_id) references public.tutor_anuncios(id) on delete cascade',t);
    execute format('alter table respaldo_515.%I enable row level security',t);
    execute format('revoke all on respaldo_515.%I from public, anon, authenticated',t);
  end loop;
end $$;
drop trigger if exists tutor_anuncios_publicacion on public.tutor_anuncios;
drop trigger if exists tutor_perfiles_suspension on public.tutor_perfiles;
-- Retener solo la publicación actual en las tablas operativas. Las otras
-- filas siguen íntegras en las copias anteriores creadas en esta transacción.
delete from public.anuncio_metricas m using public.tutor_anuncios a
  where a.id=m.anuncio_id and m.publicacion<>a.medicion_desde;
delete from public.anuncio_alcance m using public.tutor_anuncios a
  where a.id=m.anuncio_id and m.publicacion<>a.medicion_desde;
delete from public.anuncio_interacciones m using public.tutor_anuncios a
  where a.id=m.anuncio_id and m.publicacion<>a.medicion_desde;
alter table public.anuncio_metricas drop constraint anuncio_metricas_pkey;
alter table public.anuncio_metricas add primary key(anuncio_id,dia,tipo,tenant,ramo_sigla);
alter table public.anuncio_alcance drop constraint anuncio_alcance_pkey;
alter table public.anuncio_alcance add primary key(anuncio_id,user_id);
alter table public.anuncio_interacciones drop constraint anuncio_interacciones_pkey;
alter table public.anuncio_interacciones add primary key(anuncio_id,user_id,tipo);
-- Las columnas aditivas se conservan; así se puede volver a aplicar #515.
update public.anuncio_metricas set publicacion='-infinity';
update public.anuncio_alcance set publicacion='-infinity';
update public.anuncio_interacciones set publicacion='-infinity';
update public.tutor_anuncios set medicion_desde='-infinity';
do $$ declare f record; begin
  for f in select * from respaldo_515.funciones loop
    execute f.definicion;
  end loop;
end $$;
drop function if exists public.admin_marcar_cobro_publicacion(uuid,timestamptz,text,integer);
drop function if exists public.preparar_publicacion_clase();
drop function if exists public.registrar_suspension_profesor();
-- tutor_suspensiones se conserva privada como evidencia; el motor previo no
-- la usa. No se borran intervalos ni cobros para simular que nunca existieron.
commit;
