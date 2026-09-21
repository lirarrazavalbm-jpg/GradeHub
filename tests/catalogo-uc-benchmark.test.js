// El benchmark es completamente offline: las fuentes oficiales están
// congeladas y las respuestas humanas viven separadas del output del parser.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const dir=path.join(__dirname,'fixtures','catalogo-uc-benchmark');
const runner=process.env.GRADEHUB_BENCHMARK||path.join(root,'bin','benchmark-pautas-uc.js');
let benchmark;
try{benchmark=require(runner);}catch(error){console.error('FAIL: falta el runner offline del benchmark UC.');process.exit(1);}
const sources=JSON.parse(fs.readFileSync(path.join(dir,'sources.json'),'utf8'));
const gold=JSON.parse(fs.readFileSync(path.join(dir,'gold.json'),'utf8'));
let ok=0,fail=0;
function chk(name,condition){if(condition){ok++;console.log('  OK   '+name);}else{fail++;console.error('  FAIL '+name);}}

console.log('\n=== Dataset oficial congelado ===');
chk('la muestra tiene 30 programas diversos',sources.sources.length===30);
chk('cada fuente conserva URL oficial, fecha, hash y fidelidad',sources.sources.every(s=>
  s.sourceUrl.startsWith('https://catalogo.uc.cl/')&&/^2026-\d\d-\d\dT/.test(s.capturedAt)&&/^[a-f0-9]{64}$/.test(s.sourceHash)&&/^[a-f0-9]{64}$/.test(s.fixtureHash)&&s.fidelity==='normalized_official_html'));
chk('cada hash describe exactamente el HTML congelado',sources.sources.every(s=>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,s.fixture))).digest('hex')===s.fixtureHash));
chk('las gold labels están separadas y fueron declaradas humanas',/Lectura humana/.test(gold.basis)&&gold.entries.length===30);
chk('las gold labels no guardan el veredicto del parser',gold.entries.every(e=>!('parserStatus'in e)&&!('parserReasons'in e)));

console.log('\n=== Línea base de Fase 2 ===');
const result=benchmark.ejecutarBenchmark();
chk('el parser procesa las 30 fuentes sin red',result.rows.length===30);
chk('la exactitud de clasificación queda fijada en 25 de 30',result.metrics.exactClassificationCount===25);
chk('los pesos explícitos calzan en 26 de 30',result.metrics.exactWeightsCount===26);
chk('no hay falsos auto-importable',result.metrics.falseAutoImportableCount===0&&result.metrics.falseAutoImportableRate===0);
chk('hay cinco falsos insufficient_information visibles',result.metrics.falseInsufficientInformationCount===5);
chk('IIC1103 usa la pauta oficial 30/30/30/10',(()=>{const r=result.rows.find(x=>x.courseCode==='IIC1103');return r.weightsMatch&&r.parserWeights.map(x=>x.weight).join('|')==='30|30|30|10';})());
chk('los dos programas no disponibles no se confunden en la gold label',
  ['MED101A','QIM100'].every(code=>result.rows.find(r=>r.courseCode===code).goldStatus==='not_found'));
chk('QIM100F deja visibles las señales complejas que todavía omite',(()=>{const r=result.rows.find(x=>x.courseCode==='QIM100F');return r.missedComplexRules.includes('exemption_rule')&&r.missedComplexRules.includes('alternative_final_grade_formula');})());

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
