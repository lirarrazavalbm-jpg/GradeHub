// Dos detalles del barrido del 2026-09-29.
//
// a) Las casillas de una categoría se nombran en singular ("Controles" →
//    "Control 1"), pero SINGULARES_CASILLA no conocía palabras comunes y dejaba
//    "Actividades 1", "Quizzes 1" o "Tests 1".
// b) parseNota usaba parseFloat, que corta en lo que sobra: "5.5.5" entraba
//    como 5,5 sin que nada avisara.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','render-agenda.js'].map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};

console.log('\n=== a) Casillas en singular ===');
const singular=val('singularEtiquetaCasilla');
const casos={
  Actividades:'Actividad',Quizzes:'Quiz',Quices:'Quiz',Tests:'Test',Entregas:'Entrega',
  Lecturas:'Lectura',Proyectos:'Proyecto',Guías:'Guía',Ayudantías:'Ayudantía',
  Cuestionarios:'Cuestionario',Exposiciones:'Exposición',Certámenes:'Certamen',
  Avances:'Avance',Hitos:'Hito',Reportes:'Reporte',Prácticas:'Práctica',
  // Sin tilde, como se escribe a mano.
  Examenes:'Examen',Guias:'Guia',Ayudantias:'Ayudantia',Certamenes:'Certamen',Practicas:'Practica',
};
Object.entries(casos).forEach(([plural,esperado])=>chk(`"${plural}" → "${esperado}"`,singular(plural)===esperado));
chk('respeta mayúsculas: "QUIZZES" → "QUIZ"',singular('QUIZZES')==='QUIZ');
chk('y minúsculas: "entregas" → "entrega"',singular('entregas')==='entrega');

console.log('\n=== a) Lo que ya funcionaba sigue igual ===');
chk('"Controles" → "Control"',singular('Controles')==='Control');
chk('"Pruebas" → "Prueba"',singular('Pruebas')==='Prueba');
// "Prácticas" como segunda palabra sigue siendo adjetivo.
chk('"Controles prácticos" → "Control práctico"',singular('Controles prácticos')==='Control práctico');
chk('"Pruebas prácticas" → "Prueba práctica"',singular('Pruebas prácticas')==='Prueba práctica');
chk('"Exposiciones orales" → "Exposición oral"',singular('Exposiciones orales')==='Exposición oral');
chk('"Prácticas de laboratorio" → "Práctica de laboratorio"',singular('Prácticas de laboratorio')==='Práctica de laboratorio');
chk('lo ambiguo no se toca: "Actividades asincrónicas"',singular('Actividades asincrónicas')==='Actividades asincrónicas');
chk('ni un grupo con "y": "Actividades y participación"',singular('Actividades y participación')==='Actividades y participación');

// En una ficha: la casilla de "Controles" sigue siendo "Control 1", la de
// "Actividades" pasa a "Actividad 1", y una nota vieja guardada con el nombre
// colectivo se muestra con el singular sin reescribirla.
const ramo={id:'r',nombre:'Ramo Sintético',origen:null,categorias:[]};
ctx.__r=ramo;
const cat=nombre=>({id:'c',nombre,peso:100,slots:3,directNota:true,notas:[]});
ctx.__cc=cat('Controles');ctx.__ca=cat('Actividades');
chk('"Controles 1" sigue siendo "Control 1"',val('etiquetaCasilla(__r,__cc,0)')==='Control 1');
chk('"Actividades 1" pasa a "Actividad 1"',val('etiquetaCasilla(__r,__ca,0)')==='Actividad 1');
ctx.__n={id:'n',nombre:'Actividades 2',valor:5,peso:1,slot:1};
chk('una nota guardada como "Actividades 2" se ve "Actividad 2"',val('nombreNotaCasilla(__r,__ca,__n)')==='Actividad 2');

console.log('\n=== b) parseNota rechaza lo que no es una nota ===');
const parseNota=val('parseNota');
const eq=(n,got,exp)=>chk(`${n}  (${got})`,Number.isNaN(exp)?Number.isNaN(got):Math.abs(got-exp)<1e-9);
eq('"5.5.5" no es 5,5',parseNota('5.5.5'),NaN);
eq('"5,5,5" tampoco',parseNota('5,5,5'),NaN);
eq('"5,5.5" tampoco',parseNota('5,5.5'),NaN);
eq('"5a" no es 5',parseNota('5a'),NaN);
eq('"5 5" no es 5',parseNota('5 5'),NaN);
eq('"1e1" no es 1,0',parseNota('1e1'),NaN);
eq('"-5" no es nota',parseNota('-5'),NaN);

console.log('\n=== b) Lo que ya funcionaba sigue igual ===');
eq('"5,5" → 5.5',parseNota('5,5'),5.5);
eq('"5.5" → 5.5',parseNota('5.5'),5.5);
eq('"65" → 6.5',parseNota('65'),6.5);
eq('"70" → 7.0',parseNota('70'),7.0);
eq('"7" → 7.0',parseNota('7'),7.0);
eq('"4," → 4.0 (se está tecleando el decimal)',parseNota('4,'),4.0);
eq('"4." → 4.0',parseNota('4.'),4.0);
eq('"  6,2  " con espacios',parseNota('  6,2  '),6.2);
eq('un número, no texto: 6.5',parseNota(6.5),6.5);
eq('vacío no es cero',parseNota(''),NaN);
eq('"77" sigue siendo error',parseNota('77'),NaN);
// Las conceptuales se resuelven antes que el número; se compara con la tabla
// en vez de copiar sus valores acá.
const conceptos=Object.keys(val(`CALIFICACIONES_CONCEPTUALES_POR_TENANT.uc||{}`));
chk('hay conceptuales en la UC para probar',conceptos.length>0);
conceptos.forEach(c=>{
  const esperado=val(`calificacionConceptual(${JSON.stringify(c)},'uc').valor`);
  eq(`"${c}" en la UC`,parseNota(c,'uc'),esperado);
  eq(`" ${c.toLowerCase()} " en la UC, con espacios y minúscula`,parseNota(' '+c.toLowerCase()+' ','uc'),esperado);
});

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
