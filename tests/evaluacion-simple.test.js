// Una evaluación creada a mano es UNA evaluación con UNA nota.
//
// Antes se guardaba sin `directNota`, así que se dibujaba como una lista en la
// que había que entrar para agregar notas adentro. Una "Prueba 1" no tiene notas
// adentro: tiene una nota. Las pautas oficiales siempre lo hicieron bien, así
// que además convivían dos formas distintas de lo mismo en la misma pantalla.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'app-session.js', 'render-main.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Lo que se crea a mano queda como fila simple ===');
// Las dos vías que crean evaluaciones se ejercitan de verdad más abajo. Acá
// había dos regex sobre el código fuente que comprobaban lo mismo, y se rompían
// cada vez que alguien agregaba un campo al objeto sin cambiar el
// comportamiento: la última vez fue por `hora`. Un test que falla cuando el
// código está bien enseña a ignorarlo.
// La fila simple es la misma rama de render que usan las pautas oficiales, así
// que una evaluación a mano y una del catálogo se ven y se llenan igual.
chk('la fila simple es la rama de directNota sin slots',
  /if\(cat\.directNota\)\{/.test(src) && /if\(cat\.slots&&cat\.slots>1\)\{/.test(src));

console.log('\n=== Lo ya guardado se convierte, pero solo donde no se pierde nada ===');
const normalize = val('normalize');
const ramo = cats => normalize({ ramos: [{ id: 'r', nombre: 'X', categorias: cats }] }).ramos[0];

const vacia = ramo([{ id: 'c', nombre: 'Prueba 1', peso: 30, notas: [] }]).categorias[0];
chk('una evaluación vieja sin notas pasa a fila simple', vacia.directNota === true);

const unaNota = ramo([{ id: 'c', nombre: 'Prueba 1', peso: 30, notas: [{ id: 'n', valor: 5.5 }] }]).categorias[0];
chk('con una sola nota también', unaNota.directNota === true);
chk('y esa nota no se pierde', unaNota.notas.length === 1 && unaNota.notas[0].valor === 5.5);

// Este es el borde que importa: convertir una categoría con varias notas
// mostraría solo la primera y escondería el resto sin avisar.
const dosNotas = ramo([{ id: 'c', nombre: 'Controles', peso: 30, notas: [{ id: 'a', valor: 5 }, { id: 'b', valor: 6 }] }]).categorias[0];
chk('con dos o más notas NO se convierte: se perderían de vista', dosNotas.directNota === false);
chk('sus dos notas siguen ahí', dosNotas.notas.length === 2);

// Los grupos de una pauta oficial (Laboratorio con 3 espacios) ya son
// colapsables a propósito: no se tocan.
const conSlots = ramo([{ id: 'c', nombre: 'Laboratorio', peso: 20, slots: 3, notas: [] }]).categorias[0];
chk('un grupo con slots conserva su forma', conSlots.directNota === false && conSlots.slots === 3);

// Y lo que ya venía marcado se respeta tal cual, en los dos sentidos.
chk('respeta un directNota:true existente',
  ramo([{ id: 'c', nombre: 'P', peso: 10, directNota: true, notas: [] }]).categorias[0].directNota === true);
chk('respeta un directNota:false existente',
  ramo([{ id: 'c', nombre: 'P', peso: 10, directNota: false, notas: [] }]).categorias[0].directNota === false);

console.log('\n=== "Configurar pauta" era jerga ===');
chk('el botón de la ficha dice Agregar evaluaciones',
  /Agregar evaluaciones<\/button>/.test(fs.readFileSync(raiz + 'index.html', 'utf8')));
chk('el modal ya no se llama Configurar pauta', !/Configurar pauta/.test(src));

console.log('\n=== Un ramo del catálogo sin pauta tiene un camino claro ===');
const renderMain = fs.readFileSync(raiz + 'render-main.js', 'utf8');
let pautaCatalogoSinOficial = null;
try { pautaCatalogoSinOficial = val('pautaCatalogoSinOficial'); } catch (_) {}
chk('distingue un ramo del catálogo que todavía no tiene pauta oficial',
  pautaCatalogoSinOficial && pautaCatalogoSinOficial({ nombre: 'Ramo sin programa', origen: { tenant: 'uc', carrera: 'ING-PC' }, categorias: [] }) &&
  !pautaCatalogoSinOficial({ nombre: 'Ramo manual', origen: null, categorias: [] }));
chk('la acción vacía le dice que puede armar su pauta',
  /pautaCatalogoSinOficial\(r\)[\s\S]{0,500}Armar mi pauta/.test(renderMain));
chk('una pauta completa recién creada ofrece revisarla antes de compartirla',
  /estabaVacia[\s\S]{0,900}ofrecerCompartirPauta\(r\)/.test(src) &&
  /Revisar antes de enviar/.test(src) && /Nunca tus notas/.test(src));

console.log('\n=== Reportar la pauta se encuentra ===');
const html = fs.readFileSync(raiz + 'index.html', 'utf8');
// Vivía al fondo del modal de "Editar ramo", debajo de Guardar y Cancelar.
// Nadie entra a editar el nombre de un ramo para avisar que su pauta está mal.
chk('el botón está en la ficha del ramo, no en Editar ramo', /id="ramo-report"/.test(html));
const editar = src.slice(src.indexOf('<div class="modal-title">Editar ramo</div>'), src.indexOf('function confirmEditRamo'));
chk('ya no cuelga del modal de editar', !/openReportModal/.test(editar));
// Sigue habiendo un único acceso permanente en la ficha. El tercero aparece
// solo después de crear una pauta completa y abre una revisión: no envía nada
// por sí solo ni duplica una acción constante en otra pantalla.
chk('solo ofrece compartir desde el hito de crear una pauta completa',
  (src.match(/openReportModal\(/g) || []).length === 3 &&
  /function ofrecerCompartirPauta\(r\)[\s\S]{0,500}showConfirm[\s\S]{0,500}openReportModal\(r\.id\)/.test(src));
// El texto viejo ("¿Le cambiaron las ponderaciones?") daba por hecho que la
// pauta existe y cambió. Hoy el caso mayoritario es que no la tenemos.
chk('el texto sirve para una pauta mala y para una que falta',
  /no calza con tu curso/.test(html) && !/Le cambiaron las ponderaciones/.test(src + html));
// El reporte ES la estructura del ramo: sin evaluaciones no hay qué enviar, y
// `openReportModal` ya rechaza ese caso con un toast. Mejor no ofrecerlo.
chk('solo aparece cuando el ramo tiene evaluaciones',
  /if\(r\.categorias\.length\)\{\s*rep\.style\.display='flex'/.test(src));

console.log('\n=== La casilla "son varias notas" decide la forma ===');
// Se ejercita confirmAddCat de verdad y no por regex: lo que importa no es cómo
// está escrita la línea, sino qué queda guardado — de eso depende si el
// estudiante ve una casilla suelta o la tarjeta con "+ Agregar nota".
const campos = { 'm-cat-name': { value: 'Controles' }, 'm-cat-fecha': { value: '' }, 'm-cat-varias': { checked: false } };
ctx.document.getElementById = id => campos[id] || stub;
vm.runInContext('renderRamo=function(){};closeModal=function(){};save=function(){};', ctx);
vm.runInContext('S={ramos:[{id:"r1",nombre:"Ramo",categorias:[],gates:[],notas:[]}]};currentRamoId="r1";', ctx);

const ultimaCat = () => { const c = val('S.ramos[0].categorias'); return c[c.length - 1]; };

val('confirmAddCat')();
chk('sin marcar queda como fila simple', ultimaCat().directNota === true);

campos['m-cat-varias'].checked = true;
val('confirmAddCat')();
const varias = ultimaCat();
chk('marcada queda como lista abierta', varias.directNota === false);
// Sin esto la rama de render sería la de casillas fijas, que necesita un número
// que acá nadie dio.
chk('y sin slots: el estudiante agrega las que quiera', !varias.slots);

console.log('\n=== El editor de pauta y la conversión posterior ===');
vm.runInContext('S={ramos:[{id:"r2",nombre:"Ramo",categorias:[],gates:[],notas:[]}]};currentRamoId="r2";', ctx);
vm.runInContext('showToast=function(){};', ctx);
vm.runInContext('pautaDraft=[{id:null,nombre:"Solemne",peso:40,tieneNotas:false,varias:false},{id:null,nombre:"Controles",peso:60,tieneNotas:false,varias:true}];', ctx);
val('guardarPautaManual')();
const porNombre = n => val('S.ramos[0].categorias').find(c => c.nombre === n);
chk('la fila sin marcar queda simple', porNombre('Solemne').directNota === true);
chk('la fila marcada queda como lista abierta', porNombre('Controles').directNota === false);
const controlesConNotas = porNombre('Controles');

// Las plantillas UC no repiten una categoría tres veces: declaran tres casillas
// dentro del mismo grupo, para no inventar cómo se reparte su porcentaje.
vm.runInContext('S={ramos:[{id:"r3",nombre:"Cálculo sintético",categorias:[],gates:[],notas:[]}]};currentRamoId="r3";', ctx);
vm.runInContext('pautaDraft=[{id:null,nombre:"Laboratorio",peso:0,tieneNotas:false,varias:true,cantidad:3}];', ctx);
val('guardarPautaManual')();
const laboratorioPlantilla = val('S.ramos[0].categorias[0]');
chk('la plantilla conserva las tres casillas del laboratorio', laboratorioPlantilla.directNota === false && laboratorioPlantilla.slots === 3);

// Convertir una que ya tiene varias notas a fila simple mostraría una y
// escondería el resto sin decirlo. La casilla viene desactivada en ese caso, y
// confirmEditCat no toca el modo cuando lo está.
console.log('\n=== Una evaluación con varias notas no se degrada sola ===');
ctx.__controlesConNotas = controlesConNotas;
vm.runInContext('S={ramos:[{id:"r2",nombre:"Ramo",categorias:[__controlesConNotas],gates:[],notas:[]}]};currentRamoId="r2";', ctx);
const conNotas = controlesConNotas;
conNotas.notas = [{ id: 'n1', valor: 5, peso: 1 }, { id: 'n2', valor: 6, peso: 1 }];
campos['m-cat-name'] = { value: 'Controles' };
campos['m-cat-varias'] = { checked: false, disabled: true };
val('confirmEditCat')(conNotas.id);
chk('con la casilla desactivada, el modo no cambia', conNotas.directNota === false);
chk('y las notas siguen ahí', conNotas.notas.length === 2);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
