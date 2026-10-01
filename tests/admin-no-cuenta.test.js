// Las cuentas de administrador no cuentan como interacción (pedido de Lucas del
// 2026-09-30): al revisar un anuncio publicado, su vista, apertura y contacto
// se sumaban a lo que se le cobra al profesor. PostgreSQL real en memoria, con
// cuentas sintéticas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const raiz=path.join(__dirname,'..'),leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const prof='00000000-0000-0000-0000-000000000011',alumno='00000000-0000-0000-0000-000000000012',admin='00000000-0000-0000-0000-000000000013';
const otro='00000000-0000-0000-0000-000000000015',sinRamos='00000000-0000-0000-0000-000000000016';
const aviso='00000000-0000-0000-0000-000000000014';
let n=0;const check=(nombre,c)=>{assert.ok(c,nombre);n++;console.log('OK '+nombre);};

// Primero lo que se puede comprobar sin base: el archivo que se aplica a mano
// tiene que ser idéntico a la fuente, o reaplicar uno deshace el otro.
const fuente=leer('supabase/clases_particulares.sql'),delta=leer('supabase/admin_no_cuenta.sql');
const fn=(s,nombre)=>{const i=s.indexOf(`create or replace function public.${nombre}(`);const j=s.indexOf('$$;',s.indexOf('$$',s.indexOf('as $$',i)+5))+3;return i<0?null:s.slice(i,j);};
for(const f of ['es_administrador','cuenta_para_campana','registrar_metrica_anuncio'])
  check(`admin_no_cuenta.sql trae ${f} idéntica a clases_particulares.sql`,fn(fuente,f)&&fn(fuente,f)===fn(delta,f));

(async()=>{
  const db=new PGlite();const q=async(t,p=[])=>(await db.query(t,p)).rows;
  const sesion=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec(leer('bin/supabase-stubs.sql'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$
    select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal2')) $$;
    create table public.user_ramos(user_id uuid);`);
  for(const f of ['supabase/clases_particulares.sql','supabase/admin_clases.sql','supabase/administradores.sql','supabase/admin_no_cuenta.sql'])await db.exec(leer(f));
  await db.query('insert into auth.users(id) values($1),($2),($3),($4),($5)',[prof,alumno,admin,otro,sinRamos]);
  await db.query('insert into admin.administradores(user_id) values($1)',[admin]);
  // El admin TIENE ramos: lo único que lo deja fuera es ser administrador.
  await db.query('insert into user_ramos values($1),($2),($3)',[alumno,admin,otro]);
  await db.query(`insert into tutor_perfiles(user_id,nombre_publico,presentacion,estado,revisado_at)
    values($1,'Profesor sintético','Experiencia ficticia para probar comportamiento','aprobado',now())`,[prof]);
  await db.query(`insert into tutor_anuncios(id,autor_id,tenant,ramos_siglas,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,titulo)
    values($1,$2,'uc',array['TEST100'],'individual','online',10000,'Descripción sintética de más de veinte caracteres','whatsapp','56900000000','Clase ficticia')`,[aviso,prof]);
  await db.query('insert into anuncio_campanas(anuncio_id,dias,tope_clp) values($1,10,50000)',[aviso]);
  await db.query("update tutor_anuncios set estado='en_revision' where id=$1",[aviso]);
  await db.query('select admin.publicar_anuncio($1,0)',[aviso]);

  const interactuar=async()=>({
    vista:(await q('select registrar_alcance_anuncio($1,$2) as ok',[aviso,'lista']))[0].ok,
    apertura:(await q('select registrar_interaccion_anuncio($1,$2) as ok',[aviso,'apertura']))[0].ok,
    contacto:(await q('select registrar_interaccion_anuncio($1,$2) as ok',[aviso,'contacto']))[0].ok,
    metrica:(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'contacto','TEST100']))[0].ok});

  await sesion(admin);
  const a=await interactuar();
  check('el admin no suma vista, apertura, contacto ni evento',!a.vista&&!a.apertura&&!a.contacto&&!a.metrica);
  let c=(await q('select * from costo_campana($1)',[aviso]))[0];
  check('y el costo de la campaña no se mueve',c.vistas===0&&c.aperturas===0&&c.contactos===0);
  check('ni los eventos brutos',(await q('select coalesce(sum(eventos),0)::int as e from anuncio_metricas where anuncio_id=$1',[aviso]))[0].e===0);

  await sesion(alumno);
  const b=await interactuar();
  check('un estudiante sigue contando igual',b.vista&&b.apertura&&b.contacto&&b.metrica);
  c=(await q('select * from costo_campana($1)',[aviso]))[0];
  check('una vista, una apertura y un contacto',c.vistas===1&&c.aperturas===1&&c.contactos===1);

  await sesion(prof);
  check('el profesor no suma eventos de su propio anuncio',!(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'impresion','TEST100']))[0].ok);
  await sesion(sinRamos);
  check('una cuenta sin ramos no suma eventos',!(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'impresion','TEST100']))[0].ok);
  await sesion(alumno);
  check('la primera impresión entra al gráfico',(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'impresion','TEST100']))[0].ok);
  await sesion(otro);
  check('un segundo estudiante simultáneo también entra al gráfico',(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'impresion','TEST100']))[0].ok);
  check('el gráfico conserva ambas impresiones',(await q("select eventos from anuncio_metricas where anuncio_id=$1 and tipo='impresion'",[aviso]))[0].eventos===2);
  check('su vista cobrable entra por la misma elegibilidad',(await q('select registrar_alcance_anuncio($1,$2) as ok',[aviso,'lista']))[0].ok);
  await db.query('update anuncio_campanas set tope_clp=1000 where anuncio_id=$1',[aviso]);
  check('la campaña llegó al tope',(await q('select campana_visible($1) as visible',[aviso]))[0].visible===false);
  check('agotada no suma eventos',(await q('select registrar_metrica_anuncio($1,$2,$3) as ok',[aviso,'contacto','TEST100']))[0].ok===false);
  check('agotada tampoco suma cobro',(await q('select registrar_alcance_anuncio($1,$2) as ok',[aviso,'lista']))[0].ok===false);

  const lecturas=['campana_anuncio','alcance_anuncio','alcance_anuncio_por_canal','resumen_metricas_anuncio','totales_metricas_anuncio'];
  await db.exec('set role authenticated');
  await sesion(admin);
  for(const nombre of lecturas)
    check(`admin con segundo factor puede leer ${nombre}`,Array.isArray(await q(`select * from ${nombre}($1)`,[aviso])));
  check('admin ve las mismas dos vistas cobrables del profesor',(await q('select vistas from campana_anuncio($1)',[aviso]))[0].vistas===2&&
    (await q('select alcance_anuncio($1) as n',[aviso]))[0].n===2);
  check('el desglose respeta el mismo corte de privacidad del profesor',(await q('select * from totales_metricas_anuncio($1)',[aviso])).length===0);
  await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
  for(const nombre of lecturas){
    await assert.rejects(()=>q(`select * from ${nombre}($1)`,[aviso]),/sin acceso/);
    check(`admin sin segundo factor no puede leer ${nombre}`,true);
  }
  await sesion(prof);
  check('el dueño sigue leyendo sus estadísticas sin segundo factor',Array.isArray(await q('select * from totales_metricas_anuncio($1)',[aviso])));
  await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
  await sesion(otro);
  await assert.rejects(()=>q('select * from totales_metricas_anuncio($1)',[aviso]),/sin acceso/);
  check('otro estudiante no puede leer estadísticas ajenas',true);
  await db.exec('reset role');

  console.log(`Admin no cuenta: ${n} comprobaciones OK`);
})().catch(e=>{console.error(e);process.exit(1);});
