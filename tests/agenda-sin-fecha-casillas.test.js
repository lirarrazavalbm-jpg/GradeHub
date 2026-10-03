// Una primera nota no oculta las casillas pendientes que aún no tienen fecha.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const raiz=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false},toggle(){}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return null},clientWidth:400,dataset:{},contains(){return true}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},requestAnimationFrame:f=>f(),setTimeout,clearTimeout,console,getComputedStyle:()=>({getPropertyValue:()=> '0ms'})};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n'),ctx);
const run=s=>vm.runInContext(s,ctx);
const nota=(slot,valor,fecha)=>({id:'n'+slot,nombre:'Control '+(slot+1),peso:1,slot,valor,...(fecha?{fecha}:{})});
const categoria=extra=>({id:'c',nombre:'Controles',peso:100,directNota:true,slots:3,notas:[nota(0,5.5)],...extra});
function comprobar(nombre,categorias,esperados,extra={}){
  run(`S={tenant:'uc',ramos:[${JSON.stringify({id:'r',nombre:'Ramo sintético',gates:[],categorias,...extra})}]}`);
  const antes=run('JSON.stringify(S)');
  const ids=JSON.parse(run('JSON.stringify(agendaSinFecha().map(e=>e.cat.id))'));
  assert.deepEqual(ids,esperados,nombre);
  assert.equal(run('JSON.stringify(S)'),antes,'no cambia datos guardados: '+nombre);
}
comprobar('una nota de tres no oculta las dos pendientes',[categoria()],['c']);
comprobar('grupo completamente rendido',[categoria({notas:[nota(0,5),nota(1,4),nota(2,6)]})],[]);
comprobar('grupo con fecha ya tiene dónde aparecer',[categoria({fecha:'2026-12-01'})],[]);
comprobar('una casilla vacía sin fecha entre notas rendidas',[categoria({notas:[nota(0,5),nota(1,null),nota(2,6)]})],['c']);
comprobar('casilla pendiente con fecha propia',[categoria({notas:[nota(0,5),nota(1,null,'2026-12-01'),nota(2,6)]})],[]);
comprobar('todas las pendientes ya tienen fecha propia',[categoria({notas:[nota(0,null,'2026-12-01'),nota(1,null,'2026-12-02'),nota(2,null,'2026-12-03')]})],[]);
comprobar('solo una de las pendientes tiene fecha',[categoria({notas:[nota(0,5),nota(1,null,'2026-12-01')]})],['c']);
comprobar('sin slots no inventa otra entrega después de una nota',[categoria({slots:null})],[]);
comprobar('categoría directa aún vacía',[categoria({slots:null,notas:[]})],['c']);
comprobar('una nota descartada no cierra las demás casillas',[categoria({dropLowest:1})],['c']);

// Las reglas del catálogo son sintéticas y se resuelven por el mismo motor.
ctx.reglaEximicion={eximicion:{evaluacion:'Examen',segun:['Parcial'],min:5,requiereConfirmacion:true,ignoraDescartes:true}};
run("PRESETS_POR_TENANT.fen['Ramo sintético']=reglaEximicion");
comprobar('examen eximido no pide una fecha',[
  {id:'parcial',nombre:'Parcial',peso:60,notas:[{id:'p',valor:6,peso:1}]},
  {id:'examen',nombre:'Examen',peso:40,notas:[]}
],[],{eximicionConfirmada:true,origen:{tenant:'fen'}});
comprobar('un ramo manual no hereda la eximición del catálogo',[
  {id:'parcial',nombre:'Parcial',peso:60,notas:[{id:'p',valor:6,peso:1}]},
  {id:'examen',nombre:'Examen',peso:40,notas:[]}
],['examen']);
comprobar('ausencia justificada con peso transferido no pide fecha',[
  {id:'control',nombre:'Control',peso:40,notas:[]},
  {id:'examen',nombre:'Examen',peso:60,notas:[{id:'e',valor:5,peso:1}]}
],[],{ausenciasJustificadas:['control'],reglasAusenciaJustificada:{traspasos:[{desdeId:'control',haciaId:'examen'}]}});
comprobar('reemplazo justificado pendiente sigue pidiendo fecha',[
  {id:'control',nombre:'Control',peso:40,notas:[]},
  {id:'examen',nombre:'Examen',peso:60,notas:[]}
],['control','examen'],{ausenciasJustificadas:['control'],reglasAusenciaJustificada:{reemplazos:[{desdeId:'control',haciaId:'examen'}]}});

comprobar('tarjeta existente recibe el grupo pendiente',[categoria()],['c']);
const html=run('agendaSinFechaHTML(agendaSinFecha())');
assert.match(html,/Controles/);assert.match(html,/data-agenda-action="agregar-fecha"/);
run('renderAgenda()');
assert.match(stub.innerHTML,/data-agenda-action="agregar-fecha"/,'la pantalla completa conserva la acción');
console.log('OK: Agenda reconoce pendientes sin fecha por casilla y respeta las reglas del motor');
