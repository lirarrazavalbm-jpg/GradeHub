// El catálogo UC se interpreta offline y solo produce borradores revisables.
// Cada fixture es mínimo: guarda la evidencia que reprodujo el caso, no el
// programa completo ni contenido innecesario.
const fs=require('fs'),os=require('os'),path=require('path');
const raiz=path.join(__dirname,'..');
const script=process.env.GRADEHUB_SCRIPT||path.join(raiz,'bin','proponer-pautas-uc.js');
let mod;
try{mod=require(script);}catch(e){console.error('FAIL: el parser debe poder importarse offline.');process.exit(1);}
const {decodificarCatalogo,extraerEstructura,generarBorrador,esEncabezadoEvaluacion}=mod;
const fixtureDir=path.join(__dirname,'fixtures','catalogo-uc');
const fixture=sigla=>fs.readFileSync(path.join(fixtureDir,sigla+'.html'),'utf8');
let ok=0,fail=0;
function chk(n,c){if(c){ok++;console.log('  OK   '+n);}else{fail++;console.error('  FAIL '+n);}}
function parse(cuerpo,encabezado='V. ESTRATEGIAS EVALUATIVAS'){
  return extraerEstructura(`<pre>${encabezado}\n${cuerpo}\nVI. BIBLIOGRAFÍA</pre>`);
}
function reason(r,codigo){return r.reasons.includes(codigo);}

console.log('\n=== Bugs reales ===');
const fis=extraerEstructura(fixture('FIS1514'),{courseCode:'FIS1514'});
chk('FIS1514 reconoce EVALUACIONES DEL APRENDIZAJE',fis.evaluationHeading==='VI. EVALUACIONES DEL APRENDIZAJE');
chk('FIS1514 extrae 60/10/30 sin repartir las interrogaciones',
  fis.filas.map(f=>f.peso).join('|')==='60|10|30'&&fis.filas[0].detalleDetectado.cantidad===3&&!fis.filas[0].detalleDetectado.pesoCadaUna);
chk('FIS1514 queda needs_review por categoría agregada',fis.status==='needs_review'&&reason(fis,'aggregate_category_detected'));

const qim=extraerEstructura(fixture('QIM100F'),{courseCode:'QIM100F'});
chk('QIM100F conserva el candidato inicial 70/15/15',qim.filas.map(f=>f.peso).join('|')==='70|15|15'&&qim.total===100);
chk('QIM100F nunca queda auto-importable',qim.status==='needs_review');
chk('QIM100F detecta examen condicional y mínimos publicados',
  reason(qim,'conditional_exam_rule_detected')&&reason(qim,'minimum_or_cap_rule_detected'));
chk('QIM100F conserva completa y clasifica la fórmula alternativa',
  reason(qim,'alternative_final_grade_formula_detected')&&qim.complexRuleLines.length===2&&/examen equivale al 30%/.test(qim.complexRuleLines[1].line)&&qim.unparsedLines.includes(qim.complexRuleLines[1].line));

console.log('\n=== Encabezados y límites de sección ===');
['EVALUACIÓN','evaluaciones','VI. EVALUACION DE APRENDIZAJES','IX. EVALUACIONES DEL APRENDIZAJE','ESTRATEGIAS EVALUATIVAS','Sistema de Evaluación']
  .forEach(h=>chk('reconoce '+h,esEncabezadoEvaluacion(h)));
chk('una mención en un párrafo no se vuelve encabezado',!esEncabezadoEvaluacion('Las evaluaciones del aprendizaje se conversarán durante el curso.'));
const raro=extraerEstructura('<pre>\n  VII .   evaluaciones   del aprendizaje : \nPrueba: 50%\nExamen: 50%\n VIII. METODOLOGÍA\nSi obtiene algo, esto ya está fuera.\n</pre>');
chk('tolera tildes, ausencia de tildes y whitespace',raro.status==='auto_importable'&&raro.total===100);
chk('corta en la siguiente sección estructural',!/esto ya está fuera/.test(raro.evaluationSourceText));

console.log('\n=== Pautas simples y validaciones ===');
const simple=parse('Prueba 1: 30%\nPrueba 2: 30%\nProyecto: 30%\nActividad: 10%');
chk('30/30/30/10 es auto_importable',simple.status==='auto_importable'&&simple.total===100);
chk('una actividad con porcentaje se conserva',simple.filas.some(f=>f.nombre==='Actividad'&&f.peso===10));
const cada=parse('2 Pruebas: 20% c/u\nTareas: 20%\nExamen: 40%');
chk('20% c/u usa la cantidad explícita',cada.total===100&&cada.filas[0].peso===40&&cada.filas[0].detalleDetectado.pesoCadaUna===20);
chk('un examen simple es una categoría normal',parse('Pruebas: 70%\nExamen: 30%').status==='auto_importable');
const suma=parse('Pruebas: 70%\nExamen: 20%');
chk('suma distinta de 100 requiere revisión',suma.status==='needs_review'&&reason(suma,'weights_do_not_sum_100'));
const duplicada=parse('Prueba: 50%\nprueba: 50%');
chk('duplicados obvios requieren revisión',duplicada.status==='needs_review'&&reason(duplicada,'duplicate_evaluation_name'));
const siglaAjena=extraerEstructura('<pre>SIGLA: MAT9999\nV. EVALUACIÓN\nPrueba: 100%\nVI. BIBLIOGRAFÍA</pre>',{courseCode:'MAT1000'});
chk('una sigla explícita distinta requiere revisión',siglaAjena.status==='needs_review'&&reason(siglaAjena,'course_code_mismatch'));

console.log('\n=== Señales conservadoras de complejidad ===');
const cond=parse('Pruebas: 70%\nTareas: 30%\nSi el promedio es inferior a 5,0 deberá rendir examen final.');
chk('examen condicional requiere revisión',cond.status==='needs_review'&&reason(cond,'conditional_exam_rule_detected'));
chk('eximición requiere revisión',parse('Pruebas: 100%\nPodrá eximirse del examen con promedio 5,0.').reasons.includes('exemption_rule_detected'));
chk('reemplazo requiere revisión',parse('Pruebas: 100%\nEl examen reemplazará la nota más baja.').reasons.includes('replacement_rule_detected'));
chk('mínimo para aprobar requiere revisión',parse('Pruebas: 100%\nNota mínima para aprobar: 4,0.').reasons.includes('minimum_or_cap_rule_detected'));
chk('un requisito para aprobar se conserva como señal',parse('Pruebas: 100%\nPara aprobar se exige cumplir la asistencia.').reasons.includes('approval_requirement_detected'));
chk('una regla compleja sin pesos igual queda needs_review',parse('Podrá eximirse del examen con promedio 5,0.').status==='needs_review');
const formulas=parse('Parciales: 100%\nLa nota final se calculará 70% presentación y 30% examen.\nO bien, la nota final será calculada 60% presentación y 40% examen.');
chk('dos fórmulas de nota final se detectan',formulas.status==='needs_review'&&reason(formulas,'multiple_final_grade_formulas_detected'));

console.log('\n=== Información insuficiente, ausencia y evidencia ===');
const sinPesos=parse('3 evaluaciones durante el semestre. Controles en ayudantía.');
chk('una sección sin porcentajes es insufficient_information',sinPesos.status==='insufficient_information');
chk('sus líneas no desaparecen',sinPesos.unparsedLines.length===1&&/3 evaluaciones/.test(sinPesos.evaluationSourceText));
const sinSeccion=extraerEstructura('<pre>Descripción del curso. Bibliografía.</pre>');
chk('ausencia de sección no se confunde con not_found',sinSeccion.status==='insufficient_information'&&reason(sinSeccion,'evaluation_section_not_found'));
const noEncontrado=extraerEstructura(fixture('NOTFOUND'));
chk('respuesta negativa explícita es not_found',noEncontrado.status==='not_found'&&reason(noEncontrado,'program_not_found'));
const noInterpretada=parse('Prueba: 50%\nProyecto: 50%\nLa participación podrá modificar la nota.');
chk('una línea relevante no interpretada bloquea auto-importación',noInterpretada.status==='needs_review'&&reason(noInterpretada,'relevant_unparsed_line'));
chk('la evidencia trae fuente, parseadas, no interpretadas y hash',
  simple.evaluationSourceText&&simple.parsedLines.length===4&&Array.isArray(simple.unparsedLines)&&/^[a-f0-9]{64}$/.test(simple.evaluationSourceHash));
const latin1=Buffer.from('<pre>V. ESTRATEGIAS EVALUATIVAS\n-Evaluación: 100%\nVI. BIBLIOGRAFÍA</pre>','latin1');
chk('decodifica HTML latino sin degradar tildes',/Evaluación/.test(decodificarCatalogo(latin1)));

console.log('\n=== Borrador trazable y compatible ===');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gradehub-parser-uc-'));
const html=path.join(tmp,'html');fs.mkdirSync(html);
fs.writeFileSync(path.join(tmp,'data.js'),`const MALLA_UC={PC:{'1':['Simple','Complejo','Ausente']}};
const CREDITOS_UC={Simple:[10,'SIM1000'],Complejo:[10,'QIM100F'],Ausente:[10,'NOF1000']};
const PRESETS_UC={};`);
fs.writeFileSync(path.join(html,'SIM1000.html'),'<pre>V. EVALUACIÓN\nPrueba: 70%\nExamen: 30%\nVI. BIBLIOGRAFÍA</pre>');
fs.writeFileSync(path.join(html,'QIM100F.html'),fixture('QIM100F'));
fs.writeFileSync(path.join(html,'NOF1000.html'),fixture('NOTFOUND'));
(async()=>{
  try{
    const b=await generarBorrador({dataPath:path.join(tmp,'data.js'),fixtureDir:html,siglas:null,delay:0});
    chk('solo lo simple entra a propuestas',b.propuestas.length===1&&b.propuestas[0].status==='auto_importable');
    chk('QIM100F entra a revisar con candidato y reglas',b.revisarAMano.length===1&&b.revisarAMano[0].candidate.total===100&&b.revisarAMano[0].complexRuleLines.length===2);
    chk('not_found queda separado de un error de transporte',b.sinDatos.length===1&&b.sinDatos[0].status==='not_found'&&b.errores.length===0);
    const p=b.propuestas[0];
    chk('el artefacto conserva trazabilidad completa',p.sourceType==='official_uc_catalog'&&p.sourceUniversity&&p.courseCode==='SIM1000'&&p.semester===null&&p.parserVersion&&p.retrievedAt&&p.evaluationSourceHash);
  }catch(e){console.error(e);fail++;}
  finally{fs.rmSync(tmp,{recursive:true,force:true});}
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(fail?1:0);
})();
