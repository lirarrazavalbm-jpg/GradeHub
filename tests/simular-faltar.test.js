// Simular que faltas a una evaluación y elegir a dónde se va su porcentaje.
//
// Fuera del simulador esto exige que el programa declare la regla, y de 88
// pautas la declaran dos. Acá no hace falta: nadie está afirmando cuál es la
// regla de su curso, está preguntando qué le pasaría si fuera esa. Por eso la
// hipótesis no entra a S ni a gradehub_v1.
//
// Y no hay aritmética nueva: la ausencia se inyecta como si fuera una regla del
// programa y la resuelve el mismo motor que ya calcula las de Micro.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
['data.js','engine.js','app.js'].forEach(f=>vm.runInContext(fs.readFileSync(raiz+f,'utf8'),ctx));
const g=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const S=g('S'), proy=g('simProjectedAvg'), A=g('simAusencias');
const cerca=(a,b)=>a!==null&&Math.abs(a-b)<1e-9;
const limpiar=()=>{for(const k in A)delete A[k];};
// 3 interrogaciones de 20% + examen 40%. Rendidas: I1 con 5,0 y examen con 6,0.
S.ramos=[{id:'r1',nombre:'R',color:'#3aa',creditos:10,origen:null,gates:[],categorias:[
  {id:'i1',nombre:'Interrogación 1',peso:20,notas:[{id:'a',valor:5.0,peso:1}]},
  {id:'i2',nombre:'Interrogación 2',peso:20,notas:[]},
  {id:'i3',nombre:'Interrogación 3',peso:20,notas:[]},
  {id:'ex',nombre:'Examen',peso:40,notas:[{id:'b',valor:6.0,peso:1}]}]}];
g('currentRamoId');vm.runInContext('currentRamoId="r1"',ctx);
const r=S.ramos[0];

console.log('\n=== El porcentaje va a donde se elige ===');
limpiar();
chk('sin faltar: (5·20 + 6·40)/60 = 5,67', cerca(proy(r),(5*20+6*40)/60));
limpiar();A.i2={hacia:'ex',tipo:'traspaso'};
chk('el 20% de la I2 se suma al Examen → (5·20 + 6·60)/80 = 5,75', cerca(proy(r),(5*20+6*60)/80));
limpiar();A.i2={hacia:'ex',tipo:'reemplazo'};
chk('o la I2 toma la nota del Examen → (5·20 + 6·20 + 6·40)/80 = 5,75', cerca(proy(r),(5*20+6*20+6*40)/80));
limpiar();A.i2={hacia:'ex',tipo:'traspaso'};A.i3={hacia:'ex',tipo:'traspaso'};
chk('faltando a las dos, el Examen queda en 80% → 5,8', cerca(proy(r),(5*20+6*80)/100));
limpiar();A.i2={hacia:'i3',tipo:'traspaso'};
chk('el peso también puede ir a otra pendiente, y ahí no cambia nada todavía', cerca(proy(r),(5*20+6*40)/60));

console.log('\n=== La hipótesis no toca el ramo guardado ===');
limpiar();A.i2={hacia:'ex',tipo:'traspaso'};
proy(r);
chk('el ramo real sigue sin ausencias declaradas', !r.ausenciasJustificadas||r.ausenciasJustificadas.length===0);
chk('y sin reglas inventadas', !r.reglasAusenciaJustificada);
chk('su promedio real no cambia', cerca(g('ramoAvg')(r),(5*20+6*40)/60));

console.log('\n=== Solo se ofrece donde tiene sentido ===');
const puede=g('simPuedeFaltar');
chk('a una evaluación pendiente sí', puede(r.categorias[1])===true);
chk('a una que ya rendiste no', puede(r.categorias[0])===false);
g('simState')[r.categorias[2].id]=[{id:'h',valor:4}];
chk('ni a una con nota hipotética puesta', puede(r.categorias[2])===false);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
