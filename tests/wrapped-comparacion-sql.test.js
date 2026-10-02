const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const db=new PGlite(),uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const soy=n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);
const posicion=()=>q("select * from universidad_posicion('uc')");
(async()=>{try{
 await db.exec(read('bin/supabase-stubs.sql'));
 await db.exec(read('supabase/curso_posicion.sql'));
 await db.exec(read('supabase/universidad_posicion.sql'));
 await db.exec(read('supabase/universidad_posicion.sql'));
 for(let i=1;i<=6;i++){
  await db.query('insert into auth.users(id) values($1)',[uid(i)]);
  if(i===6)continue;
  await db.query("insert into curso_notas(user_id,tenant,ramo_sigla,promedio) values($1,'uc','TEST101',$2)",[uid(i),i+1]);
  await soy(i);
  if(i<5)assert.deepEqual(await posicion(),[],'menos de cinco personas no muestran comparación');
 }
 await soy(1);assert.deepEqual(await posicion(),[{total:5,mejor_que:0}]);
 await soy(5);assert.deepEqual(await posicion(),[{total:5,mejor_que:100}]);
 await soy(6);assert.deepEqual(await posicion(),[],'sin ramos con sigla no participa');
 await soy(0);assert.deepEqual(await posicion(),[],'sin sesión no devuelve agregados');
 // Más ramos de una cuenta no aumentan el número de personas.
 await db.query("insert into curso_notas(user_id,tenant,ramo_sigla,promedio) values($1,'uc','TEST102',6)",[uid(5)]);
 await soy(5);assert.equal((await posicion())[0].total,5);
 await db.exec('update curso_notas set promedio=5');
 assert.deepEqual(await posicion(),[{total:5,mejor_que:100}],'empates siguen la regla del curso');
 const respuesta=(await posicion())[0];assert.deepEqual(Object.keys(respuesta).sort(),['mejor_que','total'],'sin identificadores, notas individuales, nombres ni correo');
 await db.exec('set role anon');await assert.rejects(posicion(),/permission denied/);
 await db.exec('reset role; set role authenticated');
 assert.deepEqual(await posicion(),[{total:5,mejor_que:100}]);
 await assert.rejects(q('select * from curso_notas where user_id=$1',[uid(1)]),/permission denied/);
 await db.exec('reset role');
 await db.query("update curso_notas set updated_at=now()-interval '31 days' where user_id=$1",[uid(1)]);
 assert.deepEqual(await posicion(),[],'cuatro vigentes y una cuenta antigua no alcanzan el mínimo');
 console.log('OK comparación Wrapped: solo agregados, mínimo cinco personas, permisos, empates y vigencia');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
