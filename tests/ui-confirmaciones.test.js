// Flujos de interfaz que pueden fallar sin lanzar una excepción. No pretende
// emular un navegador completo: modela solo el DOM que cada flujo toca y permite
// hacer clic, observar visibilidad y leer el siguiente estado.
const fs=require('fs'),vm=require('vm'),child=require('child_process');
const raiz=__dirname+'/../';

function elemento(){
  const clases=new Set();
  return {
    style:{setProperty(){},removeProperty(){}},textContent:'',innerHTML:'',value:'',className:'',onclick:null,parentElement:null,
    classList:{add:c=>clases.add(c),remove:c=>clases.delete(c),contains:c=>clases.has(c)},
    addEventListener(){},focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},
    querySelector(){return null;},querySelectorAll(){return [];},appendChild(){},remove(){},dataset:{},clientWidth:400,
  };
}
function arnes(src){
  const ids={};const get=id=>ids[id]||(ids[id]=elemento());
  const action=get('confirm-action'),cancelar=elemento(),botones=elemento();
  action.parentElement=botones;botones.querySelector=s=>s==='.btn-cancel-sm'?cancelar:null;
  const stub=elemento();
  const ctx={
    window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
    document:{getElementById:get,createElement:elemento,addEventListener(){},documentElement:{...elemento(),style:{setProperty(){},removeProperty(){}}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},
    setTimeout:fn=>fn(),clearTimeout(){},console,
  };
  vm.createContext(ctx);vm.runInContext(src,ctx);return {ctx,ids,action};
}
function fuente(ref){
  const leer=f=>ref?child.execFileSync('git',['show',`${ref}:${f}`],{cwd:raiz,encoding:'utf8'}):fs.readFileSync(raiz+f,'utf8');
  return ['data.js','engine.js','app.js','render-agenda.js'].map(leer).join('\n');
}
function segundoDialogoVisible(kit){
  kit.ctx.showConfirm('Primero','',()=>kit.ctx.showConfirm('Segundo','',()=>{}, {label:'Seguir'}),{label:'Continuar'});
  kit.action.onclick();
  return kit.ids['confirm-overlay'].classList.contains('open')&&kit.ids['confirm-title'].textContent==='Segundo';
}
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n)}else{fail++;console.log('  FAIL '+n)}};

console.log('\n=== Confirmaciones encadenadas ===');
chk('el segundo diálogo queda visible después del clic',segundoDialogoVisible(arnes(fuente(null))));
// 071e86b es el arreglo; d24f16a es el commit anterior donde closeConfirm se
// ejecutaba después del callback y ocultaba el siguiente diálogo.
chk('el arnés habría detectado el bug antes del arreglo',!segundoDialogoVisible(arnes(fuente('d24f16a'))));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
