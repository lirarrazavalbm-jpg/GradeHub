// Patrones medidos en los 30 programas de la Fase 2. No agrega formatos
// hipotéticos ni traduce las reglas complejas al modelo de cálculo.
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const script=process.env.GRADEHUB_SCRIPT||path.join(root,'bin','proponer-pautas-uc.js');
let parser;
try{parser=require(script);}catch(error){console.error('FAIL: no se pudo importar el parser UC.');process.exit(1);}
const {extraerEstructura}=parser;
const fixtures=path.join(__dirname,'fixtures','catalogo-uc-benchmark');
let ok=0,fail=0;
function chk(name,condition){if(condition){ok++;console.log('  OK   '+name);}else{fail++;console.error('  FAIL '+name);}}
function parse(body){return extraerEstructura(`<pre>V. EVALUACION\n${body}\nVI. BIBLIOGRAFIA</pre>`);}
function reason(result,code){return result.reasons.includes(code);}
function official(code){return extraerEstructura(fs.readFileSync(path.join(fixtures,code+'.html'),'utf8'),{courseCode:code});}

console.log('\n=== Porcentajes respaldados por los fixtures ===');
chk('un porcentaje normal sigue entrando',parse('Pruebas: 70%\nExamen: 30%').status==='auto_importable');
chk('tolera whitespace antes del signo',parse('Prueba: 40 %\nExamen: 60 %').status==='auto_importable');
chk('acepta porcentajes entre paréntesis y punto final como AGL007',(()=>{const r=official('AGL007');return r.filas.map(f=>f.peso).join('|')==='20|40|40';})());
chk('acepta filas numeradas sin dos puntos como GEO1002',(()=>{const r=official('GEO1002');return r.filas.map(f=>f.peso).join('|')==='30|30|40';})());
chk('conserva 30/70 escritos juntos en la prosa de ICE1513',(()=>{const r=official('ICE1513');return r.filas.map(f=>f.peso).join('|')==='30|70'&&r.status==='needs_review';})());

console.log('\n=== Asistencia: requisito versus evaluación ===');
const attendance=parse('Pruebas: 100%\nAsistencia minima: 80%');
chk('la asistencia mínima no se suma al peso',attendance.total===100&&attendance.filas.length===1);
chk('la asistencia mínima obliga a revisión',attendance.status==='needs_review'&&reason(attendance,'attendance_requirement_detected'));
const gradedAttendance=parse('Pruebas: 90%\nParticipacion/asistencia: 10%');
chk('participación/asistencia con peso real se conserva',gradedAttendance.status==='auto_importable'&&gradedAttendance.total===100&&gradedAttendance.filas.length===2);

console.log('\n=== Ausencia oficial y prosa compleja ===');
const unavailable=extraerEstructura('<pre>Programa de curso no disponible</pre>');
chk('programa no disponible es not_found',unavailable.status==='not_found'&&reason(unavailable,'source_program_unavailable'));
chk('un mínimo de aprobación se conserva como señal',reason(parse('Pruebas: 100%\nPara aprobar debe obtener nota igual o superior a 4,0.'),'minimum_or_cap_rule_detected'));
chk('una condición con si se conserva como señal',reason(parse('Pruebas: 100%\nSi falta a la prueba, debe rendir una actividad.'),'conditional_rule_detected'));
chk('una fórmula equivalente 70/30 se detecta sin calcularla',
  reason(parse('Presentacion: 100%\nPara quienes no se eximen, la nota del examen equivale al 30% y la nota de presentacion al 70%.'),'alternative_final_grade_formula_detected'));
chk('la palabra eximible se reconoce como eximición',reason(parse('Pruebas: 100%\nEl curso contempla un examen final eximible.'),'exemption_rule_detected'));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
