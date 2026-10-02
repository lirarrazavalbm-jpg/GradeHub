// PostgreSQL real en memoria. Solo cuentas y ramos sintéticos.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const db=new PGlite(),u=i=>`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const soy=async i=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[i?u(i):'']);await db.exec('set role authenticated');};
let periodo;
const informar=(nombre,id='ramo-a',seccion=1,p=periodo)=>q('select profesor_docente_informar($1,$2,$3,$4)',[id,seccion,p,nombre]);
const estado=async(id='ramo-a',seccion=1,p=periodo)=>(await q('select * from profesor_docente_estado($1,$2,$3)',[id,seccion,p]))[0];
const ramo=(id,seccion=1,key='TEST101')=>({id,nombre:'Curso sintético',seccion,origen:{tenant:'uc',ramoKey:key},categorias:[{nombre:'Control ficticio',peso:100,notas:[{valor:4.7}]}]});
(async()=>{try{
  await db.exec(read('bin/supabase-stubs.sql'));
  // Fixture del contrato user_id/data que ya consumen app-session y date_consensus;
  // no crea ni migra estas tablas históricas en el SQL de producto.
  await db.exec('create table public.user_ramos(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb);');
  // Simular grants por defecto de Supabase: también deben quedar revocados.
  await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated;');
  await db.exec(read('supabase/profesores.sql'));
  await db.exec(read('supabase/profesores.sql'));
  periodo=(await q('select profesor_periodo_actual() as p'))[0].p;
  for(let i=1;i<=8;i++){
    await db.query('insert into auth.users(id,email) values($1,$2)',[u(i),`sintetico${i}@example.invalid`]);
    await db.query('insert into user_ramos values($1,$2)',[u(i),JSON.stringify({tenant:'uc',userName:'Persona sintética',ramos:i===8?[]:[ramo('ramo-a'),ramo('ramo-b',2),ramo('ramo-c',1,'TEST102')],historial:[{ramos:[ramo('solo-historial')]}]})]);
  }
  const snapshots=await q('select data from user_ramos order by user_id');
  await soy(1);await informar('María José Pérez');await informar('María José Pérez');
  assert.equal((await estado()).nombre_publico,null,'repetir aporte no duplica cuentas');
  await soy(2);await informar('Maria Jose Perez');
  assert.equal((await estado()).nombre_publico,null,'dos cuentas no publican');
  await soy(3);await informar('Maria Jose Peres');
  assert.ok((await estado()).nombre_publico,'tildes y errata convergen con tres cuentas');
  assert.equal((await estado()).mi_nombre,'Maria Jose Peres');
  assert.equal((await estado('ramo-b',2)).nombre_publico,null,'otra sección aislada');
  assert.equal((await estado('ramo-c')).nombre_publico,null,'otro ramo aislado');
  assert.equal((await estado('ramo-a',1,'2020-1')).nombre_publico,null,'otro período aislado');
  await assert.rejects(informar('Docente Antiguo','ramo-a',1,'2020-1'),/período no vigente/);
  await assert.rejects(informar('Docente Falso','ramo-a',3),/no sincronizados/);
  await assert.rejects(informar('Docente Falso','solo-historial'),/no sincronizados/);
  await soy(8);await assert.rejects(informar('Docente Falso'),/no sincronizados/);
  await soy(0);await assert.rejects(informar('Docente Falso'),/sin sesión/);
  await soy(1);
  await assert.rejects(q('select * from profesor_aportes'),/permission denied/);
  await assert.rejects(q("update profesor_aportes set nombre='Falso'"),/permission denied/);
  await assert.rejects(q("insert into profesor_aportes values($1,'uc','test101',1,$2,'Falso')",[u(8),periodo]),/permission denied/);
  await assert.rejects(q('select * from profesor_contexto($1,1)',['ramo-a']),/permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(estado(),/permission denied/);
  await assert.rejects(informar('Docente Falso'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await q("select relrowsecurity from pg_class where oid='public.profesor_aportes'::regclass"))[0].relrowsecurity,true);
  assert.deepEqual(await q('select data from user_ramos order by user_id'),snapshots,'aportar no muta datos académicos existentes');
  const columnas=(await q("select column_name from information_schema.columns where table_name='profesor_aportes' order by ordinal_position")).map(x=>x.column_name);
  assert.deepEqual(columnas,['user_id','tenant','ramo_clave','seccion','periodo','nombre']);
  await db.exec(read('supabase/profesores.sql'));
  await soy(3);assert.ok((await estado()).nombre_publico,'reaplicar conserva aportes');
  await informar('Otro Profesor');assert.equal((await estado()).nombre_publico,null,'corregir retira respaldo anterior');
  await informar('María José Pérez');assert.ok((await estado()).nombre_publico);
  // Tres de otro docente producen empate: nunca elegir uno por azar.
  for(let i=4;i<=6;i++){await soy(i);await informar('Ricardo González');}
  assert.equal((await estado()).nombre_publico,null,'empate entre docentes no publica');
  await soy(7);await informar('Ricardo González');assert.equal((await estado()).nombre_publico,'Ricardo González');
  // Aislamiento por universidad.
  await db.exec('reset role');
  await db.query('update user_ramos set data=$1 where user_id=$2',[JSON.stringify({tenant:'fen',ramos:[{...ramo('ramo-a'),origen:{tenant:'fen',ramoKey:'TEST101'}}]}),u(8)]);
  await soy(8);assert.equal((await estado()).nombre_publico,null);await informar('Ricardo González');assert.equal((await estado()).nombre_publico,null);
  // Borrar tres cuentas sintéticas elimina aportes sin trigger de reconciliación.
  await db.exec('reset role');
  await db.query('delete from auth.users where id=any($1::uuid[])',[[u(5),u(6),u(7)]]);
  assert.equal((await q('select count(*)::int as n from profesor_aportes where user_id=any($1::uuid[])',[[u(5),u(6),u(7)]]))[0].n,0);
  await soy(1);assert.ok((await estado()).nombre_publico);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[u(3)]);
  await soy(1);assert.equal((await estado()).nombre_publico,null,'borrar tercera cuenta retira consenso inmediatamente');
  const respuesta=await estado();assert.deepEqual(Object.keys(respuesta).sort(),['mi_nombre','nombre_publico']);
  console.log('OK docentes SQL: reaplicación, elegibilidad, consenso, aislamiento, corrección, permisos y cascada');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
