#!/usr/bin/env node
// Dónde el consenso de los estudiantes NO dice lo mismo que nuestra pauta.
//
// POR QUÉ EXISTE. Cuando tres personas coinciden en una pauta distinta a la que
// tiene un ramo, la app se la ofrece a quien tenga ese ramo —"6 estudiantes de
// tu universidad reportan otra pauta"— y cada uno decide. Eso corrige UNA
// cuenta a la vez: el catálogo no aprende, y la siguiente persona que agregue
// el ramo recibe otra vez la pauta vieja. Si la transcripción está mal, nadie
// que pueda arreglarla se entera.
//
// Esto es el otro lado. No le habla al estudiante: dice en qué ramos hay que ir
// a mirar el programa.
//
// CÓMO SE USA. En el SQL Editor de Supabase, con las universidades que quieras:
//
//   select 'uc'  as tenant, * from public.catalog_consensus('uc')
//   union all select 'fen' as tenant, * from public.catalog_consensus('fen')
//   union all select 'uai' as tenant, * from public.catalog_consensus('uai');
//
// Descarga el resultado como JSON y:
//
//   node bin/consenso-vs-pauta.js consenso.json
//
// CÓMO COMPARA. Con las mismas funciones de app.js que corren en el teléfono:
// `estructuraDe` → `estructuraParaConsenso` → `huellaEstructura`, las dos
// partes por el mismo camino. Es exactamente la comparación de
// `consensoParaRamo()`, así que lo que sale acá es lo mismo que están viendo
// los estudiantes, ni más ni menos. Importa que decida la huella y no una
// comparación campo a campo: tres "Laboratorio 1, 2 y 3" de 3,33 y un
// "Laboratorio 10%" con tres casillas son la MISMA pauta, y leídos fila por
// fila parecerían un desacuerdo.
//
// No se compara contra la `huella` que trae el SQL. Si alguna vez las dos
// implementaciones se separan en un detalle, esa diferencia aparecería acá
// como una pauta en disputa que en realidad no existe.
//
// QUÉ NO HACE. No decide quién tiene razón ni toca `data.js`. El consenso no
// sale del programa del curso: es lo que la gente recuerda, y puede estar
// equivocado tanto como nosotros. Lo único que hace es decir dónde mirar.
const fs = require('fs'), vm = require('vm'), path = require('path');

// ─── La app, cargada como la carga el navegador ─────────────────────────────
const raiz = path.join(__dirname, '..') + '/';
const src = ['data.js', 'engine.js', 'app.js'].map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {},
  classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '',
  focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null },
  querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {},
    documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } },
    querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

const definicionPreset = val('definicionPreset'), presetRamo = val('presetRamo');
const evalsDePreset = val('evalsDePreset');
const estructuraDe = val('estructuraDe'), estructuraParaConsenso = val('estructuraParaConsenso');
const huellaEstructura = val('huellaEstructura'), normName = val('normName'), r2 = val('r2');
const claveCatalogo = val('claveCatalogo');
const CREDITOS_UC = val('CREDITOS_UC'), SIGLAS_UC = val('SIGLAS_UC');
const PRESETS_POR_TENANT = val('PRESETS_POR_TENANT');

// En UC `definicionPreset` filtra por carrera —COM tiene su propia lista— y acá
// no sabemos la carrera de nadie: el consenso agrupa por universidad y ramo a
// propósito, porque un estudiante puede adelantar o repetir y sigue cursando el
// mismo curso. ING-PC admite cualquier preset UC, así que sirve de llave maestra.
const CARRERA_SONDA = { uc: 'ING-PC' };

// El consenso de UC viene identificado por sigla. Para encontrar la pauta hay
// que volver al nombre, que es como está escrita en PRESETS_UC.
const nombrePorSigla = new Map();
const anotarSigla = (sigla, nombre) => {
  const s = sigla && String(sigla).trim().toUpperCase();
  if (s && !nombrePorSigla.has(s)) nombrePorSigla.set(s, nombre);
};
Object.entries(CREDITOS_UC || {}).forEach(([nombre, fila]) => anotarSigla(fila && fila[1], nombre));
Object.values(SIGLAS_UC || {}).forEach(tabla =>
  Object.entries(tabla || {}).forEach(([nombre, sigla]) => anotarSigla(sigla, nombre)));

// La pauta que tenemos nosotros: por nombre y, si el nombre no calza, por sigla.
function pautaNuestra(tenant, ramo, ramoKey) {
  const carrera = CARRERA_SONDA[tenant] || null;
  const candidatos = [ramo];
  if (tenant === 'uc' && ramoKey) {
    const porSigla = nombrePorSigla.get(String(ramoKey).trim().toUpperCase());
    if (porSigla) candidatos.push(porSigla);
  }
  for (const nombre of candidatos) {
    const def = definicionPreset(nombre, tenant, carrera);
    if (!def) continue;
    // Con qué nombre está escrita en data.js, que puede no ser ninguno de los
    // dos de arriba: el estudiante escribió "CONTABILIDAD" y el catálogo dice
    // "Contabilidad". Es el nombre que hay que ir a buscar para corregirla.
    const clave = claveCatalogo(nombre, Object.keys(PRESETS_POR_TENANT[tenant] || {}), tenant);
    return { nombre, clave: clave || nombre, def, carrera };
  }
  return null;
}

const comoLaApp = est => estructuraParaConsenso(est || []);
const legible = est => est.map(e => `${e.nombre} ${r2(e.peso)}%`
  + (e.slots > 1 ? ` ×${e.slots}` : '') + (e.min ? ` (mín ${e.min})` : '')).join(' · ');

// Para leer, no para clasificar. Quien clasifica es la huella.
function diferencias(nuestra, suya) {
  const indexar = l => new Map(l.map(e => [normName(e.nombre), e]));
  const a = indexar(nuestra), b = indexar(suya), out = [];
  a.forEach((x, k) => {
    const y = b.get(k);
    if (!y) { out.push(`no la reportan: ${x.nombre} ${r2(x.peso)}%`); return; }
    if (r2(x.peso) !== r2(y.peso)) out.push(`${x.nombre}: tenemos ${r2(x.peso)}% · reportan ${r2(y.peso)}%`);
    const sa = x.slots || 1, sb = y.slots || 1;
    if (sa !== sb) out.push(`${x.nombre}: tenemos ${sa} casilla(s) · reportan ${sb}`);
    if ((x.min || 0) !== (y.min || 0)) out.push(`${x.nombre}: mínimo ${x.min || 'ninguno'} · reportan ${y.min || 'ninguno'}`);
  });
  b.forEach((y, k) => { if (!a.has(k)) out.push(`no la tenemos: ${y.nombre} ${r2(y.peso)}%`); });
  return out;
}

function clasificar(filas) {
  const difieren = [], confirman = [], sinCargar = [], sinPauta = [];
  (filas || []).forEach(f => {
    const tenant = f.tenant || 'uc';
    const suya = comoLaApp(f.estructura);
    const fila = { ...f, tenant, suya, suma: r2(suya.reduce((s, e) => s + (Number(e.peso) || 0), 0)) };
    const nuestra = pautaNuestra(tenant, f.ramo, f.ramo_key);
    if (!nuestra) { sinPauta.push(fila); return; }
    fila.preset = nuestra.clave;
    const armada = presetRamo(nuestra.clave, tenant, nuestra.carrera);
    // El dato está en data.js pero la app no lo carga: o el programa trae
    // reglas sin ponderaciones, o deja la mitad del ramo en grupos sin decir
    // cuántas evaluaciones llevan (pautaPresetSuficiente, 2026-09-25). En los
    // dos casos el consenso es la respuesta que falta, no una discrepancia:
    // compararlo contra una pauta que nadie recibió no significaría nada.
    if (!armada) {
      fila.falta = evalsDePreset(nuestra.def).length ? 'cuántas evaluaciones lleva cada grupo' : 'las ponderaciones';
      sinCargar.push(fila); return;
    }
    fila.nuestra = comoLaApp(estructuraDe(armada));
    fila.dif = diferencias(fila.nuestra, suya);
    (huellaEstructura(fila.nuestra) === huellaEstructura(suya) ? confirman : difieren).push(fila);
  });
  return { difieren, confirman, sinCargar, sinPauta };
}

// ─── El informe ─────────────────────────────────────────────────────────────
function informe(res, total, log = console.log) {
  const porRespaldos = (a, b) => b.respaldos - a.respaldos || String(a.ramo).localeCompare(String(b.ramo), 'es');
  const cab = (t, l) => { if (l.length) { l.sort(porRespaldos); log('\n' + t); } return l.length; };
  const suma = f => f.suma !== 100 ? `  ⚠ lo que reportan suma ${f.suma}%` : '';
  // Solo cuando la pauta se encontró por otro nombre que el que trae la fila.
  const bajo = f => f.preset && normName(f.preset) !== normName(f.ramo) ? `     en data.js como "${f.preset}"\n` : '';
  const ficha = f => `\n  ${f.ramo}  ·  ${f.tenant} ${f.ramo_key}  ·  ${f.respaldos} personas${suma(f)}`;

  log(`\n${total} consensos · ${res.difieren.length} difieren de nuestra pauta · ${res.confirman.length} la confirman`
    + ` · ${res.sinCargar.length} completan una que no cargamos · ${res.sinPauta.length} sin pauta nuestra`);

  if (cab('═══ DIFIEREN — acá hay que mirar el programa ═══', res.difieren))
    res.difieren.forEach(f => {
      log(ficha(f));
      log(bajo(f) + f.dif.map(d => `     · ${d}`).join('\n'));
      log(`     tenemos:  ${legible(f.nuestra)}`);
      log(`     reportan: ${legible(f.suya)}`);
    });

  if (cab('═══ COMPLETAN una pauta que tenemos pero no cargamos ═══', res.sinCargar))
    res.sinCargar.forEach(f => {
      log(ficha(f));
      log(`     en data.js como "${f.preset}", sin ${f.falta}`);
      log(`     reportan: ${legible(f.suya)}`);
    });

  if (cab('═══ SIN pauta nuestra — el consenso se aplica solo ═══', res.sinPauta))
    res.sinPauta.forEach(f => { log(ficha(f)); log(`     reportan: ${legible(f.suya)}`); });

  if (cab('═══ CONFIRMAN nuestra pauta ═══', res.confirman))
    res.confirman.forEach(f => log(`  ${f.ramo}  ·  ${f.tenant} ${f.ramo_key}  ·  ${f.respaldos} personas de acuerdo`
      + (normName(f.preset) !== normName(f.ramo) ? `  (data.js: "${f.preset}")` : '')));

  log('');
}

if (require.main === module) {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Falta el archivo.\n  node bin/consenso-vs-pauta.js consenso.json');
    process.exit(2);
  }
  let filas;
  try { filas = JSON.parse(fs.readFileSync(archivo, 'utf8')); }
  catch (e) { console.error('No pude leer el JSON: ' + e.message); process.exit(2); }
  if (!Array.isArray(filas)) {
    console.error('El JSON tiene que ser la lista de filas que devuelve la consulta.');
    process.exit(2);
  }
  informe(clasificar(filas), filas.length);
}

module.exports = { clasificar, pautaNuestra, diferencias, informe };
