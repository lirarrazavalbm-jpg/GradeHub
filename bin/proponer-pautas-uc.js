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
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CATALOGO = 'https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=';
const USER_AGENT = 'Mozilla/5.0 (compatible; GradeHubCatalogReview/1.0; +https://gradehub.cl)';

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

function bloqueEvaluaciones(texto) {
  const lineas = texto.split('\n');
  const inicio = lineas.findIndex(linea => /ESTRATEGIAS?\s+EVALUATIVAS?|SISTEMA\s+DE\s+EVALUACI[ÓO]N|EVALUACI[ÓO]N\s+DEL\s+CURSO|^(?:[IVXLC]+\.?\s*)?EVALUACI[ÓO]N(?:\s+DE\s+APRENDIZAJES)?\s*$/i.test(linea.trim()));
  if (inicio < 0) return [];
  const bloque = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (/^(?:[IVXLC]+\.?\s*)?(?:BIBLIOGRAF[IÍ]A|METODOLOG[IÍ]A|RESULTADOS|REQUISITOS|ASISTENCIA|INTEGRIDAD|ANTECEDENTES|INFORMACI[ÓO]N)\b/i.test(linea)) break;
    bloque.push(linea);
  }
  return bloque.filter(Boolean);
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
  const final = linea.match(/^(.*?)(?:\(?\s*)(\d{1,3}(?:[.,]\d+)?)\s*%\s*\)?\s*$/);
  if (!final) return null;
  const nombre = nombreLimpio(final[1]);
  const peso = Number(final[2].replace(',', '.'));
  if (!nombre || !Number.isFinite(peso) || peso <= 0 || peso > 100) return null;
  const cantidad = nombre.match(/^(\d+)\s+(.+)$/);
  return {
    nombre: cantidad ? nombreLimpio(cantidad[2]) : nombre,
    peso,
    detalleDetectado: cantidad ? { cantidad: Number(cantidad[1]) } : undefined,
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

function extraerEstructura(html) {
  const texto = htmlATexto(html);
  const lineas = bloqueEvaluaciones(texto);
  if (!lineas.length) return { estado: 'sin_datos', motivo: 'No se encontró una sección de estrategias evaluativas.', texto };
  const filas = quitarPadresDesglosados(lineas.map(filaConPorcentaje).filter(Boolean));
  if (!filas.length) return { estado: 'sin_datos', motivo: 'La sección evaluativa no declara porcentajes.', texto };
  const duplicado = filas.find((fila, indice) => filas.findIndex(otra => normalizar(otra.nombre) === normalizar(fila.nombre)) !== indice);
  const total = filas.reduce((suma, fila) => suma + fila.peso, 0);
  if (duplicado) return { estado: 'revisar_a_mano', motivo: 'Hay evaluaciones con el mismo nombre; el catálogo no permite distinguirlas sin interpretación.', filas, total, texto };
  if (Math.abs(total - 100) > 0.000001) return { estado: 'revisar_a_mano', motivo: `Los porcentajes detectados suman ${total}%, no 100%.`, filas, total, texto };
  return { estado: 'propuesta', filas, total, texto };
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
  const respuesta = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' } });
  if (!respuesta.ok) throw new Error(`El catálogo respondió ${respuesta.status} ${respuesta.statusText}.`);
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
      const estructura = extraerEstructura(respuesta.html);
      const preset = presetPorCurso(curso, datos);
      const base = { ...curso, fuente, estado: estructura.estado };
      if (preset) {
        salida.existentes.push({
          ...base,
          presetExistente: preset.clave,
          comparacion: estructura.estado === 'propuesta'
            ? comparacionEstructuras(preset, estructura)
            : { coincide: null, motivo: estructura.motivo || 'El catálogo no entregó una estructura comparable.' }
        });
      } else if (estructura.estado === 'propuesta') {
        salida.propuestas.push({ ...base, periodo: null, evaluaciones: estructura.filas.map(convertirAFicha), total: estructura.total });
      } else if (estructura.estado === 'sin_datos') {
        salida.sinDatos.push({ ...base, motivo: estructura.motivo });
      } else {
        salida.revisarAMano.push({ ...base, motivo: estructura.motivo, encontrado: estructura.filas.map(convertirAFicha), total: estructura.total });
      }
    } catch (error) {
      salida.errores.push({ ...curso, fuente, estado: 'error', motivo: error.message });
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

module.exports = { decodificarCatalogo, htmlATexto, extraerEstructura, cursosDeMallaUC, generarBorrador, normalizar };
