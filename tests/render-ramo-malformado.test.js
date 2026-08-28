// La ficha limpia #cat-list antes de dibujar cada evaluación. Una categoría
// heredada sin `notas` no puede dejar en blanco las demás ni ocultarse: se
// muestra como una evaluación sin notas para que la persona pueda corregirla.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');

function classList(){const clases=new Set();return{add(...xs){xs.forEach(x=>clases.add(x));},remove(...xs){xs.forEach(x=>clases.delete(x));},contains(x){return clases.has(x);}};}
function el(){
  let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},
    addEventListener(){},appendChild(hijo){this.children.push(hijo);return hijo;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400};
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

console.log('\n=== La ficha tolera una categoría malformada ===');
vm.runInContext(`
  S={...freshState(),ramos:[{
    id:'ramo-heredado',nombre:'Ramo heredado',color:'#6d5dd3',
    categorias:[
      {id:'segunda',nombre:'segunda evaluación',peso:'40',directNota:true,notas:[{id:'n-2',nombre:'Nota',valor:5.2,peso:1}]},
      {nombre:'primera evaluación',peso:'60',directNota:true}
    ]
  }]};
  currentRamoId='ramo-heredado';
`,ctx);

let error=null;try{val('renderRamo')();}catch(e){error=e;}
const filas=byId('cat-list').children;
chk('no cae si una categoría no trae notas',error===null);
chk('mantiene visibles las dos categorías aunque vengan reordenadas',filas.length===2);
chk('conserva la categoría válida que venía antes',filas[0]?.innerHTML.includes('segunda evaluación'));
chk('dibuja la categoría sin notas como una fila vacía',filas[1]?.innerHTML.includes('primera evaluación')&&/placeholder="—"/.test(filas[1]?.innerHTML||''));
chk('acepta nombre en minúscula, peso como texto, ramo sin gates e id ausente',
  !error&&filas[0]?.innerHTML.includes('40%')&&filas[1]?.innerHTML.includes('60%'));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
