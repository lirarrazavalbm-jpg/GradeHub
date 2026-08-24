// El recuperativo no es una evaluación con peso: decide la nota FINAL solo
// después de que el ramo está completo y las compuertas ya se aplicaron.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const eq=(n,got,esperado)=>chk(n+' ('+got+')',typeof got==='number'&&Math.abs(got-esperado)<.005);
const fn=n=>vm.runInContext(`typeof ${n}==='function'?${n}:null`,ctx);
const presetRamo=fn('presetRamo'),ramoAvg=fn('ramoAvg'),estadoRecuperativo=fn('estadoRecuperativo');

function microCon(valor){
  const r=presetRamo&&presetRamo('Introducción a la Microeconomía','fen',null);
  if(!r)return null;
  r.nombre='Introducción a la Microeconomía';r.origen={tenant:'fen'};
  r.categorias.forEach(c=>{
    const cantidad=Number.isInteger(c.slots)&&c.slots>1?c.slots:1;
    c.notas=Array.from({length:cantidad},(_,i)=>({id:`${c.id}-${i}`,nombre:`Nota ${i+1}`,valor,peso:1}));
  });
  return r;
}
function estado(r){return estadoRecuperativo?estadoRecuperativo(r):null;}

console.log('\n=== Recuperativo declarado en el preset, no en un if de ramo ===');
const definicion=vm.runInContext('PRESETS_FEN',ctx)['Introducción a la Microeconomía'];
chk('el programa declara rango y nota fija, y deja de prometerlo en noCalcula',
  definicion.recuperativo?.min===3.6&&definicion.recuperativo?.max===3.9&&definicion.recuperativo?.nota===4.0&&
  !(definicion.noCalcula||[]).some(x=>/recuperativo/i.test(x)));
const microBase=microCon(3.7);
chk('presetRamo copia la regla al ramo del estudiante',
  !!(microBase&&microBase.recuperativo&&microBase.recuperativo.min===3.6));

console.log('\n=== Derecho: final, redondeado, completo y con extremos inclusivos ===');
const bordeInferior=microCon(3.55);bordeInferior.recuperativoRendido='aprobado';
const bordeSuperior=microCon(3.94);bordeSuperior.recuperativoRendido='aprobado';
const fueraSuperior=microCon(3.95);fueraSuperior.recuperativoRendido='aprobado';
eq('3,55 se lee 3,6 y aprobar el recuperativo deja 4,0 exacto',ramoAvg&&ramoAvg(bordeInferior),4);
eq('3,94 se lee 3,9 y el borde superior también entra',ramoAvg&&ramoAvg(bordeSuperior),4);
chk('3,95 se lee 4,0 y deja la declaración desactivada',
  estado(fueraSuperior)?.motivo==='fuera_de_rango'&&fueraSuperior.recuperativoRendido==='aprobado'&&ramoAvg(fueraSuperior)===3.95);
const incompleto=microCon(3.7);incompleto.categorias.find(c=>c.slots===5).notas.pop();
chk('un promedio parcial no ofrece el recuperativo',estado(incompleto)?.motivo==='incompleto');

console.log('\n=== Declarar y corregir no borra información ni inventa notas ===');
const noDeclarado=microCon(3.7);
const reprobado=microCon(3.7);reprobado.recuperativoRendido='reprobado';
eq('sin declaración conserva el promedio que ya existía',ramoAvg&&ramoAvg(noDeclarado),3.7);
chk('sin declarar sigue ofreciendo responder, pero reprobado ya no',
  estado(noDeclarado)?.puedeDeclarar===true&&estado(reprobado)?.puedeDeclarar===false&&estado(reprobado)?.motivo==='reprobado');
const corregido=microCon(3.7);corregido.recuperativoRendido='aprobado';
eq('antes de corregir, aprobado aplica el 4,0',ramoAvg&&ramoAvg(corregido),4);
corregido.categorias.forEach(c=>c.notas.forEach(n=>n.valor=3.4));
chk('al salir del rango conserva la declaración y avisa que ya no aplica',
  corregido.recuperativoRendido==='aprobado'&&estado(corregido)?.motivo==='fuera_de_rango'&&ramoAvg(corregido)===3.4);

console.log('\n=== Una compuerta no puede fabricar el derecho ===');
const conTope={
  nombre:'Ramo con requisito',recuperativo:{min:3.6,max:3.9,nota:4},recuperativoRendido:'aprobado',
  categorias:[
    {id:'requisito',nombre:'Requisito',peso:50,notas:[{id:'r',nombre:'R',valor:3,peso:1}]},
    {id:'otro',nombre:'Otro',peso:50,notas:[{id:'o',nombre:'O',valor:7,peso:1}]},
  ],gates:[{type:'min_grade_required',catId:'requisito',min:4,cap:3.9}],
};
chk('un tope que baja el 5,0 a 3,9 bloquea el recuperativo',
  estado(conTope)?.motivo==='compuerta'&&ramoAvg(conTope)===3.9);

console.log('\n=== Compatibilidad e interfaz ===');
const sinCampo={nombre:'Ramo antiguo',categorias:[{id:'a',nombre:'A',peso:100,notas:[{id:'n',nombre:'N',valor:3.7,peso:1}]}],gates:[]};
eq('un ramo antiguo sin campos nuevos calcula igual',ramoAvg&&ramoAvg(sinCampo),3.7);
const legado=microCon(3.7);delete legado.recuperativo;delete legado.recuperativoRendido;
const normalizado=vm.runInContext('normalize',ctx)({ramos:[legado]});
chk('una cuenta existente recibe la regla pero no declara nada por ella',
  normalizado.ramos[0].recuperativo?.nota===4&&normalizado.ramos[0].recuperativoRendido===null&&ramoAvg(normalizado.ramos[0])===3.7);
const app=fs.readFileSync(raiz+'app.js','utf8'),html=fs.readFileSync(raiz+'index.html','utf8');
chk('la ficha permite declarar aprobado o reprobado y explica una declaración desactivada',
  /id="recuperativo-warning"/.test(html)&&/recuperativoRendido/.test(app)&&/ya no se aplica/.test(app));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
