// Una declaración antigua y una nueva usan exactamente los mismos campos.
const fs=require('fs'),vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const files=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'];
const source=files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
function node(){
  let html='';
  const el={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;}},children:[],value:'',textContent:'',dataset:{},
    addEventListener(){},appendChild(child){this.children.push(child);return child;},setAttribute(){},removeAttribute(){},getAttribute(){return null;},
    querySelector(){return el;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:390};
  Object.defineProperty(el,'innerHTML',{get(){return html;},set(value){html=String(value);el.children=[];}});
  return el;
}
const elements={};const byId=id=>elements[id]||(elements[id]=node());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:node,addEventListener(){},documentElement:node(),querySelector(){return node();},querySelectorAll(){return [];},body:node()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(source,ctx);
const run=code=>vm.runInContext(code,ctx);
run('save=()=>{globalThis.guardado=JSON.parse(JSON.stringify(S))};track=()=>{};openModal=()=>{};closeModal=()=>{};showToast=()=>{};animarPromedio=()=>{};mostrarEcoGpa=()=>{};showConfirm=(titulo,detalle,fn)=>{globalThis.confirmacion={titulo,detalle,fn}};');
let ok=0,fail=0;
const check=(name,condition)=>{console.log(`  ${condition?'OK  ':'FAIL'} ${name}`);condition?ok++:fail++;};
const fixture={id:'r',nombre:'Curso de prueba',color:'#555555',gates:[],categorias:[
  {id:'control',nombre:'Control inicial',peso:20,directNota:true,notas:[]},
  {id:'examen',nombre:'Examen',peso:50,directNota:true,notas:[]},
  {id:'trabajo',nombre:'Trabajo final',peso:30,directNota:false,notas:[]},
],reglasAusenciaJustificada:{traspasos:[{desdeId:'control',haciaId:'examen'}],rezagos:[],reemplazos:[]},ausenciasJustificadas:['control']};
function setRamo(r){ctx.fixture=r;run('S={...freshState(),ramos:[fixture]};currentRamoId="r";openCats={};');}
function html(){run('renderRamo()');return byId('cat-list').children.map(el=>el.innerHTML).join('\n');}

console.log('\n=== Declaraciones previas y regla del programa ===');
setRamo(JSON.parse(JSON.stringify(fixture)));
let shown=html();
check('declaración previa aparece de inmediato como Justificada y explica el destino',/Justificada/.test(shown)&&/Su 20% pasa al Examen/.test(shown)&&!/Nota de Control inicial/.test(shown));
check('no se pinta el aviso anterior',!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('ausencias-justificadas-warning'));
run('openDetalleAusenciaJustificada("control")');
check('al tocarla aparece Deshacer justificación con el destino',/Deshacer justificación/.test(byId('modal-content').innerHTML)&&/Examen/.test(byId('modal-content').innerHTML));
run('confirmarCorreccionAusenciaJustificada("control")');
check('deshacer solicita confirmación antes de cambiar el dato',run('S.ramos[0].ausenciasJustificadas.length')===1&&/Deshacer/.test(ctx.confirmacion.titulo));
ctx.confirmacion.fn();
// Desde el 2026-09-30 la opción vive en la hoja de la evaluación (la de la
// fecha), no como botón en la ficha.
check('confirmar deshacer elimina la declaración y restaura la nota pendiente',run('S.ramos[0].ausenciasJustificadas.length')===0&&!/Justificada/.test(html()));
check('la ficha ya no muestra el botón "Falté con justificativo"',!/Falté con justificativo/.test(html()));
run('openEditCatModal("control")');
check('al tocar la evaluación pendiente, su hoja ofrece justificar',/Falté con justificativo/.test(byId('modal-content').innerHTML)&&/Te decimos a dónde va su 20%/.test(byId('modal-content').innerHTML));
run('elegirAusenciaDesdeEvaluacion("control")');
check('la regla oficial se explica antes de declarar',/Su 20% pasa al Examen\. Según el programa/.test(byId('modal-content').innerHTML));
run('declararAusenciaJustificada("control")');
check('declarar desde la evaluación guarda el mismo campo previo',ctx.guardado.ramos[0].ausenciasJustificadas.join(',')==='control'&&run('S.ramos[0].reglasAusenciaJustificadaUsuario')==null);

console.log('\n=== Decisión sin regla oficial y notas reales ===');
const propia=JSON.parse(JSON.stringify(fixture));delete propia.reglasAusenciaJustificada;propia.ausenciasJustificadas=[];
setRamo(propia);
run('elegirAusenciaDesdeEvaluacion("control")');
check('sin regla abre la elección anterior, con tope de 75%',/Rendir en rezago/.test(byId('modal-content').innerHTML)&&/Acumular porcentaje/.test(byId('modal-content').innerHTML)&&/75%/.test(byId('modal-content').innerHTML));
byId('m-ausencia-destino').value='examen';run('declararAusenciaJustificadaEstudiante("control","traspaso")');
check('la elección se guarda en los campos ya existentes',ctx.guardado.ramos[0].ausenciasJustificadas.includes('control')&&ctx.guardado.ramos[0].reglasAusenciaJustificadaUsuario.traspasos[0].haciaId==='examen');
const copia=JSON.parse(JSON.stringify(ctx.guardado));setRamo(run('normalize')(copia).ramos[0]);
check('tras recargar conserva Justificada y el destino',/Justificada/.test(html())&&/Su 20% pasa al Examen/.test(html()));
run('confirmarCorreccionAusenciaJustificada("control")');ctx.confirmacion.fn();
check('deshacer limpia ausencia y regla elegida sin cambiar la pauta',run('S.ramos[0].ausenciasJustificadas.length')===0&&run('S.ramos[0].reglasAusenciaJustificadaUsuario')===null&&run('S.ramos[0].categorias[0].peso')===20);
run('setDirectNota("control","5,5")');
run('openEditCatModal("control")');
check('con nota, su hoja tampoco ofrece justificar',!/Falté con justificativo/.test(byId('modal-content').innerHTML));
check('con nota, la evaluación no ofrece justificar',!/Falté con justificativo/.test(byId('cat-list').children[0].innerHTML)&&/5,5|5\.5/.test(byId('cat-list').children[0].innerHTML));

console.log('\n=== Rezago, reemplazo y casillas múltiples ===');
const rezago=JSON.parse(JSON.stringify(fixture));delete rezago.reglasAusenciaJustificada;
rezago.reglasAusenciaJustificadaUsuario={declaradaPor:'estudiante',rezagos:[{desdeId:'control'}],reemplazos:[],traspasos:[]};
setRamo(rezago);
check('una declaración previa de rezago muestra Justificada y su porcentaje pendiente',/Justificada/.test(html())&&/Su 20% queda pendiente para rendir en rezago/.test(html()));
const reemplazo=JSON.parse(JSON.stringify(fixture));
reemplazo.reglasAusenciaJustificada={reemplazos:[{desdeId:'control',haciaId:'examen'}],traspasos:[],rezagos:[]};
setRamo(reemplazo);
check('reemplazo oficial explica qué nota calcula el porcentaje',/Su 20% se calcula con la nota del Examen/.test(html()));
const casillas=JSON.parse(JSON.stringify(fixture));casillas.categorias[0]={...casillas.categorias[0],slots:2,notas:[]};
setRamo(casillas);
{const libre=JSON.parse(JSON.stringify(casillas));libre.ausenciasJustificadas=[];delete libre.reglasAusenciaJustificada;setRamo(libre);html();
run('abrirCasilla("control",0)');
check('en un grupo sin notas, la hoja de una casilla ofrece justificar la evaluación completa',/Falté con justificativo/.test(byId('modal-content').innerHTML)&&/Aplica a toda la evaluación/.test(byId('modal-content').innerHTML));
setRamo(casillas);}
check('grupo de casillas declarado muestra estado en vez de entradas de nota',/Justificada/.test(html())&&!/setSlotNota/.test(byId('cat-list').children[0].innerHTML));
casillas.ausenciasJustificadas=[];casillas.categorias[0].notas=[{id:'uno',nombre:'Primera casilla',slot:0,valor:5.5,peso:1}];
setRamo(casillas);
run('abrirCasilla("control",1)');
check('en un grupo con una casilla calificada, la hoja de otra casilla tampoco la ofrece',!/Falté con justificativo/.test(byId('modal-content').innerHTML));
check('un grupo con una casilla ya calificada no ofrece ausencia para toda la evaluación',!/Falté con justificativo/.test(byId('cat-list').children[0].innerHTML));
casillas.ausenciasJustificadas=['control'];setRamo(casillas);
check('si una declaración antigua quedó inactiva por una nota, no esconde esa nota',/Declaración no aplicada/.test(html())&&/value="5\.5"/.test(byId('cat-list').children[0].innerHTML));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
