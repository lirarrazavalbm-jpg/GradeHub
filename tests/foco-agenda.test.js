// Qué pone la Agenda arriba como "Tu foco ahora".
//
// Esto no lanza excepciones: ordena mal y el estudiante estudia lo que no era.
// El error real que lo motivó: la urgencia iba por tramos y el último era "más
// de 30 días", así que algo a cinco semanas y algo a cuatro meses valían lo
// mismo. Entre dos evaluaciones lejanas solo competía el peso, y un examen de
// 30% en diciembre aparecía como el foco por sobre una interrogación de 15% en
// septiembre.
//
// Se prueba el ORDEN, no el número: el puntaje es un detalle de implementación
// y fijarlo obligaría a reescribir el test cada vez que se ajusta la curva.
const fs = require('fs'), vm = require('vm');
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n');
const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
  requestAnimationFrame: f => setTimeout(() => f(0), 0), cancelAnimationFrame: clearTimeout, performance: { now: () => 0 },
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const withPriority = vm.runInContext('withPriority', ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// La fecha se arma con los componentes LOCALES, no con toISOString(). Esa
// devuelve UTC: en Chile, pasadas las 20:00, `iso(-1)` daba hoy en vez de ayer
// y los chequeos de "vencida" empezaban a fallar solos. Un test que depende de
// la hora a la que se corre no prueba nada y hace perder la tarde.
const iso = d => {
  const x = new Date(); x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
// notas: [] deja el ramo sin promedio → riesgo 0. Para un ramo en riesgo se
// pasa una nota baja, que es como llega de verdad desde la app.
const evento = (nombre, dias, peso, notaDelRamo) => {
  const cat = { id: 'c-' + nombre, nombre, peso, notas: [] };
  const otras = notaDelRamo == null ? [] :
    [{ id: 'previa-' + nombre, nombre: 'Previa', peso: 100 - peso, notas: [{ id: 'n', nombre: 'n', valor: notaDelRamo, peso: 1 }] }];
  return { fecha: iso(dias), pending: true, cat, ramo: { id: 'r-' + nombre, nombre: 'Ramo', categorias: [cat, ...otras], gates: [] } };
};
const gana = (a, b) => withPriority(a).score > withPriority(b).score;

console.log('\n=== La cercanía manda; el peso y el riesgo modulan ===');
// El caso exacto que se reportó.
chk('una interrogación de 15% en un mes le gana a un examen de 30% en cuatro',
  gana(evento('I1', 43, 15), evento('Examen', 120, 30)));
chk('y también a otra de 20% a diez semanas',
  gana(evento('I1', 43, 15), evento('I2', 71, 20)));
// La clase de error, no solo ese caso: por lejos que esté, el peso no compra
// el primer lugar. Con la fórmula aditiva anterior, todos estos fallaban.
chk('10% en dos días le gana a 30% en dos semanas',
  gana(evento('cerca', 2, 10), evento('lejos', 14, 30)));
chk('5% hoy le gana a 40% en dos meses',
  gana(evento('hoy', 0, 5), evento('lejos', 60, 40)));
chk('dos lejanas ya no empatan: a igual peso, gana la más cercana',
  gana(evento('a', 45, 20), evento('b', 120, 20)));

console.log('\n=== Lo que se conserva del modelo anterior ===');
chk('lo vencido va primero, incluso contra el peor caso posible',
  gana(evento('vencida', -1, 5), evento('hoy', 0, 100, 2.0)));
chk('algo vencido hace un mes también', gana(evento('vieja', -30, 1), evento('hoy', 0, 100, 2.0)));
chk('a igual fecha, más peso sube', gana(evento('pesada', 7, 30), evento('liviana', 7, 10)));
chk('a igual fecha y peso, el ramo en riesgo sube',
  gana(evento('riesgo', 7, 20, 2.0), evento('sana', 7, 20, 6.5)));

console.log('\n=== El riesgo avisa, pero no convierte diciembre en "ahora" ===');
chk('un ramo reprobado no trae al frente su evaluación a cuatro meses',
  gana(evento('cerca', 25, 10), evento('lejos', 120, 40, 2.0)));

console.log('\n=== El nivel visual sigue midiendo lo mismo ===');
// Los cortes viejos estaban escritos contra los escalones de urgencia (85, 35).
// Al pasar a curva continua, "urgencia>=85" habría cambiado de significar dos
// días a significar cinco sin que nadie lo decidiera.
chk('vencida', withPriority(evento('x', -1, 10)).nivel === 'vencida');
chk('crítica: dos días o menos y 20% o más', withPriority(evento('x', 2, 20)).nivel === 'critica');
chk('alta: dos días o menos con poco peso', withPriority(evento('x', 1, 5)).nivel === 'alta');
chk('alta: ramo reprobado', withPriority(evento('x', 10, 5, 2.0)).nivel === 'alta');
chk('media: dentro de dos semanas', withPriority(evento('x', 14, 5)).nivel === 'media');
chk('baja: lejos y liviana', withPriority(evento('x', 90, 10)).nivel === 'baja');

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
