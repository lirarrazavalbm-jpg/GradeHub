// Antes de aprender fechas de otras personas hay que saber de dónde salió cada
// una. Si no, una fecha del catálogo o importada se replica como si fueran
// decisiones de estudiantes distintos y el consenso se amplifica solo.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return stub;},querySelectorAll(){return [];},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;
const chk=(nombre,cond)=>{console.log(`  ${cond?'OK  ':'FAIL'} ${nombre}`);if(cond)ok++;else fail++;};

console.log('\n=== Migración compatible de procedencia ===');
const normalize=val('normalize'),ramoAvg=val('ramoAvg');
const legado={ramos:[{id:'legado',nombre:'Ramo propio',origen:null,gates:[],categorias:[{
  id:'c',nombre:'Prueba',peso:100,fecha:'2026-09-10',hora:'14:00',notas:[{id:'n',nombre:'P1',valor:5,peso:1,fecha:'2026-09-10',hora:'14:00'}]
}]}]};
const antes=ramoAvg(legado.ramos[0]);
const despues=normalize(JSON.parse(JSON.stringify(legado))).ramos[0];
chk('una cuenta sin los campos nuevos conserva exactamente su promedio',ramoAvg(despues)===antes);
chk('una fecha antigua sin evidencia queda desconocida',
  despues.categorias[0].fechaOrigen==='desconocido'&&despues.categorias[0].horaOrigen==='desconocido'&&
  despues.categorias[0].notas[0].fechaOrigen==='desconocido'&&despues.categorias[0].notas[0].horaOrigen==='desconocido');

const PRESETS_UC=val('PRESETS_UC');
const oficial=Object.entries(PRESETS_UC).map(([nombre,def])=>{
  const ev=(Array.isArray(def)?def:def.evals||[]).find(x=>x[2]&&x[2].fecha);
  return ev&&{nombre,ev};
}).find(Boolean);
const catalogado=normalize({ramos:[{id:'oficial',nombre:oficial.nombre,origen:{tenant:'uc',carrera:'ING-PC'},categorias:[
  {id:'c',nombre:oficial.ev[0],peso:oficial.ev[1],fecha:oficial.ev[2].fecha,notas:[]}
]}]}).ramos[0];
chk('una coincidencia exacta con el programa se reconoce como catálogo',catalogado.categorias[0].fechaOrigen==='catalogo');
chk('la clave del ramo se persiste sin duplicar la tabla de siglas en SQL',catalogado.origen.ramoKey==='MAT1610'||/^[A-Z]{2,}\d+$/.test(catalogado.origen.ramoKey||''));

console.log('\n=== Entradas explícitas no se convierten en votos ===');
val('S='+JSON.stringify({ramos:[{id:'ics',nombre:'Cálculo II',categorias:[{id:'cat',nombre:'Interrogación 1',peso:100,fecha:null,notas:[]}]}]}));
const aplicar=val('aplicarPropuestasIcs');
aplicar([{titulo:'I1 Cálculo II',fecha:'2026-09-08',target:'ics|cat|'}]);
chk('una fecha importada queda marcada como calendario',val('S.ramos[0].categorias[0].fechaOrigen')==='calendario');
let cuentaFecha=null;try{cuentaFecha=val('fechaAportaRespaldo');}catch(e){}
chk('catálogo e importación nunca aportan respaldos',!!cuentaFecha&&!cuentaFecha(catalogado.categorias[0])&&!cuentaFecha(val('S.ramos[0].categorias[0]')));
let marcar=null;try{marcar=val('marcarFechaUsuario');}catch(e){}
const item={fecha:'2026-09-08',hora:'09:30',fechaOrigen:'desconocido',horaOrigen:'desconocido'};
if(marcar)marcar(item,item.fecha,item.hora);
chk('editar o confirmar una fecha la vuelve una decisión del estudiante',!!marcar&&item.fechaOrigen==='usuario'&&item.horaOrigen==='usuario');
chk('solo una fecha marcada por la persona aporta un respaldo',!!cuentaFecha&&cuentaFecha(item));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
