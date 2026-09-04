// El paso 2 pregunta dónde estudias. Si llega con una universidad puesta y
// "Continuar" habilitado, quien no se fija avanza con la que la app eligió por
// él: termina en las carreras de la otra universidad —donde la primera opción
// de FEN es "Ingeniería Comercial"— y se lleva la malla, los colores y el
// vocabulario que no son los suyos, sin que nada falle.
//
// `selectedTenant` nace en 'fen' porque la app tiene que pintarse de algo antes
// de saber quién eres. Este test fija que empezar el onboarding lo limpia.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const app=process.env.GRADEHUB_APP||raiz+'app.js';
const src=['data.js','engine.js'].map(f=>fs.readFileSync(raiz+f,'utf8'))
  .concat(fs.readFileSync(app,'utf8'),fs.readFileSync(raiz+'render-main.js','utf8'),fs.readFileSync(raiz+'render-agenda.js','utf8')).join('\n');

const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,clientHeight:400,scrollTop:0,dataset:{},click(){},closest(){return stub;},insertBefore(){},removeChild(){},remove(){},getBoundingClientRect(){return {top:0,left:0,width:0,height:0,bottom:0,right:0};},children:[],firstElementChild:null,contains(){return false;},disabled:false};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,gtag(){},requestAnimationFrame(){return 0;},cancelAnimationFrame(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== El paso 2 empieza sin universidad elegida ===');
run('obIniciar()');
chk('empezar el onboarding no deja una universidad puesta', !run('selectedTenant'));
chk('el paso 2 no se da por respondido solo', run('obStepValid(2)')===false);
// Parado EN el paso 2, no en el 1: si se mide con obStep=1 el botón sale
// deshabilitado por el nombre vacío y la aserción pasa siempre, mida o no el bug.
run('obStep=2');
chk('y parado en el paso 2, "Continuar" queda deshabilitado', run('(checkOb(),document.getElementById("ob-next").disabled)')===true);
run('obStep=1');

console.log('\n=== Elegir una sí lo responde ===');
run('selectTenant("uc")');
chk('elegir UC responde el paso', run('obStepValid(2)')===true && run('selectedTenant')==='uc');
run('obIniciar()');
chk('volver a empezar lo limpia otra vez', !run('selectedTenant'));

// Los tests que llaman obStepValid con datos explícitos (el embudo completo)
// no dependen del estado global y tienen que seguir funcionando igual.
chk('con datos explícitos sigue validando el dato, no la global',
  run('obStepValid(2,{tenant:"fen"})')===true && run('obStepValid(2,{tenant:""})')===false);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
