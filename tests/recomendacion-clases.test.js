// La recomendación de clases en Inicio: una en la mañana y una en la tarde
// (decisión de Lucas del 2026-09-25), elegida en el navegador, que se cierra
// hasta la próxima franja y que nunca se guarda en gradehub_v1.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','app-session.js','marketplace.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const guardado={};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem:k=>k in guardado?guardado[k]:null,setItem:(k,v)=>{guardado[k]=String(v);},removeItem:k=>{delete guardado[k];}},
  navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// Pauta de ejemplo escrita acá, no sacada del catálogo.
const nota=(slot,valor)=>({id:'n'+slot,nombre:'Informe '+slot,slot,valor,peso:1});
const ramo=(id,valores)=>({id,nombre:'Cálculo I',sigla:'MAT1610',origen:{tenant:'uc',ramoKey:'MAT1610'},gates:[],categorias:[
  {id:'informes',nombre:'Informes',peso:70,slots:6,directNota:true,notas:valores.map((v,i)=>nota(i,v))},
  {id:'examen',nombre:'Examen',peso:30,directNota:true,notas:[]}]});
const aviso=(id)=>({id,tenant:'uc',ramos_siglas:['MAT1610'],criterios:{promedioMenorA:4,avanceMinimo:20},estado:'publicado',vence_at:'2099-01-01T00:00:00Z',titulo:'Cálculo I',precio_clp:15000});
const lunes=Date.parse('2026-09-28T09:00:00'),lunesTarde=Date.parse('2026-09-28T16:00:00'),martes=Date.parse('2026-09-29T09:00:00');
ctx.__avisos=[aviso('a1'),aviso('a2')];
const dia=(ramos,estado,t,visita='v1')=>{ctx.__r=ramos;ctx.__e=estado;ctx.__t=t;ctx.__v=visita;return run("recomendacionDelDia(__avisos,__r,'uc',__e,__t,__v)");};
const complicado=[ramo('r1',[3.5,3.5])],bien=[ramo('r1',[5.5,5.5])];

console.log('=== Una en la mañana y una en la tarde ===');
let r=dia(complicado,{},lunes);
chk('elige una clase cuando el ramo calza',r.sel&&r.sel.anuncio.id==='a1'&&r.sel.ramo.id==='r1');
chk('y anota la franja, la visita y cuál fue',r.estado.franja==='2026-09-28-manana'&&r.estado.visita==='v1'&&r.estado.anuncioId==='a1');
const manana=r.estado;
chk('en la misma visita se mantiene al volver a Inicio',dia(complicado,manana,lunes+3600e3).sel?.anuncio.id==='a1');
chk('si vuelve a entrar esa mañana, no aparece',dia(complicado,manana,lunes+3600e3,'v2').sel===null);
chk('en la tarde vuelve a aparecer',dia(complicado,manana,lunesTarde,'v2').sel?.anuncio.id==='a1');
chk('si sube la nota, desaparece en vez de quedar pegada',dia(bien,manana,lunes).sel===null);
chk('sin un ramo que calce, no hay nada',dia(bien,{},lunes).sel===null);
// Pasó en la prueba del 2026-09-25: Inicio se abrió antes de publicar la clase
// y la clase no apareció hasta el día siguiente.
chk('una franja sin nada que mostrar no queda tomada',(r=>r.sel===null&&!r.estado.franja)(dia(bien,{},lunes)));
ctx.__avisos=[];const vacio=dia(complicado,{},lunes).estado;ctx.__avisos=[aviso('a1'),aviso('a2')];
chk('si la clase se publica más tarde, aparece',dia(complicado,vacio,lunes+3600e3,'v2').sel?.anuncio.id==='a1');
chk('un estado de la versión anterior (una sola vez cerrada) no la descarta',dia(complicado,{dia:'2026-09-28',anuncioId:null,cerradaHoy:true,descartados:['a1']},lunes).sel?.anuncio.id==='a1');

console.log('\n=== Cerrarla ===');
run(`descartarRecomendacionClase('a1',${lunes},'v1')`);
const tras=JSON.parse(guardado.gradehub_marketplace_v1);
chk('cerrarla la esconde por esta franja, aun en la misma visita',dia(complicado,tras,lunes).sel===null);
chk('pero no la descarta para siempre: en la tarde vuelve',dia(complicado,tras,lunesTarde,'v2').sel?.anuncio.id==='a1');
chk('y al día siguiente también',dia(complicado,tras,martes,'v3').sel?.anuncio.id==='a1');
chk('la primera vez no dice "no te la volvemos a mostrar"',run(`descartarRecomendacionClase('a2',${lunes},'v1')`)===false);
chk('la segunda vez sí, y la descarta para siempre',run(`descartarRecomendacionClase('a1',${lunesTarde},'v2')`)===true);
const dos=JSON.parse(guardado.gradehub_marketplace_v1);
chk('esa clase ya no vuelve, ni otro día',(r=>r.sel&&r.sel.anuncio.id==='a2')(dia(complicado,dos,martes,'v4')));
ctx.__avisos=[aviso('a1')];
chk('si era la única que calzaba, no hay nada',dia(complicado,dos,martes,'v5').sel===null);
ctx.__avisos=[aviso('a1'),aviso('a2')];

console.log('\n=== Dónde vive ===');
chk('se guarda en su propia clave, no en gradehub_v1',!('gradehub_v1' in guardado)&&'gradehub_marketplace_v1' in guardado);
guardado.gradehub_marketplace_v1='{roto';
chk('un valor dañado no rompe Inicio',JSON.stringify(run('leerEstadoMarketplace()'))==='{}');
const mk=fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8'),rm=fs.readFileSync(path.join(raiz,'render-main.js'),'utf8');
const bloque=mk.slice(mk.indexOf('function pintarRecomendacionClase'),mk.indexOf('async function abrirClaseRecomendada'));
const contenido=mk.slice(mk.indexOf('function contenidoRecomendacionClase'),mk.indexOf('function pintarRecomendacionClase'));
chk('el banner dice publicidad, igual que la vista previa del profesor',
  /Publicidad · Clase particular/.test(contenido)&&/contenidoRecomendacionClase\(anuncio\)/.test(bloque));
chk('y no diagnostica',!/reprob|riesgo|mal en|te va mal/i.test(bloque+contenido));
chk('solo Inicio lo pinta',/pintarRecomendacionClase\(c\)/.test(rm.slice(rm.indexOf('function renderHome'),rm.indexOf('function renderRamo')))&&
  !/pintarRecomendacionClase/.test(rm.slice(rm.indexOf('function renderRamo'))));
chk('el alcance se registra como recomendación',/registrarAlcanceAnuncio\(anuncio\.id,'recomendacion'\)/.test(mk));
chk('hay un interruptor para apagarlo',/const RECOMENDACIONES_CLASES_ACTIVAS=/.test(mk));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
