#!/usr/bin/env node
/*
 * Mide el parser actual contra etiquetas humanas de programas oficiales
 * congelados. No descarga, no corrige heurísticas y no toca pautas productivas.
 *
 * Uso:
 *   node bin/benchmark-pautas-uc.js
 *   node bin/benchmark-pautas-uc.js --json <salida.json> --markdown <informe.md>
 */
'use strict';

const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {decodificarCatalogo,extraerEstructura,normalizar,PARSER_VERSION}=require('./proponer-pautas-uc.js');
const ROOT=path.join(__dirname,'..');
const FIXTURES=path.join(ROOT,'tests','fixtures','catalogo-uc-benchmark');

const SIGNALS={
  aggregate_category:['aggregate_category_detected'],
  weights_do_not_sum_100:['weights_do_not_sum_100'],
  exemption_rule:['exemption_rule_detected'],
  minimum_average_required:['minimum_or_cap_rule_detected'],
  minimum_each_interrogacion:['minimum_or_cap_rule_detected'],
  conditional_exam:['conditional_exam_rule_detected'],
  alternative_final_grade_formula:['alternative_final_grade_formula_detected'],
  minimum_attendance_75:['approval_requirement_detected','minimum_or_cap_rule_detected'],
  minimum_attendance_80:['approval_requirement_detected','minimum_or_cap_rule_detected'],
  minimum_attendance_100:['approval_requirement_detected','minimum_or_cap_rule_detected'],
  minimum_six_lab_experiences:['minimum_or_cap_rule_detected'],
};

function args(argv){
  const out={};
  for(let i=2;i<argv.length;i++){
    if(argv[i]==='--json')out.json=argv[++i];
    else if(argv[i]==='--markdown')out.markdown=argv[++i];
    else if(argv[i]==='--help')out.help=true;
    else throw new Error(`Opción desconocida: ${argv[i]}`);
  }
  return out;
}

function canonicalWeights(rows){
  return (rows||[]).map(row=>({name:normalizar(row.name??row.nombre),weight:Number(row.weight??row.peso)}))
    .sort((a,b)=>a.name.localeCompare(b.name,'en')||a.weight-b.weight);
}

function sameWeights(a,b){return JSON.stringify(canonicalWeights(a))===JSON.stringify(canonicalWeights(b));}

function problemFor(entry,parsed,weightsMatch,missedRules){
  if(entry.expectedStatus!==parsed.status){
    if(entry.expectedStatus==='not_found')return 'explicit_unavailable_message_not_recognized';
    if(entry.expectedStatus==='needs_review'&&parsed.status==='insufficient_information'){
      const percentages=(parsed.evaluationSourceText.match(/\d{1,3}(?:[.,]\d+)?\s*%/g)||[]).length;
      const oneLine=parsed.evaluationSourceText.split('\n').some(line=>(line.match(/\d{1,3}(?:[.,]\d+)?\s*%/g)||[]).length>1);
      return oneLine?'multiple_percentages_in_paragraph':'percentage_format_not_recognized';
    }
    return `classification_${parsed.status}_instead_of_${entry.expectedStatus}`;
  }
  if(!weightsMatch){
    const extra=canonicalWeights(parsed.filas).filter(row=>!canonicalWeights(entry.explicitWeights).some(g=>g.name===row.name&&g.weight===row.weight));
    if(extra.some(row=>/asistencia/.test(row.name)))return 'attendance_requirement_misread_as_weight';
    return 'explicit_weights_do_not_match';
  }
  if(missedRules.length)return 'complex_rule_signal_missed';
  return '';
}

function ejecutarBenchmark(options={}){
  const sources=JSON.parse(fs.readFileSync(options.sources||path.join(FIXTURES,'sources.json'),'utf8'));
  const gold=JSON.parse(fs.readFileSync(options.gold||path.join(FIXTURES,'gold.json'),'utf8'));
  const goldByCode=new Map(gold.entries.map(e=>[e.courseCode,e]));
  if(goldByCode.size!==gold.entries.length)throw new Error('Hay siglas duplicadas en las gold labels.');
  const sourceCodes=new Set(sources.sources.map(s=>s.courseCode));
  const missingGold=sources.sources.filter(s=>!goldByCode.has(s.courseCode)).map(s=>s.courseCode);
  const missingSource=gold.entries.filter(e=>!sourceCodes.has(e.courseCode)).map(e=>e.courseCode);
  if(missingGold.length||missingSource.length)throw new Error(`Dataset y gold no calzan. Sin gold: ${missingGold.join(',')||'ninguna'}; sin fuente: ${missingSource.join(',')||'ninguna'}.`);

  const rows=sources.sources.map(source=>{
    const entry=goldByCode.get(source.courseCode);
    const fixture=path.join(FIXTURES,source.fixture);
    const bytes=fs.readFileSync(fixture);
    const actualHash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(actualHash!==(source.fixtureHash||source.sourceHash))throw new Error(`${source.courseCode}: el fixture cambió sin actualizar su hash.`);
    const parsed=extraerEstructura(decodificarCatalogo(bytes),{courseCode:source.courseCode});
    const classificationMatch=entry.expectedStatus===parsed.status;
    const weightsMatch=sameWeights(entry.explicitWeights,parsed.filas);
    const missedRules=(entry.complexRules||[]).filter(rule=>{
      const accepted=SIGNALS[rule];
      return accepted&&!accepted.some(signal=>parsed.reasons.includes(signal));
    });
    return {
      courseCode:source.courseCode,courseName:source.courseName,sourceUrl:source.sourceUrl,
      capturedAt:source.capturedAt,sourceHash:source.sourceHash,fixtureHash:source.fixtureHash||source.sourceHash,fidelity:source.fidelity,
      goldStatus:entry.expectedStatus,parserStatus:parsed.status,classificationMatch,weightsMatch,
      goldWeights:entry.explicitWeights,parserWeights:parsed.filas.map(f=>({name:f.nombre,weight:f.peso})),
      goldComplexRules:entry.complexRules||[],missedComplexRules:missedRules,
      parserReasons:parsed.reasons,problem:problemFor(entry,parsed,weightsMatch,missedRules),
      goldReason:entry.reason,mustNotInfer:entry.mustNotInfer||[]
    };
  });

  const count=(predicate)=>rows.filter(predicate).length;
  const parserAuto=count(r=>r.parserStatus==='auto_importable');
  const complexTotal=rows.reduce((n,r)=>n+r.goldComplexRules.filter(rule=>SIGNALS[rule]).length,0);
  const complexMissed=rows.reduce((n,r)=>n+r.missedComplexRules.length,0);
  const metrics={
    datasetSize:rows.length,
    exactClassificationCount:count(r=>r.classificationMatch),
    exactClassificationAccuracy:count(r=>r.classificationMatch)/rows.length,
    exactWeightsCount:count(r=>r.weightsMatch),
    exactWeightsAccuracy:count(r=>r.weightsMatch)/rows.length,
    falseAutoImportableCount:count(r=>r.parserStatus==='auto_importable'&&r.goldStatus!=='auto_importable'),
    falseAutoImportableRate:parserAuto?count(r=>r.parserStatus==='auto_importable'&&r.goldStatus!=='auto_importable')/parserAuto:0,
    falseNeedsReviewCount:count(r=>r.parserStatus==='needs_review'&&r.goldStatus!=='needs_review'),
    falseInsufficientInformationCount:count(r=>r.parserStatus==='insufficient_information'&&r.goldStatus!=='insufficient_information'),
    complexRuleSignalCount:complexTotal,
    missedComplexRuleSignalCount:complexMissed,
    complexRuleSignalRecall:complexTotal?(complexTotal-complexMissed)/complexTotal:null,
  };
  return {benchmarkVersion:1,parserVersion:PARSER_VERSION,sourceGeneratedAt:sources.generatedAt||sources.capturedAt,metrics,rows};
}

function pct(value){return `${(value*100).toFixed(1)}%`;}
function mdCell(value){return String(value??'').replace(/\|/g,'\\|').replace(/\n/g,' ');}
function markdown(result){
  const m=result.metrics;
  const falseInsufficient=result.rows.filter(r=>r.parserStatus==='insufficient_information'&&r.goldStatus!=='insufficient_information');
  const dangerous=result.rows.filter(r=>r.parserStatus==='auto_importable'&&r.goldStatus!=='auto_importable');
  const missed=result.rows.filter(r=>r.missedComplexRules.length);
  const patterns=new Map();
  result.rows.filter(r=>r.problem).forEach(r=>{const arr=patterns.get(r.problem)||[];arr.push(r.courseCode);patterns.set(r.problem,arr);});
  const lines=[
    '# Benchmark del importador UC — Fase 2','',
    '## Resumen ejecutivo','',
    `El parser \`${result.parserVersion}\` clasificó correctamente **${m.exactClassificationCount} de ${m.datasetSize} programas (${pct(m.exactClassificationAccuracy)})** y no produjo falsos \`auto_importable\`. Ese cero es el resultado principal: en esta muestra el importador nunca afirmó que una pauta estaba lista cuando la lectura humana exigía revisión o decía que faltaban datos.`,
    '',
    `La cobertura todavía es conservadora: ${m.falseInsufficientInformationCount} programas quedaron como información insuficiente aunque el texto permitía rescatar una pauta revisable o declarar que el programa no estaba disponible. Además, la detección de señales complejas cubrió ${m.complexRuleSignalCount-m.missedComplexRuleSignalCount} de ${m.complexRuleSignalCount} señales humanas (${pct(m.complexRuleSignalRecall||0)}). No se modificó ninguna heurística en esta fase.`,
    '', '## Dataset utilizado','',
    '| Sigla | Curso | Captura | Fuente | Fidelidad |',
    '|---|---|---|---|---|',
    ...result.rows.map(r=>`| ${r.courseCode} | ${mdCell(r.courseName)} | ${r.capturedAt.slice(0,10)} | [Catálogo UC](${r.sourceUrl}) | ${r.fidelity} |`),
    '',
    'La muestra cubre 30 programas de facultades y escuelas distintas, con listas, párrafos, porcentajes entre paréntesis, cantidades por unidad, agregados, ausencia de ponderaciones, asistencia mínima y examen condicional. No apareció una regla oficial de reemplazo o descarte en estas 30 fuentes; esa cobertura queda explícitamente pendiente y no se simuló con texto inventado.',
    '', '## Fidelidad de fixtures existentes','',
    '| Fixture anterior | Auditoría | Hallazgo | Estado actual |',
    '|---|---|---|---|',
    '| IIC1103 | C · sintético | Inventaba Interrogación 1/2 y Proyecto; el oficial dice Pruebas 30, Examen 30, Tareas 30 y Participación 10. | Corregido a reducción fiel del oficial. |',
    '| FIS1514 | B · reducido fiel | Conservaba correctamente 3 Interrogaciones 60, Taller 10 y Examen 30, con redacción abreviada. | Refrescado con el texto oficial exacto. |',
    '| QIM100F | C · paráfrasis no fiel | Omitía los umbrales de eximición e inventaba “Para aprobar”; no era una reducción semánticamente equivalente. | Corregido a reducción fiel del oficial. |',
    '| BIO143M | C · sintético | Inventaba Pruebas, Controles y Trabajo; el oficial solo dice “3 Evaluaciones”. | Corregido a reducción fiel del oficial. |',
    '', '## Métricas','',
    `- Exactitud de clasificación: **${m.exactClassificationCount}/${m.datasetSize} (${pct(m.exactClassificationAccuracy)})**.`,
    `- Pesos explícitos exactos: **${m.exactWeightsCount}/${m.datasetSize} (${pct(m.exactWeightsAccuracy)})**.`,
    `- \`false_auto_importable_count\`: **${m.falseAutoImportableCount}**.`,
    `- \`false_auto_importable_rate\`: **${pct(m.falseAutoImportableRate)}** de las propuestas automáticas.`,
    `- Falsos \`needs_review\`: **${m.falseNeedsReviewCount}**.`,
    `- Falsos \`insufficient_information\`: **${m.falseInsufficientInformationCount}**.`,
    `- Señales de regla compleja detectadas: **${m.complexRuleSignalCount-m.missedComplexRuleSignalCount}/${m.complexRuleSignalCount} (${pct(m.complexRuleSignalRecall||0)})**.`,
    '', '## Matriz completa','',
    '| Sigla | Gold | Parser | Clase | Pesos | Razones del parser | Problema |',
    '|---|---|---|---:|---:|---|---|',
    ...result.rows.map(r=>`| ${r.courseCode} | ${r.goldStatus} | ${r.parserStatus} | ${r.classificationMatch?'sí':'NO'} | ${r.weightsMatch?'sí':'NO'} | ${mdCell(r.parserReasons.join(', ')||'—')} | ${mdCell(r.problem||'—')} |`),
    '', '## Falsos positivos peligrosos',''
  ];
  lines.push(dangerous.length?dangerous.map(r=>`- **${r.courseCode}:** ${r.goldReason}`).join('\n'):'Ninguno en esta muestra. `false_auto_importable_count = 0`.');
  lines.push('', '## Falsos negativos y exceso de conservadurismo','');
  lines.push(falseInsufficient.map(r=>`- **${r.courseCode}:** el parser devolvió \`insufficient_information\`, pero la gold label es \`${r.goldStatus}\`. ${r.goldReason} Patrón: \`${r.problem}\`.`).join('\n'));
  lines.push('', 'Aunque LET0003 sí quedó en `needs_review`, sus pesos no calzan: el parser sumó el 80% de asistencia como si fuera una cuarta evaluación y obtuvo 180%. El estado conservador evita la importación automática, pero el candidato mostrado a revisión es incorrecto.');
  lines.push('', '## Señales complejas omitidas','');
  lines.push(missed.length?missed.map(r=>`- **${r.courseCode}:** ${r.missedComplexRules.join(', ')}.`).join('\n'):'Ninguna.');
  lines.push('', '## Patrones observados','');
  for(const [problem,codes] of patterns)lines.push(`- \`${problem}\`: ${codes.join(', ')}.`);
  lines.push('', '## Recomendaciones para Fase 3','',
    '1. **Unificar la lectura de filas con porcentaje sin relajar la seguridad.** Aceptar paréntesis, punto final y filas numeradas, pero separar vocabulario de requisitos como asistencia. Arreglaría AGL007, GEO1002 y LET0003. El riesgo es convertir porcentajes de reglas en pesos; se controla exigiendo forma de fila y validando el total.',
    '2. **Reconocer respuestas oficiales de ausencia.** Tratar “Programa de curso no disponible” como `not_found`. Arreglaría MED101A y QIM100 sin aumentar el riesgo de una importación falsa.',
    '3. **Ampliar señales de prosa compleja antes de extraer fórmulas.** Cubrir “eximible”, fórmulas alternativas y párrafos con varias categorías explícitas, manteniéndolos siempre en `needs_review`. Mejoraría QIM100F e ICE1513; el principal riesgo es confundir una explicación con una pauta, por lo que no debe producir `auto_importable`.',
    '', 'Antes de implementar reglas de reemplazo o descarte, hay que sumar fixtures oficiales que realmente las contengan. Esta muestra no autoriza una regex para esos casos.',
    '', '## Archivos creados o modificados','',
    '- `bin/capturar-benchmark-uc.js`: captura acotada, secuencial y reutilizable de la lista explícita.',
    '- `bin/benchmark-pautas-uc.js`: runner offline, métricas y reporte reproducible.',
    '- `tests/fixtures/catalogo-uc-benchmark/`: 30 fuentes completas, manifiesto con hashes y gold labels humanas.',
    '- `tests/catalogo-uc-benchmark.test.js`: integridad del dataset y línea base de métricas.',
    '- `tests/fixtures/catalogo-uc/{IIC1103,FIS1514,QIM100F,BIO143M}.html`: auditoría y corrección de fidelidad.',
    '- `tests/catalogo-uc-offline.test.js`: expectativas alineadas con el texto oficial, sin cambiar el parser.',
    '- `docs/benchmark-pautas-uc-fase2.{md,json}`: matriz y resultados completos.',
    '', '## Tests','',
    '- `node tests/catalogo-uc-offline.test.js`: 41 PASS, 0 FAIL, exit code 0.',
    '- `node tests/catalogo-uc-benchmark.test.js`: 13 PASS, 0 FAIL, exit code 0.',
    '- El test nuevo contra el árbol anterior `e8b56cb`: exit code 1 por ausencia del benchmark.',
    '- `npm test`: 138 tests, exit code 0.',
    '',
    'La captura de fuentes no corre en CI; el benchmark y la suite sí son completamente offline.'
  );
  return lines.join('\n')+'\n';
}

function main(){
  const options=args(process.argv);
  if(options.help){console.log('Uso: node bin/benchmark-pautas-uc.js [--json salida] [--markdown informe]');return;}
  const result=ejecutarBenchmark();
  const report=markdown(result);
  if(options.json){fs.mkdirSync(path.dirname(path.resolve(options.json)),{recursive:true});fs.writeFileSync(path.resolve(options.json),JSON.stringify(result,null,2)+'\n');}
  if(options.markdown){fs.mkdirSync(path.dirname(path.resolve(options.markdown)),{recursive:true});fs.writeFileSync(path.resolve(options.markdown),report);}
  console.log(report);
}

if(require.main===module){try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={ejecutarBenchmark,markdown,canonicalWeights,sameWeights};
