// Las comparaciones con el curso ignoran filas congeladas.
//
// Hasta el 2026-09-29 el cliente no mandaba el null de un ramo borrado ni de un
// semestre archivado, así que esas filas quedaron en `curso_notas` para
// siempre y el cliente ya no sabe que existen. curso_posicion y
// universidad_posicion ahora solo cuentan filas tocadas en los últimos 30
// días. PostgreSQL real en memoria, solo cuentas sintéticas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const raiz=path.join(__dirname,'..'),leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const db=new PGlite();
const u=i=>`00000000-0000-0000-0000-00000000000${i}`;
let pruebas=0;
const check=(nombre,cond)=>{assert.ok(cond,nombre);pruebas++;console.log('  OK   '+nombre);};
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const soy=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
const fila=(id,sigla,promedio,dias=0)=>db.query(
  `insert into curso_notas(user_id,tenant,ramo_sigla,promedio,updated_at) values($1,'uc',$2,$3,now()-make_interval(days=>$4))`,
  [id,sigla,promedio,dias]);
const posicion=async sigla=>(await q(`select * from curso_posicion('uc',$1)`,[sigla]))[0]||null;
const universidad=async()=>(await q(`select * from universidad_posicion('uc')`))[0]||null;
(async()=>{
try{
  await db.exec(leer('bin/supabase-stubs.sql'));
  await db.exec(leer('supabase/curso_posicion.sql'));
  await db.exec(leer('supabase/universidad_posicion.sql'));
  for(let i=1;i<=7;i++)await db.query('insert into auth.users(id) values($1)',[u(i)]);

  console.log('\n=== curso_posicion ===');
  // Cinco al día en MAT1610, más uno congelado hace 90 días con un 7,0 que
  // antes le ganaba a todos.
  for(let i=1;i<=5;i++)await fila(u(i),'MAT1610',3+i*0.5);
  await fila(u(6),'MAT1610',7.0,90);
  await soy(u(5));
  let p=await posicion('MAT1610');
  check('la fila congelada no suma participantes',p&&p.total===5);
  check('ni le gana a quien pregunta (5,5 es el más alto de los vigentes)',p&&p.mejor_que===100);

  // Con cuatro vigentes y uno congelado ya no llega al piso de cinco.
  await fila(u(1),'FIS1514',5.0);await fila(u(2),'FIS1514',5.0);await fila(u(3),'FIS1514',5.0);
  await fila(u(4),'FIS1514',5.0);await fila(u(6),'FIS1514',6.0,45);
  await soy(u(1));
  check('cuatro vigentes más uno congelado no alcanzan el mínimo',(await posicion('FIS1514'))===null);

  // Quien pregunta con su propia fila congelada no participa.
  await soy(u(6));
  check('una fila propia congelada no se ubica',(await posicion('MAT1610'))===null);

  // Si esa persona vuelve a abrir Estadísticas, curso_nota_set la revive.
  await db.query(`select curso_nota_set('uc','MAT1610',6.0)`);
  p=await posicion('MAT1610');
  check('al volver a subir, la fila revive',p&&p.total===6);
  await db.query(`update curso_notas set updated_at=now()-interval '90 days' where user_id=$1`,[u(6)]);

  console.log('\n=== universidad_posicion ===');
  // u7 solo tiene una fila congelada: no cuenta como persona de la universidad.
  await fila(u(7),'ICS1113',1.0,60);
  await soy(u(1));
  const antes=await universidad();
  check('cuenta solo personas con filas vigentes (5 de 7)',antes&&antes.total===5);
  // El promedio de u2 no incluye su fila congelada de otro ramo.
  await fila(u(2),'MAT1203',1.0,60);
  await soy(u(2));
  const conCongelada=await universidad();
  await db.query(`delete from curso_notas where user_id=$1 and ramo_sigla='MAT1203'`,[u(2)]);
  const sinCongelada=await universidad();
  check('una fila congelada propia no baja el promedio de quien pregunta',
    conCongelada&&sinCongelada&&conCongelada.mejor_que===sinCongelada.mejor_que);

  console.log(`\nPASS: ${pruebas}   FAIL: 0`);
}catch(e){console.error('  FAIL',e.message);process.exit(1);}
})();
