// Estado sintético por la RPC real agente_datos y por el endpoint MCP.
// La pauta vive en este test: nunca se toma un preset ni una cuenta real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const raiz = path.join(__dirname, '..');
const leer = archivo => fs.readFileSync(path.join(raiz, archivo), 'utf8');
const usuario = '00000000-0000-0000-0000-000000000041';
const token = 'a'.repeat(64);
const nota = (id, valor) => ({ id: `nota-${id}`, nombre: id, valor, peso: 1 });
const categoria = (id, nombre, peso, notas = []) => ({ id, nombre, peso, directNota: true, notas });
const ramo = (extra = {}) => ({
  id: 'ramo-sintetico', nombre: 'Ramo sintético', color: '#456', origen: null, gates: [],
  categorias: [
    categoria('i1', 'Interrogación 1', 20, [nota('i1', 5)]),
    categoria('i2', 'Interrogación 2', 20),
    categoria('ex', 'Examen', 40),
    categoria('ta', 'Taller', 20, [nota('ta', 5)]),
  ],
  reglasAusenciaJustificada: { reemplazos: [], traspasos: [{ desdeId: 'i2', haciaId: 'ex' }] },
  ausenciasJustificadas: [],
  ...extra,
});

function conectar(estado) {
  const llamadas = [];
  const ctx = {
    console, Response, structuredClone,
    HERRAMIENTAS: [], NOMBRES: ['simular'],
    fetch: async (url, options) => {
      llamadas.push({ url, options });
      return { ok: true, json: async () => structuredClone(estado) };
    },
    module: { exports: {} }, exports: {},
  };
  vm.createContext(ctx);
  vm.runInContext(leer('engine.js'), ctx, { filename: 'engine.js' });
  ctx.motorCompartido = { gh_crearCalculoRamo: ctx.module.exports.gh_crearCalculoRamo };
  const endpoint = leer('functions/mcp/[[ruta]].js').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
  vm.runInContext(endpoint + '\n;globalThis.__post=onRequestPost;', ctx, { filename: 'mcp.js' });
  return {
    llamadas,
    async simular(args) {
      const respuesta = await ctx.__post({
        params: { ruta: [token] },
        request: { json: async () => ({ jsonrpc: '2.0', id: 1, method: 'tools/call',
          params: { name: 'simular', arguments: { ramo: 'Ramo sintético', ...args } } }) },
      });
      const cuerpo = await respuesta.json();
      return { ...JSON.parse(cuerpo.result.content[0].text), isError: cuerpo.result.isError === true };
    },
  };
}

function promedioApp(caso) {
  const stub = { style: { setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, appendChild() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return stub; }, querySelectorAll() { return []; }, focus() {}, select() {}, click() {} };
  const ctx = {
    console, setTimeout, clearTimeout,
    window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
    document: { getElementById: () => stub, createElement: () => stub, addEventListener() {},
      documentElement: stub, querySelector: () => stub, querySelectorAll: () => [], body: stub },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, navigator: {},
    location: { origin: '', pathname: '/', hash: '' }, history: { replaceState() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(['data.js', 'engine.js', 'app.js'].map(leer).join('\n'), ctx);
  ctx.__ramo = caso;
  return vm.runInContext('ramoAvg(__ramo)', ctx);
}

(async () => {
  const db = new PGlite();
  try {
    await db.exec(leer('bin/supabase-stubs.sql'));
    await db.exec('create table public.user_ramos (user_id uuid primary key references auth.users(id), data jsonb not null)');
    await db.exec(leer('supabase/agente_mcp.sql'));
    const oficial = ramo();
    const declarada = ramo({ id: 'otro-ramo', nombre: 'Otro ramo', reglasAusenciaJustificada: null,
      reglasAusenciaJustificadaUsuario: { declaradaPor: 'estudiante', rezagos: [], reemplazos: [],
        traspasos: [{ desdeId: 'i2', haciaId: 'ex' }] }, ausenciasJustificadas: ['i2'] });
    const guardado = { tenant: 'uc', ramos: [oficial, declarada] };
    await db.query('insert into auth.users(id) values($1)', [usuario]);
    await db.query('insert into user_ramos(user_id,data) values($1,$2::jsonb)', [usuario, JSON.stringify(guardado)]);
    await db.query('insert into agent_links(user_id,token,agente) values($1,$2,$3)', [usuario, token, 'Agente sintético']);
    const rpc = async () => (await db.query('select agente_datos($1) as estado', [token])).rows[0].estado;
    const estado = await rpc();
    assert.deepEqual(estado.ramos[0].reglasAusenciaJustificada, oficial.reglasAusenciaJustificada,
      'la regla del programa guardada en user_ramos.data llega por agente_datos');
    assert.deepEqual(estado.ramos[1].reglasAusenciaJustificadaUsuario, declarada.reglasAusenciaJustificadaUsuario,
      'la regla declarada por el estudiante también llega por agente_datos');
    assert.deepEqual(estado.ramos[1].ausenciasJustificadas, ['i2'], 'las ausencias previas llegan sin migración');

    const conector = conectar(estado);
    const escenario = await conector.simular({ ausencias: [{ evaluacion: 'Interrogación 2' }],
      notas: [{ evaluacion: 'Examen', valor: 5 }] });
    assert.equal(escenario.isError, false);
    assert.equal(escenario.promedioSimulado, 5);
    assert.equal(escenario.origenReglaAusencia, 'programa');
    assert.deepEqual(JSON.parse(JSON.stringify(escenario.ausenciasSimuladas[0])), {
      evaluacion: 'Interrogación 2', tipo: 'traspaso', estado: 'aplicada', pesoOriginal: 20,
      destino: 'Examen', pesoNuevoDestino: 60, pesoAplicado: 20, topeAplicado: false,
      pesoExcedenteConNotaUno: 0, origenRegla: 'programa', yaDeclarada: false,
    });
    const comoEnApp = ramo();
    comoEnApp.ausenciasJustificadas = ['i2'];
    comoEnApp.categorias.find(c => c.id === 'ex').notas = [nota('ex', 5)];
    assert.equal(escenario.promedioSimulado, promedioApp(comoEnApp),
      'la ausencia nueva y la nota hipotética dan el mismo promedio que la app con esa declaración');
    const rendir = await conector.simular({ notas: [{ evaluacion: 'Interrogación 2', valor: 3 },
      { evaluacion: 'Examen', valor: 5 }] });
    assert.equal(rendir.promedioSimulado, 4.6, 'se pueden comparar los dos escenarios');
    assert.equal(conector.llamadas.length, 2);
    assert.ok(conector.llamadas.every(x => x.url.endsWith('/agente_datos')),
      'simular solo llama a la RPC de lectura existente');
    assert.deepEqual(estado.ramos[0], oficial, 'el ramo original no cambia en memoria');
    assert.deepEqual((await rpc()).ramos[0], oficial, 'el ramo guardado en user_ramos.data no cambia');

    const anterior = await conector.simular({ ausencias: [{ evaluacion: 'Interrogación 2' }] });
    assert.equal(anterior.ausenciasSimuladas[0].yaDeclarada, false);
    const existente = conectar({ ramos: [ramo({ reglasAusenciaJustificada: null,
      reglasAusenciaJustificadaUsuario: declarada.reglasAusenciaJustificadaUsuario,
      ausenciasJustificadas: ['i2'] })] });
    const previa = await existente.simular({ ausencias: [{ evaluacion: 'Interrogación 2' }],
      notas: [{ evaluacion: 'Examen', valor: 5 }] });
    assert.equal(previa.origenReglaAusencia, 'estudiante');
    assert.equal(previa.ausenciasSimuladas[0].yaDeclarada, true);
    assert.equal(previa.promedioSimulado, 5);

    const topado = ramo({ categorias: [
      categoria('i1', 'Interrogación 1', 10, [nota('i1', 7)]),
      categoria('i2', 'Interrogación 2', 30),
      categoria('ex', 'Examen', 60, [nota('ex', 7)]),
    ] });
    const conTope = await conectar({ ramos: [topado] }).simular({ ausencias: [{ evaluacion: 'Interrogación 2' }] });
    assert.equal(conTope.promedioSimulado, 6.1);
    assert.equal(conTope.ausenciasSimuladas[0].pesoNuevoDestino, 75);
    assert.equal(conTope.ausenciasSimuladas[0].pesoExcedenteConNotaUno, 15);
    assert.equal(conTope.ausenciasSimuladas[0].notaExceso, 1);
    assert.equal(conTope.ausenciasSimuladas[0].topeAplicado, true);

    const sinRegla = await conectar({ ramos: [ramo({ reglasAusenciaJustificada: null })] })
      .simular({ ausencias: [{ evaluacion: 'Interrogación 2' }] });
    assert.equal(sinRegla.isError, true);
    assert.match(sinRegla.error, /no tiene declarada la regla/);
    assert.equal(sinRegla.promedioSimulado, undefined, 'sin regla no se entrega un cálculo inventado');
    const conNota = ramo();
    conNota.categorias.find(c => c.id === 'i2').notas = [nota('i2', 4)];
    const rendida = await conectar({ ramos: [conNota] }).simular({ ausencias: [{ evaluacion: 'Interrogación 2' }] });
    assert.equal(rendida.isError, true);
    assert.match(rendida.error, /ya tiene nota/);
    const inexistente = await conector.simular({ ausencias: [{ evaluacion: 'Control inventado' }] });
    assert.equal(inexistente.isError, true);
    assert.match(inexistente.error, /No encontré/);
    const contradictorio = await conector.simular({ ausencias: [{ evaluacion: 'Interrogación 2' }],
      notas: [{ evaluacion: 'Interrogación 2', valor: 5 }] });
    assert.equal(contradictorio.isError, true);

    const conCompuerta = ramo({ gates: [{ type: 'min_grade_required', catId: 'ex', min: 4, cap: 3.9 }],
      categorias: [categoria('i1', 'Interrogación 1', 20, [nota('i1', 7)]),
        categoria('i2', 'Interrogación 2', 20), categoria('ex', 'Examen', 40),
        categoria('ta', 'Taller', 20, [nota('ta', 7)])] });
    const gate = await conectar({ ramos: [conCompuerta] }).simular({
      ausencias: [{ evaluacion: 'Interrogación 2' }], notas: [{ evaluacion: 'Examen', valor: 3 }],
    });
    assert.equal(gate.promedioSimulado, 3.9);
    assert.equal(gate.compuertasIncumplidas[0].nombre, 'Examen');

    const rezago = ramo({ reglasAusenciaJustificada: null,
      reglasAusenciaJustificadaUsuario: { declaradaPor: 'estudiante', rezagos: [{ desdeId: 'i2' }],
        reemplazos: [], traspasos: [] } });
    const pendiente = await conectar({ ramos: [rezago] }).simular({ ausencias: [{ evaluacion: 'Interrogación 2' }] });
    assert.equal(pendiente.ausenciasSimuladas[0].tipo, 'rezago');
    assert.equal(pendiente.ausenciasSimuladas[0].estado, 'pendiente');
    assert.equal(pendiente.ausenciasSimuladas[0].destino, null);

    const multicasilla = ramo();
    multicasilla.categorias.find(c => c.id === 'i2').slots = 2;
    const casilla = await conectar({ ramos: [multicasilla] }).simular({
      ausencias: [{ evaluacion: 'Interrogación 2', casilla: 2 }],
    });
    assert.equal(casilla.isError, true);
    assert.match(casilla.error, /evaluación completa/);

    const resumen = (leer('functions/mcp/herramientas.js').match(/nombre: 'simular'[\s\S]*?resumen: '([^']*)'/) || [])[1] || '';
    assert.match(resumen, /comparar.*justificativo/i);
    assert.match(resumen, /solo si la persona tiene justificativo/i);
    console.log('OK MCP: reglas por agente_datos, simulación, tope, errores, compuerta y solo lectura');
  } finally {
    await db.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
