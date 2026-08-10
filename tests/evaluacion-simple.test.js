// Una evaluación creada a mano es UNA evaluación con UNA nota.
//
// Antes se guardaba sin `directNota`, así que se dibujaba como una lista en la
// que había que entrar para agregar notas adentro. Una "Prueba 1" no tiene notas
// adentro: tiene una nota. Las pautas oficiales siempre lo hicieron bien, así
// que además convivían dos formas distintas de lo mismo en la misma pantalla.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
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
// Las dos vías que crean evaluaciones: el modal de una sola y el editor de varias.
chk('confirmAddCat marca directNota',
  /r\.categorias\.push\(\{id:uid\(\),nombre:name,peso,fecha,ponderaNotas:false,directNota:true/.test(src));
chk('guardarPautaManual marca directNota',
  /r\.categorias\.push\(\{id:uid\(\),nombre:f\.nombre\.trim\(\),peso:f\.peso,ponderaNotas:false,directNota:true/.test(src));
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

console.log('\n=== Reportar la pauta se encuentra ===');
const html = fs.readFileSync(raiz + 'index.html', 'utf8');
// Vivía al fondo del modal de "Editar ramo", debajo de Guardar y Cancelar.
// Nadie entra a editar el nombre de un ramo para avisar que su pauta está mal.
chk('el botón está en la ficha del ramo, no en Editar ramo', /id="ramo-report"/.test(html));
const editar = src.slice(src.indexOf('<div class="modal-title">Editar ramo</div>'), src.indexOf('function confirmEditRamo'));
chk('ya no cuelga del modal de editar', !/openReportModal/.test(editar));
// Y queda una sola vía de entrada: dos botones para lo mismo en pantallas
// distintas es cómo se llegó a que nadie encontrara ninguno.
chk('hay un solo punto de entrada al reporte',
  (src.match(/openReportModal\(/g) || []).length === 2);
// El texto viejo ("¿Le cambiaron las ponderaciones?") daba por hecho que la
// pauta existe y cambió. Hoy el caso mayoritario es que no la tenemos.
chk('el texto sirve para una pauta mala y para una que falta',
  /no calza con tu curso/.test(html) && !/Le cambiaron las ponderaciones/.test(src + html));
// El reporte ES la estructura del ramo: sin evaluaciones no hay qué enviar, y
// `openReportModal` ya rechaza ese caso con un toast. Mejor no ofrecerlo.
chk('solo aparece cuando el ramo tiene evaluaciones',
  /if\(r\.categorias\.length\)\{\s*rep\.style\.display='flex'/.test(src));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
