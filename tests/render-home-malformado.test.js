// Home vacía #home-ramos antes de redibujarla. Una categoría heredada sin
// `notas` no puede convertir esa lista en una pantalla en blanco: el ramo debe
// seguir visible para que la persona sepa que sus datos no desaparecieron.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');

function classList(){const clases=new Set();return{add(...xs){xs.forEach(x=>clases.add(x));},remove(...xs){xs.forEach(x=>clases.delete(x));},contains(x){return clases.has(x);}};}
function el(){
  let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},
    addEventListener(){},appendChild(hijo){this.children.push(hijo);return hijo;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},closest(){return nodo;},focus(){},select(){},click(){},remove(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;
}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

console.log('\n=== Home conserva la lista ante una categoría incompleta ===');
vm.runInContext(`
  S={...freshState(),tenant:'uc',userName:'Persona Sintética',careerSemestre:2,onboardingDone:true,ramos:[{
    id:'ramo-heredado',nombre:'Ramo heredado',color:'#6d5dd3',categorias:[
      {id:'cat-mal',nombre:'control',peso:100,directNota:true}
    ]
  }]};
`,ctx);

let error=null;try{val('renderHome')();}catch(e){error=e;}
const filas=byId('home-ramos').children;
chk('no cae después de vaciar la lista',error===null);
chk('el ramo sigue visible',filas.length===1&&filas[0].innerHTML.includes('Ramo heredado'));
chk('la evaluación incompleta se presenta sin notas',filas[0]?.innerHTML.includes('1 evaluación'));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
