// El onboarding no puede ofrecer una salida que en realidad termina en silencio.
// Estos tres casos llegaron después de que #231 dejara carreras enteras fuera:
// no rompen JS, solo hacen que una persona crea que no puede seguir.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const app=process.env.GRADEHUB_APP||raiz+'app.js';
const src=['data.js','engine.js'].map(f=>fs.readFileSync(raiz+f,'utf8'))
  .concat(fs.readFileSync(app,'utf8'),fs.readFileSync(raiz+'render-main.js','utf8'),fs.readFileSync(raiz+'render-agenda.js','utf8')).join('\n');

const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,clientHeight:400,scrollTop:0,dataset:{},click(){},closest(){return stub;},insertBefore(){},removeChild(){},remove(){},getBoundingClientRect(){return {top:0,left:0,width:0,height:0,bottom:0,right:0};},children:[],firstElementChild:null,contains(){return false;}};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,gtag(){},requestAnimationFrame(){return 0;},cancelAnimationFrame(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function element(){
  const attrs={};
  return {style:{},value:'',innerHTML:'',textContent:'',hidden:true,className:'',onclick:null,children:[],focused:false,
    addEventListener(){},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},focus(){this.focused=true;},appendChild(node){this.children.push(node);return node;}};
}
const els=new Map();
const grid=element();
Object.defineProperty(grid,'innerHTML',{get(){return this._html||'';},set(v){this._html=v;this.children=[];}});
els.set('carrera-grid',grid);
ctx.document={getElementById:id=>els.get(id)||stub,createElement:()=>element(),addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub};

console.log('\n=== Ramo manual vacío explica qué falta ===');
const manual=element(),error=element();manual.value='   ';els.set('ob-manual-name',manual);els.set('ob-manual-error',error);
run('obRamos=[];obManualError="";renderObCoursePicker=()=>{};obRender=()=>{};');
chk('no se devuelve callado y devuelve el foco al campo',run('obAgregarManual()')===false&&/Escribe el nombre/.test(error.textContent)&&error.hidden===false&&manual.focused===true&&manual.getAttribute('aria-invalid')==='true');

console.log('\n=== Ninguna carrera declarable queda escondida ===');
run('selectedTenant="uc";carreraFiltro="";selectedCarrera=null;selectedCarreraNombre=null;initCarreraGrid();');
const total=run('carrerasDeclarables("uc").length');
const opciones=grid.children.filter(b=>b.className==='carrera-opt');
chk(`las ${total} carreras UC se pueden recorrer sin buscar`,opciones.length===total);

console.log('\n=== La salida manual existe aunque la búsqueda encuentre parecidos ===');
run('selectedTenant="uc";carreraFiltro="Pedagogía";selectedCarrera="ING-PC";selectedCarreraNombre=null;initCarreraGrid();');
const resultados=grid.children.filter(b=>b.className==='carrera-opt'&&!/^Usar /.test(b.innerHTML));
const salida=grid.children.find(b=>/^Usar /.test(b.innerHTML));
if(salida)salida.onclick();
chk('con resultados parciales igual permite declarar lo escrito',resultados.length>0&&!!salida&&run('selectedCarrera')===null&&run('selectedCarreraNombre')==='Pedagogía'&&run('obStepValid(3)')===true);

console.log('\nPASS: '+ok+'   FAIL: '+fail);process.exit(fail?1:0);
