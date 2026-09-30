// El simulador consulta al mismo motor que la ficha. Pautas sintéticas escritas
// acá: ningún caso depende de presetRamo() ni de datos de estudiantes reales.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const elements=new Map(),writes=[];
function el(){
  let html='';
  const node={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false},toggle(){}},
    hidden:false,value:'',textContent:'',dataset:{},children:[],clientWidth:390,
    addEventListener(){},appendChild(x){this.children.push(x);return x},setAttribute(){},removeAttribute(){},getAttribute(){return null},
    querySelector(){return node},querySelectorAll(){return []},focus(){},select(){},click(){},remove(){}};
  Object.defineProperty(node,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});
  return node;
}
const byId=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id)};
const ctx={console,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),body:el(),querySelector:()=>el(),querySelectorAll:()=>[]},
  localStorage:{getItem:()=>null,setItem:(...args)=>writes.push(args),removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}}};
vm.createContext(ctx);
for(const file of ['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const run=s=>vm.runInContext(s,ctx),S=run('S');
const n=(id,valor,slot)=>({id,nombre:id,valor,peso:1,...(slot===undefined?{}:{slot})});
const c=(id,nombre,peso,notas=[],extra={})=>({id,nombre,peso,notas:notas.length?notas:[n('pendiente-'+id,null)],directNota:true,...extra});
const ramo=(categorias,extra={})=>({id:'r1',nombre:'Ramo sintético',color:'#456',creditos:10,origen:null,gates:[],categorias,...extra});
function pintar(r,{notas={},ausencias={}}={}){
  S.ramos=[r];run("currentRamoId='r1';simState={};simAusencias={};");
  for(const [id,valor] of Object.entries(notas))run(`simState[${JSON.stringify(id)}]=[{id:'hip-'+${JSON.stringify(id)},valor:${valor},peso:1}]`);
  for(const [id,ausencia] of Object.entries(ausencias)){
    ctx.__ausencia=ausencia;
    run(`simAusencias[${JSON.stringify(id)}]=__ausencia`);
  }
  run('renderSimulador()');
  return byId('sim-needed').textContent;
}
const base=()=>ramo([c('prueba','Prueba escrita',50,[n('n1',5)]),c('cierre','Evaluación final',50)]);

console.log('=== Misma cifra que la ficha sin hipótesis ===');
const real=base();
const sim=pintar(real);
assert.equal(byId('sim-avg').textContent,'5,0','el promedio proyectado conserva su valor y muestra coma decimal');
assert.match(byId('sim-cats').innerHTML,/n1: 5,0/,'las notas de la lista usan coma decimal');
run('renderRamo()');
const ficha=byId('ramo-min-chip').textContent;
const numeroFicha=(ficha.match(/Necesitas ([\d.,]+)/)||[])[1];
assert.ok(numeroFicha,`la ficha debe dar una cifra: ${ficha}`);
assert.equal(sim,`Para el 4,0 necesitas ${numeroFicha.replace('.',',')} en lo que queda`);
assert.equal(sim,'Para el 4,0 necesitas 2,9 en lo que queda');
assert.equal(byId('sim-needed').hidden,false);

console.log('=== Notas hipotéticas y ausencia simulada ===');
const tres=()=>ramo([c('prueba','Prueba escrita',30,[n('n1',5)]),c('taller','Taller aplicado',20),c('cierre','Evaluación final',50)]);
assert.equal(pintar(tres(),{notas:{taller:3}}),'Para el 4,0 necesitas 3,7 en lo que queda');
const ausencia=pintar(tres(),{ausencias:{taller:{hacia:'cierre',tipo:'traspaso'}}});
assert.equal(ausencia,'Para el 4,0 necesitas 3,5 en lo que queda');
assert.equal(run('notaNecesaria(simProjectedRamo(S.ramos[0]),4)').toFixed(3),'3.500');
assert.equal(S.ramos[0].ausenciasJustificadas,undefined,'simular la falta no modifica el ramo real');
const movimiento=ramo([c('prueba','Prueba escrita',30,[n('n1',5)]),c('taller','Taller aplicado',20),
  c('control','Control oral',20,[n('n2',3)]),c('cierre','Evaluación final',30)]);
assert.equal(pintar(movimiento),'Para el 4,0 necesitas 3,7 en lo que queda');
run("simSetFalta('taller','traspaso|control')");
assert.equal(byId('sim-needed').textContent,'Para el 4,0 necesitas 4,2 en lo que queda',
  'al mover el peso a una evaluación ya calificada la cifra cambia en vivo');
assert.equal(pintar(tres()),'Para el 4,0 necesitas 3,5 en lo que queda');
byId('sim-in-taller').value='3,0';
run("simAddNota('taller')");
assert.equal(byId('sim-needed').textContent,'Para el 4,0 necesitas 3,7 en lo que queda',
  'una nota hipotética cambia la cifra sin guardarse');

console.log('=== Ausencia ya declarada en una cuenta existente ===');
const declarada=tres();
declarada.ausenciasJustificadas=['taller'];
declarada.reglasAusenciaJustificadaUsuario={declaradaPor:'estudiante',rezagos:[],reemplazos:[],traspasos:[{desdeId:'taller',haciaId:'cierre'}]};
assert.equal(pintar(declarada),ausencia,'la ausencia guardada antes se lee igual que la simulada');
assert.deepEqual(declarada.ausenciasJustificadas,['taller']);
const conPrograma=tres();
conPrograma.ausenciasJustificadas=['taller'];
conPrograma.reglasAusenciaJustificada={reemplazos:[],traspasos:[{desdeId:'taller',haciaId:'cierre'}]};
assert.equal(pintar(conPrograma),ausencia,'una regla del programa también conserva el peso declarado');
const mezclada=ramo([c('prueba','Prueba escrita',20,[n('n1',5)]),c('taller','Taller aplicado',20),
  c('informe','Informe',20),c('cierre','Evaluación final',40)],{
  ausenciasJustificadas:['taller'],
  reglasAusenciaJustificadaUsuario:{declaradaPor:'estudiante',rezagos:[],reemplazos:[],traspasos:[{desdeId:'taller',haciaId:'cierre'}]}});
assert.equal(pintar(mezclada,{ausencias:{informe:{hacia:'cierre',tipo:'traspaso'}}}),
  'Para el 4,0 necesitas 3,9 en lo que queda','las dos ausencias se combinan y el motor aplica el tope de 75%');
assert.deepEqual(mezclada.ausenciasJustificadas,['taller'],'la segunda ausencia sigue siendo solo una hipótesis');

console.log('=== Compuertas que topan la nota ===');
const piso=ramo([c('prueba','Prueba escrita',30,[n('n1',2)]),c('cierre','Evaluación final',70)],{
  gates:[{type:'min_grade_required',catId:'prueba',min:4,cap:3.9,nombre:'Prueba escrita'}]});
assert.match(pintar(piso),/^Con esto ya no alcanzas el 4,0/);
assert.match(byId('sim-needed').textContent,/Prueba escrita.*4,0.*topa/);
const grupo=ramo([c('individual','Trabajo individual',40,[n('n1',3)]),c('cierre','Evaluación final',60)],{
  gates:[{type:'group_min',catIds:['individual'],min:4,cap:'self',nombre:'Trabajo individual'}]});
assert.match(pintar(grupo),/^Con esto ya no alcanzas el 4,0/);
assert.match(byId('sim-needed').textContent,/Trabajo individual.*topa/);

console.log('=== Pendiente bajo compuerta: muestra la condición, no promete aprobación ===');
const pisoPendiente=ramo([c('prueba','Prueba escrita',50,[n('n1',2,0)],{slots:2,directNota:false}),c('cierre','Evaluación final',50,[n('n2',7)])],{
  gates:[{type:'min_grade_required',catId:'prueba',min:4,cap:3.9,nombre:'Prueba escrita'}]});
assert.match(pintar(pisoPendiente),/^El promedio ponderado ya alcanza el 4,0/);
assert.match(byId('sim-needed').textContent,/Además, Prueba escrita debe llegar a 4,0/);
const pisoSimulado=ramo([c('prueba','Prueba escrita',50),c('cierre','Evaluación final',50)],{
  gates:[{type:'min_grade_required',catId:'prueba',min:4,cap:3.9,nombre:'Prueba escrita'}]});
assert.match(pintar(pisoSimulado,{notas:{prueba:3}}),/^Con esto ya no alcanzas el 4,0/,
  'una nota hipotética ocupa su casilla y puede dejar una compuerta definitivamente bajo el mínimo');

console.log('=== Imposible, asegurado, pauta incompleta y ramo cerrado ===');
assert.equal(pintar(ramo([c('prueba','Prueba escrita',80,[n('n1',1)]),c('cierre','Evaluación final',20)])),
  'Con esto ya no alcanzas el 4,0');
assert.equal(pintar(ramo([c('prueba','Prueba escrita',90,[n('n1',7)]),c('cierre','Evaluación final',10)])),
  'Ya tienes el 4,0 asegurado');
const casiAsegurado=ramo([c('prueba','Prueba escrita',90,[n('n1',7)]),c('cierre','Evaluación final',10)],{
  gates:[{type:'min_grade_required',catId:'cierre',min:4,cap:3.9}]});
assert.match(pintar(casiAsegurado),/^El promedio ponderado ya alcanza el 4,0/);
assert.match(byId('sim-needed').textContent,/Evaluación final debe llegar a 4,0/,
  'una compuerta pendiente impide decir que el 4,0 está asegurado');
assert.equal(pintar(ramo([c('prueba','Prueba escrita',40,[n('n1',5)]),c('cierre','Evaluación final',40)])),
  'Completa la pauta para calcularlo');
assert.equal(pintar(ramo([c('prueba','Prueba escrita',50,[n('n1',5)]),c('cierre','Evaluación final',50,[n('n2',4)])])), '');
assert.equal(byId('sim-needed').hidden,true,'un ramo completo solo muestra su promedio final');

console.log('=== Explorar no escribe datos ===');
const explorado=tres();
writes.length=0;
pintar(explorado);
const antes=JSON.stringify(explorado);
run("simToggleFalta('taller')");
run("simSetFalta('taller','traspaso|cierre')");
byId('sim-in-cierre').value='4,5';
run("simAddNota('cierre')");
assert.equal(JSON.stringify(explorado),antes,'la simulación conserva intacto el ramo original');
assert.equal(writes.length,0,'no se toca gradehub_v1 ni otra clave local al simular');
assert.match(fs.readFileSync(path.join(root,'app.js'),'utf8'),/const necesaria=notaNecesaria\(proyectado,meta\)/);
console.log('OK: simulador, compuertas, ausencias y ficha');
