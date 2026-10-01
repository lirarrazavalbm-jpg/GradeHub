// Reaplicar clases_particulares.sql no puede quitarle al pack sus permisos.
// Pasó con #559 y #560: el archivo hace `revoke all` sobre tutor_anuncios y
// vuelve a dar permisos de columna, y el pack venía de otro archivo. Si se
// reaplicaba entero en producción, un pack publicado perdía su precio.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const prof='00000000-0000-0000-0000-000000000031',aviso='00000000-0000-0000-0000-000000000032';
const privilegios=async db=>(await db.query(`select
  has_column_privilege('authenticated','public.tutor_anuncios','pack_clases','select') as pack_select,
  has_column_privilege('anon','public.tutor_anuncios','pack_clases','select') as pack_select_anon,
  has_column_privilege('authenticated','public.tutor_anuncios','descuento_gradehub_pct','select') as dcto_select,
  has_column_privilege('anon','public.tutor_anuncios','descuento_gradehub_pct','select') as dcto_select_anon,
  has_column_privilege('authenticated','public.tutor_anuncios','pack_clases','insert') as pack_insert,
  has_column_privilege('authenticated','public.tutor_anuncios','pack_clases','update') as pack_update,
  has_column_privilege('authenticated','public.tutor_anuncios','descuento_gradehub_pct','insert') as dcto_insert,
  has_column_privilege('authenticated','public.tutor_anuncios','descuento_gradehub_pct','update') as dcto_update`)).rows[0];
const esperado={pack_select:true,pack_select_anon:true,dcto_select:true,dcto_select_anon:true,
  pack_insert:true,pack_update:true,dcto_insert:false,dcto_update:false};
const base=async()=>{
  const db=new PGlite();
  await db.exec(read('bin/supabase-stubs.sql'));
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$ select '{"aal":"aal2"}'::jsonb $$;
    create table public.user_ramos(user_id uuid);`);
  return db;
};
(async()=>{try{
  // Como en producción: la fuente, la administración y después el delta del pack.
  const db=await base();
  for(const f of ['clases_particulares','admin_clases','administradores','clases_pack_descuento'])await db.exec(read('supabase/'+f+'.sql'));
  await db.query('insert into auth.users(id) values($1)',[prof]);
  await db.query(`insert into tutor_anuncios(id,autor_id,tenant,ramos_siglas,modalidad,ubicacion,precio_clp,descripcion,contacto_tipo,contacto_valor,titulo,pack_clases)
    values($1,$2,'uc',array['TEST100'],'grupal','online',12500,'Descripción sintética de más de veinte caracteres','whatsapp','56900000000','Pack ficticio',4)`,[aviso,prof]);
  await db.query('select admin.descuento_anuncio($1,10)',[aviso]);
  assert.deepEqual(await privilegios(db),esperado,'Después del delta del pack');

  // Reaplicar la fuente completa no le quita nada al pack ni toca sus datos.
  await db.exec(read('supabase/clases_particulares.sql'));
  assert.deepEqual(await privilegios(db),esperado,'Reaplicar clases_particulares.sql conserva los permisos del pack');
  const fila=(await db.query('select pack_clases,descuento_gradehub_pct,precio_clp from tutor_anuncios where id=$1',[aviso])).rows[0];
  assert.deepEqual(fila,{pack_clases:4,descuento_gradehub_pct:10,precio_clp:12500},'El pack y su descuento siguen iguales');
  console.log('  OK   reaplicar la fuente conserva permisos y datos del pack');

  // El descuento sigue siendo solo de GradeHub: un profesor no puede fijárselo.
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[prof]);
  await assert.rejects(db.query('update public.tutor_anuncios set descuento_gradehub_pct=50 where id=$1',[aviso]),/permission denied/i);
  await db.exec('reset role');
  console.log('  OK   el profesor no puede escribir el descuento');

  // Base nueva: la fuente sola ya trae el pack, y el delta encima no falla.
  const nueva=await base();
  for(const f of ['clases_particulares','admin_clases','administradores'])await nueva.exec(read('supabase/'+f+'.sql'));
  assert.deepEqual(await privilegios(nueva),esperado,'La fuente sola trae el pack');
  await nueva.exec(read('supabase/clases_pack_descuento.sql'));
  assert.deepEqual(await privilegios(nueva),esperado,'El delta encima de la fuente no cambia nada');
  console.log('  OK   la fuente sola trae el pack y el delta sigue siendo reaplicable');
}catch(e){console.error(e);process.exit(1);}})();
