// Guardar una nota hipotética en una categoría con casillas debe ocupar una
// casilla real. Sin `slot`, el promedio la incluye pero la ficha y el avance no
// la ven: tres espacios siguen vacíos detrás de un promedio imposible de explicar.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.env.GRADEHUB_APP?path.dirname(process.env.GRADEHUB_APP):path.join(__dirname,'..');
const files=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'];
const elements=new Map();
const mk=()=>({style:{setProperty(){},removeProperty(){},display:''},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return null},focus(){},select(){},value:'',innerHTML:'',textContent:'',dataset:{},clientWidth:375,getBoundingClientRect(){return{top:0,left:0,width:0,height:0}},scrollIntoView(){}});
const get=id=>{if(!elements.has(id))elements.set(id,mk());return elements.get(id)};
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:get,createElement:mk,addEventListener(){},documentElement:mk(),body:mk(),querySelector(){return null},querySelectorAll(){return[]}},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},getComputedStyle:()=>({getPropertyValue:()=> '0ms'}),setTimeout(fn){fn();return 1},clearTimeout(){},requestAnimationFrame(){return 1},cancelAnimationFrame(){},gtag(){}};
vm.createContext(ctx);files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f}));
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;
function chk(nombre,cond){if(cond){ok++;console.log('  OK   '+nombre)}else{fail++;console.log('  FAIL '+nombre)}}

run(`
  S={...freshState(),ramos:[{
    id:'ramo',nombre:'Ramo con informes',color:'#123456',origen:null,gates:[],
    categorias:[{id:'informes',nombre:'Informes',peso:100,directNota:true,slots:3,notas:[]}]
  }]};
  currentRamoId='ramo';simState={};
  showConfirm=(titulo,detalle,confirmar)=>confirmar();
  save=()=>{};track=()=>{};closeModal=()=>{};renderRamo=()=>{};showToast=()=>{};
`);
get('sim-in-informes').value='6,0';
run("simAddNota('informes')");
chk('la proyección ya reserva una casilla concreta',run("simState.informes[0]?.slot")===0);
chk('reservar la casilla no cambia el promedio proyectado',run("simProjectedAvg(S.ramos[0])")===6);
run('simCommit()');
let ramo=run('S.ramos[0]'),informes=ramo.categorias[0];

console.log('\n=== Guardar desde el simulador ocupa una casilla ===');
chk('la nota queda identificada como la primera casilla',informes.notas.length===1&&informes.notas[0].slot===0);
chk('la ficha puede encontrarla con el mismo lookup que usa renderRamo',informes.notas.find(n=>n.slot===0)?.valor===6);
chk('una de tres casillas aporta 33% de avance',run('ramoProgress(S.ramos[0]).pct')===33);

console.log('\n=== El identificador sobrevive a recargar ===');
ctx.__estado=JSON.parse(JSON.stringify(run('S')));
run('S=normalize(__estado)');
ramo=run('S.ramos[0]');informes=ramo.categorias[0];
chk('la nota sigue en la casilla tras normalize',informes.notas[0]?.slot===0&&informes.notas[0]?.valor===6);
chk('el avance sigue en 33% tras normalize',run('ramoProgress(S.ramos[0]).pct')===33);

console.log('\n=== Se ocupa la primera casilla realmente libre ===');
run(`
  S={...freshState(),ramos:[{
    id:'parcial',nombre:'Ramo parcial',color:'#123456',origen:null,gates:[],
    categorias:[{id:'controles',nombre:'Controles',peso:100,directNota:true,slots:3,
      notas:[{id:'control-2',nombre:'Control 2',valor:5,peso:1,slot:1}]}]
  }]};
  currentRamoId='parcial';simState={};
`);
get('sim-in-controles').value='5,5';run("simAddNota('controles')");
get('sim-in-controles').value='6,0';run("simAddNota('controles')");
run('simCommit()');
const controles=run("S.ramos[0].categorias[0]");
chk('salta la ocupada y asigna las libres en orden',controles.notas.find(n=>n.slot===0)?.valor===5.5&&controles.notas.find(n=>n.slot===1)?.valor===5&&controles.notas.find(n=>n.slot===2)?.valor===6);
chk('tres casillas identificadas cierran el avance',run('ramoProgress(S.ramos[0]).pct')===100);

console.log('\n=== Lo antiguo y ambiguo no se reasigna ===');
const legado=run(`normalize({...freshState(),ramos:[{
  id:'viejo',nombre:'Ramo viejo',color:'#123456',origen:null,gates:[],
  categorias:[{id:'informes-viejos',nombre:'Informes',peso:100,directNota:true,slots:3,
    notas:[{id:'simulada-vieja',nombre:'Simulada 1',valor:6,peso:1}]}]
}]}).ramos[0]`);
ctx.__legado=legado;
chk('una simulada antigua sin slot sigue sin slot',!Object.hasOwn(legado.categorias[0].notas[0],'slot'));
chk('no se inventa avance para esa nota ambigua',run('ramoProgress(__legado).pct')===0);
chk('su promedio guardado tampoco se mueve',run('ramoAvg(__legado)')===6);

console.log('\n=== Una categoría abierta conserva el flujo anterior ===');
run(`
  S={...freshState(),ramos:[{
    id:'abierto',nombre:'Ramo abierto',color:'#123456',origen:null,gates:[],
    categorias:[{id:'tareas',nombre:'Tareas',peso:100,directNota:false,notas:[]}]
  }]};currentRamoId='abierto';simState={};
`);
get('sim-in-tareas').value='5,0';run("simAddNota('tareas')");run('simCommit()');
const tarea=run('S.ramos[0].categorias[0].notas[0]');
chk('sin cantidad declarada sigue guardando una nota sin slot',tarea.valor===5&&!Object.hasOwn(tarea,'slot'));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
