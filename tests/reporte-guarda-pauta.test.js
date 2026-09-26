// "Reportar pauta" deja corregir nombres, porcentajes y filas. Hasta el
// 2026-09-26 eso solo viajaba al servidor y la ficha seguía con la pauta
// anterior: parecía que la corrección se había borrado. Ahora queda también en
// el ramo, sin perder notas, fechas ni reglas. Pauta de ejemplo escrita acá.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=c=>vm.runInContext(c,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const ramo=()=>({id:'r1',nombre:'Biología de prueba',origen:null,gates:[],categorias:[
  {id:'c1',nombre:'Controles',peso:20,directNota:true,slots:5,notas:[{id:'n1',nombre:'Control 1',slot:0,valor:6.1,peso:1}]},
  {id:'i1',nombre:'Interrogación 1',peso:40,directNota:true,fecha:'2026-10-01',notas:[{id:'n2',nombre:'Interrogación 1',valor:5.4,peso:1}]},
  {id:'ex',nombre:'Examen',peso:40,directNota:true,notas:[]}]});
const aplicar=(r,borrador)=>{ctx.__r=r;ctx.__b=borrador;return run('aplicarReporteAlRamo(__r,__b)');};

console.log('=== Lo corregido en el reporte queda en el ramo ===');
let r=ramo();
let res=aplicar(r,[{nombre:'Controles',peso:20,slots:5},{nombre:'Interrogación 1',peso:30},{nombre:'Interrogación 2',peso:30},{nombre:'Examen',peso:20}]);
const cat=n=>r.categorias.find(c=>c.nombre===n);
chk('se aplica',res==='aplicada');
chk('los porcentajes nuevos quedan',cat('Interrogación 1').peso===30&&cat('Examen').peso===20);
chk('la evaluación nueva aparece',cat('Interrogación 2')&&cat('Interrogación 2').peso===30);
chk('las notas se conservan',cat('Controles').notas[0].valor===6.1&&cat('Interrogación 1').notas[0].valor===5.4);
chk('y la fecha y el id de lo que sigue',cat('Interrogación 1').fecha==='2026-10-01'&&cat('Interrogación 1').id==='i1');
chk('las casillas se mantienen',cat('Controles').slots===5);

console.log('\n=== Nada se pierde ===');
r=ramo();
aplicar(r,[{nombre:'Controles',peso:20,slots:5},{nombre:'Examen',peso:80}]);
const fuera=r.categorias.find(c=>c.nombre==='Interrogación 1');
chk('una evaluación con nota que sale de la pauta queda en 0% con su nota',fuera&&fuera.peso===0&&fuera.fueraDePauta&&fuera.notas[0].valor===5.4);
r=ramo();
chk('sin cambios no se toca nada',aplicar(r,[{nombre:'Controles',peso:20,slots:5},{nombre:'Interrogación 1',peso:40},{nombre:'Examen',peso:40}])==='igual'&&r.categorias.length===3);
chk('filas sin nombre se ignoran',(r=>aplicar(r,[{nombre:'  ',peso:0}])==='igual'&&r.categorias.length===3)(ramo()));

console.log('\n=== Una regla de aprobación no se pierde en silencio ===');
r=ramo();r.gates=[{type:'min_grade_required',catId:'ex',min:3.5,cap:3.9}];
chk('si el reporte quita la evaluación con regla, no se aplica',aplicar(r,[{nombre:'Controles',peso:20,slots:5},{nombre:'Interrogación 1',peso:80}])==='regla'&&r.categorias.find(c=>c.id==='ex').peso===40);
r=ramo();r.gates=[{type:'min_grade_required',catId:'ex',min:3.5,cap:3.9}];
chk('si solo cambia su porcentaje, se aplica y la regla sigue apuntando a ella',aplicar(r,[{nombre:'Controles',peso:20,slots:5},{nombre:'Interrogación 1',peso:30},{nombre:'Examen',peso:50}])==='aplicada'&&r.categorias.some(c=>c.id==='ex'&&c.peso===50));

console.log('\n=== El envío guarda primero ===');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const envio=app.slice(app.indexOf('async function enviarReporte'),app.indexOf('async function cargarConsenso'));
chk('la pauta se guarda antes de llamar al servidor',envio.indexOf('aplicarReporteAlRamo')>-1&&envio.indexOf('aplicarReporteAlRamo')<envio.indexOf("rpc('submit_catalog_report'"));
chk('si el envío falla, lo dice sin decir que se perdió',/Tu pauta qued\\u00f3 guardada, pero el reporte no se pudo enviar/.test(envio));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
