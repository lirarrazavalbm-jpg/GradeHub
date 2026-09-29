// PostgreSQL real en memoria. Solo cuentas, ramos y campañas sintéticos.
// Ejercita el SQL, las transiciones y los permisos, no coincidencias de texto.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const raiz=path.join(__dirname,'..'),leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const sql=process.env.GRADEHUB_CLASES_SQL?fs.readFileSync(process.env.GRADEHUB_CLASES_SQL,'utf8'):leer('supabase/clases_particulares.sql');
const db=new PGlite();
const prof='00000000-0000-0000-0000-000000000001',alumno='00000000-0000-0000-0000-000000000002',admin='00000000-0000-0000-0000-000000000003';
const aviso='00000000-0000-0000-0000-000000000004',otro='00000000-0000-0000-0000-000000000005';
let pruebas=0;
const check=(nombre,cond)=>{assert.ok(cond,nombre);pruebas++;console.log('OK '+nombre);};
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const coste=async id=>(await q('select * from costo_campana($1)',[id]))[0];
const sesion=async(id,aal='aal2')=>db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('audit.aal',$2,false)",[id,aal]);
const crear=async id=>db.query(`insert into tutor_anuncios(id,autor_id,tenant,ramos_siglas,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,titulo)
  values($1,$2,'uc',array['TEST100'],'individual','online',10000,'Descripción sintética de más de veinte caracteres','whatsapp','56900000000','Clase ficticia')`,[id,prof]);
(async()=>{
try{
  await db.exec(leer('bin/supabase-stubs.sql'));
  // Dependencias mínimas de Supabase. No afirman reproducir su esquema real.
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',coalesce(current_setting('audit.aal',true),'aal1')) $$;
    create table public.user_ramos(user_id uuid);`);
  await db.exec(sql);
  await db.exec(leer('supabase/admin_clases.sql'));
  await db.exec(leer('supabase/administradores.sql'));
  await db.query('insert into auth.users(id) values($1),($2),($3)',[prof,alumno,admin]);
  await db.query('insert into admin.administradores(user_id) values($1)',[admin]);
  await db.query('insert into user_ramos values($1)',[alumno]);
  await db.query(`insert into tutor_perfiles(user_id,nombre_publico,presentacion,estado,revisado_at)
    values($1,'Profesor sintético','Experiencia ficticia para probar comportamiento','aprobado',now())`,[prof]);
  await crear(aviso);
  await assert.rejects(db.query("update tutor_anuncios set estado='en_revision' where id=$1",[aviso]),/tope/);
  check('el servidor rechaza enviar sin campaña',true);
  await db.query('insert into anuncio_campanas(anuncio_id,dias,tope_clp) values($1,10,50000)',[aviso]);
  await db.query("update tutor_anuncios set estado='en_revision' where id=$1",[aviso]);
  await db.query('select admin.publicar_anuncio($1,0)',[aviso]);
  // Un escenario con 4,5 días transcurridos evita bordes de redondeo de milisegundos.
  await db.query("update tutor_anuncios set publicado_at=now()-interval '4 days 12 hours',vence_at=now()+interval '5 days' where id=$1",[aviso]);
  const primera=(await q('select publicado_at::text as fecha from tutor_anuncios where id=$1',[aviso]))[0].fecha;
  await sesion(alumno);
  await db.query('select registrar_alcance_anuncio($1,$2)',[aviso,'lista']);
  await db.query('select registrar_interaccion_anuncio($1,$2)',[aviso,'apertura']);
  await db.query('select registrar_interaccion_anuncio($1,$2)',[aviso,'contacto']);
  await db.query('select registrar_interaccion_anuncio($1,$2)',[aviso,'contacto']);
  let c=await coste(aviso);
  check('una cuenta cuenta una vez por tipo en la publicación',c.vistas===1&&c.aperturas===1&&c.contactos===1);
  check('el costo inicial incluye 5 días visibles',c.dias_cobrados===5);
  await sesion(admin);
  await db.query('select admin_estado_profesor($1,$2)',[prof,'suspendido']);
  check('suspender oculta la campaña',(await q('select campana_visible($1) as visible',[aviso]))[0].visible===false);
  await db.query("update tutor_suspensiones set desde=now()-interval '2 days' where user_id=$1 and hasta is null",[prof]);
  c=await coste(aviso);
  check('los dos días suspendido no se cobran',c.dias_cobrados===3&&c.costo_bruto===1360);
  const detenido=c.costo_bruto;
  await sesion(alumno);
  check('no se registran contactos mientras está suspendido',(await q('select registrar_interaccion_anuncio($1,$2) as ok',[aviso,'contacto']))[0].ok===false);
  await sesion(admin);
  await db.query('select admin_estado_profesor($1,$2)',[prof,'aprobado']);
  c=await coste(aviso);
  check('reactivar conserva el descuento por suspensión',c.costo_bruto===detenido);
  await db.query("insert into tutor_suspensiones(user_id,desde,hasta) values($1,now()-interval '4 days',now()-interval '3 days')",[prof]);
  check('varias suspensiones descuentan sus intervalos sin cobrar días ocultos',(await coste(aviso)).dias_cobrados===2);
  await db.query('select admin_marcar_cobro($1,$2,$3)',[aviso,'deuda',1250]);
  await db.query('select admin_pausar_anuncio($1)',[aviso]);
  c=await coste(aviso);
  await db.query('select admin_estado_profesor($1,$2)',[prof,'suspendido']);
  await db.query('select admin_estado_profesor($1,$2)',[prof,'aprobado']);
  check('reactivar al profesor no reactiva una pausa propia',(await q('select estado from tutor_anuncios where id=$1',[aviso]))[0].estado==='pausado');
  check('una campaña pausada conserva su costo',(await coste(aviso)).costo_bruto===c.costo_bruto);

  await db.query("update tutor_anuncios set estado='en_revision' where id=$1",[aviso]);
  await db.query('select admin.publicar_anuncio($1,0)',[aviso]);
  c=await coste(aviso);
  check('republicar empieza con cero vistas, aperturas y contactos',c.vistas===0&&c.aperturas===0&&c.contactos===0);
  check('los registros de la primera publicación no se borraron',(await q('select count(*)::int as n from anuncio_interacciones where anuncio_id=$1',[aviso]))[0].n===2);
  const panel=(await q('select admin_panel_clases() as p'))[0].p;
  const a=panel.find(p=>p.user_id===prof).anuncios.find(a=>a.id===aviso);
  check('la deuda anterior sigue en la respuesta del panel',a.cobro===null&&a.cobros.length===1&&a.cobros[0].monto_clp===1250);
  await db.query('select admin_marcar_cobro_publicacion($1,$2,$3,$4)',[aviso,primera,'cobrado',1250]);
  check('se puede saldar la deuda anterior sin tocar la campaña actual',(await q('select estado from admin.cobros where anuncio_id=$1 and publicado_at=$2',[aviso,primera]))[0].estado==='cobrado');
  await assert.rejects(db.query('select admin_marcar_cobro_publicacion($1,$2,$3,$4)',[aviso,'2000-01-01','deuda',1000]),/no existe/);
  check('no se inventan cobros para publicaciones inexistentes',true);
  await sesion(alumno);
  await db.query('select registrar_alcance_anuncio($1,$2)',[aviso,'busqueda']);
  await db.query('select registrar_interaccion_anuncio($1,$2)',[aviso,'contacto']);
  c=await coste(aviso);
  check('la misma cuenta sí cuenta en la nueva publicación',c.vistas===1&&c.contactos===1&&c.aperturas===0);
  await sesion(prof);
  const canales=await q('select * from alcance_anuncio_por_canal($1)',[aviso]);
  check('el alcance por canal solo incluye la nueva publicación',canales.length===1&&canales[0].canal==='busqueda'&&canales[0].cuentas===1);

  // Gráficos: dos publicaciones el mismo día no comparten eventos anónimos.
  await db.query(`insert into anuncio_metricas(anuncio_id,dia,tipo,tenant,ramo_sigla,eventos,publicacion)
    select id,current_date,'impresion','uc','TEST100',15,medicion_desde from tutor_anuncios where id=$1`,[aviso]);
  check('el gráfico actual contiene solo sus eventos',(await q('select * from resumen_metricas_anuncio($1)',[aviso]))[0].eventos===15);

  // Una actualización con filas antiguas: todas conservan el grupo heredado.
  await crear(otro);
  await db.query('insert into anuncio_campanas(anuncio_id,dias,tope_clp) values($1,10,50000)',[otro]);
  await db.query("update tutor_anuncios set estado='en_revision' where id=$1",[otro]);
  await db.query('select admin.publicar_anuncio($1,0)',[otro]);
  await db.query("update tutor_anuncios set medicion_desde='-infinity' where id=$1",[otro]);
  await db.query('insert into anuncio_alcance(anuncio_id,user_id,canal) values($1,$2,$3)',[otro,alumno,'lista']);
  await db.query('insert into anuncio_interacciones(anuncio_id,user_id,tipo) values($1,$2,$3)',[otro,alumno,'contacto']);
  const antesLegacy=await coste(otro);
  await db.exec(sql);
  await db.exec(leer('supabase/admin_clases.sql'));
  await db.exec(leer('supabase/administradores.sql'));
  const despuesLegacy=await coste(otro);
  check('reaplicar SQL conserva los importes y registros heredados',antesLegacy.costo_bruto===despuesLegacy.costo_bruto&&despuesLegacy.vistas===1&&despuesLegacy.contactos===1);
  check('reaplicar no borra interacciones de publicaciones nuevas',(await coste(aviso)).contactos===1);
  check('reaplicar conserva el cobro histórico',(await q('select count(*)::int as n from admin.cobros'))[0].n===1);
  await db.query("update tutor_anuncios set estado='en_revision' where id=$1",[otro]);
  await db.query('select admin.publicar_anuncio($1,0)',[otro]);
  check('renovar una campaña heredada empieza una medición nueva',(await coste(otro)).contactos===0);

  // Las filas de una publicación vieja vencen aunque el anuncio se renueve.
  await db.query("update anuncio_interacciones set vence_publicacion=now()-interval '91 days' where anuncio_id=$1 and publicacion=$2",[aviso,primera]);
  await db.query('select limpiar_interacciones_anuncios()');
  check('la retención sigue a la publicación y conserva la actual',(await q('select count(*)::int as n from anuncio_interacciones where anuncio_id=$1',[aviso]))[0].n===1);

  // Auth/RLS: no basta con ocultar el botón en el navegador.
  await sesion(admin,'aal1');
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select admin_panel_clases()'),/sin acceso/);
  await assert.rejects(db.query('select admin_marcar_cobro_publicacion($1,$2,$3,$4)',[aviso,primera,'deuda',100]),/sin acceso/);
  check('admin sin segundo factor no lee ni altera cobros',true);
  await db.exec('reset role');
  await sesion(alumno);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select admin_panel_clases()'),/sin acceso/);
  await assert.rejects(db.query('select campana_anuncio($1)',[aviso]),/no puedes/);
  await assert.rejects(db.query('select * from anuncio_interacciones'),/permission denied/);
  await assert.rejects(db.query('select * from tutor_suspensiones'),/permission denied/);
  check('un alumno no lee admin, métricas ajenas ni tablas privadas',true);
  await db.exec('reset role');
  await sesion(prof);
  await db.exec('set role authenticated');
  await assert.rejects(db.query("update tutor_anuncios set medicion_desde=now() where id=$1",[aviso]),/permission denied/);
  check('el profesor no puede reiniciar sus métricas',true);
  const propia=await q('select * from campana_anuncio($1)',[aviso]);
  check('el profesor conserva acceso a sus agregados',propia.length===1&&propia[0].contactos===1);
  await db.exec('reset role');
  await sesion(admin);
  await db.exec('set role authenticated');
  check('admin verificado conserva acceso al panel',(await q('select admin_panel_clases() as p'))[0].p.length===1);
  await db.exec('reset role');
}finally{await db.close()}
console.log(`Campañas SQL: ${pruebas} comprobaciones OK`);
})().catch(e=>{console.error(e);process.exitCode=1});
