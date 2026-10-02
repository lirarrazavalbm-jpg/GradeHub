// Elegir el destino de una fecha del calendario redibuja la lista. Reportado el
// 2026-09-21: cada elección la devolvía arriba y había que volver a bajar.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
let lista=null,enfocado=null;
function elemento(){return {innerHTML:'',textContent:'',value:'',dataset:{},style:{setProperty(){}},
  classList:{add(){},remove(){},contains(){return false}},addEventListener(){},appendChild(){},focus(){},
  setAttribute(){},removeAttribute(){},querySelector(){return null},querySelectorAll(){return []}};}
const modal=elemento();
Object.defineProperty(modal,'innerHTML',{set(){
  // Cada render crea una lista nueva arriba del todo, como el navegador.
  const selects=Array.from({length:12},(_,i)=>({focus(o){enfocado={i,o};}}));
  lista={scrollTop:0,querySelectorAll:()=>selects};
},get(){return '';}});
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:id=>id==='modal-content'?modal:id==='ics-revision-lista'?lista:elemento(),
    querySelector:()=>elemento(),querySelectorAll:()=>[],createElement:elemento,addEventListener(){},
    documentElement:elemento(),body:elemento(),head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){}};
vm.createContext(ctx);
for(const f of ['data.js','engine.js','app.js'])vm.runInContext(fs.readFileSync(path.join(raiz,f),'utf8'),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
let fallos=0;const chk=(n,ok)=>{console.log(`  ${ok?'OK  ':'FAIL'} ${n}`);if(!ok)fallos++;};

console.log('\n=== Asignar una fecha del calendario no mueve la lista ===');
run(`S.ramos=[{id:'r1',nombre:'Ramo de prueba',categorias:[{id:'c1',nombre:'Prueba',peso:100,notas:[]}]}];
  icsImportDraft=Array.from({length:12},(_,i)=>({titulo:'Evento '+(i+1),fecha:'2026-10-'+(10+i),target:null}));
  renderRevisionIcs();`);
lista.scrollTop=640;
run(`asignarDestinoIcs(10,claveDestinoIcs(destinosIcs()[0]))`);
chk('la lista queda donde estaba',lista.scrollTop===640);
chk('el foco vuelve al mismo selector sin desplazar',!!enfocado&&enfocado.i===10&&enfocado.o&&enfocado.o.preventScroll===true);
chk('la elección quedó guardada',run('icsImportDraft[10].target')===run('claveDestinoIcs(destinosIcs()[0])'));

console.log(fallos?`\nFAIL: ${fallos}`:'\nRevisión de calendario OK');
process.exit(fallos?1:0);
