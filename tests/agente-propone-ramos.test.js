// Un agente propone los RAMOS del semestre; la app los agrega cuando su dueña
// acepta. Lo que se cuida acá es lo mismo de siempre: la propuesta no toca el
// semestre al llegar, no trae notas, y aceptar no puede duplicar un ramo que ya
// está. Además, aceptar tiene que dejar el ramo como si lo hubiera agregado del
// catálogo —con su pauta y sus créditos—, porque si no, la propuesta le ahorra
// el tipeo y le quita la pauta.
const fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const sql = leer('supabase/agente_ramos_propuestas.sql');

const ctxMod = { module: {}, exports: {} };
vm.createContext(ctxMod);
vm.runInContext(leer('functions/mcp/herramientas.js').replace(/^export (const|function)/gm, '$1'), ctxMod);
const HERRAMIENTAS = vm.runInContext('HERRAMIENTAS', ctxMod);
const validar = vm.runInContext('validarPropuestaRamos', ctxMod);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('=== La herramienta es una propuesta, no una escritura ===');
const tool = HERRAMIENTAS.find(h => h.nombre === 'proponer_ramos');
chk('proponer_ramos existe y es propuesta', !!tool && tool.tipo === 'propuesta');
chk('su descripción dice que no los agrega', /no los agrega|pendiente|acepta/i.test(tool.resumen));
chk('no recibe notas: solo nombre, sigla y sección',
  JSON.stringify(Object.keys(tool.args.ramos.items.properties)) === '["nombre","sigla","seccion"]');

console.log('\n=== Lo que el agente manda se valida antes de guardarlo ===');
const bueno = { fuente: 'Horario de la universidad', ramos: [{ nombre: 'Cálculo I', sigla: 'MAT1610', seccion: 3 }, { nombre: 'Dinámica' }] };
chk('una lista bien formada pasa', validar(bueno) === null);
chk('sin fuente no pasa', /de dónde salió/.test(validar({ ...bueno, fuente: '' })));
chk('vacía o con más de 20 no pasa',
  /entre 1 y 20/.test(validar({ ...bueno, ramos: [] })) &&
  /entre 1 y 20/.test(validar({ ...bueno, ramos: Array.from({ length: 21 }, (_, i) => ({ nombre: 'Ramo ' + i })) })));
chk('un ramo sin nombre no pasa', /necesita un nombre/.test(validar({ ...bueno, ramos: [{ sigla: 'MAT1610' }] })));
chk('una sección fuera de rango no pasa',
  /entre 1 y 999/.test(validar({ ...bueno, ramos: [{ nombre: 'Cálculo I', seccion: 0 }] })) &&
  /entre 1 y 999/.test(validar({ ...bueno, ramos: [{ nombre: 'Cálculo I', seccion: 2.5 }] })));
chk('el mismo ramo dos veces no pasa',
  /viene dos veces/.test(validar({ ...bueno, ramos: [{ nombre: 'Cálculo I' }, { nombre: 'cálculo i' }] })));

console.log('\n=== El SQL: pendiente, sin lectura y atado al token ===');
chk('agrega el tipo ramos sin botar los otros tres',
  /check \(tipo in \('pauta','notas','fechas','ramos'\)\)/.test(sql));
chk('el user_id sale del token vigente, nunca de la petición',
  /from public\.agent_links\s+where token = p_token and expires_at > now\(\)/.test(sql) && !/p_user_id/.test(sql));
chk('rechaza listas vacías, largas y sin fuente',
  /jsonb_array_length\(p_ramos\) = 0/.test(sql) && /> 20/.test(sql) && /de dónde salió la lista/.test(sql));
chk('valida nombre, sigla y sección también en el servidor',
  /cada ramo necesita un nombre/.test(sql) && /la sigla no puede tener más de 40/.test(sql) && /entero entre 1 y 999/.test(sql));
chk('deja una sola pendiente por cuenta',
  /set status='descartada'[\s\S]{0,120}where user_id=v_user and status='pendiente' and tipo='ramos'/.test(sql));
// Sin los comentarios: el archivo NOMBRA `user_ramos` para explicar por qué no
// lo toca, y esa explicación no puede hacer pasar la comprobación.
const sqlSinComentarios = sql.replace(/--[^\n]*/g, '');
chk('nace pendiente y no toca user_ramos',
  /insert into public\.agent_pauta_proposals/.test(sqlSinComentarios) && !/user_ramos/.test(sqlSinComentarios));
chk('la función no queda pública', /revoke all on function public\.proponer_ramos_agente/.test(sql));

// ─── La app: aceptar agrega de verdad, y no duplica ──────────────────────────
function elemento() {
  const atributos = {};
  return {
    style: { setProperty() {}, removeProperty() {} }, textContent: '', innerHTML: '', value: '', className: '', hidden: true, checked: true, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false } },
    addEventListener() {}, focus() {}, select() {}, setAttribute(k, v) { atributos[k] = String(v); }, removeAttribute(k) { delete atributos[k]; }, getAttribute(k) { return atributos[k] || null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {}, remove() {}, clientWidth: 400,
  };
}
function arnes(checks) {
  const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-agenda.js'].map(leer).join('\n');
  const ids = {}; const get = id => ids[id] || (ids[id] = elemento());
  const stub = elemento();
  const rpcs = [];
  const ctx = {
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
    document: {
      getElementById: get, createElement: elemento, addEventListener() {},
      documentElement: { ...elemento(), style: { setProperty() {}, removeProperty() {} } },
      querySelector: () => stub,
      // Las casillas del modal: cada una apunta a un ramo de la propuesta.
      querySelectorAll: sel => (sel === '.agent-ramo-check' ? checks : []),
      body: stub,
    },
    localStorage: { getItem() { return null }, setItem() {}, removeItem() {} }, navigator: {}, location: { origin: '', pathname: '', hash: '' },
    setTimeout: fn => fn(), clearTimeout() {}, requestAnimationFrame: fn => fn(), cancelAnimationFrame() {}, console,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  vm.runInContext(`
    renderHome=()=>{};closeModal=()=>{};openModal=()=>{};track=()=>{};showToast=()=>{};save=()=>{};
    supabaseClient={rpc:async(nombre,args)=>{globalThis.__rpcs.push({nombre,args});return {data:null,error:null};}};
    currentUser={id:'prueba'};
  `, ctx);
  ctx.__rpcs = rpcs;
  return { ctx, val: c => vm.runInContext(c, ctx), rpcs };
}
const casilla = i => ({ ...elemento(), checked: true, dataset: { i: String(i) } });

(async () => {
console.log('\n=== Aceptar agrega los ramos con su pauta y su sección ===');
{
  const k = arnes([casilla(0), casilla(1)]);
  k.val(`S=normalize({ramos:[],tenant:'uc',carrera:'ING-PC',userName:'P',careerSemestre:1,historial:[]});
    propuestasRamosAgente=[{id:'p1',fuente:'Horario',createdAt:null,ramos:[
      {nombre:'Cálculo I',sigla:'MAT1610',seccion:3},{nombre:'Dinámica',sigla:'FIS1514',seccion:null}]}];`);
  await k.val('aplicarRamosPropuestos()');
  const ramos = k.val('S.ramos');
  chk('agrega los dos ramos marcados', ramos.length === 2);
  chk('el que tiene pauta oficial llega con sus evaluaciones',
    ramos.some(r => r.nombre === 'Cálculo I' && (r.categorias || []).length > 0));
  chk('y ninguno llega con notas puestas',
    ramos.every(r => (r.categorias || []).every(c => (c.notas || []).every(n => n.valor == null))));
  chk('la sección del horario queda guardada', ramos.find(r => r.nombre === 'Cálculo I').seccion === 3);
  // Sin sección no se inventa una: queda vacía hasta que alguien la escriba.
  // `normalize()` la deja en null al cargar; recién creado basta con que no
  // tenga un número puesto.
  chk('el que no traía sección queda sin ella', ramos.find(r => r.nombre === 'Dinámica').seccion == null);
  chk('los créditos del catálogo llegan solos', ramos.every(r => typeof r.creditos === 'number'));
  // Primero se guardan los ramos, después se marca resuelta: si la red falla,
  // la persona se queda con sus ramos y la propuesta sigue pendiente.
  chk('recién ahí se marca la propuesta como aplicada',
    k.rpcs.length === 1 && k.rpcs[0].nombre === 'resolver_propuesta_pauta_agente' && k.rpcs[0].args.p_accion === 'aplicada');
  chk('y deja de estar pendiente en el cliente', k.val('propuestasRamosAgente.length') === 0);
}

console.log('\n=== Lo que ya está no se agrega dos veces ===');
{
  const k = arnes([casilla(0)]);
  k.val(`S=normalize({ramos:[],tenant:'uc',carrera:'ING-PC',userName:'P',careerSemestre:1,historial:[]});
    addFromCatalog('Cálculo I','MAT1610');
    propuestasRamosAgente=[{id:'p1',fuente:'Horario',createdAt:null,ramos:[
      {nombre:'Cálculo I',sigla:'MAT1610',seccion:3},{nombre:'Dinámica',sigla:'FIS1514',seccion:null}]}];`);
  chk('un ramo que ya está se reconoce por nombre o sigla',
    k.val(`ramoPropuestoYaEsta({nombre:'calculo i',sigla:null})`) === true &&
    k.val(`ramoPropuestoYaEsta({nombre:'Otro',sigla:'MAT1610'})`) === true &&
    k.val(`ramoPropuestoYaEsta({nombre:'Dinámica',sigla:'FIS1514'})`) === false);
  // La casilla 0 del modal apunta a los ramos QUE FALTAN, no a la lista
  // completa: con Cálculo I ya agregado, la primera casilla es Dinámica.
  await k.val('aplicarRamosPropuestos()');
  const ramos = k.val('S.ramos');
  chk('no duplica el que ya tenía', ramos.filter(r => r.nombre === 'Cálculo I').length === 1);
  chk('y agrega el que faltaba', ramos.some(r => r.nombre === 'Dinámica') && ramos.length === 2);
}

console.log('\n=== Texto ajeno: llega de un agente, se limpia al entrar ===');
{
  const k = arnes([]);
  const sucio = k.val(`propuestaRamosLimpia({id:'p9',fuente:'Horario\\u202e',created_at:null,evaluaciones:[
    {nombre:'  Cálculo\\u200b I  ',sigla:'mat1610',seccion:3},{nombre:'',sigla:'X'},{nombre:'Sin sección',seccion:0}]})`);
  chk('saca los caracteres invisibles del nombre y la fuente',
    sucio.ramos[0].nombre === 'Cálculo I' && !/‮/.test(sucio.fuente));
  chk('la sigla queda en mayúsculas', sucio.ramos[0].sigla === 'MAT1610');
  chk('un ramo sin nombre se descarta', sucio.ramos.length === 2);
  chk('una sección inválida queda vacía, no en cero', sucio.ramos[1].seccion === null);
  chk('una propuesta sin ramos válidos no entra',
    k.val(`propuestaRamosLimpia({id:'p9',fuente:'Horario',evaluaciones:[{nombre:''}]})`) === null);
}

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
})();
