-- Cuentas y anuncios exclusivamente sintéticos para una actualización real.
insert into auth.users(id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6) n;
insert into public.user_ramos values('00000000-0000-0000-0000-000000000002');
insert into admin.administradores values('00000000-0000-0000-0000-000000000003',now());
insert into public.tutor_perfiles(user_id,nombre_publico,presentacion,estado,revisado_at)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Profesor de prueba',
  'Presentación completamente ficticia para pruebas',
  case n when 1 then 'aprobado' when 4 then 'pendiente' when 5 then 'rechazado' else 'suspendido' end,
  case when n=4 then null else now() end
from unnest(array[1,4,5,6]) n;
insert into public.tutor_anuncios(id,autor_id,tenant,ramos_siglas,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,titulo,estado,revisado_at,pagado_at,publicado_at,vence_at)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001',
 'uc',array['TEST101'],'individual','online',10000,'Clase ficticia para una prueba de migración','whatsapp','56900000000','Clase de prueba',
 case n when 10 then 'publicado' when 11 then 'pausado' when 12 then 'en_revision' else 'borrador' end,
 case when n<12 then now() else null end,case when n<12 then now() else null end,
 case when n<12 then now()-interval '2 days 12 hours' else null end,
 case when n<12 then now()+interval '7 days' else null end
from generate_series(10,13) n;
-- Publicado sin campaña: tiene que seguir visible. Pausado con campaña.
insert into public.anuncio_campanas(anuncio_id,dias,tope_clp,detenido_at)
values('00000000-0000-0000-0000-000000000011',10,50000,now()-interval '1 day');
insert into public.anuncio_alcance(anuncio_id,user_id,canal)
values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002','lista');
insert into public.anuncio_interacciones(anuncio_id,user_id,tipo)
values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002','contacto');
insert into public.anuncio_metricas(anuncio_id,dia,tipo,tenant,ramo_sigla,eventos)
values('00000000-0000-0000-0000-000000000010',current_date,'impresion','uc','TEST101',15);
insert into admin.cobros(anuncio_id,publicado_at,estado,monto_clp)
select id,publicado_at,'deuda',1350 from public.tutor_anuncios where estado='publicado';
