// bin/consenso-vs-pauta.js — el informe que dice dónde el consenso de los
// estudiantes no coincide con la pauta que tenemos transcrita.
//
// LOS CASOS SE ARMAN DESDE EL CATÁLOGO, NO CONTRA ÉL. Ningún `chk` de acá dice
// "Cálculo I lleva Interrogación 1 al 20%". Se lee la pauta que el catálogo
// tenga HOY, se le mete al informe y se comprueba que la clasifique donde
// corresponde; después se le mueve un peso y se comprueba que la mueva de
// grupo. Así una corrección de contenido —que es justo lo que se edita todo el
// tiempo— no puede volver rojo este archivo. Es la regla de AGENTS.md sobre no
// atar un test de mecanismo a datos del catálogo, cumplida al revés: el dato
// entra como insumo del caso en vez de como la respuesta esperada.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..') + '/';
const { clasificar } = require(raiz + 'bin/consenso-vs-pauta.js');

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

const PRESETS_UC = val('PRESETS_UC'), CREDITOS_UC = val('CREDITOS_UC');
const evalsDePreset = val('evalsDePreset'), pautaPresetSuficiente = val('pautaPresetSuficiente');
const presetRamo = val('presetRamo'), estructuraDe = val('estructuraDe');
const estructuraParaConsenso = val('estructuraParaConsenso'), normName = val('normName');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const nota = n => console.log('  --   ' + n);

// La estructura de un preset tal como la ve la app en el teléfono: es también
// la forma en que llega un reporte, así que sirve de las dos puntas.
const comoLaApp = nombre => estructuraParaConsenso(estructuraDe(presetRamo(nombre, 'uc', 'ING-PC')));
const fila = (ramo, estructura, extra) => Object.assign(
  { tenant: 'uc', ramo, ramo_key: 'XXX000', estructura, respaldos: 3, huella: '-' }, extra);
const unico = res => { // una sola fila: en qué grupo cayó
  const g = ['difieren', 'confirman', 'sinCargar', 'sinPauta'].filter(k => res[k].length);
  return g.length === 1 && res[g[0]].length === 1 ? g[0] : 'ninguno/varios';
};

const cargables = Object.keys(PRESETS_UC).filter(k => pautaPresetSuficiente(evalsDePreset(PRESETS_UC[k])));
const bloqueados = Object.keys(PRESETS_UC).filter(k => !pautaPresetSuficiente(evalsDePreset(PRESETS_UC[k])));

console.log('\n=== Clasificación ===');
if (!cargables.length) { nota('SALTADO: no hay ningún preset UC que la app cargue'); }
else {
  const nombre = cargables[0];
  const nuestra = comoLaApp(nombre);
  nota(`caso construido con "${nombre}" (${nuestra.length} evaluaciones)`);

  chk('la pauta del catálogo, reportada tal cual, CONFIRMA',
    unico(clasificar([fila(nombre, nuestra.map(e => ({ ...e })))])) === 'confirman');

  // Un peso movido es la discrepancia más barata de fabricar y la más típica:
  // el curso le cambió la ponderación al examen y nadie actualizó el programa.
  const movida = nuestra.map((e, i) => ({ ...e, peso: i === 0 ? e.peso + 5 : e.peso }));
  const res = clasificar([fila(nombre, movida)]);
  chk('con un peso movido, DIFIERE', unico(res) === 'difieren');
  chk('y dice cuál evaluación y los dos valores',
    res.difieren.length === 1 && res.difieren[0].dif.some(d =>
      d.includes(nuestra[0].nombre) && d.includes('tenemos') && d.includes('reportan')));

  chk('avisa cuando lo reportado no suma 100',
    clasificar([fila(nombre, nuestra.slice(1).map(e => ({ ...e })))]).difieren.every(f => f.suma !== 100));

  // Las dos direcciones se leen distinto y las dos importan: una evaluación
  // que nosotros tenemos y ellos no puede ser una que el curso sacó, y una que
  // ellos tienen y nosotros no, una que nunca transcribimos.
  const conExtra = clasificar([fila(nombre, nuestra.map(e => ({ ...e }))
    .concat([{ nombre: 'Trabajo Final Que No Tenemos', peso: 10 }]))]);
  chk('nombra lo que solo reportan ellos',
    conExtra.difieren.length === 1 &&
    conExtra.difieren[0].dif.some(d => d.includes('Trabajo Final Que No Tenemos')));
  chk('nombra lo que solo tenemos nosotros',
    clasificar([fila(nombre, nuestra.slice(1).map(e => ({ ...e })))]).difieren
      .some(f => f.dif.some(d => d.includes(nuestra[0].nombre))));

  // El nombre que trae la fila es el que escribió alguien; el que hay que ir a
  // buscar para corregir la pauta es el de data.js, con sus mayúsculas y sus
  // tildes. Comparación exacta a propósito: normalizando, este chk no
  // distinguiría "CONTABILIDAD" de "Contabilidad", que es justo el caso.
  const gritado = clasificar([fila(nombre.toUpperCase(), comoLaApp(nombre))]);
  chk('devuelve la clave de data.js tal cual, no como venía escrita',
    gritado.confirman.length === 1 && gritado.confirman[0].preset === nombre);
}

chk('un ramo que no está en el catálogo queda SIN PAUTA nuestra',
  unico(clasificar([fila('Ramo Que No Existe Zzyzx', [{ nombre: 'Examen', peso: 100 }])])) === 'sinPauta');

if (!bloqueados.length) nota('SALTADO: hoy no hay presets UC frenados por pautaPresetSuficiente');
else {
  const nombre = bloqueados[0];
  nota(`caso construido con "${nombre}", que está en data.js pero no se carga`);
  const res = clasificar([fila(nombre, evalsDePreset(PRESETS_UC[nombre])
    .map(([n, p], i) => ({ nombre: n, peso: p, slots: i === 0 ? 3 : 1 })))]);
  chk('una pauta que tenemos pero no cargamos sale aparte, no como diferencia',
    unico(res) === 'sinCargar');
  chk('y dice con qué nombre buscarla en data.js',
    res.sinCargar.length === 1 && normName(res.sinCargar[0].preset) === normName(nombre));
}

console.log('\n=== Encontrar la pauta ===');
// El consenso de UC viaja identificado por SIGLA, y el nombre que trae es el
// que escribió alguien: puede estar en mayúsculas, abreviado o mal escrito. Si
// el informe solo mirara el nombre, esos ramos se verían como "sin pauta
// nuestra" y nadie iría a revisar el programa.
const conSigla = cargables
  .map(n => ({ n, sigla: (CREDITOS_UC[Object.keys(CREDITOS_UC).find(k => normName(k) === normName(n))] || [])[1] }))
  .find(x => typeof x.sigla === 'string' && x.sigla);
if (!conSigla) nota('SALTADO: ningún preset UC cargable tiene sigla en CREDITOS_UC');
else {
  nota(`caso construido con "${conSigla.n}" / ${conSigla.sigla}`);
  const res = clasificar([fila('nombre escrito a mano que no calza', comoLaApp(conSigla.n),
    { ramo_key: conSigla.sigla })]);
  chk('con un nombre que no calza, la sigla igual encuentra la pauta', unico(res) === 'confirman');
  chk('y el informe dice el nombre real de data.js',
    res.confirman.length === 1 && normName(res.confirman[0].preset) === normName(conSigla.n));
  chk('la sigla en minúsculas o con espacios también encuentra la pauta',
    unico(clasificar([fila('otro nombre cualquiera', comoLaApp(conSigla.n),
      { ramo_key: '  ' + conSigla.sigla.toLowerCase() + ' ' })])) === 'confirman');
}

console.log('\n=== La huella manda, no la lectura fila por fila ===');
// Tres "Control 1, 2 y 3" de 10% y un "Controles 30%" con tres casillas son la
// MISMA pauta: calculan igual y la huella las agrupa. Leídas fila por fila
// parecen un desacuerdo, y si el informe las marcara como tal mandaría a
// revisar programas que están bien — que es la forma de que nadie lo mire más.
const conSerie = cargables.map(n => ({ n, est: comoLaApp(n) }))
  .find(x => x.est.some(e => (e.slots || 1) >= 3));
if (!conSerie) nota('SALTADO: hoy ningún preset UC cargable tiene una categoría de 3+ casillas');
else {
  const cat = conSerie.est.find(e => (e.slots || 1) >= 3);
  nota(`caso construido con "${conSerie.n}": ${cat.nombre} ${cat.peso}% ×${cat.slots}`);
  const desplegada = conSerie.est.flatMap(e => e !== cat ? [{ ...e }]
    : Array.from({ length: cat.slots }, (_, i) => ({
        nombre: `${cat.nombre} ${i + 1}`,
        // El reparto trae el mismo redondeo a dos decimales que hace la app, y
        // el resto se le carga a la última: así suma exacto, como suma un
        // reporte de verdad.
        peso: i < cat.slots - 1 ? Math.round(cat.peso / cat.slots * 100) / 100
          : Math.round((cat.peso - Math.round(cat.peso / cat.slots * 100) / 100 * (cat.slots - 1)) * 100) / 100,
      })));
  chk('la misma pauta escrita como serie numerada CONFIRMA, no difiere',
    unico(clasificar([fila(conSerie.n, desplegada)])) === 'confirman');
}

console.log('\n=== Varias filas a la vez ===');
if (cargables.length >= 2) {
  const [a, b] = cargables;
  const res = clasificar([
    fila(a, comoLaApp(a)),
    fila(b, comoLaApp(b).map((e, i) => ({ ...e, peso: i === 0 ? e.peso + 7 : e.peso })), { respaldos: 9 }),
    fila('Ramo Que No Existe Zzyzx', [{ nombre: 'Examen', peso: 100 }], { respaldos: 5 }),
  ]);
  chk('cada fila cae en su grupo y ninguna se pierde',
    res.confirman.length === 1 && res.difieren.length === 1 && res.sinPauta.length === 1 &&
    res.confirman[0].ramo === a && res.difieren[0].ramo === b);
} else nota('SALTADO: hacen falta dos presets UC cargables');

chk('una lista vacía no revienta',
  ['difieren', 'confirman', 'sinCargar', 'sinPauta'].every(k => clasificar([])[k].length === 0));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
