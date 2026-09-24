// Microeconomía sí dice qué ocurre con una ausencia justificada. No se modela
// por nombre de ramo: el preset declara reemplazos y traspasos separados, y el
// motor recibe ids de categorías ya resueltos.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','render-main.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
const renderMain=fs.readFileSync(raiz+'render-main.js','utf8');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return stub;},querySelectorAll(){return [];},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};
const eq=(n,a,b)=>chk(`${n} (${a})`,typeof a==='number'&&Math.abs(a-b)<.005);
const presetRamo=val('presetRamo'),ramoAvg=val('ramoAvg');
const normalize=val('normalize');
let estadoAusencias=null;try{estadoAusencias=val('estadoAusenciasJustificadas');}catch(e){}
let estadoParaNotaNecesaria=null;try{estadoParaNotaNecesaria=val('estadoParaNotaNecesaria');}catch(e){}
let configurarAusenciaEstudiante=null;try{configurarAusenciaEstudiante=val('configurarAusenciaJustificadaEstudiante');}catch(e){}

function micro(valores={}){
  const r=presetRamo('Introducción a la Microeconomía','fen',null);
  r.nombre='Introducción a la Microeconomía';r.origen={tenant:'fen'};
  r.categorias.forEach(c=>{
    const v=valores[c.nombre];
    const cantidad=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    c.notas=v==null?[]:Array.from({length:cantidad},(_,i)=>({id:`${c.id}-${i}`,nombre:`${c.nombre} ${i+1}`,valor:v,peso:1}));
  });
  return r;
}
function id(r,n){return r.categorias.find(c=>c.nombre===n).id;}
function ramoConAusencias(){
  return {
    id:'ramo-ausencias',nombre:'Curso con formulario propio',categorias:[
      {id:'i1',nombre:'Interrogación 1',peso:20,notas:[]},
      {id:'i2',nombre:'Interrogación 2',peso:20,notas:[]},
      {id:'i3',nombre:'Interrogación 3',peso:20,notas:[]},
      {id:'ex',nombre:'Examen',peso:30,notas:[{id:'n-ex',nombre:'Examen',valor:7,peso:1}]},
      {id:'ta',nombre:'Tareas',peso:10,notas:[{id:'n-ta',nombre:'Tareas',valor:7,peso:1}]},
    ],gates:[],ausenciasJustificadas:[],
  };
}

console.log('\n=== Regla declarativa, no condicional por ramo ===');
const def=val('PRESETS_FEN')['Introducción a la Microeconomía'];
const p=micro();
chk('el preset separa reemplazos de traspasos',
  Array.isArray(def.ausenciasJustificadas?.reemplazos)&&def.ausenciasJustificadas.reemplazos.length===4&&
  Array.isArray(def.ausenciasJustificadas?.traspasos)&&def.ausenciasJustificadas.traspasos.length===1);
chk('presetRamo resuelve las reglas a ids de esta pauta',
  p.reglasAusenciaJustificada?.reemplazos?.some(x=>x.desdeId===id(p,'Control 1')&&x.haciaId===id(p,'Solemne'))&&
  p.reglasAusenciaJustificada?.traspasos?.some(x=>x.desdeId===id(p,'Pruebas sorpresa')&&x.haciaId===id(p,'Examen')));
chk('la ficha permite declarar la ausencia y explica si luego deja de aplicar',
  /declararAusenciaJustificada/.test(renderMain)&&/Tu declaración se conserva, pero ya no se aplica/.test(renderMain));

console.log('\n=== Reemplazar una nota y mover un peso son operaciones distintas ===');
const c1=micro({Solemne:6,'Control 2':4,'Control 3':5,'Pruebas sorpresa':4,Examen:2});
const baseC1=ramoAvg(c1);c1.ausenciasJustificadas=[id(c1,'Control 1')];
eq('Control 1 ausente toma la nota de la Solemne antes del promedio',ramoAvg(c1),4.2);
chk('sin declaración el promedio antiguo no cambia',baseC1===4);

const sorpresa=micro({Solemne:6,'Control 1':5,'Control 2':5,'Control 3':5,Examen:5});
sorpresa.ausenciasJustificadas=[id(sorpresa,'Pruebas sorpresa')];
eq('la ausencia en Pruebas sorpresa mueve su 5% al Examen',ramoAvg(sorpresa),5.3);

console.log('\n=== Una corrección desactiva, pero no borra ===');
c1.categorias.find(c=>c.id===id(c1,'Control 1')).notas=[{id:'c1-real',nombre:'Control 1',valor:4,peso:1}];
const estado=estadoAusencias&&estadoAusencias(c1);
chk('si aparece una nota, conserva la declaración y avisa que no aplica',
  c1.ausenciasJustificadas.includes(id(c1,'Control 1'))&&estado?.inactivas?.some(x=>x.desdeId===id(c1,'Control 1')&&x.motivo==='tiene_nota'));
eq('una declaración desactivada no altera el cálculo',ramoAvg(c1),4);

console.log('\n=== Compatibilidad y orden de cálculo ===');
const antigua=micro({Solemne:3.7,'Control 1':3.7,'Control 2':3.7,'Control 3':3.7,'Pruebas sorpresa':3.7,Examen:3.7});
const sinCampo=JSON.parse(JSON.stringify(antigua));delete sinCampo.ausenciasJustificadas;
eq('una cuenta existente sin declaración calcula igual que hoy',ramoAvg(sinCampo),3.7);
const normalizadaAntigua=normalize({tenant:'uc',ramos:[sinCampo]}).ramos[0];
chk('una cuenta anterior sin la regla del estudiante sigue sin regla',normalizadaAntigua.reglasAusenciaJustificadaUsuario===null);
const paraRecuperativo=micro({Solemne:3.7,'Control 2':3.7,'Control 3':3.7,'Pruebas sorpresa':3.7,Examen:3.7});
paraRecuperativo.ausenciasJustificadas=[id(paraRecuperativo,'Control 1')];paraRecuperativo.recuperativoRendido='aprobado';
eq('el reemplazo ocurre antes de aplicar el recuperativo',ramoAvg(paraRecuperativo),4);

console.log('\n=== El estudiante declara la regla que trae su formulario ===');
const declarada=ramoConAusencias();
chk('se puede declarar rezago cuando no existe regla oficial',
  configurarAusenciaEstudiante&&configurarAusenciaEstudiante(declarada,'i1','rezago')===true&&
  declarada.reglasAusenciaJustificadaUsuario?.declaradaPor==='estudiante'&&
  declarada.reglasAusenciaJustificadaUsuario?.rezagos?.some(x=>x.desdeId==='i1')&&
  declarada.ausenciasJustificadas.includes('i1'));
chk('cambiar a acumulación reemplaza el rezago en vez de duplicar la regla',
  configurarAusenciaEstudiante(declarada,'i1','traspaso','ex')===true&&
  !declarada.reglasAusenciaJustificadaUsuario.rezagos.some(x=>x.desdeId==='i1')&&
  declarada.reglasAusenciaJustificadaUsuario.traspasos.some(x=>x.desdeId==='i1'&&x.haciaId==='ex'));
configurarAusenciaEstudiante(declarada,'i1','rezago');
const estadoRezago=estadoAusencias&&estadoAusencias(declarada);
chk('el rezago no mueve peso y sigue pendiente hasta rendirse',
  estadoRezago?.pendientes?.some(x=>x.desdeId==='i1'&&x.tipo==='rezago'&&x.motivo==='espera_rezago')&&
  estadoRezago.estructura.children.find(x=>x.id==='i1')?.weight===20&&
  estadoParaNotaNecesaria(declarada).pendiente>0);
chk('la ficha distingue la regla declarada por el estudiante y ofrece ambos caminos',
  /Declarado por ti según el formulario/.test(renderMain)&&/Rendir en rezago/.test(fs.readFileSync(raiz+'app.js','utf8'))&&/Acumular.*porcentaje/s.test(fs.readFileSync(raiz+'app.js','utf8')));

const oficial=ramoConAusencias();
oficial.reglasAusenciaJustificada={traspasos:[{desdeId:'i1',haciaId:'ex'}],reemplazos:[]};
chk('una regla oficial no se puede reemplazar por una declaración del estudiante',
  configurarAusenciaEstudiante&&configurarAusenciaEstudiante(oficial,'i2','rezago')===false&&!oficial.reglasAusenciaJustificadaUsuario);
const yaRendida=ramoConAusencias();
chk('una evaluación que ya tiene nota no se puede declarar como inasistencia',
  configurarAusenciaEstudiante(yaRendida,'ex','rezago')===false&&!yaRendida.reglasAusenciaJustificadaUsuario);

console.log('\n=== La acumulación al examen respeta el tope institucional ===');
const topado=ramoConAusencias();
topado.reglasAusenciaJustificadaUsuario={
  declaradaPor:'estudiante',rezagos:[],reemplazos:[],
  traspasos:[{desdeId:'i1',haciaId:'ex'},{desdeId:'i2',haciaId:'ex'},{desdeId:'i3',haciaId:'ex'}],
};
topado.ausenciasJustificadas=['i1','i2','i3'];
const estadoTopado=estadoAusencias&&estadoAusencias(topado);
eq('tres traspasos dejan 75% en el examen y 15% con nota 1,0',ramoAvg(topado),6.1);
chk('el motor informa el tope y el excedente sin esconderlo',
  estadoTopado?.activas?.some(x=>x.desdeId==='i3'&&x.topePesoDestino===75&&x.pesoExcedente===15)&&
  estadoTopado.estructura.children.find(x=>x.id==='ex')?.weight===75&&
  estadoTopado.estructura.children.some(x=>x.ausenciaExceso===true&&x.weight===15));
chk('con el excedente ya calificado no quedan evaluaciones pendientes',
  estadoParaNotaNecesaria(topado).pendiente===0);

const bajoTope=ramoConAusencias();
bajoTope.reglasAusenciaJustificadaUsuario={declaradaPor:'estudiante',rezagos:[],reemplazos:[],traspasos:[{desdeId:'i1',haciaId:'ex'}]};
bajoTope.ausenciasJustificadas=['i1'];
const estadoBajoTope=estadoAusencias&&estadoAusencias(bajoTope);
chk('bajo 75% se mueve todo el peso y no aparece castigo',
  estadoBajoTope?.activas?.some(x=>x.desdeId==='i1'&&x.pesoAplicado===20&&x.pesoExcedente===0)&&
  !estadoBajoTope.estructura.children.some(x=>x.ausenciaExceso===true));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
