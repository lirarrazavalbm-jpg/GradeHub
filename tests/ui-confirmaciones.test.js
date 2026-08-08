// Flujos de interfaz que pueden fallar sin lanzar una excepción. No pretende
// emular un navegador completo: modela solo el DOM que cada flujo toca y permite
// hacer clic, observar visibilidad y leer el siguiente estado.
const fs=require('fs'),vm=require('vm');
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
function fuente(){
  return ['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
}
// El arnés solo sirve si falla cuando el bug vuelve. En vez de traerse un commit
// viejo con `git show` —que además revienta en CI, donde el clon es shallow—,
// revierte el arreglo EN MEMORIA: cambia el orden de closeConfirm y el callback
// por el que tenía en producción, y comprueba que el arnés lo caza.
const ARREGLO=`const confirmar=_confirmFn;
    closeConfirm();
    if(confirmar)confirmar();`;
const ROTO='if(_confirmFn)_confirmFn();closeConfirm();';
function fuenteConElBugDeVuelta(){
  const src=fuente();
  if(!src.includes(ARREGLO))throw new Error('showConfirm cambió de forma: este test ya no sabe revertir el arreglo. Actualízalo — sin esto el arnés no está probado.');
  return src.replace(ARREGLO,ROTO);
}
function segundoDialogoVisible(kit){
  kit.ctx.showConfirm('Primero','',()=>kit.ctx.showConfirm('Segundo','',()=>{}, {label:'Seguir'}),{label:'Continuar'});
  kit.action.onclick();
  return kit.ids['confirm-overlay'].classList.contains('open')&&kit.ids['confirm-title'].textContent==='Segundo';
}
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n)}else{fail++;console.log('  FAIL '+n)}};

console.log('\n=== Confirmaciones encadenadas ===');
chk('el segundo diálogo queda visible después del clic',segundoDialogoVisible(arnes(fuente())));
chk('y el arnés lo caza si alguien devuelve el orden viejo',!segundoDialogoVisible(arnes(fuenteConElBugDeVuelta())));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
