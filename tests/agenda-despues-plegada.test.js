// "Después" no cae entera de una.
//
// Con un semestre cargado son quince o veinte evaluaciones seguidas, y una
// lista así deja de ser una agenda: hay que recorrerla para saber qué viene,
// que es justo lo que la pantalla venía a resolver.
//
// Se muestran tres enteras y la cuarta a medio salir, borrosa, para que se
// entienda que hay más sin leer un número. Las dos prioridades no se tocan.
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

const pintar=cuantas=>{
  ctx.__n=cuantas;
  vm.runInContext(`
    var __fecha=n=>{var x=new Date();x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);};
    var cats=[];for(var i=0;i<__n;i++)cats.push({id:'c'+i,nombre:'Evaluación '+(i+1),peso:100/__n,fecha:__fecha(i+2),notas:[]});
    S=normalize({tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',color:'#6d5dd3',creditos:10,origen:null,gates:[],categorias:cats}]});
    renderAgenda();`,ctx);
  return byId('agenda-body').innerHTML;
};
// El fantasma lleva su clase ANTES de `ag-event-row`, así que contar por
// `class="ag-event ag-event-row` lo dejaba fuera. Se cuenta el sufijo.
const filas=h=>(h.match(/ag-event-row/g)||[]).length;

console.log('\n=== Con muchas evaluaciones se pliega ===');
let h=pintar(9);
// `ag-event-priority-sec` contiene `ag-event-priority`, así que se distinguen
// por la comilla de cierre: una principal y una secundaria.
chk('las prioridades siguen siendo 2',
  (h.match(/ag-event-priority"/g)||[]).length===1 && (h.match(/ag-event-priority-sec"/g)||[]).length===1);
chk('en Después se dibujan 4 filas: 3 enteras y la que asoma', filas(h)===4);
chk('la cuarta va marcada como fantasma', /ag-event-fantasma/.test(h));
chk('y hay un botón que dice cuántas faltan', /Ver 4 más/.test(h));

console.log('\n=== Al desplegar se muestran todas ===');
vm.runInContext('toggleRestantesAgenda();',ctx);
h=byId('agenda-body').innerHTML;
chk('ya no hay fantasma', !/ag-event-fantasma/.test(h));
chk('se dibujan las 7 restantes', filas(h)===7);
chk('y aparece "Ver menos"', /Ver menos/.test(h));
vm.runInContext('toggleRestantesAgenda();',ctx);

console.log('\n=== Con pocas no se pliega nada ===');
// 2 prioridades + 3 restantes: no sobra ninguna, así que no hay fantasma.
h=pintar(5);
chk('no aparece el fantasma', !/ag-event-fantasma/.test(h));
chk('ni el botón de ver más', !/ag-rest-ver/.test(h));
chk('y se dibujan las 3 restantes', filas(h)===3);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
