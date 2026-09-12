// Quitar una evaluación de una pauta completa no debería obligar al estudiante
// a resolver decimales periódicos. Revelación y Fe tiene tres evaluaciones de
// 20/20/30 y un examen de 30: al sacar el examen, las restantes mantienen su
// proporción y vuelven a sumar 100.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const appPath=process.env.GRADEHUB_APP||raiz+'app.js';
const src=[raiz+'data.js',raiz+'engine.js',appPath,raiz+'app-session.js',raiz+'render-main.js',raiz+'render-agenda.js']
  .map(f=>fs.readFileSync(f,'utf8')).join('\n');

function elemento(){return {style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},appendChild(){},remove(){},focus(){this.focused=true},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return null},querySelectorAll(){return []},value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},clientWidth:375,clientHeight:600,children:[]};}
const ids={};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:id=>ids[id]||(ids[id]=elemento()),createElement:elemento,addEventListener(){},querySelector(){return elemento()},querySelectorAll(){return []},documentElement:elemento(),body:elemento()},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  getComputedStyle:()=>({getPropertyValue:()=>''}),setTimeout(fn){fn();return 0},clearTimeout(){},requestAnimationFrame(){return 0},cancelAnimationFrame(){},console,gtag(){}
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=codigo=>vm.runInContext(codigo,ctx);
let ok=0,fail=0;
function chk(nombre,cond){if(cond){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}}
function cerca(a,b){return Math.abs(a-b)<1e-9;}

console.log('\n=== El editor reparte el peso después de confirmar ===');
run(`
  pautaDraft=[
    {id:'e1',nombre:'Evaluación 1',peso:20,tieneNotas:false},
    {id:'e2',nombre:'Evaluación 2',peso:20,tieneNotas:false},
    {id:'e3',nombre:'Evaluación 3',peso:30,tieneNotas:false},
    {id:'ex',nombre:'Examen final',peso:30,tieneNotas:false}
  ];
  confirmacionPendiente=null;
  showConfirm=(titulo,cuerpo,accion)=>{confirmacionPendiente=accion;};
  renderPautaManualModal=()=>{};
  quitarPautaFila(3);
`);
chk('no cambia la pauta antes de confirmar',run('pautaDraft.length')===4);
run('confirmacionPendiente()');
const pesos=run('pautaDraft.map(f=>f.peso)');
chk('conserva la proporción 2:2:3',cerca(pesos[0]/pesos[2],2/3)&&cerca(pesos[1]/pesos[2],2/3));
chk('las evaluaciones restantes suman exactamente 100%',cerca(pesos.reduce((s,p)=>s+p,0),100));
chk('el editor reconoce la pauta como completa',run('estadoPauta(pautaDraft).lista')===true);

console.log('\n=== Tres tercios no exigen escribir 33,3 periódico ===');
run(`
  pautaDraft=[
    {id:'a',nombre:'A',peso:20,tieneNotas:false},
    {id:'b',nombre:'B',peso:20,tieneNotas:false},
    {id:'c',nombre:'C',peso:20,tieneNotas:false},
    {id:'ex',nombre:'Examen',peso:40,tieneNotas:false}
  ];
  quitarPautaFila(3);confirmacionPendiente();
`);
const tercios=run('pautaDraft.map(f=>f.peso)');
chk('los tres pesos quedan iguales',cerca(tercios[0],tercios[1])&&cerca(tercios[1],tercios[2]));
chk('los tercios internos siguen sumando 100%',cerca(tercios.reduce((s,p)=>s+p,0),100));
run("actualizarPautaPeso(0,'33,33')");
chk('el campo acepta decimales sin convertir 33,33 en 100',cerca(run('pautaDraft[0].peso'),33.33));

console.log('\n=== Una pauta incompleta no se completa inventando ===');
run(`
  pautaDraft=[
    {id:'a',nombre:'A',peso:30,tieneNotas:false},
    {id:'b',nombre:'B',peso:20,tieneNotas:false},
    {id:'c',nombre:'C',peso:10,tieneNotas:false}
  ];
  quitarPautaFila(2);confirmacionPendiente();
`);
chk('si antes no sumaba 100, conserva los pesos conocidos',run('pautaDraft.map(f=>f.peso).join("|")')==='30|20');

console.log('\n=== Borrar desde la ficha usa la misma regla y conserva notas ===');
run(`
  S={ramos:[{id:'r',nombre:'Ramo',categorias:[
    {id:'a',nombre:'A',peso:20,notas:[{id:'n',valor:5,peso:1}]},
    {id:'b',nombre:'B',peso:20,notas:[]},
    {id:'c',nombre:'C',peso:20,notas:[]},
    {id:'ex',nombre:'Examen',peso:40,notas:[]}
  ]}]};currentRamoId='r';save=()=>{};renderRamo=()=>{};
  confirmDeleteCat('ex');confirmacionPendiente();
`);
const ficha=run('S.ramos[0].categorias');
chk('la eliminación directa también deja 100%',cerca(ficha.reduce((s,c)=>s+c.peso,0),100));
chk('la nota que ya existía no cambia',ficha[0].notas.length===1&&ficha[0].notas[0].valor===5);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
