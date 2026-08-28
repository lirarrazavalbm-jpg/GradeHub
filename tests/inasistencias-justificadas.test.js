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
let estadoAusencias=null;try{estadoAusencias=val('estadoAusenciasJustificadas');}catch(e){}

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
const paraRecuperativo=micro({Solemne:3.7,'Control 2':3.7,'Control 3':3.7,'Pruebas sorpresa':3.7,Examen:3.7});
paraRecuperativo.ausenciasJustificadas=[id(paraRecuperativo,'Control 1')];paraRecuperativo.recuperativoRendido='aprobado';
eq('el reemplazo ocurre antes de aplicar el recuperativo',ramoAvg(paraRecuperativo),4);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
