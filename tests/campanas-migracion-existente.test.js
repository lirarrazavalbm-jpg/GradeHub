// La actualización empieza con el esquema anterior, datos sintéticos y deuda.
// Además de aplicar dos veces, verifica reversión después de una renovación.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),db=new PGlite();
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const q=async(s,p=[])=>(await db.query(s,p)).rows;
const apply=async()=>{for(const f of ['clases_particulares','admin_clases','administradores'])await db.exec(read('supabase/'+f+'.sql'));};
const role=async(name,fn)=>{await db.exec('set role '+name);try{await fn()}finally{await db.exec('reset role')}};
(async()=>{try{
  for(const f of ['bin/supabase-stubs.sql','bin/fixtures/campanas-515/antes.sql','bin/fixtures/campanas-515/datos.sql','supabase/respaldo_campanas_515.sql'])await db.exec(read(f));
  const before=(await q('select * from costo_campana($1)',[id(10)]))[0];
  await apply();await db.exec(read('bin/fixtures/campanas-515/verificar.sql'));
  assert.deepEqual((await q('select * from costo_campana($1)',[id(10)]))[0],before,'No recalcula el pasado ni altera el costo existente');
  const keys=await q("select conname,oid from pg_constraint where conname in ('anuncio_metricas_pkey','anuncio_alcance_pkey','anuncio_interacciones_pkey') order by conname");
  await apply();await db.exec(read('bin/fixtures/campanas-515/verificar.sql'));
  assert.deepEqual(await q("select conname,oid from pg_constraint where conname in ('anuncio_metricas_pkey','anuncio_alcance_pkey','anuncio_interacciones_pkey') order by conname"),keys,'No reconstruye las llaves al reaplicar');
  await db.query("update tutor_anuncios set estado='pausado' where id=$1",[id(10)]);
  await db.query("update tutor_anuncios set estado='publicado' where id=$1",[id(10)]).then(()=>assert.fail('No reutilizar identidad')).catch(e=>assert.match(e.message,/propia fecha/));
  // Volver a publicar usa fecha nueva, pero jamás exige una campaña inventada.
  await db.query("update tutor_anuncios set estado='publicado',publicado_at=now()-interval '1 day' where id=$1",[id(10)]);
  assert.equal((await q('select campana_visible($1) as ok',[id(10)]))[0].ok,true);
  await db.query('select admin.publicar_anuncio($1,0)',[id(12)]);
  assert.equal((await q('select estado from tutor_anuncios where id=$1',[id(12)]))[0].estado,'publicado','Revisión heredada sin campaña sigue publicable');
  await assert.rejects(db.query("update tutor_anuncios set estado='en_revision' where id=$1",[id(13)]),/tope/);
  for(const n of [4,5]){await db.query("update tutor_perfiles set estado='suspendido',revisado_at=now() where user_id=$1",[id(n)]);}
  assert.equal((await q('select count(*)::int as n from tutor_suspensiones'))[0].n,0,'Pendientes/rechazados no crean suspensiones');
  await db.query("update tutor_perfiles set estado='suspendido' where user_id=$1",[id(1)]);
  assert.equal((await q('select count(*)::int as n from tutor_suspensiones'))[0].n,1);
  await db.query("update tutor_perfiles set estado='aprobado' where user_id=$1",[id(1)]);
  assert.ok((await q('select hasta from tutor_suspensiones'))[0].hasta);
  const fk=await q("select confdeltype from pg_constraint where conrelid='tutor_suspensiones'::regclass and confrelid='auth.users'::regclass");
  assert.equal(fk[0].confdeltype,'c');
  await role('anon',async()=>{for(const table of ['public.tutor_suspensiones','respaldo_515.anuncio_alcance','admin.cobros'])await assert.rejects(db.query('select * from '+table),/permission denied/);});
  // Misma cuenta en otra publicación. La reversión no puede perder el archivo.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
  await db.query('select registrar_alcance_anuncio($1)',[id(10)]);
  await db.query("select registrar_interaccion_anuncio($1,'contacto')",[id(10)]);
  assert.equal((await q('select count(*)::int as n from anuncio_alcance'))[0].n,2);
  await db.exec(read('supabase/revertir_campanas_515.sql'));
  assert.equal((await q('select count(*)::int as n from respaldo_515.anuncio_alcance_posterior'))[0].n,2,'Archivo conserva ambas publicaciones');
  assert.equal((await q('select count(*)::int as n from anuncio_alcance'))[0].n,1,'Operación anterior mantiene solo publicación actual');
  assert.equal((await q('select monto_clp from admin.cobros'))[0].monto_clp,1350,'Revertir no borra deuda');
  await db.query('select registrar_alcance_anuncio($1)',[id(10)]); // ON CONFLICT viejo funciona.
  await role('anon',async()=>{await assert.rejects(db.query('select * from respaldo_515.anuncio_alcance_posterior'),/permission denied/);});
  await apply();
  await db.query('delete from auth.users where id=$1',[id(2)]);
  assert.equal((await q('select count(*)::int as n from respaldo_515.anuncio_alcance_posterior'))[0].n,0,'Los respaldos respetan borrado de cuenta');
  await db.query('delete from auth.users where id=$1',[id(1)]);
  assert.equal((await q('select count(*)::int as n from tutor_suspensiones'))[0].n,0,'Suspensiones se borran con el profesor');
  console.log('Migración existente: publicado/pausado/revisión, idempotencia, RLS, FK y reversión OK');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
