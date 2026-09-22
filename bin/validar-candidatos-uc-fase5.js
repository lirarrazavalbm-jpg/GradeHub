#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  decodificarCatalogo,
  extraerEstructura,
  normalizar,
} = require('./proponer-pautas-uc.js');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INVENTORY = path.join(ROOT, 'docs', 'catalogo-uc-inventory.json');
const DEFAULT_CACHE = path.join(ROOT, '.cache', 'catalogo-uc', 'programas');
const DEFAULT_SAMPLE = path.join(ROOT, 'docs', 'catalogo-uc-review-sample-fase5.json');
const DEFAULT_LABELS = path.join(ROOT, 'docs', 'catalogo-uc-manual-validation-fase5.json');
const DEFAULT_METRICS = path.join(ROOT, 'docs', 'catalogo-uc-validation-metrics-fase5.json');
const DEFAULT_REPORT = path.join(ROOT, 'docs', 'catalogo-uc-fase5.md');
const DEFAULT_PACKET = path.join(ROOT, 'docs', 'catalogo-uc-review-packet-fase5.md');
const DEFAULT_SEED = 'gradehub-uc-fase5-v1';
const DEFAULT_SAMPLE_SIZE = 120;
const ALLOWED_LABELS = [
  'correct_auto_importable',
  'should_be_needs_review',
  'insufficient_information',
  'source_problem',
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value.endsWith('\n') ? value : value + '\n');
}

function sigla(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function cleanValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim() || null;
}

function extractDeclaredField(text, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`(?:^|\\n)${escaped}\\s*:\\s*([^\\n]+)`, 'i'));
  return match ? cleanValue(match[1]) : null;
}

function headingType(heading) {
  const value = normalizar(String(heading || '').replace(/^(?:[IVXLCDM]+|\d+)\s*[.)-]?\s*/i, '').replace(/[:.\s]+$/, ''));
  if (/^estrategias? evaluativas?$/.test(value)) return 'evaluation_strategies';
  if (/^evaluacion(?:es)? de aprendizajes?$/.test(value)) return 'learning_assessment';
  if (/^evaluacion(?:es)? del aprendizaje$/.test(value)) return 'learning_assessment';
  if (/^sistema de evaluacion$/.test(value)) return 'evaluation_system';
  if (/^evaluacion(?:es)?(?: del curso)?$/.test(value)) return 'evaluation';
  return value ? `other:${value}` : 'missing';
}

function categoryCountBucket(count) {
  if (count <= 2) return '1-2';
  if (count === 3) return '3';
  if (count === 4) return '4';
  return '5+';
}

function sectionLengthBucket(length) {
  if (length <= 180) return 'short_0-180';
  if (length <= 360) return 'medium_181-360';
  return 'long_361+';
}

function linePercentageFormat(line) {
  const value = String(line || '');
  if (/\b(?:c\/?u|cada una|cada uno)\b/i.test(value)) return 'per_item';
  if (/\([^)]*\d+(?:[.,]\d+)?\s*%[^)]*\)/.test(value)) return 'parenthesized';
  if (/:\s*\d+(?:[.,]\d+)?\s*%/.test(value)) return 'colon';
  if (/=\s*\d+(?:[.,]\d+)?\s*%/.test(value)) return 'equals';
  if (/\d+(?:[.,]\d+)?\s*%/.test(value)) return 'plain';
  return 'other';
}

function percentageFormat(lines) {
  const formats = [...new Set(lines.map(linePercentageFormat))].sort();
  return formats.length === 1 ? formats[0] : `mixed:${formats.join('+')}`;
}

function evaluationLayout(lines) {
  if (!lines.length) return 'empty';
  const bullets = lines.filter(line => /^\s*[-•*?]\s*\S/.test(line)).length;
  const numbered = lines.filter(line => /^\s*\d+\s*[.)-]\s+/.test(line)).length;
  const tableLike = lines.filter(line => /\S\s{3,}\d+(?:[.,]\d+)?\s*%/.test(line)).length;
  const paragraphs = lines.filter(line => line.length > 150 || (line.match(/%/g) || []).length > 1).length;
  const majority = Math.ceil(lines.length / 2);
  if (paragraphs >= majority) return 'paragraph';
  if (tableLike >= majority) return 'table_like';
  if (numbered >= majority) return 'numbered_list';
  if (bullets >= majority) return 'bullet_list';
  return 'plain_lines';
}

function pluralSurface(name) {
  const first = normalizar(name).split(/\s+/)[0] || '';
  if (!first) return 'unknown';
  if (/^(?:analisis|sintesis|tesis|crisis|campus|estatus)$/.test(first)) return 'ambiguous';
  return /(?:s|es)$/.test(first) ? 'plural_like' : 'singular_like';
}

function categoryNumberForm(rows) {
  if (rows.some(row => row.detail && Number(row.detail.cantidad) > 1)) return 'explicit_count';
  const values = [...new Set(rows.map(row => pluralSurface(row.name)))];
  return values.length === 1 ? values[0] : 'mixed';
}

function additionalTextAfterPercentages(sourceText) {
  const lines = String(sourceText || '').split('\n').slice(1);
  let lastPercentage = -1;
  lines.forEach((line, index) => { if (/%/.test(line)) lastPercentage = index; });
  const trailingLines = lastPercentage >= 0 ? lines.slice(lastPercentage + 1).filter(line => line.trim()) : [];
  const inlineSuffix = lines.some(line => /%\s*(?:[.;,:-]\s*)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}/.test(line));
  return {
    present: trailingLines.length > 0 || inlineSuffix,
    trailingLines,
    inlineSuffix,
  };
}

function codePrefix(courseCode) {
  return (String(courseCode || '').match(/^[A-Z]+/) || ['unknown'])[0];
}

function cacheFor(cacheDir, courseCode) {
  const file = path.join(cacheDir, `${sigla(courseCode)}.json`);
  if (!fs.existsSync(file)) throw new Error(`Falta la fuente cacheada de ${courseCode}. Ejecuta la Fase 4 antes de preparar la muestra.`);
  const entry = readJson(file);
  if (entry.httpStatus !== 200 || !entry.contentBase64) throw new Error(`La cache de ${courseCode} no contiene una respuesta oficial utilizable.`);
  return entry;
}

function analyzeCandidate(entry, cacheDir = DEFAULT_CACHE) {
  if (entry.hasExistingPreset || entry.classification !== 'auto_importable') {
    throw new Error(`${entry.courseCode} no pertenece a la población nueva auto_importable.`);
  }
  const cached = cacheFor(cacheDir, entry.courseCode);
  const html = decodificarCatalogo(Buffer.from(cached.contentBase64, 'base64'));
  const parsed = extraerEstructura(html, { courseCode: entry.courseCode });
  if (parsed.status !== 'auto_importable') throw new Error(`${entry.courseCode} dejó de ser auto_importable con el parser congelado.`);
  if (entry.evaluationHash && parsed.evaluationSourceHash !== entry.evaluationHash) {
    throw new Error(`La fuente evaluativa de ${entry.courseCode} no coincide con el inventario de Fase 4.`);
  }
  const parsedLines = [...new Set((parsed.filas || []).map(row => row.linea).filter(Boolean))];
  const weights = (entry.weights || []).map(row => ({
    name: row.name,
    weight: row.weight,
    ...(row.detail ? { detail: row.detail } : {}),
  }));
  const additional = additionalTextAfterPercentages(parsed.evaluationSourceText);
  const discipline = extractDeclaredField(parsed.texto, 'DISCIPLINA');
  const features = {
    academicUnit: null,
    discipline,
    courseCodePrefix: codePrefix(entry.courseCode),
    headingType: headingType(parsed.evaluationHeading),
    evaluationHeading: parsed.evaluationHeading || null,
    categoryCount: weights.length,
    categoryCountBucket: categoryCountBucket(weights.length),
    percentageFormat: percentageFormat(parsedLines),
    evaluationLayout: evaluationLayout(parsedLines),
    sourceContainer: /<pre\b/i.test(html) ? 'preformatted_text' : /<table\b/i.test(html) ? 'html_table' : 'html_text',
    sectionLength: parsed.evaluationSourceText.length,
    sectionLengthBucket: sectionLengthBucket(parsed.evaluationSourceText.length),
    programVersionAvailability: entry.programVersionText ? 'declared' : 'missing',
    categoryNumberForm: categoryNumberForm(weights),
    additionalTextAfterPercentages: additional.present ? 'present' : 'absent',
    additionalTextDetail: additional,
  };
  const primaryStratum = [
    features.evaluationLayout,
    features.categoryCountBucket,
    features.programVersionAvailability,
    features.additionalTextAfterPercentages,
  ].join('|');
  return {
    courseCode: entry.courseCode,
    courseName: entry.courseName,
    sourceUrl: entry.sourceUrl,
    programVersionText: entry.programVersionText || null,
    evaluationSourceText: entry.evaluationSourceText,
    candidateWeights: weights,
    parserOutput: {
      classification: entry.classification,
      reasons: entry.reasons || [],
      unparsedRelevantLines: entry.unparsedRelevantLines || [],
    },
    existingPresetComparison: entry.existingPresetComparison || null,
    scope: 'institutional_program',
    semester: null,
    section: null,
    NRC: null,
    provenance: {
      sourceType: 'official_uc_catalog',
      sourceUrl: entry.sourceUrl,
      courseCode: entry.courseCode,
      retrievedAt: entry.retrievedAt,
      programVersionText: entry.programVersionText || null,
      evaluationHash: entry.evaluationHash,
      sourceContentHash: entry.sourceContentHash,
      parserVersion: entry.parserVersion,
      scope: 'institutional_program',
    },
    features,
    primaryStratum,
  };
}

function countBy(items, getter) {
  const counts = new Map();
  items.forEach(item => {
    const key = String(getter(item) ?? 'missing');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')));
}

const FEATURE_DIMENSIONS = {
  discipline: item => item.features.discipline || 'missing',
  courseCodePrefix: item => item.features.courseCodePrefix,
  headingType: item => item.features.headingType,
  categoryCountBucket: item => item.features.categoryCountBucket,
  percentageFormat: item => item.features.percentageFormat,
  evaluationLayout: item => item.features.evaluationLayout,
  sourceContainer: item => item.features.sourceContainer,
  sectionLengthBucket: item => item.features.sectionLengthBucket,
  programVersionAvailability: item => item.features.programVersionAvailability,
  categoryNumberForm: item => item.features.categoryNumberForm,
  additionalTextAfterPercentages: item => item.features.additionalTextAfterPercentages,
};

function distributions(items) {
  return Object.fromEntries(Object.entries(FEATURE_DIMENSIONS).map(([name, getter]) => [name, countBy(items, getter)]));
}

function allocateStrata(groups, sampleSize) {
  const rows = [...groups.entries()].map(([key, entries]) => ({ key, population: entries.length, sample: 0 }));
  if (rows.length > sampleSize) throw new Error(`Hay ${rows.length} estratos primarios y la muestra de ${sampleSize} no alcanza para cubrirlos.`);
  rows.forEach(row => { row.sample = 1; });
  let assigned = rows.length;
  while (assigned < sampleSize) {
    const available = rows.filter(row => row.sample < row.population);
    if (!available.length) break;
    available.sort((a, b) => {
      const scoreA = Math.sqrt(a.population) / (a.sample + 0.5);
      const scoreB = Math.sqrt(b.population) / (b.sample + 0.5);
      return scoreB - scoreA || a.key.localeCompare(b.key, 'en');
    });
    available[0].sample++;
    assigned++;
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key, 'en'));
}

function featureTokens(item) {
  return Object.entries(FEATURE_DIMENSIONS).map(([name, getter]) => `${name}=${getter(item) || 'missing'}`);
}

function deterministicOrder(seed, courseCode) {
  return sha256(`${seed}|${courseCode}`);
}

function chooseWithinStratum(entries, amount, seed, globalTokenCounts) {
  const remaining = [...entries];
  const selected = [];
  const covered = new Set();
  while (selected.length < amount && remaining.length) {
    remaining.sort((a, b) => {
      const tokensA = featureTokens(a);
      const tokensB = featureTokens(b);
      const uncoveredA = tokensA.filter(token => !covered.has(token)).length;
      const uncoveredB = tokensB.filter(token => !covered.has(token)).length;
      const rarityA = tokensA.reduce((sum, token) => sum + 1 / Math.sqrt(globalTokenCounts[token] || 1), 0);
      const rarityB = tokensB.reduce((sum, token) => sum + 1 / Math.sqrt(globalTokenCounts[token] || 1), 0);
      return uncoveredB - uncoveredA || rarityB - rarityA || deterministicOrder(seed, a.courseCode).localeCompare(deterministicOrder(seed, b.courseCode));
    });
    const chosen = remaining.shift();
    selected.push(chosen);
    featureTokens(chosen).forEach(token => covered.add(token));
  }
  return selected;
}

function selectStratifiedSample(population, sampleSize = DEFAULT_SAMPLE_SIZE, seed = DEFAULT_SEED) {
  if (sampleSize < 100 || sampleSize > 150) throw new Error('La muestra de Fase 5 debe quedar entre 100 y 150 candidatos.');
  if (population.length < sampleSize) throw new Error(`Solo hay ${population.length} candidatos para una muestra de ${sampleSize}.`);
  const groups = new Map();
  population.forEach(item => {
    if (!groups.has(item.primaryStratum)) groups.set(item.primaryStratum, []);
    groups.get(item.primaryStratum).push(item);
  });
  const allocation = allocateStrata(groups, sampleSize);
  const globalTokenCounts = {};
  population.forEach(item => featureTokens(item).forEach(token => { globalTokenCounts[token] = (globalTokenCounts[token] || 0) + 1; }));
  const selected = allocation.flatMap(row => chooseWithinStratum(groups.get(row.key), row.sample, `${seed}|${row.key}`, globalTokenCounts));
  selected.sort((a, b) => deterministicOrder(seed, a.courseCode).localeCompare(deterministicOrder(seed, b.courseCode)));
  const selectedCodes = new Set(selected.map(item => item.courseCode));
  if (selectedCodes.size !== sampleSize) throw new Error('La selección estratificada produjo siglas repetidas o un tamaño incorrecto.');
  return {
    selected,
    allocation: allocation.map(row => ({
      primaryStratum: row.key,
      populationCount: row.population,
      sampleCount: row.sample,
      populationShare: row.population / population.length,
      sampleShare: row.sample / sampleSize,
      samplingRate: row.sample / row.population,
    })),
  };
}

function sampleHash(sample) {
  return sha256(sample.map(item => `${item.courseCode}:${item.provenance.evaluationHash}`).sort().join('|'));
}

function prepareLabels(sampleDocument, existing = null) {
  const previous = new Map(((existing && existing.reviews) || []).map(review => [review.courseCode, review]));
  const reviews = sampleDocument.sample.map(item => {
    const prior = previous.get(item.courseCode);
    const unchanged = prior && prior.evaluationHash === item.provenance.evaluationHash;
    return {
      courseCode: item.courseCode,
      evaluationHash: item.provenance.evaluationHash,
      humanLabel: unchanged && ALLOWED_LABELS.includes(prior.humanLabel) ? prior.humanLabel : null,
      note: unchanged ? prior.note || '' : '',
      reviewer: unchanged ? prior.reviewer || null : null,
      reviewedAt: unchanged ? prior.reviewedAt || null : null,
    };
  });
  return {
    schemaVersion: 1,
    sampleHash: sampleDocument.sampleHash,
    allowedLabels: ALLOWED_LABELS,
    instructions: 'Completa humanLabel, note, reviewer y reviewedAt después de contrastar el texto oficial. Ninguna opción viene preseleccionada.',
    reviews,
  };
}

function validateLabels(sampleDocument, labelsDocument) {
  if (labelsDocument.sampleHash !== sampleDocument.sampleHash) throw new Error('Las etiquetas humanas pertenecen a otra muestra o versión de fuentes.');
  const sampleByCode = new Map(sampleDocument.sample.map(item => [item.courseCode, item]));
  if ((labelsDocument.reviews || []).length !== sampleDocument.sample.length) throw new Error('El archivo de revisión no contiene exactamente una fila por candidato.');
  const seen = new Set();
  (labelsDocument.reviews || []).forEach(review => {
    if (seen.has(review.courseCode)) throw new Error(`La revisión repite ${review.courseCode}.`);
    seen.add(review.courseCode);
    const item = sampleByCode.get(review.courseCode);
    if (!item) throw new Error(`${review.courseCode} no pertenece a la muestra actual.`);
    if (review.evaluationHash !== item.provenance.evaluationHash) throw new Error(`La revisión de ${review.courseCode} corresponde a otro texto oficial.`);
    if (review.humanLabel !== null && !ALLOWED_LABELS.includes(review.humanLabel)) throw new Error(`Etiqueta humana inválida en ${review.courseCode}.`);
    if (review.humanLabel && (!cleanValue(review.reviewer) || !cleanValue(review.reviewedAt))) {
      throw new Error(`${review.courseCode} tiene decisión, pero no registra reviewer y reviewedAt.`);
    }
  });
}

function emptyMetricRow(populationCount = null) {
  return { populationCount, reviewedCount: 0, correctCount: 0, errorCount: 0, errorRate: null };
}

function calculateMetrics(sampleDocument, labelsDocument) {
  validateLabels(sampleDocument, labelsDocument);
  const byCode = new Map(sampleDocument.sample.map(item => [item.courseCode, item]));
  const reviewed = labelsDocument.reviews.filter(review => review.humanLabel !== null);
  const correct = reviewed.filter(review => review.humanLabel === 'correct_auto_importable');
  const errors = reviewed.filter(review => review.humanLabel !== 'correct_auto_importable');
  const byLabel = Object.fromEntries(ALLOWED_LABELS.map(label => [label, reviewed.filter(review => review.humanLabel === label).length]));
  const populationStrata = new Map(sampleDocument.stratification.primaryStrata.map(row => [row.primaryStratum, row.populationCount]));
  const byPrimaryStratum = {};
  sampleDocument.stratification.primaryStrata.forEach(row => { byPrimaryStratum[row.primaryStratum] = emptyMetricRow(row.populationCount); });
  const byPattern = {};
  reviewed.forEach(review => {
    const item = byCode.get(review.courseCode);
    const isError = review.humanLabel !== 'correct_auto_importable';
    const stratum = byPrimaryStratum[item.primaryStratum] || (byPrimaryStratum[item.primaryStratum] = emptyMetricRow(populationStrata.get(item.primaryStratum) || null));
    stratum.reviewedCount++;
    if (isError) stratum.errorCount++; else stratum.correctCount++;
    featureTokens(item).forEach(token => {
      const [dimension, ...valueParts] = token.split('=');
      const value = valueParts.join('=');
      const populationCount = sampleDocument.stratification.populationByFeature[dimension] && sampleDocument.stratification.populationByFeature[dimension][value] || null;
      const row = byPattern[token] || (byPattern[token] = emptyMetricRow(populationCount));
      row.reviewedCount++;
      if (isError) row.errorCount++; else row.correctCount++;
    });
  });
  [...Object.values(byPrimaryStratum), ...Object.values(byPattern)].forEach(row => {
    row.errorRate = row.reviewedCount ? row.errorCount / row.reviewedCount : null;
  });
  const falseDetails = errors.map(review => {
    const item = byCode.get(review.courseCode);
    return {
      courseCode: review.courseCode,
      courseName: item.courseName,
      humanLabel: review.humanLabel,
      note: review.note || '',
      sourceUrl: item.sourceUrl,
      evaluationSourceText: item.evaluationSourceText,
      primaryStratum: item.primaryStratum,
      responsiblePatterns: featureTokens(item),
      potentialPrimaryStratumPopulation: populationStrata.get(item.primaryStratum) || null,
    };
  });
  const reviewComplete = reviewed.length === sampleDocument.sample.length;
  const stopCondition = !reviewComplete ? 'pending_review' : errors.length ? 'stop_false_auto_importable_detected' : 'validated_for_approval_workflow_design';
  return {
    generatedAt: new Date().toISOString(),
    sampleHash: sampleDocument.sampleHash,
    sampleSize: sampleDocument.sample.length,
    reviewed_count: reviewed.length,
    correct_auto_importable_count: correct.length,
    false_auto_importable_count: errors.length,
    false_auto_importable_rate: reviewed.length ? errors.length / reviewed.length : null,
    unreviewed_count: sampleDocument.sample.length - reviewed.length,
    labels: byLabel,
    errorsByPrimaryStratum: byPrimaryStratum,
    errorsByPattern: byPattern,
    falseAutoImportableDetails: falseDetails,
    stopCondition,
    massImportAllowed: false,
  };
}

function jsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;
}

function validateEvaluations(rows) {
  const errors = [];
  if (!Array.isArray(rows) || !rows.length) errors.push('La pauta no tiene evaluaciones.');
  const names = new Set();
  let total = 0;
  (rows || []).forEach((row, index) => {
    const name = cleanValue(row && (row.name ?? row.nombre));
    const weight = Number(row && (row.weight ?? row.peso));
    if (!name) errors.push(`La evaluación ${index + 1} no tiene nombre.`);
    const key = normalizar(name || '');
    if (key && names.has(key)) errors.push(`La evaluación ${name} está duplicada.`);
    if (key) names.add(key);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) errors.push(`La evaluación ${name || index + 1} tiene un peso inválido.`);
    else total += weight;
  });
  if (Math.abs(total - 100) > 0.000001) errors.push(`Los pesos suman ${total}, no 100.`);
  return { valid: errors.length === 0, errors, total };
}

function candidateToPresetProposal(candidate, approval) {
  if (!candidate || candidate.scope !== 'institutional_program') throw new Error('El candidato no conserva el alcance institucional.');
  if (!approval || approval.status !== 'approved') throw new Error('La conversión exige una aprobación humana explícita.');
  if (!cleanValue(approval.approvedBy) || !cleanValue(approval.approvedAt)) throw new Error('La aprobación debe registrar quién y cuándo aprobó.');
  const evaluations = (approval.editedEvaluations || candidate.candidateWeights || []).map(row => ({
    name: cleanValue(row.name ?? row.nombre),
    weight: Number(row.weight ?? row.peso),
  }));
  const validation = validateEvaluations(evaluations);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const presetDefinition = {
    sigla: candidate.courseCode,
    evals: evaluations.map(row => [row.name, row.weight]),
  };
  const provenance = {
    sourceType: 'official_uc_catalog',
    sourceUrl: candidate.sourceUrl,
    courseCode: candidate.courseCode,
    retrievedAt: candidate.provenance.retrievedAt,
    programVersionText: candidate.programVersionText || null,
    evaluationHash: candidate.provenance.evaluationHash,
    parserVersion: candidate.provenance.parserVersion,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
    scope: 'institutional_program',
    semester: null,
    section: null,
    NRC: null,
  };
  const evalLines = presetDefinition.evals.map(row => `      [${jsString(row[0])},${row[1]}],`).join('\n');
  const diffText = `  ${jsString(candidate.courseName)}:{\n    sigla:${jsString(candidate.courseCode)},\n    evals:[\n${evalLines}\n    ],\n  },`;
  return {
    presetName: candidate.courseName,
    presetDefinition,
    diffText,
    provenance,
    validation,
    aggregationPolicy: 'Cada categoría permanece exactamente con la granularidad de la fuente o de la edición humana aprobada; no se divide automáticamente.',
  };
}

function sampleDocument(population, selection, seed, sampleSize, inventory) {
  const populationByFeature = distributions(population);
  const sampleByFeature = distributions(selection.selected);
  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceInventoryGeneratedAt: inventory.generatedAt,
    parserVersion: inventory.parserVersion,
    seed,
    selectionMethod: 'Cobertura mínima de cada estrato primario y asignación restante proporcional a la raíz de su población; dentro de cada estrato se priorizan valores secundarios aún no cubiertos y raros, con desempate SHA-256 reproducible.',
    populationSize: population.length,
    sampleSize,
    stratification: {
      primaryDefinition: ['evaluationLayout', 'categoryCountBucket', 'programVersionAvailability', 'additionalTextAfterPercentages'],
      secondaryDimensions: Object.keys(FEATURE_DIMENSIONS),
      academicUnitPolicy: 'ESCUELAS_UC está vacío porque la fuente consolidada no conserva una escuela fiable. Solo se usa DISCIPLINA cuando el programa la declara; no se infiere facultad desde la sigla.',
      primaryStrata: selection.allocation,
      populationByFeature,
      sampleByFeature,
    },
    sample: selection.selected,
  };
  document.sampleHash = sampleHash(document.sample);
  return document;
}

function pct(value) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function topDistribution(counts, limit = 12) {
  return Object.entries(counts || {}).slice(0, limit).map(([key, count]) => `${key}: ${count}`).join('; ') || 'sin datos';
}

function renderReviewPacket(sampleDocument) {
  const lines = [
    '# Paquete de revisión humana · Catálogo UC · Fase 5', '',
    `Muestra estratificada de **${sampleDocument.sample.length}** cursos. Seed: \`${sampleDocument.seed}\`.`, '',
    'La salida del parser se muestra como antecedente técnico, no como respuesta correcta. La decisión se registra únicamente en `catalogo-uc-manual-validation-fase5.json`.', '',
  ];
  sampleDocument.sample.forEach((item, index) => {
    lines.push(
      `## ${String(index + 1).padStart(3, '0')} · ${item.courseCode} · ${item.courseName}`, '',
      `- Fuente: ${item.sourceUrl}`,
      `- Versión declarada: ${item.programVersionText || 'no declarada'}`,
      `- Disciplina declarada: ${item.features.discipline || 'no declarada'}`,
      `- Estrato: \`${item.primaryStratum}\``, '',
      '### Texto oficial evaluativo', '',
      '```text', item.evaluationSourceText, '```', '',
      '### Estructura propuesta', '',
      ...item.candidateWeights.map(row => `- ${row.name}: ${row.weight}%`), '',
      '### Salida del parser — no es la etiqueta humana', '',
      `- Clasificación: \`${item.parserOutput.classification}\`` ,
      `- Reasons: ${item.parserOutput.reasons.join(', ') || 'ninguna'}`,
      `- Líneas no interpretadas: ${item.parserOutput.unparsedRelevantLines.join(' / ') || 'ninguna'}`, '',
      '### Revisión humana', '',
      '- [ ] correct_auto_importable',
      '- [ ] should_be_needs_review',
      '- [ ] insufficient_information',
      '- [ ] source_problem',
      '- Nota:', '',
    );
  });
  return lines.join('\n');
}

function renderReport(sampleDocument, metrics, paths) {
  const strata = sampleDocument.stratification.primaryStrata;
  const missingDiscipline = sampleDocument.stratification.populationByFeature.discipline.missing || 0;
  const declaredDiscipline = sampleDocument.populationSize - missingDiscipline;
  const stopText = metrics.stopCondition === 'pending_review'
    ? `La revisión sigue pendiente: ${metrics.reviewed_count}/${metrics.sampleSize} fichas tienen etiqueta humana.`
    : metrics.false_auto_importable_count > 0
      ? `Se detectaron ${metrics.false_auto_importable_count} falsos auto_importable. Se detiene cualquier preparación de importación masiva.`
      : 'La muestra completa no detectó falsos auto_importable. Esto habilita diseñar una aprobación controlada, no importar automáticamente.';
  const lines = [
    '# Fase 5 · Validación estratificada y flujo de aprobación UC', '',
    '## Resumen ejecutivo', '',
    `La población es de **${sampleDocument.populationSize}** candidatos sin preset clasificados \`auto_importable\` por el parser congelado. Se seleccionaron **${sampleDocument.sampleSize}** para revisión humana estratificada. ${stopText}`, '',
    'No se modificaron `PRESETS_UC`, el parser, cuentas, UI ni datos productivos.', '',
    '## Análisis de los 2.001 candidatos', '',
    `- Encabezados: ${topDistribution(sampleDocument.stratification.populationByFeature.headingType)}.`,
    `- Número de categorías: ${topDistribution(sampleDocument.stratification.populationByFeature.categoryCountBucket)}.`,
    `- Formato de porcentaje: ${topDistribution(sampleDocument.stratification.populationByFeature.percentageFormat)}.`,
    `- Disposición evaluativa: ${topDistribution(sampleDocument.stratification.populationByFeature.evaluationLayout)}.`,
    `- Longitud de sección: ${topDistribution(sampleDocument.stratification.populationByFeature.sectionLengthBucket)}.`,
    `- Versión del programa: ${topDistribution(sampleDocument.stratification.populationByFeature.programVersionAvailability)}.`,
    `- Forma singular/plural superficial: ${topDistribution(sampleDocument.stratification.populationByFeature.categoryNumberForm)}.`,
    `- Texto posterior a porcentajes: ${topDistribution(sampleDocument.stratification.populationByFeature.additionalTextAfterPercentages)}.`, '',
    'La unidad académica no está disponible de forma fiable: `ESCUELAS_UC` está vacío deliberadamente. En su lugar se conserva únicamente `DISCIPLINA` cuando el propio programa la declara; no se deduce facultad desde la sigla.', '',
    '## Estratos encontrados', '',
    `Estrato primario: \`${sampleDocument.stratification.primaryDefinition.join(' × ')}\`. La asignación da al menos un cupo a cada estrato y distribuye el resto según la raíz de la población, por lo que los formatos raros quedan sobrerrepresentados sin ahogar los comunes.`, '',
    '| Estrato | Población | Muestra | Tasa de muestreo |',
    '|---|---:|---:|---:|',
    ...strata.map(row => `| ${row.primaryStratum} | ${row.populationCount} | ${row.sampleCount} | ${pct(row.samplingRate)} |`), '',
    '## Muestra seleccionada', '',
    `Seed reproducible: \`${sampleDocument.seed}\`. Hash de la muestra: \`${sampleDocument.sampleHash}\`.`, '',
    '| Sigla | Ramo | Estrato | Disciplina |',
    '|---|---|---|---|',
    ...sampleDocument.sample.map(item => `| ${item.courseCode} | ${item.courseName.replace(/\|/g, '\\|')} | ${item.primaryStratum} | ${(item.features.discipline || 'no declarada').replace(/\|/g, '\\|')} |`), '',
    '## Archivos para revisión humana', '',
    `- Paquete legible: \`${path.relative(ROOT, paths.packet)}\`.`,
    `- Muestra estructurada: \`${path.relative(ROOT, paths.sample)}\`.`,
    `- Etiquetas humanas separadas: \`${path.relative(ROOT, paths.labels)}\`.`,
    `- Métricas: \`${path.relative(ROOT, paths.metrics)}\`.`, '',
    'Ninguna etiqueta viene preseleccionada. El archivo de etiquetas está ligado al hash de cada sección evaluativa para impedir que una decisión vieja se aplique a una fuente nueva.', '',
    '## Cómo ejecutar la revisión y calcular métricas', '',
    '1. Abrir cada ficha del paquete y contrastar el texto evaluativo con la URL oficial.',
    '2. Completar `humanLabel`, `note`, `reviewer` y `reviewedAt` en el archivo de etiquetas.',
    '3. Ejecutar:', '',
    '```bash',
    'node bin/validar-candidatos-uc-fase5.js metrics',
    '```', '',
    `Estado actual: \`${metrics.stopCondition}\`; revisados ${metrics.reviewed_count}; correctos ${metrics.correct_auto_importable_count}; falsos ${metrics.false_auto_importable_count}; tasa ${pct(metrics.false_auto_importable_rate)}.`, '',
    'Si aparece un falso positivo, las métricas guardan el curso, texto fuente, etiqueta, nota, estrato, patrones responsables y población potencial del estrato. El runner siempre mantiene `massImportAllowed:false`.', '',
    '## Diseño del workflow de aprobación', '',
    '```text',
    'candidate',
    '  → human validation label',
    '  → approved candidate (con edición opcional y firma)',
    '  → propuesta de cambio PRESETS_UC + provenance',
    '  → tests del preset generado',
    '  → PR revisable',
    '  → merge',
    '```', '',
    'El revisor ve la fuente, la sección completa, la estructura y cualquier comparación disponible. Validar no publica. Aprobar exige identidad y fecha; editar crea una propuesta nueva conservando la fuente original y el detalle de la edición. Rechazar conserva la decisión y su motivo.', '',
    '## Conversión a PRESETS_UC', '',
    '`candidateToPresetProposal(candidate, approval)` es una función pura. Solo acepta una aprobación explícita, nombres no vacíos, categorías únicas y pesos que sumen 100. Devuelve:', '',
    '- un objeto actual de `PRESETS_UC` con `sigla` y `evals`;',
    '- un diff textual para revisión;',
    '- un registro de provenance separado;',
    '- la validación realizada.', '',
    'No escribe `data.js`. Tampoco divide categorías agregadas: `Pruebas 40%` sigue siendo una categoría de 40%, salvo que una persona la edite con evidencia antes de aprobar.', '',
    '## Provenance propuesta', '',
    'Cada aprobación conserva centralmente `sourceType`, `sourceUrl`, `courseCode`, `retrievedAt`, `programVersionText`, `evaluationHash`, `parserVersion`, `approvedAt`, `approvedBy` y `scope`. El alcance continúa siendo `institutional_program`; semestre, sección y NRC permanecen nulos.', '',
    'La provenance debe vivir junto a la definición institucional o en un registro central por sigla/hash, nunca copiada a cada cuenta. El estado del estudiante solo recibe la pauta resultante.', '',
    '## Riesgos', '',
    '- La muestra reduce incertidumbre, pero no demuestra que los 2.001 casos sean correctos.',
    `- Solo ${declaredDiscipline} candidatos declaran \`DISCIPLINA\`; inferir la facultad desde la sigla sería inventar metadata.`,
    '- Los programas institucionales pueden ser más genéricos que la pauta del semestre.',
    '- Una edición humana puede introducir un error aunque el parser haya acertado; por eso el diff y los tests siguen siendo obligatorios.',
    '- Si cambia `evaluationHash`, cualquier aprobación anterior debe quedar obsoleta.', '',
    '## Archivos que habría que modificar en una futura Fase 6', '',
    '- `data.js`: agregar únicamente los presets aprobados y una referencia central de provenance.',
    '- `tests/presets.test.js` y pruebas UC específicas: fijar suma, sigla, granularidad y ausencia de período inventado.',
    '- Un artefacto generado de aprobaciones: registrar decisiones y hashes sin datos de estudiantes.',
    '- Opcionalmente `app.js` y `render-main.js`: distinguir en producto una pauta institucional genérica de una pauta semestral, en un PR separado.', '',
    'No se implementó importación productiva, UI pública, LLM ni cambios de heurísticas.', '',
  ];
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    command: argv[2],
    inventory: DEFAULT_INVENTORY,
    cacheDir: DEFAULT_CACHE,
    sample: DEFAULT_SAMPLE,
    labels: DEFAULT_LABELS,
    metrics: DEFAULT_METRICS,
    report: DEFAULT_REPORT,
    packet: DEFAULT_PACKET,
    seed: DEFAULT_SEED,
    sampleSize: DEFAULT_SAMPLE_SIZE,
  };
  for (let index = 3; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--inventory') options.inventory = path.resolve(argv[++index]);
    else if (arg === '--cache') options.cacheDir = path.resolve(argv[++index]);
    else if (arg === '--sample') options.sample = path.resolve(argv[++index]);
    else if (arg === '--labels') options.labels = path.resolve(argv[++index]);
    else if (arg === '--metrics') options.metrics = path.resolve(argv[++index]);
    else if (arg === '--report') options.report = path.resolve(argv[++index]);
    else if (arg === '--packet') options.packet = path.resolve(argv[++index]);
    else if (arg === '--seed') options.seed = String(argv[++index]);
    else if (arg === '--sample-size') options.sampleSize = Number(argv[++index]);
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return options;
}

function help() {
  return [
    'Uso:',
    '  node bin/validar-candidatos-uc-fase5.js prepare [--sample-size 120] [--seed texto]',
    '  node bin/validar-candidatos-uc-fase5.js metrics',
    '',
    'prepare lee el inventario y la cache de Fase 4; no consulta la red.',
    'metrics lee únicamente la muestra y las etiquetas humanas.',
  ].join('\n');
}

function prepare(options) {
  const inventory = readJson(options.inventory);
  const entries = (inventory.entries || []).filter(entry => !entry.hasExistingPreset && entry.classification === 'auto_importable');
  const population = entries.map(entry => analyzeCandidate(entry, options.cacheDir));
  const selection = selectStratifiedSample(population, options.sampleSize, options.seed);
  const sample = sampleDocument(population, selection, options.seed, options.sampleSize, inventory);
  const existingLabels = fs.existsSync(options.labels) ? readJson(options.labels) : null;
  const labels = prepareLabels(sample, existingLabels);
  const metrics = calculateMetrics(sample, labels);
  const paths = options;
  writeJson(options.sample, sample);
  writeJson(options.labels, labels);
  writeJson(options.metrics, metrics);
  writeText(options.packet, renderReviewPacket(sample));
  writeText(options.report, renderReport(sample, metrics, paths));
  return { sample, labels, metrics };
}

function recalculate(options) {
  const sample = readJson(options.sample);
  const labels = readJson(options.labels);
  const metrics = calculateMetrics(sample, labels);
  writeJson(options.metrics, metrics);
  writeText(options.report, renderReport(sample, metrics, options));
  return metrics;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.command || options.command === 'help' || options.command === '--help') return console.log(help());
  if (options.command === 'prepare') {
    const result = prepare(options);
    console.log(JSON.stringify({
      populationSize: result.sample.populationSize,
      sampleSize: result.sample.sampleSize,
      primaryStrata: result.sample.stratification.primaryStrata.length,
      seed: result.sample.seed,
      sampleHash: result.sample.sampleHash,
      reviewed: result.metrics.reviewed_count,
      stopCondition: result.metrics.stopCondition,
    }, null, 2));
    return;
  }
  if (options.command === 'metrics') {
    console.log(JSON.stringify(recalculate(options), null, 2));
    return;
  }
  throw new Error(`Comando desconocido: ${options.command}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Fase 5 no pudo continuar: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_LABELS,
  analyzeCandidate,
  headingType,
  categoryCountBucket,
  sectionLengthBucket,
  percentageFormat,
  evaluationLayout,
  categoryNumberForm,
  additionalTextAfterPercentages,
  distributions,
  allocateStrata,
  selectStratifiedSample,
  prepareLabels,
  validateLabels,
  calculateMetrics,
  validateEvaluations,
  candidateToPresetProposal,
  sampleDocument,
  renderReviewPacket,
  renderReport,
  prepare,
  recalculate,
};
