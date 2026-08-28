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
  const writes=[];
  const action=get('confirm-action'),cancelar=elemento(),botones=elemento();
  action.parentElement=botones;botones.querySelector=s=>s==='.btn-cancel-sm'?cancelar:null;
  const stub=elemento();
  const ctx={
    window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
    document:{getElementById:get,createElement:elemento,addEventListener(){},documentElement:{...elemento(),style:{setProperty(){},removeProperty(){}}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
    localStorage:{getItem(){return null},setItem(k,v){writes.push([k,v])},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},
    setTimeout:fn=>fn(),clearTimeout(){},console,
  };
  vm.createContext(ctx);vm.runInContext(src,ctx);return {ctx,ids,action,writes};
}
function fuente(){
  return ['data.js','engine.js','app.js','app-session.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
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

console.log('\n=== Orden manual de ramos ===');
const dragKit=arnes(fuente());
const fn=nombre=>vm.runInContext(`typeof ${nombre}==='function'?${nombre}:null`,dragKit.ctx);
const esperaReordenRamo=fn('esperaReordenRamo');
const movimientoCancelaReorden=fn('movimientoCancelaReorden');
const guardarOrdenRamos=fn('guardarOrdenRamos');
chk('touch exige sostener antes de mover y mouse responde al tiro',
  !!esperaReordenRamo&&esperaReordenRamo('touch')>=350&&esperaReordenRamo('mouse')===0);
chk('mover el dedo antes de activar cancela el drag para que la pantalla haga scroll',
  !!movimientoCancelaReorden&&!movimientoCancelaReorden(3,4)&&movimientoCancelaReorden(0,12));
vm.runInContext("S={ramos:[{id:'a',nombre:'A'},{id:'b',nombre:'B'},{id:'c',nombre:'C'}],sortMode:'manual'}",dragKit.ctx);
const guardado=guardarOrdenRamos&&guardarOrdenRamos(['c','a','b']);
const ultimo=dragKit.writes.filter(([k])=>k==='gradehub_v1').at(-1);
chk('soltar guarda el nuevo orden completo en gradehub_v1',
  guardado===true&&vm.runInContext("S.ramos.map(r=>r.id).join(',')",dragKit.ctx)==='c,a,b'&&
  !!ultimo&&JSON.parse(ultimo[1]).ramos.map(r=>r.id).join(',')==='c,a,b');
chk('un orden incompleto o con ids repetidos no puede borrar ramos',
  !!guardarOrdenRamos&&guardarOrdenRamos(['a','a','b'])===false&&
  vm.runInContext("S.ramos.map(r=>r.id).join(',')",dragKit.ctx)==='c,a,b');

// Mover con teclado tiene que conservar el foco en el asa, o cada paso obliga a
// tabular de nuevo hasta el ramo. Lo que lo garantiza es NO volver a dibujar la
// lista: se mueve el nodo, así que el asa enfocada nunca se destruye. Eso es lo
// que se comprueba acá, porque el foco mismo necesita un navegador de verdad.
const tecladoKit=arnes(fuente());
const filaFalsa=id=>({dataset:{ramoId:id},querySelector:()=>({textContent:'Ramo '+id})});
let redibujos=0;
vm.runInContext("renderHome=function(){__redibujo();};S={ramos:[{id:'a',nombre:'A'},{id:'b',nombre:'B'},{id:'c',nombre:'C'}],sortMode:'manual'};",tecladoKit.ctx);
tecladoKit.ctx.__redibujo=()=>{redibujos++;};
let orden=['a','b','c'];
const contenedor={
  querySelectorAll:()=>orden.map(filaFalsa),
  insertBefore(nodo,ref){
    const id=nodo.dataset.ramoId,antes=ref.dataset.ramoId;
    orden=orden.filter(x=>x!==id);
    orden.splice(orden.indexOf(antes),0,id);
  },
};
tecladoKit.ctx.document.getElementById=id=>id==='home-ramos'?contenedor:elemento();
const moverRamoConTeclado=vm.runInContext('moverRamoConTeclado',tecladoKit.ctx);
moverRamoConTeclado('a',1);
chk('la flecha mueve el ramo una posición',orden.join(',')==='b,a,c');
chk('y el estado guardado queda igual que lo que se ve',
  vm.runInContext("S.ramos.map(r=>r.id).join(',')",tecladoKit.ctx)==='b,a,c');
moverRamoConTeclado('a',-1);
chk('y vuelve para el otro lado',orden.join(',')==='a,b,c');
chk('sin volver a dibujar la lista: el asa enfocada sobrevive',redibujos===0);
// El tope: en el primero, subir no hace nada. Sin este guard el índice se sale
// del arreglo y el orden queda corrupto.
moverRamoConTeclado('a',-1);
chk('en el borde no pasa nada',orden.join(',')==='a,b,c');

const appSrc=fs.readFileSync(raiz+'app.js','utf8')+'\n'+fs.readFileSync(raiz+'app-session.js','utf8')+'\n'+fs.readFileSync(raiz+'render-main.js','utf8');
const indexSrc=fs.readFileSync(raiz+'index.html','utf8');
const homeSrc=appSrc.slice(appSrc.indexOf('function renderHome'),appSrc.indexOf('function renderRamo'));
chk('Manual usa un SVG en línea y no el carácter que iOS convierte en emoji',
  !homeSrc.includes('Manual ↕')&&!indexSrc.includes('Manual ↕')&&
  /sortBtn\.innerHTML=[\s\S]*?<svg[^>]*class="ic/.test(homeSrc)&&
  /id="sort-btn"[\s\S]{0,300}<svg[^>]*class="ic/.test(indexSrc));
chk('el arrastre se activa solo al renderizar el modo manual',
  /S\.sortMode===['"]manual['"][\s\S]{0,120}activarReordenRamos/.test(homeSrc));

console.log('\n=== Calendario desde Agenda ===');
chk('Agenda abre una elección y no descarga el archivo directamente',
  /id="agenda-export-btn"[^>]*onclick="openAgendaCalendarOptions\(\)"[^>]*>Calendario<\/button>/.test(indexSrc));
chk('la suscripción es el camino principal y lleva a su sección de Ajustes',
  /function openAgendaCalendarOptions\([\s\S]*?se actualiza sola[\s\S]*?class="btn-primary"[\s\S]*?function openCalendarSubscriptionFromAgenda\([\s\S]*?openSettings\(['"]calendario['"]\)/i.test(appSrc));
chk('exportar queda como copia secundaria con advertencia específica para iPhone',
  /function openAgendaCalendarOptions\([\s\S]*?copia del momento[\s\S]*?En iPhone[\s\S]*?calendario que ya existe[\s\S]*?exportarCalendario\(\)/i.test(appSrc));

// Importar es precisamente la puerta que necesita alguien cuya Agenda todavía
// está vacía. Este flujo llama al render y abre el menú: comprobar solo que el
// HTML contiene un botón no detectaría las dos guardas que lo ocultaban.
function calendarioDesdeAgendaSinFechas(src){
  const kit=arnes(src);
  return vm.runInContext(`
    S={ramos:[{id:'sin-fechas',nombre:'Ramo sin fechas',categorias:[{id:'i1',nombre:'I1',peso:100,notas:[]}]}]};
    let abrioModal=false;
    openModal=()=>{abrioModal=true;};
    showToast=()=>{};
    renderAgenda();
    const botonVisible=document.getElementById('agenda-export-btn').style.display==='block';
    openAgendaCalendarOptions();
    ({botonVisible,abrioModal,html:document.getElementById('modal-content').innerHTML});
  `,kit.ctx);
}
const calendarioVacio=calendarioDesdeAgendaSinFechas(fuente());
chk('con cero fechas, Agenda deja abrir el menú y llegar a importar un .ics',
  calendarioVacio.botonVisible&&calendarioVacio.abrioModal&&/abrirImportarCalendario\(\)/.test(calendarioVacio.html));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
