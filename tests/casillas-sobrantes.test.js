// Una nota que quedó fuera de la pauta tiene que VERSE, porque sigue contando.
//
// Al bajar las casillas de una categoría —de 3 controles a 2— la nota del
// tercero se quedaba guardada y seguía pesando en el promedio, pero dejaba de
// dibujarse. Con 7,0 · 7,0 · 1,0 la ficha mostraba dos sietes y un promedio de
// 5,0, y no había nada en pantalla que explicara la diferencia. `normalize`
// tampoco la limpiaba al recargar, así que se quedaba así para siempre.
//
// No se deja de contar: es una nota que la persona escribió, y descontarla
// cambiaría el promedio de cuentas reales sin que nadie lo pidiera. Se muestra,
// que es lo mismo que hizo el #235 con las notas que salen de una pauta oficial.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);}};}
function el(){let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},
    addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

// Tres controles de 100%: 7,0 · 7,0 · 1,0 → promedio 5,0
ctx.__notas=[{id:'n1',nombre:'Control 1',slot:0,valor:7,peso:1},
             {id:'n2',nombre:'Control 2',slot:1,valor:7,peso:1},
             {id:'n3',nombre:'Control 3',slot:2,valor:1,peso:1}];
const pintar=slots=>{ctx.__slots=slots;
  vm.runInContext(`S=normalize({tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',color:'#6d5dd3',creditos:10,origen:null,gates:[],
    categorias:[{id:'c1',nombre:'Controles',peso:100,slots:__slots,notas:JSON.parse(JSON.stringify(__notas))}]}]});
    currentRamoId='r1';renderRamo();`,ctx);
  // El HTML vive en los nodos que renderRamo fue colgando de #cat-list, así
  // que hay que recorrerlos: leer solo el innerHTML del contenedor no alcanza.
  const juntar=n=>(n.innerHTML||'')+(n.children||[]).map(juntar).join('');
  return {html:juntar(byId('cat-list')), avg:vm.runInContext('ramoAvg(S.ramos[0])',ctx)};};

console.log('\n=== Con las tres casillas declaradas ===');
const tres=pintar(3);
chk('el promedio es 5,0', Math.abs(tres.avg-5)<1e-9);
chk('se dibujan las tres', (tres.html.match(/<div class="eval-sub/g)||[]).length===3);

console.log('\n=== Al bajar la pauta a dos casillas ===');
const dos=pintar(2);
chk('el promedio SIGUE siendo 5,0: la nota no se descarta', Math.abs(dos.avg-5)<1e-9);
chk('pero la tercera se sigue dibujando', (dos.html.match(/<div class="eval-sub/g)||[]).length===3);
chk('y queda marcada como sobrante', /eval-sub-sobra/.test(dos.html));
chk('con un aviso de que sigue contando', /sigue contando/.test(dos.html));

console.log('\n=== Sin sobrantes no aparece la marca ===');
const limpio=(()=>{ctx.__notas=[{id:'n1',nombre:'Control 1',slot:0,valor:7,peso:1}];return pintar(3);})();
chk('una categoría normal no muestra ningún sobrante', !/eval-sub-sobra/.test(limpio.html));
chk('y dibuja solo sus casillas declaradas', (limpio.html.match(/<div class="eval-sub/g)||[]).length===3);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
