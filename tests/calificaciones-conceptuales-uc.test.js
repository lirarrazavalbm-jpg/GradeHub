// La UC permite calificar ciertas actividades con D, A o R. La letra es el
// dato que ve el estudiante en Mi UC; su equivalencia numérica es la que entra
// al motor. Ambas tienen que sobrevivir juntas sin extender la norma a FEN.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');

function elemento(){
  let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',checked:false,textContent:'',dataset:{},
    addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(k,v){attrs[k]=String(v)},removeAttribute(k){delete attrs[k]},getAttribute(k){return attrs[k]||null},
    querySelector(){return nodo},querySelectorAll(){return[]},focus(){},select(){},click(){},remove(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});
  return nodo;
}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector(){return elemento()},querySelectorAll(){return[]},body:elemento()},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,console,getComputedStyle:()=>({getPropertyValue:()=> '0ms'}),
};
vm.createContext(ctx);
['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'].forEach(f=>vm.runInContext(leer(f),ctx,{filename:f}));
const run=s=>vm.runInContext(s,ctx);
run('save=()=>{};track=()=>{};closeModal=()=>{};openModal=()=>{};showToast=()=>{};animarPromedio=()=>{};mostrarEcoGpa=()=>{};renderHome=()=>{};renderAgenda=()=>{};');
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++};

console.log('\n=== La norma existe solo para la UC ===');
const tabla=JSON.parse(run('JSON.stringify(CALIFICACIONES_CONCEPTUALES_POR_TENANT)'));
chk('la tabla declara exactamente D=7, A=5 y R=3 para UC',JSON.stringify(tabla.uc)===JSON.stringify({D:7,A:5,R:3}));
chk('FEN no hereda equivalencias ajenas',run("CALIFICACIONES_CONCEPTUALES_POR_TENANT.fen===undefined&&Number.isNaN(parseNota('A','fen'))"));
chk('D, A y R aceptan minúsculas y espacios',run("parseNota(' d ','uc')===7&&parseNota('a','uc')===5&&parseNota(' R ','uc')===3"));
chk('el tenant global se usa sin volver obligatorio el parámetro',run("S.tenant='uc';parseNota('A')===5"));
chk('C sigue fuera porque no tiene equivalencia numérica',run("Number.isNaN(parseNota('C','uc'))"));

console.log('\n=== Cuentas anteriores siguen siendo notas numéricas ===');
run(`S=normalize({tenant:'uc',ramos:[{id:'r1',nombre:'Taller',color:'#123456',creditos:10,gates:[],categorias:[
  {id:'directa',nombre:'Taller',peso:50,directNota:true,notas:[{id:'vieja',nombre:'Taller',valor:5,peso:1}]},
  {id:'grupo',nombre:'Seminarios',peso:50,directNota:true,slots:2,notas:[{id:'s1',nombre:'Seminario 1',valor:5,peso:1,slot:0,fecha:'2026-09-20',recorreccionPendiente:true}]}
]}]});currentRamoId='r1';`);
chk('una nota vieja sin campo sigue sin campo',run("!Object.hasOwn(S.ramos[0].categorias[0].notas[0],'calificacionConceptual')"));
chk('y sigue mostrando su número',run("textoCalificacionNota(S.ramos[0].categorias[0].notas[0])==='5.0'"));
const promedioNumerico=run('ramoAvg(S.ramos[0])'),gpaNumerico=run('gpa(S.ramos)');

console.log('\n=== La letra se guarda sin tocar el cálculo ===');
run("setDirectNota('directa','A')");
chk('la evaluación directa guarda letra y equivalencia',run("S.ramos[0].categorias[0].notas[0].calificacionConceptual==='A'&&S.ramos[0].categorias[0].notas[0].valor===5"));
run("setSlotNota('grupo',0,'a')");
chk('una casilla normaliza la letra a mayúscula',run("S.ramos[0].categorias[1].notas[0].calificacionConceptual==='A'&&S.ramos[0].categorias[1].notas[0].valor===5"));
chk('poner A sobre un 5 no mueve el promedio ni el GPA',run('ramoAvg(S.ramos[0])')===promedioNumerico&&run('gpa(S.ramos)')===gpaNumerico);
chk('A conserva el mismo semáforo de una nota 5,0',run("colorClass(parseNota('A'))===colorClass(5)&&getColor(parseNota('A'))===getColor(5)"));

console.log('\n=== Editar la casilla no pierde metadatos ni deja basura ===');
run("setSlotNota('grupo',0,'6,1')");
chk('la nota cambia y desaparece la letra anterior',run("S.ramos[0].categorias[1].notas[0].valor===6.1&&!Object.hasOwn(S.ramos[0].categorias[1].notas[0],'calificacionConceptual')"));
chk('la edición conserva fecha y recorrección',run("S.ramos[0].categorias[1].notas[0].fecha==='2026-09-20'&&S.ramos[0].categorias[1].notas[0].recorreccionPendiente===true"));

console.log('\n=== El editor de una nota abierta conserva y limpia la letra ===');
run("S.ramos[0].categorias.push({id:'abierta',nombre:'Actividades',peso:0,directNota:false,notas:[{id:'n1',nombre:'Actividad 1',valor:3,peso:1,calificacionConceptual:'R'}]})");
porId('m-nota-name').value='Actividad 2';porId('m-nota-val').value='A';porId('m-nota-fecha').value='';porId('m-pond-toggle').checked=false;
run("confirmAddNota('abierta')");
chk('agregar una nota abierta también conserva A',run("S.ramos[0].categorias[2].notas.some(n=>n.nombre==='Actividad 2'&&n.valor===5&&n.calificacionConceptual==='A')"));
run("openEditNotaModal('abierta','n1')");
chk('el modal vuelve a mostrar R y explica las tres letras',/value="R"/.test(porId('modal-content').innerHTML)&&/D, A o R/.test(porId('modal-content').innerHTML));
porId('m-nota-name').value='Actividad 1';porId('m-nota-val').value='D';porId('m-nota-fecha').value='';porId('m-pond-toggle').checked=false;
run("confirmEditNota('abierta','n1')");
chk('confirmEditNota guarda D además de 7,0',run("S.ramos[0].categorias[2].notas[0].valor===7&&S.ramos[0].categorias[2].notas[0].calificacionConceptual==='D'"));
porId('m-nota-val').value='5,8';run("confirmEditNota('abierta','n1')");
chk('cambiarla a número elimina el concepto obsoleto',run("S.ramos[0].categorias[2].notas[0].valor===5.8&&!Object.hasOwn(S.ramos[0].categorias[2].notas[0],'calificacionConceptual')"));

console.log('\n=== Recarga, ficha, Agenda y simulador conservan la letra ===');
run("setDirectNota('directa','A')");
ctx.__guardado=JSON.parse(JSON.stringify(run('S')));run('S=normalize(__guardado)');
chk('normalize conserva una equivalencia consistente',run("S.ramos[0].categorias[0].notas[0].calificacionConceptual==='A'"));
run('renderRamo()');
chk('la ficha muestra A y mantiene el color calculado con 5,0',porId('cat-list').children.some(f=>/value="A"/.test(f.innerHTML)&&/color:/.test(f.innerHTML)));
const agenda=run("agendaRendidaHTML(agendaRendidas().find(e=>e.nota.id==='vieja'))");
chk('la Agenda muestra A, no reemplaza lo escrito por 5,0',/>A<\/span>/.test(agenda));
run("simState={};document.getElementById('sim-in-grupo').value='R';simAddNota('grupo')");
chk('el simulador conserva R junto a su 3,0',run("simState.grupo[0].valor===3&&simState.grupo[0].calificacionConceptual==='R'"));
run("showConfirm=(t,d,fn)=>fn();simCommit()");
chk('guardar la simulación lleva la letra a la nota real',run("S.ramos[0].categorias[1].notas.some(n=>n.calificacionConceptual==='R'&&n.valor===3)"));

console.log('\n=== Lo inconsistente no se presenta como letra oficial ===');
const reparada=run("normalize({tenant:'uc',ramos:[{id:'x',nombre:'X',categorias:[{id:'c',nombre:'C',notas:[{id:'n',valor:6,calificacionConceptual:'A'}]}]}]}).ramos[0].categorias[0].notas[0]");
chk('normalize descarta solo una letra que no calza con su valor',!Object.hasOwn(reparada,'calificacionConceptual')&&reparada.valor===6);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
