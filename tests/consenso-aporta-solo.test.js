// La pauta que alguien arma para un ramo que el catálogo trae VACÍO se aporta
// sola al consenso, sin preguntarle.
//
// Es la única pauta que el consenso puede usar: aplicarConsensoAuto solo escribe
// donde no hay nada que pisar, o sea exactamente en esos ramos. Y era a quien no
// se le pedía: el botón del pie preguntaba "¿esta pauta no calza con tu curso?"
// sobre una pauta que nunca le dimos.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const leer = f => fs.readFileSync(raiz + f, 'utf8');
let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const enviados = [];
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => ({ ...stub }), createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
  // save() sincroniza con Supabase, y eso vive en app-session.js, que acá no se
  // carga: interesa lo que se aporta al catálogo, no el guardado.
  syncToCloud() {},
};
vm.createContext(ctx);
vm.runInContext(['data.js', 'engine.js', 'app.js', 'render-main.js', 'render-agenda.js'].map(leer).join('\n'), ctx);
const val = c => vm.runInContext(c, ctx);

// Supabase de mentira: guarda lo que se le manda en vez de salir a la red.
ctx.enviados = enviados;
val(`currentUser={id:'u1'};
supabaseClient={rpc:(nombre,args)=>{enviados.push({nombre,args});return Promise.resolve({error:null});}};
S.tenant='uc';S.carrera='Ingeniería';`);

const ramo = (extra) => Object.assign({
  id: 'r1', nombre: 'Ramo Sintético', color: '#000', gates: [],
  origen: { tenant: 'uc', carrera: 'Ingeniería' },
  categorias: [
    { id: 'c1', nombre: 'Prueba 1', peso: 40, notas: [{ id: 'n1', nombre: 'Prueba 1', valor: 6.2, peso: 1 }] },
    { id: 'c2', nombre: 'Examen', peso: 60, notas: [] },
  ],
}, extra || {});

console.log('=== Se aporta sin preguntar ===');
val('S.ramos=' + JSON.stringify([ramo()]));
let n = null;
(async () => { n = await val('aportarPautasAlCatalogo')(); })();

setTimeout(() => {
  chk('una pauta completa de un ramo sin pauta oficial se aporta', enviados.length === 1);
  const a = enviados[0] && enviados[0].args;
  chk('va por submit_catalog_report', enviados[0] && enviados[0].nombre === 'submit_catalog_report');
  chk('sin ninguna nota adentro',
    !!a && a.p_nota === null && !JSON.stringify(a.p_estructura).includes('6.2') && !/"valor"|"notas"/.test(JSON.stringify(a.p_estructura)));
  chk('con los nombres y porcentajes de las evaluaciones',
    !!a && JSON.stringify(a.p_estructura).includes('Examen') && JSON.stringify(a.p_estructura).includes('60'));
  chk('queda marcado para no reenviar lo mismo', !!val('S.ramos[0].consensoAportado'));

  console.log('\n=== No se reenvía hasta que la pauta cambia ===');
  enviados.length = 0;
  (async () => { await val('aportarPautasAlCatalogo')(); })();
  setTimeout(() => {
    chk('abrir la app de nuevo no manda nada', enviados.length === 0);
    val("S.ramos[0].categorias[1].peso=50;S.ramos[0].categorias.push({id:'c3',nombre:'Tareas',peso:10,notas:[]})");
    (async () => { await val('aportarPautasAlCatalogo')(); })();
    setTimeout(() => {
      chk('editar la pauta sí vuelve a aportar', enviados.length === 1);

      console.log('\n=== Lo que NO se aporta ===');
      enviados.length = 0;
      // Un ramo escrito a mano no tiene con qué agruparse con nadie.
      val("S.ramos=[" + JSON.stringify(ramo({ origen: null })) + "]");
      (async () => { await val('aportarPautasAlCatalogo')(); })();
      setTimeout(() => {
        chk('un ramo fuera del catálogo no se aporta', enviados.length === 0);
        // Una pauta a medio armar: los pesos no suman 100.
        enviados.length = 0;
        val("S.ramos=[" + JSON.stringify(ramo({ categorias: [{ id: 'c1', nombre: 'Prueba 1', peso: 40, notas: [] }] })) + "]");
        (async () => { await val('aportarPautasAlCatalogo')(); })();
        setTimeout(() => {
          chk('una pauta incompleta tampoco', enviados.length === 0);
          // Sin sesión no hay nada que mandar.
          enviados.length = 0;
          val("S.ramos=[" + JSON.stringify(ramo()) + "];currentUser=null");
          (async () => { await val('aportarPautasAlCatalogo')(); })();
          setTimeout(() => {
            chk('sin sesión no se manda nada', enviados.length === 0);

            console.log('\n=== Y el botón deja de preguntar lo que no corresponde ===');
            const render = leer('render-main.js');
            chk('a esa persona se le afirma, no se le pregunta',
              /pautaCatalogoSinOficial\(r\)\?'Tu pauta completa el catálogo de este ramo'/.test(render));
            chk('el resto sigue viendo su texto de siempre',
              /'¿Esta pauta no calza con tu curso\? Repórtala'/.test(render) &&
              /'Corregiste esta pauta · compártela con tu curso'/.test(render));
            chk('la política dice que esto pasa y que las notas no viajan',
              /armas la pauta de un ramo que traemos sin ponderaciones/.test(leer('privacidad.html')) &&
              /tus notas no salen de tu cuenta/.test(leer('privacidad.html')));

            console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
            process.exit(fail ? 1 : 0);
          }, 5);
        }, 5);
      }, 5);
    }, 5);
  }, 5);
}, 5);
