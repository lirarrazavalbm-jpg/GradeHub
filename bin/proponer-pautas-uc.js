#!/usr/bin/env node
/*
 * Consulta el catálogo público UC y deja un BORRADOR revisable de pautas.
 *
 * No toca data.js ni se usa desde la app: los programas del catálogo son
 * genéricos y una persona tiene que revisar cada propuesta antes de convertirla
 * en un preset. En particular, un preset ya existente se conserva intacto;
 * este script solo reporta cómo difiere lo que dice el catálogo genérico.
 *
 * Uso:
 *   node bin/proponer-pautas-uc.js
 *   node bin/proponer-pautas-uc.js --sigla MAT1610,FIS1514 --out /tmp/uc.json
 *   node bin/proponer-pautas-uc.js --fixture-dir /ruta/a/html --sigla MAT1610
 *
 * Compatibilidad: los buckets (`propuestas`, `sinDatos`, `revisarAMano`) y el
 * campo `estado` se conservan. `status`, `reasons` y la evidencia trazable se
 * agregan en paralelo para que un revisor pueda decidir sin volver a descargar.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CATALOGO = 'https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=';
const USER_AGENT = 'Mozilla/5.0 (compatible; GradeHubCatalogReview/1.0; +https://gradehub.cl)';
const PARSER_VERSION = 'uc-catalogo-2';

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function leerDatosUC(dataPath = path.join(ROOT, 'data.js')) {
  const codigo = fs.readFileSync(dataPath, 'utf8');
  const contexto = {};
  vm.createContext(contexto);
  vm.runInContext(codigo + ';globalThis.__catalogoUC={MALLA_UC,CREDITOS_UC,PRESETS_UC};', contexto, { filename: dataPath });
  return contexto.__catalogoUC;
}

// El servidor UC ha enviado páginas ISO-8859-1 y UTF-8 según el curso. Elegir
// solo por el header vuelve "Cálculo" en "CÃ¡lculo" en una de las dos formas.
function decodificarCatalogo(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const latin1 = new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
  const puntaje = texto => {
    const acentos = (texto.match(/[áéíóúüñÁÉÍÓÚÜÑ]/g) || []).length;
    const roto = (texto.match(/[Ã�]/g) || []).length;
    return acentos * 3 - roto * 8;
  };
  return puntaje(latin1) > puntaje(utf8) ? latin1 : utf8;
}

function decodificarEntidades(texto) {
  const mapa = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    ntilde: 'ñ', uuml: 'ü', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ'
  };
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, entidad) => {
    const clave = entidad.toLowerCase();
    if (clave[0] === '#') {
      const numero = clave[1] === 'x' ? parseInt(clave.slice(2), 16) : parseInt(clave.slice(1), 10);
      return Number.isFinite(numero) ? String.fromCodePoint(numero) : todo;
    }
    return mapa[entidad] || mapa[clave] || todo;
  });
}

function htmlATexto(html) {
  const pre = html.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
  const cuerpo = pre ? pre[1] : html;
  return decodificarEntidades(cuerpo)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|td|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tituloSinNumero(linea) {
  return String(linea || '').trim()
    .replace(/^(?:[IVXLCDM]+|\d+)\s*[.)-]?\s*/i, '')
    .replace(/[:.\s]+$/, '').trim();
}

function esEncabezadoEvaluacion(linea) {
  const crudo = String(linea || '').trim();
  if (!crudo || crudo.length > 120) return false;
  const titulo = normalizar(tituloSinNumero(crudo));
  return /^(?:evaluacion(?:es)?(?: de(?:l)? aprendizajes?| del curso)?|estrategias? evaluativas?|sistema de evaluacion)$/.test(titulo);
}

// Un encabezado estructural tiene número romano/arábigo o se presenta como una
// línea corta en mayúsculas. Una mención a “evaluación” dentro de un párrafo no
// abre ni cierra secciones.
function esEncabezadoEstructural(linea) {
  const crudo = String(linea || '').trim();
  if (!crudo || crudo.length > 140) return false;
  if (/^(?:[IVXLCDM]+|\d+)\s*[.)-]\s*\S/i.test(crudo)) return true;
  const letras = crudo.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  return letras.length >= 5 && crudo === crudo.toLocaleUpperCase('es-CL') && !/[.!?].+\s/.test(crudo);
}

function bloqueEvaluaciones(texto) {
  const lineas = String(texto || '').split('\n');
  const inicio = lineas.findIndex(esEncabezadoEvaluacion);
  if (inicio < 0) return null;
  const contenido = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (linea && esEncabezadoEstructural(linea) && !esEncabezadoEvaluacion(linea)) break;
    if (linea) contenido.push(linea);
  }
  return { encabezado: lineas[inicio].trim(), lineas: contenido, inicio };
}

function nombreLimpio(nombre) {
  return nombre
    .replace(/^[\s•*\-–—]+/, '')
    .replace(/[\s:;,(\[]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function filaConPorcentaje(linea) {
  // El porcentaje al final evita tomar frases descriptivas como "se exigirá un
  // 75% de asistencia". Dentro de la sección evaluativa, una fila así es la
  // única forma segura de proponer una categoría.
  const porcentajes = [...String(linea || '').matchAll(/\d{1,3}(?:[.,]\d+)?\s*%/g)];
  if (porcentajes.length !== 1) return null;
  const final = linea.match(/^(.*?)(?:\(?\s*)(\d{1,3}(?:[.,]\d+)?)\s*%\s*\)?(?:\s*(?:c\/?u|cada\s+una?))?\s*$/i);
  if (!final) return null;
  const nombre = nombreLimpio(final[1]);
  const pesoUnitario = Number(final[2].replace(',', '.'));
  const cadaUna = /(?:c\/?u|cada\s+una?)\s*$/i.test(linea);
  const cantidad = nombre.match(/^(\d+)\s+(.+)$/);
  const peso = cadaUna && cantidad ? pesoUnitario * Number(cantidad[1]) : pesoUnitario;
  if (!nombre || !Number.isFinite(peso) || peso <= 0 || peso > 100) return null;
  return {
    nombre: cantidad ? nombreLimpio(cantidad[2]) : nombre,
    peso,
    detalleDetectado: cantidad ? { cantidad: Number(cantidad[1]), ...(cadaUna ? { pesoCadaUna: pesoUnitario } : {}) } : undefined,
    linea: linea.trim()
  };
}

function esAgregado(nombre) {
  return /\bevaluaciones?\s+(?:sumativas?|parciales?|te[oó]ricas?)\b|\bnota\s+de\s+presentaci[oó]n\b/i.test(nombre);
}

function quitarPadresDesglosados(filas) {
  const quitar = new Set();
  for (let i = 0; i < filas.length; i++) {
    const padre = filas[i];
    if (!esAgregado(padre.nombre)) continue;
    let suma = 0;
    const hijos = [];
    for (let j = i + 1; j < filas.length && suma < padre.peso; j++) {
      if (esAgregado(filas[j].nombre)) break;
      suma += filas[j].peso;
      hijos.push(j);
    }
    // Solo se omite el agregado cuando el propio texto enumera de inmediato un
    // desglose completo. Si no calza exacto, queda para revisión: adivinar cuál
    // de sus filas son hijas sería peor que proponer un total equivocado.
    if (hijos.length > 1 && Math.abs(suma - padre.peso) < 0.000001) quitar.add(i);
  }
  return filas.filter((_, i) => !quitar.has(i));
}

function lineaIgnorable(linea) {
  const n = normalizar(linea);
  return !n || /^(?:actividad|evaluacion|instrumento|ponderacion|porcentaje|peso|nota)$/.test(n)
    || /^[\s|+_=-]+$/.test(linea);
}

function senalesComplejidad(linea, fueFila) {
  if (fueFila) return [];
  const n = normalizar(linea);
  const razones = [];
  const condicional = /\b(?:si|en caso de|siempre que|cuando)\b/.test(n);
  const formula = /\b(?:nota final|promedio final|se calculara|sera calculada|ponderara|pasara a ponderar)\b/.test(n);
  const porcentajes = (linea.match(/\d{1,3}(?:[.,]\d+)?\s*%/g) || []).length;
  if (/\b(?:para aprobar|requisito para aprobar|condicion de aprobacion)\b/.test(n)) razones.push('approval_requirement_detected');
  if (/\b(?:eximid[oa]s?|eximicion|exencion|podra eximirse)\b/.test(n)) razones.push('exemption_rule_detected');
  if (/\b(?:reemplaza|reemplazara|se reemplazara|sustituye|sustituira)\b/.test(n)) razones.push('replacement_rule_detected');
  if (/\b(?:nota minima|promedio minimo|minimo para aprobar|al menos|mayor o igual|inferior a|superior a|minimo entre|maximo entre|tope)\b/.test(n)) razones.push('minimum_or_cap_rule_detected');
  if (/\bexamen\b/.test(n) && (condicional || /\b(?:obligatorio|optativo|exim)/.test(n))) razones.push('conditional_exam_rule_detected');
  if (formula && (porcentajes >= 2 || condicional || /\b(?:alternativ|en cambio|o bien)\b/.test(n))) razones.push('alternative_final_grade_formula_detected');
  if (condicional && !razones.length) razones.push('conditional_rule_detected');
  return [...new Set(razones)];
}

function legadoEstado(status) {
  return status === 'auto_importable' ? 'propuesta'
    : status === 'needs_review' ? 'revisar_a_mano' : 'sin_datos';
}

function hashEvaluacion(texto) {
  return crypto.createHash('sha256').update(normalizar(texto)).digest('hex');
}

function extraerEstructura(html, opciones = {}) {
  const texto = htmlATexto(html);
  const nTexto = normalizar(texto);
  const noEncontrado = /\b(?:programa|curso) no encontrado\b|\bno se encontraron resultados\b|\b404 not found\b/.test(nTexto);
  const bloque = bloqueEvaluaciones(texto);
  if (!bloque) {
    const status = noEncontrado ? 'not_found' : 'insufficient_information';
    return { status, estado: legadoEstado(status), reasons: [noEncontrado ? 'program_not_found' : 'evaluation_section_not_found'],
      motivo: noEncontrado ? 'El catálogo indica que el programa no fue encontrado.' : 'No se encontró una sección evaluativa.',
      texto, evaluationSourceText: '', parsedLines: [], unparsedLines: [], complexRuleLines: [], filas: [], total: 0 };
  }
  const evaluationSourceText = [bloque.encabezado, ...bloque.lineas].join('\n');
  const interpretadas = bloque.lineas.map(linea => ({ linea, fila: filaConPorcentaje(linea) }));
  const filas = quitarPadresDesglosados(interpretadas.map(x => x.fila).filter(Boolean));
  const parsedSet = new Set(filas.map(f => f.linea));
  const parsedLines = bloque.lineas.filter(linea => parsedSet.has(linea));
  const complejas = [];
  const reasons = [];
  const codigoDeclarado = (texto.match(/\bSIGLA\s*:?\s*([A-Z]{2,6}[A-Z0-9_]{2,10})\b/i) || [])[1] || null;
  if (opciones.courseCode && codigoDeclarado && normalizar(opciones.courseCode) !== normalizar(codigoDeclarado)) {
    reasons.push('course_code_mismatch');
  }
  interpretadas.forEach(({ linea, fila }) => {
    const señales = senalesComplejidad(linea, !!fila);
    if (señales.length) complejas.push({ line: linea, reasons: señales });
    reasons.push(...señales);
  });
  filas.filter(f => esAgregado(f.nombre) || (f.detalleDetectado && f.detalleDetectado.cantidad > 1 && !f.detalleDetectado.pesoCadaUna))
    .forEach(() => reasons.push('aggregate_category_detected'));
  const unparsedLines = bloque.lineas.filter(linea => !interpretadas.some(x => x.linea === linea && x.fila) && !lineaIgnorable(linea));
  if (unparsedLines.some(linea => !complejas.some(c => c.line === linea))) reasons.push('relevant_unparsed_line');
  const duplicado = filas.find((fila, indice) => filas.findIndex(otra => normalizar(otra.nombre) === normalizar(fila.nombre)) !== indice);
  const total = filas.reduce((suma, fila) => suma + fila.peso, 0);
  if (duplicado) reasons.push('duplicate_evaluation_name');
  if (filas.some(f => !f.nombre || !Number.isFinite(f.peso) || f.peso <= 0 || f.peso > 100)) reasons.push('invalid_weight_or_name');
  if (filas.length && Math.abs(total - 100) > 0.000001) reasons.push('weights_do_not_sum_100');
  const formulas = complejas.filter(c => c.reasons.includes('alternative_final_grade_formula_detected'));
  if (formulas.length > 1) reasons.push('multiple_final_grade_formulas_detected');
  const uniqueReasons = [...new Set(reasons)];
  let status;
  if (!filas.length) status = uniqueReasons.some(r => r !== 'relevant_unparsed_line') ? 'needs_review' : 'insufficient_information';
  else if (uniqueReasons.length) status = 'needs_review';
  else status = 'auto_importable';
  const motivo = status === 'auto_importable' ? null
    : status === 'insufficient_information' ? 'La sección evaluativa no declara ponderaciones suficientes.'
    : `Revisión necesaria: ${uniqueReasons.join(', ')}.`;
  return {
    status, estado: legadoEstado(status), reasons: uniqueReasons, motivo, filas, total, texto,
    evaluationHeading: bloque.encabezado, evaluationSourceText, evaluationSourceHash: hashEvaluacion(evaluationSourceText),
    parsedLines, unparsedLines, complexRuleLines: complejas,
    programVersionText: texto.split('\n').find(l => /\b(?:programa|version|semestre|periodo)\b.*\b20\d{2}\b/i.test(l)) || null,
    semester: null, parserVersion: PARSER_VERSION,
    expectedCourseCode: opciones.courseCode || null, detectedCourseCode: codigoDeclarado ? codigoDeclarado.toUpperCase() : null,
  };
}

function convertirAFicha(fila) {
  const ficha = { nombre: fila.nombre, peso: fila.peso };
  // La cantidad viene declarada en el programa ("3 interrogaciones"), no es
  // una ponderación inventada. Se conserva como señal para quien revise el
  // borrador, sin dividir el porcentaje por nuestra cuenta.
  if (fila.detalleDetectado) ficha.detalleDetectado = fila.detalleDetectado;
  return ficha;
}

function cursosDeMallaUC({ MALLA_UC, CREDITOS_UC }) {
  const vistos = new Set();
  const cursos = [];
  Object.values(MALLA_UC).forEach(plan => Object.values(plan).forEach(semestre => semestre.forEach(nombre => {
    const datos = CREDITOS_UC[nombre];
    if (!datos || !datos[1]) return;
    const sigla = String(datos[1]).toUpperCase();
    if (vistos.has(sigla)) return;
    vistos.add(sigla);
    cursos.push({ nombre, creditos: datos[0], sigla });
  })));
  return cursos.sort((a, b) => a.sigla.localeCompare(b.sigla));
}

function presetPorCurso(curso, { PRESETS_UC, CREDITOS_UC }) {
  const clave = Object.keys(PRESETS_UC).find(nombre => normalizar(nombre) === normalizar(curso.nombre));
  if (!clave) return null;
  const bruto = PRESETS_UC[clave];
  // Los presets antiguos son arrays y los recientes agregan metadatos como
  // periodo, grupos o reglas dentro de {evals:[...]}. Ambos ya coexisten en
  // data.js; no confundir ese cambio de forma con una pauta ausente.
  const lista = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.evals) ? bruto.evals : [];
  const evaluaciones = lista.map(item => {
    const [nombre, peso, extra] = item;
    return { nombre, peso, ...(extra && extra.slots ? { slots: extra.slots } : {}) };
  });
  return { clave, evaluaciones };
}

function comparacionEstructuras(preset, propuesta) {
  const actual = preset.evaluaciones.map(e => ({ nombre: e.nombre, peso: e.peso, ...(e.slots ? { slots: e.slots } : {}) }));
  const catalogo = propuesta.filas.map(convertirAFicha);
  const firma = filas => filas.map(f => `${normalizar(f.nombre)}:${f.peso}:${f.slots || f.detalleDetectado?.cantidad || 1}`).sort().join('|');
  return { coincide: firma(actual) === firma(catalogo), actual, catalogo };
}

function urlPrograma(sigla) {
  return CATALOGO + encodeURIComponent(sigla);
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function descargar(url) {
  let respuesta;
  try { respuesta = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' } }); }
  catch (error) {
    const fallo = new Error(`No se pudo conectar con el catálogo: ${error.message}`);
    fallo.tipo = /timeout|abort/i.test(error.message) ? 'timeout' : 'connection_error';
    throw fallo;
  }
  if (!respuesta.ok) {
    const fallo = new Error(`El catálogo respondió ${respuesta.status} ${respuesta.statusText}.`);
    fallo.tipo = `http_${respuesta.status}`;
    throw fallo;
  }
  return decodificarCatalogo(Buffer.from(await respuesta.arrayBuffer()));
}

function opciones(argv) {
  const resultado = { delay: 250, out: null, fixtureDir: null, siglas: null, dataPath: path.join(ROOT, 'data.js') };
  for (let i = 2; i < argv.length; i++) {
    const valor = argv[i];
    if (valor === '--out') resultado.out = argv[++i];
    else if (valor === '--fixture-dir') resultado.fixtureDir = argv[++i];
    else if (valor === '--sigla') resultado.siglas = (argv[++i] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    else if (valor === '--delay-ms') resultado.delay = Math.max(0, Number(argv[++i]));
    else if (valor === '--data') resultado.dataPath = argv[++i];
    else if (valor === '--help') resultado.help = true;
    else throw new Error(`Opción desconocida: ${valor}`);
  }
  return resultado;
}

function ayuda() {
  return `Uso: node bin/proponer-pautas-uc.js [opciones]\n\n` +
    `  --out <archivo>       destino del borrador JSON (por defecto: borradores/...)\n` +
    `  --sigla A,B           limita la revisión a siglas UC de la malla\n` +
    `  --fixture-dir <dir>   lee <SIGLA>.html local en vez de consultar UC\n` +
    `  --delay-ms <n>        espera entre consultas (por defecto: 250)\n` +
    `  --data <archivo>      data.js alternativo para una revisión aislada\n`;
}

async function htmlParaCurso(curso, opts) {
  const url = urlPrograma(curso.sigla);
  if (opts.fixtureDir) {
    const archivo = path.join(opts.fixtureDir, `${curso.sigla}.html`);
    return { html: decodificarCatalogo(fs.readFileSync(archivo)), url, local: true };
  }
  return { html: await descargar(url), url, local: false };
}

async function generarBorrador(opts) {
  const datos = leerDatosUC(opts.dataPath);
  let cursos = cursosDeMallaUC(datos);
  if (opts.siglas) {
    const solicitadas = new Set(opts.siglas);
    cursos = cursos.filter(curso => solicitadas.has(curso.sigla));
    const presentes = new Set(cursos.map(curso => curso.sigla));
    opts.siglas.filter(sigla => !presentes.has(sigla)).forEach(sigla => {
      throw new Error(`${sigla} no pertenece a una malla UC con sigla declarada en data.js.`);
    });
  }
  const consultadoEn = new Date().toISOString();
  const salida = {
    generadoEn: consultadoEn,
    alcance: 'Ramos de MALLA_UC; las pautas son borradores del catálogo genérico y requieren revisión humana.',
    propuestas: [],
    existentes: [],
    sinDatos: [],
    revisarAMano: [],
    errores: []
  };
  for (let indice = 0; indice < cursos.length; indice++) {
    const curso = cursos[indice];
    const fuente = { url: urlPrograma(curso.sigla), consultadoEn };
    try {
      const respuesta = await htmlParaCurso(curso, opts);
      fuente.url = respuesta.url;
      const estructura = extraerEstructura(respuesta.html, { courseCode: curso.sigla });
      const preset = presetPorCurso(curso, datos);
      const candidato = estructura.filas.map(convertirAFicha);
      const base = {
        ...curso, fuente, estado: estructura.estado, status: estructura.status,
        sourceType: 'official_uc_catalog', sourceUrl: fuente.url, sourceUniversity: 'Pontificia Universidad Católica de Chile',
        courseCode: curso.sigla, retrievedAt: consultadoEn, evaluationSourceText: estructura.evaluationSourceText,
        evaluationSourceHash: estructura.evaluationSourceHash || null, programVersionText: estructura.programVersionText || null,
        semester: null, parserVersion: estructura.parserVersion || PARSER_VERSION, reasons: estructura.reasons || [],
        candidate: { evaluations: candidato, total: estructura.total },
        parsedLines: estructura.parsedLines || [], unparsedLines: estructura.unparsedLines || [],
        complexRuleLines: estructura.complexRuleLines || [],
      };
      if (preset) {
        salida.existentes.push({
          ...base,
          presetExistente: preset.clave,
          comparacion: estructura.status === 'auto_importable'
            ? comparacionEstructuras(preset, estructura)
            : { coincide: null, motivo: estructura.motivo || 'El catálogo no entregó una estructura comparable.' }
        });
      } else if (estructura.status === 'auto_importable') {
        salida.propuestas.push({ ...base, periodo: null, evaluaciones: candidato, total: estructura.total });
      } else if (estructura.status === 'insufficient_information' || estructura.status === 'not_found') {
        salida.sinDatos.push({ ...base, motivo: estructura.motivo });
      } else {
        salida.revisarAMano.push({ ...base, motivo: estructura.motivo, encontrado: candidato, total: estructura.total });
      }
    } catch (error) {
      salida.errores.push({ ...curso, fuente, estado: 'error', status: 'transport_error', errorType: error.tipo || 'unknown_error', motivo: error.message });
    }
    if (!opts.fixtureDir && indice < cursos.length - 1 && opts.delay) await esperar(opts.delay);
  }
  return salida;
}

async function main() {
  const opts = opciones(process.argv);
  if (opts.help) return console.log(ayuda());
  const borrador = await generarBorrador(opts);
  const fecha = borrador.generadoEn.slice(0, 10);
  const destino = path.resolve(opts.out || path.join(ROOT, 'borradores', `pautas-uc-catalogo-${fecha}.json`));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(borrador, null, 2) + '\n');
  console.log(`Borrador escrito en ${destino}`);
  console.log(`Propuestas: ${borrador.propuestas.length}; existentes: ${borrador.existentes.length}; sin datos: ${borrador.sinDatos.length}; revisar: ${borrador.revisarAMano.length}; errores: ${borrador.errores.length}.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`No se pudo generar el borrador: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  PARSER_VERSION, decodificarCatalogo, htmlATexto, esEncabezadoEvaluacion, bloqueEvaluaciones,
  filaConPorcentaje, extraerEstructura, cursosDeMallaUC, generarBorrador, normalizar
};
