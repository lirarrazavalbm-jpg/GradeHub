#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const tool = require(process.env.GRADEHUB_PHASE5 || '../bin/validar-candidatos-uc-fase5.js');

const ROOT = path.join(__dirname, '..');
let ok = 0;
let fail = 0;
function check(name, condition) {
  if (condition) { ok++; console.log(`  OK   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

function synthetic(courseCode, primaryStratum, feature = {}) {
  return {
    courseCode,
    courseName: `Curso ${courseCode}`,
    primaryStratum,
    features: {
      discipline: null,
      courseCodePrefix: courseCode.replace(/\d/g, ''),
      headingType: 'evaluation',
      categoryCountBucket: '3',
      percentageFormat: 'colon',
      evaluationLayout: primaryStratum.split('|')[0],
      sourceContainer: 'preformatted_text',
      sectionLengthBucket: 'short_0-180',
      programVersionAvailability: 'missing',
      categoryNumberForm: 'mixed',
      additionalTextAfterPercentages: 'absent',
      ...feature,
    },
    scope: 'institutional_program',
    sourceUrl: `https://catalogo.uc.cl/${courseCode}`,
    evaluationSourceText: 'V. EVALUACION\nPrueba 1: 50%\nPrueba 2: 50%',
    candidateWeights: [{ name: 'Pruebas', weight: 50 }, { name: 'Examen', weight: 50 }],
    parserOutput: { classification: 'auto_importable', reasons: [], unparsedRelevantLines: [] },
    provenance: {
      evaluationHash: `hash-${courseCode}`,
      retrievedAt: '2026-09-21T00:00:00Z',
      parserVersion: 'uc-catalogo-3',
    },
  };
}

console.log('\n=== La muestra representa formatos, no posiciones del catálogo ===');
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'catalogo-uc-review-sample-fase5.json')));
const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'catalogo-uc-manual-validation-fase5.json')));
const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'catalogo-uc-validation-metrics-fase5.json')));
check('la población son los 2.001 nuevos auto_importable', sample.populationSize === 2001);
check('la muestra queda dentro del rango aprobado y tiene 120 siglas únicas', sample.sampleSize === 120 && new Set(sample.sample.map(item => item.courseCode)).size === 120);
check('todos los estratos primarios quedan representados', sample.stratification.primaryStrata.every(row => row.sampleCount > 0));
check('los formatos poco frecuentes tienen una tasa mayor que el estrato dominante', (() => {
  const rows = sample.stratification.primaryStrata;
  const rare = rows.filter(row => row.populationCount <= 4);
  const dominant = [...rows].sort((a, b) => b.populationCount - a.populationCount)[0];
  return rare.length > 0 && rare.every(row => row.samplingRate > dominant.samplingRate);
})());
check('la selección cubre cada formato de porcentaje observado', Object.keys(sample.stratification.populationByFeature.percentageFormat).every(key => sample.stratification.sampleByFeature.percentageFormat[key] > 0));
check('no inventa una facultad cuando la fuente no la conserva', sample.sample.every(item => item.features.academicUnit === null));
check('el alcance institucional nunca declara semestre, sección ni NRC', sample.sample.every(item => item.scope === 'institutional_program' && item.semester === null && item.section === null && item.NRC === null));

const population = [];
for (let index = 0; index < 200; index++) population.push(synthetic(`COM${String(index).padStart(3, '0')}`, 'bullet_list|3|missing|absent'));
for (let index = 0; index < 20; index++) population.push(synthetic(`RAR${String(index).padStart(3, '0')}`, 'paragraph|3|declared|present', { evaluationLayout: 'paragraph', programVersionAvailability: 'declared', additionalTextAfterPercentages: 'present' }));
const firstSelection = tool.selectStratifiedSample(population, 100, 'seed-fija');
const secondSelection = tool.selectStratifiedSample(population, 100, 'seed-fija');
check('la seed reproduce exactamente las mismas siglas', firstSelection.selected.map(x => x.courseCode).join('|') === secondSelection.selected.map(x => x.courseCode).join('|'));
check('el estrato raro queda sobrerrepresentado', (() => {
  const common = firstSelection.allocation.find(row => row.primaryStratum.startsWith('bullet_list'));
  const rare = firstSelection.allocation.find(row => row.primaryStratum.startsWith('paragraph'));
  return rare.samplingRate > common.samplingRate;
})());

console.log('\n=== El parser no se autovalida ===');
check('ninguna etiqueta humana viene contestada', labels.reviews.length === 120 && labels.reviews.every(review => review.humanLabel === null && review.reviewer === null && review.reviewedAt === null));
check('la clasificación del parser no se copia al archivo de respuestas', labels.reviews.every(review => !Object.prototype.hasOwnProperty.call(review, 'classification') && !Object.prototype.hasOwnProperty.call(review, 'parserOutput')));
check('sin revisión las métricas dicen pendiente, no éxito', metrics.reviewed_count === 0 && metrics.false_auto_importable_rate === null && metrics.stopCondition === 'pending_review');

const retainedReview = {
  sampleHash: sample.sampleHash,
  reviews: sample.sample.map((item, index) => ({
    courseCode: item.courseCode,
    evaluationHash: item.provenance.evaluationHash,
    humanLabel: index === 0 ? 'correct_auto_importable' : null,
    note: index === 0 ? 'Revisado contra la fuente.' : '',
    reviewer: index === 0 ? 'revisor' : null,
    reviewedAt: index === 0 ? '2026-09-21T12:00:00Z' : null,
  })),
};
const labelsRetained = tool.prepareLabels(sample, retainedReview);
const changedSample = JSON.parse(JSON.stringify(sample));
changedSample.sample[0].provenance.evaluationHash = 'fuente-oficial-cambiada';
const labelsInvalidated = tool.prepareLabels(changedSample, retainedReview);
check('una decisión se conserva mientras el texto oficial sea el mismo', labelsRetained.reviews[0].humanLabel === 'correct_auto_importable');
check('una decisión vieja se borra si cambia el hash evaluativo', labelsInvalidated.reviews[0].humanLabel === null && labelsInvalidated.reviews[0].reviewer === null && labelsInvalidated.reviews[0].reviewedAt === null);

const tinySample = {
  sampleHash: 'tiny',
  sample: [synthetic('SIM1000', 'bullet_list|3|missing|absent'), synthetic('SIM2000', 'paragraph|3|declared|present', { evaluationLayout: 'paragraph', programVersionAvailability: 'declared', additionalTextAfterPercentages: 'present' })],
  stratification: {
    primaryStrata: [
      { primaryStratum: 'bullet_list|3|missing|absent', populationCount: 1900 },
      { primaryStratum: 'paragraph|3|declared|present', populationCount: 3 },
    ],
    populationByFeature: tool.distributions(population),
  },
};
const reviewedAt = '2026-09-21T12:00:00Z';
const allCorrect = {
  sampleHash: 'tiny',
  reviews: tinySample.sample.map(item => ({ courseCode: item.courseCode, evaluationHash: item.provenance.evaluationHash, humanLabel: 'correct_auto_importable', note: '', reviewer: 'revisor', reviewedAt })),
};
const oneError = JSON.parse(JSON.stringify(allCorrect));
oneError.reviews[1].humanLabel = 'should_be_needs_review';
oneError.reviews[1].note = 'Hay una condición que el parser no detectó.';
const safeMetrics = tool.calculateMetrics(tinySample, allCorrect);
const stoppedMetrics = tool.calculateMetrics(tinySample, oneError);
check('cero falsos habilita diseñar aprobación, nunca importar solo', safeMetrics.stopCondition === 'validated_for_approval_workflow_design' && safeMetrics.false_auto_importable_count === 0 && safeMetrics.massImportAllowed === false);
check('un falso positivo activa el stop condition', stoppedMetrics.stopCondition === 'stop_false_auto_importable_detected' && stoppedMetrics.false_auto_importable_count === 1 && stoppedMetrics.false_auto_importable_rate === 0.5);
check('el error conserva texto, patrón y población potencial', stoppedMetrics.falseAutoImportableDetails[0].evaluationSourceText && stoppedMetrics.falseAutoImportableDetails[0].responsiblePatterns.length > 0 && stoppedMetrics.falseAutoImportableDetails[0].potentialPrimaryStratumPopulation === 3);
check('una etiqueta sin autor y fecha se rechaza', (() => {
  const unsigned = JSON.parse(JSON.stringify(allCorrect));
  unsigned.reviews[0].reviewer = null;
  try { tool.calculateMetrics(tinySample, unsigned); return false; } catch (_) { return true; }
})());

console.log('\n=== Aprobar genera un diff, no escribe producción ===');
const aggregate = sample.sample.find(item => item.courseCode === 'IMT2100');
const proposal = tool.candidateToPresetProposal(aggregate, { status: 'approved', approvedBy: 'revisor', approvedAt: reviewedAt });
check('la definición usa el formato actual de PRESETS_UC y no inventa período', proposal.presetDefinition.sigla === 'IMT2100' && Array.isArray(proposal.presetDefinition.evals) && !Object.prototype.hasOwnProperty.call(proposal.presetDefinition, 'periodo'));
check('tres Pruebas agregadas siguen siendo UNA categoría de 60%', proposal.presetDefinition.evals.filter(row => row[0] === 'Pruebas' && row[1] === 60).length === 1 && proposal.presetDefinition.evals.length === 4);
check('la provenance conserva fuente, hash, parser, aprobación y alcance', proposal.provenance.sourceType === 'official_uc_catalog' && proposal.provenance.evaluationHash && proposal.provenance.parserVersion === 'uc-catalogo-3' && proposal.provenance.approvedBy === 'revisor' && proposal.provenance.scope === 'institutional_program' && proposal.provenance.semester === null);
check('sin aprobación explícita no hay propuesta', (() => { try { tool.candidateToPresetProposal(aggregate, {}); return false; } catch (_) { return true; } })());
check('una edición que ya no suma 100 se rechaza', (() => { try { tool.candidateToPresetProposal(aggregate, { status: 'approved', approvedBy: 'revisor', approvedAt: reviewedAt, editedEvaluations: [{ name: 'Pruebas', weight: 40 }] }); return false; } catch (_) { return true; } })());

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
