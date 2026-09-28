-- Ejecutar UNA VEZ antes de #515. Solo SQL Editor, nunca desde la app.
-- No usar IF NOT EXISTS: un segundo intento no debe reemplazar el respaldo.
-- Incluye definiciones reales de funciones (no una suposición sobre producción).
begin;
create schema respaldo_515;
revoke all on schema respaldo_515 from public, anon, authenticated;
lock table public.tutor_anuncios, public.anuncio_metricas, public.anuncio_alcance,
  public.anuncio_interacciones, public.anuncio_campanas, admin.cobros,
  admin.anuncio_publicaciones in share mode;
do $$ begin
  if exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='tutor_anuncios' and column_name='medicion_desde') then
    raise exception 'El SQL #515 ya está aplicado: no crear un falso respaldo anterior.';
  end if;
end $$;
create table respaldo_515.anuncio_metricas as select * from public.anuncio_metricas;
create table respaldo_515.anuncio_alcance as select * from public.anuncio_alcance;
create table respaldo_515.anuncio_interacciones as select * from public.anuncio_interacciones;
create table respaldo_515.tutor_anuncios as select * from public.tutor_anuncios;
create table respaldo_515.anuncio_campanas as select * from public.anuncio_campanas;
create table respaldo_515.cobros as select * from admin.cobros;
create table respaldo_515.anuncio_publicaciones as select * from admin.anuncio_publicaciones;
-- Solo funciones afectadas por #515. No se revierten cambios ajenos.
create table respaldo_515.funciones as
select n.nspname as esquema, p.proname as nombre,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_functiondef(p.oid) as definicion
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in (
  'registrar_metrica_anuncio','resumen_metricas_anuncio','totales_metricas_anuncio',
  'registrar_alcance_anuncio','alcance_anuncio','alcance_anuncio_por_canal',
  'limpiar_alcance_anuncios','costo_campana','registrar_interaccion_anuncio',
  'limpiar_interacciones_anuncios','admin_panel_clases','admin_marcar_cobro'))
  or (n.nspname='admin' and p.proname='publicar_anuncio');
-- Las copias no se exponen y siguen el borrado de usuarios/anuncios.
alter table respaldo_515.anuncio_alcance add foreign key(user_id) references auth.users(id) on delete cascade;
alter table respaldo_515.anuncio_interacciones add foreign key(user_id) references auth.users(id) on delete cascade;
alter table respaldo_515.tutor_anuncios add foreign key(autor_id) references auth.users(id) on delete cascade;
do $$ declare t text; begin
  foreach t in array array['anuncio_metricas','anuncio_alcance','anuncio_interacciones',
    'anuncio_campanas','cobros','anuncio_publicaciones'] loop
    execute format('alter table respaldo_515.%I add foreign key(anuncio_id) references public.tutor_anuncios(id) on delete cascade',t);
  end loop;
  foreach t in array array['anuncio_metricas','anuncio_alcance','anuncio_interacciones',
    'tutor_anuncios','anuncio_campanas','cobros','anuncio_publicaciones','funciones'] loop
    execute format('alter table respaldo_515.%I enable row level security',t);
    execute format('revoke all on respaldo_515.%I from public, anon, authenticated',t);
  end loop;
end $$;
commit;
