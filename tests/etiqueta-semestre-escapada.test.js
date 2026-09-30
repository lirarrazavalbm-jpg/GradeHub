// La etiqueta de un semestre archivado no puede llegar cruda al HTML.
//
// Barrido del 2026-09-29: Estadísticas arma "Vas 0,50 puntos sobre 2026-1."
// con `S.historial[].label` y lo pegaba en innerHTML sin esc(). Desde la app la
// etiqueta siempre sale de etiquetaSemestre(), pero un respaldo importado
// (confirmarImportar → normalize) la trae tal cual, y la CSP permite
// 'unsafe-inline': un <img src=x onerror=...> se ejecutaba. Inicio ya la
// escapaba; Estadísticas no.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);},toggle(){}};}
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

// Pauta sintética: un ramo con una nota este semestre y uno archivado con otra,
// para que Estadísticas tenga contra qué comparar.
const ramo=(id,valor)=>({id,nombre:'Ramo '+id,color:'#6d5dd3',creditos:null,origen:null,gates:[],
  categorias:[{id:'c'+id,nombre:'Prueba',peso:100,notas:[{id:'n'+id,nombre:'Prueba',valor,peso:1}]}]});
const estadisticas=label=>{
  ctx.__datos=JSON.stringify({tenant:'uc',onboardingDone:true,ramos:[ramo('a',5.5)],
    historial:[{id:'h1',label,gpa:5,ramos:[ramo('b',5.0)]}]});
  vm.runInContext(`S=normalize(JSON.parse(__datos));renderStats();`,ctx);
  return byId('stats-body').innerHTML;
};

console.log('\n=== Etiqueta maliciosa desde un respaldo ===');
const payload='<img src=x onerror=alert(1)>';
let h=estadisticas(payload);
chk('Estadísticas pinta la frase de comparación', h.includes('stats-situation-reading'));
chk('el <img del respaldo no queda crudo en el HTML', !h.includes('<img src=x'));
// El Historial de más abajo ya la escapaba; lo que se revisa es la frase.
const frase=(h.match(/stats-situation-reading">([^<]*)</)||[])[1]||'';
chk('la frase la muestra como texto escapado', frase.includes('&lt;img src=x onerror=alert(1)&gt;'));

console.log('\n=== Etiqueta normal, igual que antes ===');
h=estadisticas('2026-1');
chk('"Vas 0,50 puntos sobre 2026-1."', /Vas 0[.,]50 puntos sobre 2026-1\./.test(h));

console.log('\n=== normalize deja la etiqueta como texto ===');
const label=v=>{ctx.__h=v;return vm.runInContext(`normalize({ramos:[],historial:[{id:'h1',label:__h,ramos:[]}]}).historial[0].label`,ctx);};
chk('una etiqueta válida no cambia', label('2026-1')==='2026-1');
chk('ni una de verano', label('TAV 2026')==='TAV 2026');
chk('un número pasa a texto', label(2026)==='2026');
chk('una etiqueta ausente queda vacía, no "undefined"', label(undefined)==='');

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
