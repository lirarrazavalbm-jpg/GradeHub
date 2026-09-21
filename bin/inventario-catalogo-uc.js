#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const {
  PARSER_VERSION,
  decodificarCatalogo,
  extraerEstructura,
  normalizar,
} = require('./proponer-pautas-uc.js');

const ROOT = path.join(__dirname, '..');
const CATALOGO = 'https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=';
const ROBOTS_URL = 'https://catalogo.uc.cl/robots.txt';
const USER_AGENT = 'GradeHubCatalogReview/1.0 (+https://gradehub.cl; offline academic catalog review)';
const DEFAULT_CACHE = path.join(ROOT, '.cache', 'catalogo-uc');
const DEFAULT_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 15000;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function siglaNormalizada(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function urlPrograma(courseCode) {
  return CATALOGO + encodeURIComponent(courseCode);
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function leerFuentesUC(root = ROOT) {
  const archivos = ['data.js', 'cursos-uc.js', 'mallas-uc.js'];
  const codigo = archivos.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n') +
    '\n;globalThis.__fuentesUC={MALLA_UC,CREDITOS_UC,PRESETS_UC,CURSOS_UC_FULL,MALLAS_UC_EXTRA};';
  const context = {};
  vm.createContext(context);
  vm.runInContext(codigo, context, { filename: 'fuentes-uc-concatenadas.js' });
  return context.__fuentesUC;
}

function evaluacionesPreset(raw) {
  const evals = Array.isArray(raw) ? raw : Array.isArray(raw && raw.evals) ? raw.evals : [];
  return evals.map(item => ({
    name: String(item[0] || '').trim(),
    weight: Number(item[1]),
    ...(item[2] && item[2].slots ? { slots: Number(item[2].slots) } : {}),
  })).filter(item => item.name && Number.isFinite(item.weight));
}

function nombresDeMallas(mallas) {
  const names = new Set();
  Object.values(mallas || {}).forEach(plan => {
    Object.values(plan || {}).forEach(semester => {
      (semester || []).forEach(name => names.add(normalizar(name)));
    });
  });
  return names;
}

function construirInventario(root = ROOT) {
  const data = leerFuentesUC(root);
  const byCode = new Map();
  const byName = new Map();

  function add(codeValue, nameValue, creditsValue, source) {
    const courseCode = siglaNormalizada(codeValue);
    const courseName = String(nameValue || '').trim();
    if (!courseCode || !/^[A-Z0-9_-]+$/.test(courseCode)) return;
    let course = byCode.get(courseCode);
    if (!course) {
      course = { courseCode, courseName, credits: Number.isFinite(Number(creditsValue)) ? Number(creditsValue) : null, sources: [] };
      byCode.set(courseCode, course);
    } else {
      if (!course.courseName && courseName) course.courseName = courseName;
      if (course.credits === null && Number.isFinite(Number(creditsValue))) course.credits = Number(creditsValue);
    }
    if (!course.sources.includes(source)) course.sources.push(source);
    const key = normalizar(courseName);
    if (key) {
      if (!byName.has(key)) byName.set(key, new Set());
      byName.get(key).add(courseCode);
    }
  }

  (data.CURSOS_UC_FULL || []).forEach(row => add(row[0], row[1], row[2], 'cursos-uc.js'));
  Object.entries(data.CREDITOS_UC || {}).forEach(([name, value]) => add(value && value[1], name, value && value[0], 'data.js:CREDITOS_UC'));

  const baseNames = nombresDeMallas(data.MALLA_UC);
  const extraNames = nombresDeMallas(data.MALLAS_UC_EXTRA);
  const presetNames = new Map(Object.keys(data.PRESETS_UC || {}).map(name => [normalizar(name), name]));
  const unresolved = { baseMallaNames: [], extraMallaNames: [], presetNames: [] };

  function attachNames(names, source, unresolvedBucket) {
    names.forEach(nameKey => {
      const codes = byName.get(nameKey);
      if (!codes || !codes.size) return unresolvedBucket.push(nameKey);
      codes.forEach(code => {
        const course = byCode.get(code);
        if (!course.sources.includes(source)) course.sources.push(source);
      });
    });
  }
  attachNames(baseNames, 'data.js:MALLA_UC', unresolved.baseMallaNames);
  attachNames(extraNames, 'mallas-uc.js:MALLAS_UC_EXTRA', unresolved.extraMallaNames);

  presetNames.forEach((displayName, nameKey) => {
    const codes = byName.get(nameKey);
    if (!codes || !codes.size) return unresolved.presetNames.push(displayName);
    codes.forEach(code => {
      const course = byCode.get(code);
      course.hasExistingPreset = true;
      course.existingPresetName = displayName;
      course.existingPreset = evaluacionesPreset(data.PRESETS_UC[displayName]);
      if (!course.sources.includes('data.js:PRESETS_UC')) course.sources.push('data.js:PRESETS_UC');
    });
  });

  const courses = [...byCode.values()].map(course => ({
    ...course,
    hasExistingPreset: !!course.hasExistingPreset,
    existingPresetName: course.existingPresetName || null,
    existingPreset: course.existingPreset || null,
    sources: course.sources.sort(),
  })).sort((a, b) => a.courseCode.localeCompare(b.courseCode, 'en'));

  const sourceCounts = {};
  courses.forEach(course => course.sources.forEach(source => { sourceCounts[source] = (sourceCounts[source] || 0) + 1; }));
  return {
    generatedAt: new Date().toISOString(),
    totalUniqueCourseCodes: courses.length,
    withExistingPreset: courses.filter(course => course.hasExistingPreset).length,
    withoutExistingPreset: courses.filter(course => !course.hasExistingPreset).length,
    sourceCounts,
    unresolved,
    courses,
  };
}

function cachePath(cacheDir, courseCode) {
  return path.join(cacheDir, 'programas', `${siglaNormalizada(courseCode)}.json`);
}

function leerCache(cacheDir, courseCode) {
  const file = cachePath(cacheDir, courseCode);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function escribirCache(cacheDir, entry) {
  const file = cachePath(cacheDir, entry.courseCode);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(entry, null, 2) + '\n');
  fs.renameSync(temporary, file);
  return file;
}

async function fetchConTimeout(url, options, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function reglasRobots(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  const disallow = [];
  let applies = false;
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') applies = value === '*';
    else if (key === 'disallow' && applies && value) disallow.push(value);
  }
  return disallow;
}

function robotsPermitePrograma(text) {
  const target = '/index.php';
  return !reglasRobots(text).some(rule => rule === '/' || target.startsWith(rule));
}

async function verificarRobots(cacheDir, options = {}) {
  const file = path.join(cacheDir, 'robots.json');
  const now = Date.now();
  if (!options.refresh && fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached.fetchedAt && now - Date.parse(cached.fetchedAt) < 24 * 60 * 60 * 1000) return cached;
  }
  const response = await fetchConTimeout(ROBOTS_URL, { headers: { 'user-agent': USER_AGENT, accept: 'text/plain' } }, options.timeoutMs || DEFAULT_TIMEOUT_MS, options.fetchImpl);
  const body = await response.text();
  const result = {
    sourceUrl: ROBOTS_URL,
    fetchedAt: new Date().toISOString(),
    httpStatus: response.status,
    contentHash: sha256(Buffer.from(body)),
    allowsProgramEndpoint: response.ok && robotsPermitePrograma(body),
    body,
  };
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  if (!result.allowsProgramEndpoint) throw new Error('robots.txt no permite consultar /index.php o no pudo verificarse.');
  return result;
}

function tipoError(error) {
  if (error && error.name === 'AbortError') return 'timeout';
  return 'connection_error';
}

async function fetchCourse(course, options = {}) {
  const cacheDir = options.cacheDir || DEFAULT_CACHE;
  const cached = !options.refresh && leerCache(cacheDir, course.courseCode);
  if (cached) return { entry: cached, fromCache: true };
  const sourceUrl = urlPrograma(course.courseCode);
  const attempts = Math.max(1, Number(options.retries ?? 1) + 1);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchConTimeout(sourceUrl, {
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      }, options.timeoutMs || DEFAULT_TIMEOUT_MS, options.fetchImpl);
      const bytes = Buffer.from(await response.arrayBuffer());
      const entry = {
        courseCode: course.courseCode,
        sourceUrl,
        fetchedAt: new Date().toISOString(),
        httpStatus: response.status,
        contentHash: sha256(bytes),
        contentEncoding: 'base64',
        contentBase64: bytes.toString('base64'),
        errorType: response.ok ? null : `http_${response.status}`,
      };
      escribirCache(cacheDir, entry);
      if (response.status === 429 || response.status === 403) {
        const error = new Error(`El catálogo respondió ${response.status}; la corrida se detuvo para no evadir el límite.`);
        error.stopRun = true;
        error.entry = entry;
        throw error;
      }
      if (response.status >= 500 && attempt < attempts) {
        await esperar(options.backoffMs || 2000);
        continue;
      }
      return { entry, fromCache: false };
    } catch (error) {
      if (error.stopRun) throw error;
      lastError = error;
      if (attempt < attempts) {
        await esperar(options.backoffMs || 2000);
        continue;
      }
    }
  }
  const entry = {
    courseCode: course.courseCode,
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    httpStatus: null,
    contentHash: null,
    contentEncoding: null,
    contentBase64: null,
    errorType: tipoError(lastError),
    errorMessage: lastError ? lastError.message : 'Error de transporte desconocido.',
  };
  escribirCache(cacheDir, entry);
  return { entry, fromCache: false };
}

function cargarBenchmark(root = ROOT) {
  const goldPath = path.join(root, 'tests', 'fixtures', 'catalogo-uc-benchmark', 'gold.json');
  if (!fs.existsSync(goldPath)) return [];
  return JSON.parse(fs.readFileSync(goldPath, 'utf8')).entries || [];
}

function seleccionarSmoke(inventory, root = ROOT, limit = 10) {
  const byCode = new Map(inventory.courses.map(course => [course.courseCode, course]));
  const gold = cargarBenchmark(root);
  const statusOrder = ['auto_importable', 'needs_review', 'insufficient_information', 'not_found'];
  const selected = [];
  for (const status of statusOrder) {
    for (const hasPreset of [true, false]) {
      const candidate = gold.map(entry => byCode.get(entry.courseCode)).find(course => course && course.hasExistingPreset === hasPreset && !selected.includes(course));
      if (candidate) selected.push(candidate);
    }
  }
  gold.map(entry => byCode.get(entry.courseCode)).filter(Boolean).forEach(course => {
    if (selected.length < limit && !selected.includes(course)) selected.push(course);
  });
  inventory.courses.forEach(course => {
    if (selected.length < limit && !selected.includes(course)) selected.push(course);
  });
  return selected.slice(0, limit);
}

async function fetchInventory(inventory, options = {}) {
  const cacheDir = options.cacheDir || DEFAULT_CACHE;
  await verificarRobots(cacheDir, options);
  let courses = inventory.courses;
  if (options.retryErrors) courses = courses.filter(course => {
    const cached = leerCache(cacheDir, course.courseCode);
    return cached && cached.errorType;
  });
  if (options.smoke) courses = seleccionarSmoke(inventory, options.root || ROOT, options.limit || 10);
  if (options.codes && options.codes.length) {
    const requested = new Set(options.codes.map(siglaNormalizada));
    courses = courses.filter(course => requested.has(course.courseCode));
  }
  if (options.limit && !options.smoke) courses = courses.slice(0, options.limit);
  const result = { requested: courses.length, fetched: 0, reused: 0, errors: 0, stopped: false, courses: [] };
  let consecutiveSourceErrors = 0;
  for (let index = 0; index < courses.length; index++) {
    const course = courses[index];
    let usedNetwork = false;
    try {
      const fetched = await fetchCourse(course, { ...options, refresh: options.refresh || options.retryErrors });
      usedNetwork = !fetched.fromCache;
      const status = fetched.entry.httpStatus;
      if (fetched.fromCache) result.reused++;
      else result.fetched++;
      if (fetched.entry.errorType) result.errors++;
      result.courses.push({ courseCode: course.courseCode, fromCache: fetched.fromCache, httpStatus: status, errorType: fetched.entry.errorType });
      const sourceError = !fetched.fromCache && (status >= 500 || ['connection_error', 'timeout'].includes(fetched.entry.errorType));
      consecutiveSourceErrors = sourceError ? consecutiveSourceErrors + 1 : fetched.fromCache ? consecutiveSourceErrors : 0;
      if (consecutiveSourceErrors >= 3) {
        result.stopped = true;
        result.stopReason = 'Tres errores de fuente consecutivos; se detuvo la corrida para no insistir sobre un servicio inestable.';
        break;
      }
    } catch (error) {
      result.errors++;
      result.courses.push({ courseCode: course.courseCode, fromCache: false, httpStatus: error.entry && error.entry.httpStatus, errorType: error.entry && error.entry.errorType, error: error.message });
      if (error.stopRun) {
        result.stopped = true;
        result.stopReason = error.message;
        break;
      }
    }
    if (!options.fetchImpl && usedNetwork && index < courses.length - 1 && options.delayMs !== 0) await esperar(options.delayMs ?? DEFAULT_DELAY_MS);
    if (options.onProgress) options.onProgress(index + 1, courses.length, result);
  }
  return result;
}

function firmaPesos(rows) {
  return rows.map(row => Number(row.weight ?? row.peso)).filter(Number.isFinite).sort((a, b) => a - b).join('|');
}

function compararPreset(course, parsed) {
  if (!course.hasExistingPreset) return null;
  const preset = course.existingPreset || [];
  const institutional = (parsed.filas || []).map(row => ({ name: row.nombre, weight: row.peso }));
  if (!institutional.length || parsed.status === 'insufficient_information' || parsed.status === 'not_found') {
    return { category: 'cannot_compare', detail: 'El programa institucional no entrega una estructura comparable.' };
  }
  const presetNames = new Map(preset.map(row => [normalizar(row.name), row.weight]));
  const institutionalNames = new Map(institutional.map(row => [normalizar(row.name), row.weight]));
  const exact = preset.length === institutional.length && [...presetNames].every(([name, weight]) => institutionalNames.get(name) === weight);
  if (exact) return { category: 'approximately_matches', detail: 'Nombres y pesos coinciden.' };
  const sameWeights = firmaPesos(preset) === firmaPesos(institutional);
  const aggregate = (parsed.reasons || []).includes('aggregate_category_detected');
  const genericNames = institutional.every(row => /^(?:evaluaciones?|pruebas?|controles?|tareas?|trabajos?|laboratorios?|examen(?: final)?|participacion)(?:\s|$)/.test(normalizar(row.name)));
  if (aggregate || (institutional.length < preset.length && genericNames)) {
    return { category: 'institutional_more_generic', detail: 'El programa institucional agrupa más que el preset semestral.' };
  }
  const overlap = [...presetNames.keys()].filter(name => institutionalNames.has(name));
  const changed = overlap.filter(name => presetNames.get(name) !== institutionalNames.get(name));
  if (changed.length) {
    return { category: 'relevant_difference', detail: 'Hay categorías comparables con pesos distintos.', changedCategories: changed };
  }
  if (sameWeights && overlap.length >= Math.ceil(Math.min(preset.length, institutional.length) / 2)) {
    return { category: 'approximately_matches', detail: 'Los pesos coinciden y las categorías se parecen.' };
  }
  return { category: 'cannot_compare', detail: 'Las dos estructuras no tienen correspondencia automática segura.' };
}

function analizarEntrada(course, cacheEntry) {
  const base = {
    courseCode: course.courseCode,
    courseName: course.courseName,
    credits: course.credits,
    knownSources: course.sources,
    hasExistingPreset: course.hasExistingPreset,
    existingPresetName: course.existingPresetName,
    scope: 'institutional_program',
    semester: null,
    section: null,
    NRC: null,
    sourceUrl: cacheEntry ? cacheEntry.sourceUrl : urlPrograma(course.courseCode),
    retrievedAt: cacheEntry ? cacheEntry.fetchedAt : null,
    sourceHttpStatus: cacheEntry ? cacheEntry.httpStatus : null,
    sourceContentHash: cacheEntry ? cacheEntry.contentHash : null,
    parserVersion: PARSER_VERSION,
  };
  if (!cacheEntry) return { ...base, sourceStatus: 'not_cached', classification: 'transport_error', reasons: ['source_not_cached'], weights: [], complexSignals: [], unparsedRelevantLines: [], evaluationHash: null, existingPresetComparison: null };
  if (!cacheEntry.contentBase64) return { ...base, sourceStatus: cacheEntry.errorType || 'transport_error', classification: 'transport_error', reasons: [cacheEntry.errorType || 'transport_error'], weights: [], complexSignals: [], unparsedRelevantLines: [], evaluationHash: null, existingPresetComparison: null };
  if (cacheEntry.httpStatus === 404) return { ...base, sourceStatus: 'http_404', classification: 'not_found', reasons: ['http_404'], weights: [], complexSignals: [], unparsedRelevantLines: [], evaluationHash: null, existingPresetComparison: course.hasExistingPreset ? { category: 'cannot_compare', detail: 'La fuente respondió 404.' } : null };
  if (cacheEntry.httpStatus !== 200) return { ...base, sourceStatus: `http_${cacheEntry.httpStatus}`, classification: 'transport_error', reasons: [cacheEntry.errorType || `http_${cacheEntry.httpStatus}`], weights: [], complexSignals: [], unparsedRelevantLines: [], evaluationHash: null, existingPresetComparison: null };
  const html = decodificarCatalogo(Buffer.from(cacheEntry.contentBase64, 'base64'));
  const parsed = extraerEstructura(html, { courseCode: course.courseCode });
  const discoverySignals = [];
  if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]\?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]|�/.test(parsed.texto || '')) discoverySignals.push('encoding_suspect');
  if ((parsed.unparsedLines || []).some(line => /\d{1,3}(?:[.,]\d+)?\s*%/.test(line))) discoverySignals.push('unrecognized_percentage_line');
  if ((parsed.unparsedLines || []).some(line => /^\s*\d+(?:\.\d+)+[.)-]?\s+/.test(line))) discoverySignals.push('hierarchical_evaluation_structure');
  if (/<table\b/i.test(html) && (!parsed.filas || !parsed.filas.length)) discoverySignals.push('table_without_extracted_weights');
  if ((parsed.reasons || []).includes('evaluation_section_not_found')) {
    const headingCandidates = String(parsed.texto || '').split('\n').filter(line => line.length <= 140 && /\bevaluaci[oó]n|calificaci[oó]n|ponderaci[oó]n/i.test(line)).slice(0, 5);
    if (headingCandidates.length) discoverySignals.push('unrecognized_evaluation_heading');
  }
  return {
    ...base,
    sourceStatus: parsed.reasons.includes('source_program_unavailable') ? 'officially_unavailable' : 'found',
    classification: parsed.status,
    reasons: parsed.reasons || [],
    weights: (parsed.filas || []).map(row => ({ name: row.nombre, weight: row.peso, ...(row.detalleDetectado ? { detail: row.detalleDetectado } : {}) })),
    complexSignals: parsed.complexRuleLines || [],
    unparsedRelevantLines: parsed.unparsedLines || [],
    discoverySignals,
    programVersionText: parsed.programVersionText || null,
    evaluationSourceText: parsed.evaluationSourceText || '',
    evaluationHash: parsed.evaluationSourceHash || null,
    existingPresetComparison: compararPreset(course, parsed),
  };
}

function metricas(entries) {
  const groups = {
    all: entries,
    withExistingPreset: entries.filter(entry => entry.hasExistingPreset),
    withoutExistingPreset: entries.filter(entry => !entry.hasExistingPreset),
  };
  const summarize = rows => ({
    total: rows.length,
    found: rows.filter(row => row.sourceStatus === 'found').length,
    officiallyUnavailable: rows.filter(row => row.sourceStatus === 'officially_unavailable').length,
    notFound: rows.filter(row => row.classification === 'not_found' && row.sourceStatus !== 'officially_unavailable').length,
    transportErrors: rows.filter(row => row.classification === 'transport_error').length,
    autoImportable: rows.filter(row => row.classification === 'auto_importable').length,
    needsReview: rows.filter(row => row.classification === 'needs_review').length,
    insufficientInformation: rows.filter(row => row.classification === 'insufficient_information').length,
  });
  return {
    all: summarize(groups.all),
    withExistingPreset: summarize(groups.withExistingPreset),
    withoutExistingPreset: summarize(groups.withoutExistingPreset),
    newAutoImportableCandidates: groups.withoutExistingPreset.filter(row => row.classification === 'auto_importable').length,
  };
}

function formatosNoCubiertos(entries) {
  const groups = {};
  function add(key, entry, lines) {
    if (!groups[key]) groups[key] = { count: 0, examples: [] };
    groups[key].count++;
    if (groups[key].examples.length < 12) groups[key].examples.push({ courseCode: entry.courseCode, lines: (lines || []).slice(0, 3) });
  }
  entries.forEach(entry => {
    if (entry.classification === 'transport_error' || entry.classification === 'not_found') return;
    (entry.discoverySignals || []).forEach(signal => add(signal, entry, entry.unparsedRelevantLines));
    (entry.reasons || []).forEach(reason => {
      if (!['evaluation_section_not_found', 'relevant_unparsed_line', 'ambiguous_percentage_detected'].includes(reason)) return;
      add(reason, entry, entry.unparsedRelevantLines);
    });
  });
  return groups;
}

function seleccionarRevisionSeguridad(entries) {
  const candidates = entries.filter(entry => !entry.hasExistingPreset && entry.classification === 'auto_importable');
  const count = Math.min(10, candidates.length);
  if (!count) return [];
  if (count === 1) return [candidates[0]];
  const selected = [];
  for (let index = 0; index < count; index++) {
    const position = Math.round(index * (candidates.length - 1) / (count - 1));
    selected.push(candidates[position]);
  }
  return selected;
}

function revisionManual(entries, reviewRows = []) {
  const selected = seleccionarRevisionSeguridad(entries);
  const byCode = new Map((reviewRows || []).map(row => [siglaNormalizada(row.courseCode), row]));
  const reviews = selected.map(entry => {
    const review = byCode.get(entry.courseCode);
    return {
      courseCode: entry.courseCode,
      courseName: entry.courseName,
      officialTextChecked: !!(review && review.officialTextChecked),
      verdict: review && review.verdict || 'pending',
      notes: review && review.notes || null,
    };
  });
  const complete = reviews.every(review => review.officialTextChecked && ['correct', 'false_auto_importable'].includes(review.verdict));
  return {
    required: selected.length,
    status: complete ? 'complete' : 'pending',
    falseAutoImportableCount: reviews.filter(review => review.verdict === 'false_auto_importable').length,
    entries: reviews,
  };
}

function analizarInventario(inventory, options = {}) {
  let courses = inventory.courses;
  if (options.smoke) courses = seleccionarSmoke(inventory, options.root || ROOT, options.limit || 10);
  if (options.codes && options.codes.length) {
    const requested = new Set(options.codes.map(siglaNormalizada));
    courses = courses.filter(course => requested.has(course.courseCode));
  }
  if (options.limit && !options.smoke) courses = courses.slice(0, options.limit);
  const entries = courses.map(course => analizarEntrada(course, leerCache(options.cacheDir || DEFAULT_CACHE, course.courseCode)));
  const reviews = options.reviewFile && fs.existsSync(options.reviewFile)
    ? JSON.parse(fs.readFileSync(options.reviewFile, 'utf8')).reviews || []
    : [];
  const robotsFile = path.join(options.cacheDir || DEFAULT_CACHE, 'robots.json');
  const robots = fs.existsSync(robotsFile) ? JSON.parse(fs.readFileSync(robotsFile, 'utf8')) : null;
  return {
    generatedAt: new Date().toISOString(),
    scope: 'institutional_program',
    parserVersion: PARSER_VERSION,
    sourcePolicy: robots ? {
      sourceUrl: robots.sourceUrl,
      checkedAt: robots.fetchedAt,
      httpStatus: robots.httpStatus,
      allowsProgramEndpoint: robots.allowsProgramEndpoint,
      contentHash: robots.contentHash,
    } : null,
    inventory: {
      totalUniqueCourseCodes: inventory.totalUniqueCourseCodes,
      withExistingPreset: inventory.withExistingPreset,
      withoutExistingPreset: inventory.withoutExistingPreset,
      sourceCounts: inventory.sourceCounts,
      unresolved: inventory.unresolved,
    },
    metrics: metricas(entries),
    uncoveredFormats: formatosNoCubiertos(entries),
    manualSafetyReview: revisionManual(entries, reviews),
    entries,
  };
}

function cell(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function resumenMarkdown(result, fetchSummary = null) {
  const m = result.metrics;
  const without = result.entries.filter(entry => !entry.hasExistingPreset);
  const auto = without.filter(entry => entry.classification === 'auto_importable');
  const withPreset = result.entries.filter(entry => entry.hasExistingPreset);
  const comparisons = {};
  withPreset.forEach(entry => {
    const category = entry.existingPresetComparison ? entry.existingPresetComparison.category : 'cannot_compare';
    comparisons[category] = (comparisons[category] || 0) + 1;
  });
  const phase5Recommendation = result.manualSafetyReview.status === 'complete'
    ? result.manualSafetyReview.falseAutoImportableCount > 0
      ? 'La muestra detectó al menos un falso `auto_importable`: no corresponde proponer importación masiva. La Fase 5 debería documentar ese patrón y ampliar la revisión antes de cambiar una heurística.'
      : `La muestra manual de ${result.manualSafetyReview.required} candidatos no detectó falsos \`auto_importable\`, pero no convierte los ${m.newAutoImportableCandidates} candidatos en pautas aprobadas. La Fase 5 debería crear una cola de revisión humana controlada y estudiar por separado los formatos fuera de distribución antes de importar una sola pauta.`
    : 'Completar la revisión humana de seguridad y estudiar los formatos fuera de distribución antes de cambiar heurísticas o importar una sola pauta.';
  const lines = [
    '# Inventario de programas institucionales UC — Fase 4', '',
    '## Resumen ejecutivo', '',
    `Se analizaron **${m.all.total}** siglas conocidas por GradeHub con el parser \`${result.parserVersion}\`. Esta medición no importa ni modifica pautas productivas. Los **${m.newAutoImportableCandidates}** cursos sin preset clasificados como \`auto_importable\` son solo candidatos para revisión humana.`, '',
    '## Fuente de siglas', '',
    `- Siglas UC únicas conocidas: **${result.inventory.totalUniqueCourseCodes}**.`,
    `- Con preset existente: **${result.inventory.withExistingPreset}**.`,
    `- Sin preset existente: **${result.inventory.withoutExistingPreset}**.`,
    ...Object.entries(result.inventory.sourceCounts).map(([source, count]) => `- \`${source}\`: ${count} siglas.`), '',
    `- Nombres de mallas extra sin sigla verificable: **${result.inventory.unresolved.extraMallaNames.length}**; no se inventó ninguna.`,
    `- Presets sin sigla verificable en las fuentes actuales: **${result.inventory.unresolved.presetNames.length}**; no se inventó ninguna.`, '',
    '## Estado de las fuentes UC', '',
    fetchSummary ? `- Fetch solicitado: ${fetchSummary.requested}; nuevas respuestas: ${fetchSummary.fetched}; cache reutilizada: ${fetchSummary.reused}; errores: ${fetchSummary.errors}; detenido: ${fetchSummary.stopped ? 'sí' : 'no'}.` : '- El análisis usa exclusivamente la cache local; no consulta la red.',
    result.sourcePolicy
      ? `- robots.txt comprobado el ${result.sourcePolicy.checkedAt}; HTTP ${result.sourcePolicy.httpStatus}; el endpoint de programas está permitido: ${result.sourcePolicy.allowsProgramEndpoint ? 'sí' : 'no'}.`
      : '- No hay comprobación cacheada de robots.txt.',
    '- `scope` es `institutional_program`; `semester`, `section` y `NRC` quedan en `null`.', '',
    '## Métricas globales', '',
    '| Grupo | Total | Encontrados | No disponibles | No encontrados | Transporte | Auto | Revisar | Insuficiente |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...[['Todos',m.all],['Con preset',m.withExistingPreset],['Sin preset',m.withoutExistingPreset]].map(([label,row]) => `| ${label} | ${row.total} | ${row.found} | ${row.officiallyUnavailable} | ${row.notFound} | ${row.transportErrors} | ${row.autoImportable} | ${row.needsReview} | ${row.insufficientInformation} |`),
    '', `**new_auto_importable_candidates: ${m.newAutoImportableCandidates}**`, '',
    '## Cursos con preset existente', '',
    ...Object.entries(comparisons).map(([category,count]) => `- \`${category}\`: ${count}.`), '',
    'Las diferencias son informativas: el programa institucional no reemplaza al preset semestral.', '',
    '## Cursos sin preset', '',
    '| Sigla | Estado | Pesos | Reasons | Candidato |',
    '|---|---|---|---|---|',
    ...without.map(entry => `| ${entry.courseCode} | ${entry.classification} | ${cell(entry.weights.map(row => `${row.name} ${row.weight}%`).join('; ') || '—')} | ${cell(entry.reasons.join(', ') || '—')} | ${entry.classification === 'auto_importable' ? 'sí' : 'no'} |`), '',
    '## Nuevos auto_importable', '',
    ...(auto.length ? auto.map(entry => `- **${entry.courseCode} · ${entry.courseName}:** ${entry.weights.map(row => `${row.name} ${row.weight}%`).join('; ')}.`) : ['Ninguno.']), '',
    '## Revisión manual de seguridad', '',
    `Estado: **${result.manualSafetyReview.status}**. Muestra requerida: ${result.manualSafetyReview.required}.`, '',
    '| Sigla | Revisión del texto oficial | Veredicto | Nota |',
    '|---|---:|---|---|',
    ...result.manualSafetyReview.entries.map(review => `| ${review.courseCode} | ${review.officialTextChecked ? 'sí' : 'no'} | ${review.verdict} | ${cell(review.notes)} |`), '',
    '## Falsos auto-importable detectados', '',
    result.manualSafetyReview.status === 'complete'
      ? `**${result.manualSafetyReview.falseAutoImportableCount}** en la muestra manual.`
      : 'Pendiente de la revisión manual; esta fase no interpreta una clasificación automática como aprobación humana.', '',
    '## Nuevos formatos no cubiertos', '',
    ...Object.entries(result.uncoveredFormats).map(([reason,group]) => `- \`${reason}\`: ${group.count} casos; ejemplos: ${group.examples.map(example => example.courseCode).join(', ')}.`),
    ...(Object.keys(result.uncoveredFormats).length ? [] : ['No se detectaron formatos nuevos en el conjunto analizado.']), '',
    '## Errores de red/fuente', '',
    ...result.entries.filter(entry => entry.classification === 'transport_error').map(entry => `- ${entry.courseCode}: ${entry.sourceStatus}.`),
    ...(result.entries.some(entry => entry.classification === 'transport_error') ? [] : ['Ninguno.']), '',
    '## Recomendación de Fase 5', '',
    `${phase5Recommendation} No se implementó Fase 5.`, '',
  ];
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    command: argv[2],
    root: ROOT,
    cacheDir: DEFAULT_CACHE,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retries: 1,
    refresh: false,
    retryErrors: false,
    smoke: false,
    limit: null,
    codes: null,
    json: null,
    markdown: null,
    reviewFile: null,
  };
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cache') options.cacheDir = path.resolve(argv[++i]);
    else if (arg === '--delay-ms') options.delayMs = Math.max(0, Number(argv[++i]));
    else if (arg === '--timeout-ms') options.timeoutMs = Math.max(1000, Number(argv[++i]));
    else if (arg === '--retries') options.retries = Math.max(0, Number(argv[++i]));
    else if (arg === '--refresh') options.refresh = true;
    else if (arg === '--retry-errors') options.retryErrors = true;
    else if (arg === '--smoke') options.smoke = true;
    else if (arg === '--limit') options.limit = Math.max(1, Number(argv[++i]));
    else if (arg === '--codes') options.codes = String(argv[++i] || '').split(',').map(siglaNormalizada).filter(Boolean);
    else if (arg === '--json') options.json = path.resolve(argv[++i]);
    else if (arg === '--markdown') options.markdown = path.resolve(argv[++i]);
    else if (arg === '--review') options.reviewFile = path.resolve(argv[++i]);
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return options;
}

function help() {
  return [
    'Uso:',
    '  node bin/inventario-catalogo-uc.js inventory [--json archivo]',
    '  node bin/inventario-catalogo-uc.js fetch [--smoke|--limit N|--codes A,B] [--cache dir] [--retry-errors]',
    '  node bin/inventario-catalogo-uc.js analyze [--smoke|--limit N|--codes A,B] [--json archivo] [--markdown archivo] [--review archivo]',
    '',
    `Fetch: concurrencia 1, ${DEFAULT_DELAY_MS} ms entre solicitudes, timeout ${DEFAULT_TIMEOUT_MS} ms, un reintento y cache local.`,
  ].join('\n');
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.command || options.command === '--help' || options.command === 'help') return console.log(help());
  const inventory = construirInventario(options.root);
  if (options.command === 'inventory') {
    if (options.json) writeJson(options.json, inventory);
    console.log(JSON.stringify({ total: inventory.totalUniqueCourseCodes, withPreset: inventory.withExistingPreset, withoutPreset: inventory.withoutExistingPreset, sourceCounts: inventory.sourceCounts, unresolved: inventory.unresolved }, null, 2));
    return;
  }
  if (options.command === 'fetch') {
    const summary = await fetchInventory(inventory, { ...options, onProgress(done, total, result) {
      if (done === total || done % 25 === 0) console.log(`[${done}/${total}] nuevas=${result.fetched} cache=${result.reused} errores=${result.errors}`);
    } });
    if (options.json) writeJson(options.json, summary);
    const { courses, ...compact } = summary;
    console.log(JSON.stringify({ ...compact, lastCourses: courses.slice(-10) }, null, 2));
    if (summary.stopped) process.exitCode = 2;
    return;
  }
  if (options.command === 'analyze') {
    const result = analizarInventario(inventory, options);
    if (options.json) writeJson(options.json, result);
    if (options.markdown) {
      fs.mkdirSync(path.dirname(options.markdown), { recursive: true });
      fs.writeFileSync(options.markdown, resumenMarkdown(result));
    }
    console.log(JSON.stringify(result.metrics, null, 2));
    return;
  }
  throw new Error(`Comando desconocido: ${options.command}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Fase 4 no pudo continuar: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  USER_AGENT,
  construirInventario,
  leerCache,
  escribirCache,
  reglasRobots,
  robotsPermitePrograma,
  fetchCourse,
  fetchInventory,
  seleccionarSmoke,
  compararPreset,
  analizarEntrada,
  analizarInventario,
  metricas,
  formatosNoCubiertos,
  seleccionarRevisionSeguridad,
  revisionManual,
  resumenMarkdown,
  siglaNormalizada,
};
