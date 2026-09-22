#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const inventoryTool = require(process.env.GRADEHUB_INVENTORY || '../bin/inventario-catalogo-uc.js');

let ok = 0;
let fail = 0;
function check(name, condition) {
  if (condition) { ok++; console.log(`  OK   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

(async () => {
  console.log('\n=== Las siglas salen del repo, no de una lista paralela ===');
  const inventory = inventoryTool.construirInventario();
  check('deduplica más de once mil siglas conocidas', inventory.totalUniqueCourseCodes > 11000 && inventory.courses.length === inventory.totalUniqueCourseCodes);
  check('cada sigla conserva sus fuentes', inventory.courses.every(course => course.sources.length > 0));
  check('separa cursos con y sin preset', inventory.withExistingPreset > 0 && inventory.withExistingPreset + inventory.withoutExistingPreset === inventory.totalUniqueCourseCodes);
  check('el smoke mezcla cursos con y sin preset', (() => {
    const smoke = inventoryTool.seleccionarSmoke(inventory);
    return smoke.length === 10 && smoke.some(course => course.hasExistingPreset) && smoke.some(course => !course.hasExistingPreset);
  })());

  console.log('\n=== Fetch y análisis son etapas distintas ===');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradehub-uc-cache-'));
  const course = { courseCode: 'ZZZ1000', courseName: 'Curso sintético', hasExistingPreset: false, sources: ['test'], credits: 10 };
  let requests = 0;
  const fakeFetch = async () => {
    requests++;
    return new Response('<html><body><pre>SIGLA: ZZZ1000\nVI. EVALUACIONES\nPrueba 1: 50%\nPrueba 2: 50%\nVII. BIBLIOGRAFIA</pre></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const first = await inventoryTool.fetchCourse(course, { cacheDir, fetchImpl: fakeFetch, retries: 0 });
  const second = await inventoryTool.fetchCourse(course, { cacheDir, fetchImpl: fakeFetch, retries: 0 });
  check('la primera respuesta queda cacheada con hash y fecha', !first.fromCache && first.entry.contentHash && first.entry.fetchedAt);
  check('la segunda lectura no repite la petición', second.fromCache && requests === 1);
  const analyzed = inventoryTool.analizarEntrada(course, inventoryTool.leerCache(cacheDir, course.courseCode));
  check('analyze usa la cache y clasifica sin red', analyzed.classification === 'auto_importable' && analyzed.weights.map(row => row.weight).join('|') === '50|50');
  check('el alcance institucional nunca inventa semestre, sección ni NRC', analyzed.scope === 'institutional_program' && analyzed.semester === null && analyzed.section === null && analyzed.NRC === null);

  console.log('\n=== Robots y fallos de fuente quedan explícitos ===');
  const robots = 'User-agent: *\nDisallow: /administrator/\nDisallow: /cache/\n';
  check('las restricciones actuales no bloquean /index.php', inventoryTool.robotsPermitePrograma(robots));
  check('un bloqueo de raíz sí detendría la corrida', !inventoryTool.robotsPermitePrograma('User-agent: *\nDisallow: /\n'));
  const missing = inventoryTool.analizarEntrada(course, null);
  check('una entrada no descargada es error de transporte, no programa vacío', missing.classification === 'transport_error' && missing.reasons.includes('source_not_cached'));

  console.log('\n=== Comparar nunca convierte una diferencia en reemplazo ===');
  const withPreset = { ...course, hasExistingPreset: true, existingPreset: [{ name: 'Prueba 1', weight: 50 }, { name: 'Prueba 2', weight: 50 }] };
  const same = inventoryTool.compararPreset(withPreset, { status: 'auto_importable', reasons: [], filas: [{ nombre: 'Prueba 1', peso: 50 }, { nombre: 'Prueba 2', peso: 50 }] });
  const changed = inventoryTool.compararPreset(withPreset, { status: 'auto_importable', reasons: [], filas: [{ nombre: 'Prueba 1', peso: 40 }, { nombre: 'Prueba 2', peso: 60 }] });
  const unrelated = inventoryTool.compararPreset(withPreset, { status: 'auto_importable', reasons: [], filas: [{ nombre: 'Proyecto', peso: 100 }] });
  check('una coincidencia queda informada como aproximada', same.category === 'approximately_matches');
  check('un mismo nombre con otro peso es diferencia relevante', changed.category === 'relevant_difference');
  check('estructuras sin correspondencia quedan como no comparables', unrelated.category === 'cannot_compare');

  const splitMetrics = inventoryTool.metricas([
    { hasExistingPreset: false, sourceStatus: 'officially_unavailable', classification: 'not_found' },
    { hasExistingPreset: false, sourceStatus: 'http_404', classification: 'not_found' },
  ]);
  check('no disponible y no encontrado se cuentan por separado', splitMetrics.all.officiallyUnavailable === 1 && splitMetrics.all.notFound === 1);

  const candidates = Array.from({ length: 12 }, (_, index) => ({ courseCode: `ZZZ${1000 + index}`, courseName: `Curso ${index}`, hasExistingPreset: false, classification: 'auto_importable' }));
  const selected = inventoryTool.seleccionarRevisionSeguridad(candidates);
  const completed = inventoryTool.revisionManual(candidates, selected.map(entry => ({ courseCode: entry.courseCode, officialTextChecked: true, verdict: 'correct', notes: 'Texto y pesos coinciden.' })));
  check('la muestra de seguridad toma diez candidatos repartidos', selected.length === 10 && selected[0].courseCode === 'ZZZ1000' && selected.at(-1).courseCode === 'ZZZ1011');
  check('solo una revisión explícita completa cierra la muestra', completed.status === 'complete' && completed.falseAutoImportableCount === 0);

  const unstableDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradehub-uc-unstable-'));
  const unstableFetch = async url => {
    if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /administrator/\n', { status: 200 });
    throw new Error('conexión interrumpida');
  };
  const unstable = await inventoryTool.fetchInventory({ courses: candidates.slice(0, 5) }, { cacheDir: unstableDir, fetchImpl: unstableFetch, retries: 0, delayMs: 0 });
  check('tres fallos seguidos detienen el fetch conservador', unstable.stopped && unstable.courses.length === 3 && unstable.errors === 3);
  const recovered = await inventoryTool.fetchInventory({ courses: candidates.slice(0, 5) }, { cacheDir: unstableDir, fetchImpl: fakeFetch, retries: 0, delayMs: 0, retryErrors: true });
  check('el reintento apunta solo a errores cacheados', recovered.requested === 3 && recovered.fetched === 3 && recovered.errors === 0);

  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(unstableDir, { recursive: true, force: true });
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
