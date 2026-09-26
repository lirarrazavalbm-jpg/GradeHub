// Los reportes de pauta UC se agrupan por sigla. Hasta el 2026-09-26, los
// ramos agregados antes de que su sigla estuviera en el catálogo guardaban el
// NOMBRE como ramoKey, y ese nombre viajaba como si fuera la sigla: el mismo
// ramo quedaba en dos grupos y el consenso no llegaba a tres. Curso sintético.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:stub,querySelector:()=>stub,querySelectorAll:()=>[],body:stub,head:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(['data.js','engine.js','app.js'].map(leer).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
var __r;run("S={ramos:[],tenant:'uc',carrera:'ING-PC',careerSemestre:2,onboardingDone:true,historial:[],sortMode:'manual'};");
run("agregarCursosUcRemotos([{sigla:'ZZZ110C',nombre:'Ramo Sintético de Prueba',creditos:10}])");
const ramo=(extra)=>JSON.stringify(Object.assign({id:'r',nombre:'Ramo Sintético de Prueba',categorias:[],gates:[]},extra));

console.log('=== La sigla del reporte tiene forma de sigla ===');
chk('un ramoKey que es el nombre no viaja como sigla',run(`siglaReporteUC(${ramo({origen:{tenant:'uc',carrera:'ING-PC',ramoKey:'ramo sintetico de prueba'}})})`)==='ZZZ110C');
chk('la sigla guardada en el ramo manda',run(`siglaReporteUC(${ramo({sigla:'ZZZ110C',origen:{tenant:'uc',ramoKey:'ramo sintetico de prueba'}})})`)==='ZZZ110C');
chk('un ramoKey que ya es sigla se respeta',run(`siglaReporteUC(${ramo({nombre:'Otro Nombre Cualquiera',origen:{tenant:'uc',ramoKey:'zzz999'}})})`)==='ZZZ999');
chk('sin sigla resoluble, null (el servidor agrupa por nombre)',run(`siglaReporteUC(${ramo({nombre:'Nombre Que No Está',origen:{tenant:'uc',ramoKey:'nombre que no esta'}})})`)===null);
chk('fuera de la UC no hay sigla',run(`siglaReporteUC(${ramo({origen:{tenant:'fen',ramoKey:'ramo sintetico de prueba'}})})`)===null);

console.log('\n=== La clave del consenso es la misma que usa el servidor ===');
chk('el ramo con el nombre como ramoKey encuentra el consenso de su sigla',run(`claveReporte(${ramo({origen:{tenant:'uc',ramoKey:'ramo sintetico de prueba'}})})`)==='ZZZ110C');
chk('sin sigla, sigue con su ramoKey como antes',run(`claveReporte(${ramo({nombre:'Nombre Que No Está',origen:{tenant:'uc',ramoKey:'nombre que no esta'}})})`)==='nombre que no esta');
chk('en FEN no cambia nada',run(`claveReporte(${ramo({origen:{tenant:'fen',ramoKey:'ramo sintetico de prueba'}})})`)==='ramo sintetico de prueba');
chk('el ramoKey guardado no se reescribe',(()=>{run(`__r=${ramo({origen:{tenant:'uc',ramoKey:'ramo sintetico de prueba'}})};claveReporte(__r)`);return run('__r.origen.ramoKey')==='ramo sintetico de prueba';})());

console.log('\n=== El servidor exige la misma forma ===');
const sql=leer('supabase/catalog_consensus.sql');
chk('es_sigla_uc usa la misma regla que la app',/p ~ '\^\[A-Z0-9_\]\{3,12\}\$' and p ~ '\[0-9\]'/.test(sql)&&/\^\[A-Z0-9_\]\{3,12\}\$/.test(leer('app.js')));
chk('el reporte sin sigla válida se resuelve contra catalogo_uc',/not public\.es_sigla_uc\(sigla\)[\s\S]*sigla_catalogo_uc\(p_ramo\)/.test(sql));
chk('y los reportes guardados se corrigen una vez, sin tocar la estructura',/update public\.catalog_reports\s+set ramo_sigla = public\.sigla_catalogo_uc\(ramo\)/.test(sql));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
