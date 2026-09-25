// La recomendación de clases en Inicio: una por día, elegida en el navegador,
// que se puede cerrar para siempre y que nunca se guarda en gradehub_v1.
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
const lunes=Date.parse('2026-09-28T12:00:00'),martes=Date.parse('2026-09-29T12:00:00');
ctx.__avisos=[aviso('a1'),aviso('a2')];
const dia=(ramos,estado,t)=>{ctx.__r=ramos;ctx.__e=estado;ctx.__t=t;return run("recomendacionDelDia(__avisos,__r,'uc',__e,__t)");};
const complicado=[ramo('r1',[3.5,3.5])],bien=[ramo('r1',[5.5,5.5])];

console.log('=== Una por día ===');
let r=dia(complicado,{},lunes);
chk('elige una clase cuando el ramo calza',r.sel&&r.sel.anuncio.id==='a1'&&r.sel.ramo.id==='r1');
chk('y deja anotado el día y cuál fue',r.estado.dia==='2026-09-28'&&r.estado.anuncioId==='a1');
const lunesEstado=r.estado;
chk('el mismo día muestra la misma',dia(complicado,lunesEstado,lunes+3600e3).sel?.anuncio.id==='a1');
chk('si ese día se cerró una, no aparece otra hasta mañana',
  dia(complicado,{dia:'2026-09-28',anuncioId:null,cerradaHoy:true},lunes).sel===null&&dia(complicado,{dia:'2026-09-28',anuncioId:null,cerradaHoy:true},martes).sel!==null);
chk('si sube la nota el mismo día, desaparece en vez de quedar pegada',dia(bien,lunesEstado,lunes).sel===null);
chk('sin un ramo que calce, no hay nada',dia(bien,{},lunes).sel===null);
// Pasó en la prueba del 2026-09-25: Inicio se abrió antes de publicar la clase,
// quedó anotado "hoy ninguna" y la clase no apareció hasta el día siguiente.
chk('un día sin nada que mostrar no bloquea el resto del día',(r=>r.sel===null&&!r.estado.dia)(dia(bien,{},lunes)));
ctx.__avisos=[];const vacio=dia(complicado,{},lunes).estado;ctx.__avisos=[aviso('a1'),aviso('a2')];
chk('si la clase se publica más tarde ese día, aparece',dia(complicado,vacio,lunes+3600e3).sel?.anuncio.id==='a1');
chk('un "hoy ninguna" que dejó la versión anterior no bloquea',dia(complicado,{dia:'2026-09-28',anuncioId:null},lunes).sel?.anuncio.id==='a1');

console.log('\n=== Cerrarla ===');
run(`descartarRecomendacionClase('a1',${lunes})`);
const tras=JSON.parse(guardado.gradehub_marketplace_v1);
chk('cerrarla la anota como descartada',tras.descartados.includes('a1'));
chk('no se reemplaza por otra el mismo día',dia(complicado,tras,lunes).sel===null);
r=dia(complicado,tras,martes);
chk('al día siguiente puede aparecer otra, pero nunca la cerrada',r.sel&&r.sel.anuncio.id==='a2');
ctx.__avisos=[aviso('a1')];
chk('si la única que calza es la cerrada, no vuelve',dia(complicado,tras,martes).sel===null);

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
