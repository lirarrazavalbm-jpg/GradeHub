// Todo campo que la app le pide llenar a alguien tiene que recibir el estilo
// base, y en particular su ancho.
//
// La regla de `styles.css` listaba text, number, password y email — pero no
// date. El resultado: el campo de fecha se quedaba con el ancho por defecto del
// navegador, ~130px, y en el celular el calendario nativo se abría anclado a esa
// caja diminuta. Poner la fecha de una prueba era pelear con un control enano, y
// sin fechas la Agenda queda vacía y el feed de calendario no tiene qué mostrar.
//
// No falla nada: el campo existe, guarda y valida. Solo es inusable con el
// pulgar. Por eso el test no mira la fecha en particular sino la regla: cualquier
// `type` que aparezca en el HTML de la app tiene que estar en la lista de
// estilos, así que el próximo `time` o `month` que alguien agregue cae acá.
const fs = require('fs');
const raiz = __dirname + '/../';
const css = fs.readFileSync(raiz + 'styles.css', 'utf8');
const html = fs.readFileSync(raiz + 'index.html', 'utf8') + fs.readFileSync(raiz + 'app.js', 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

// Los tipos que la app realmente usa en algún formulario.
const usados = [...new Set([...html.matchAll(/type=\\?"([a-z-]+)\\?"/g)].map(m => m[1]))]
  .filter(t => !['button', 'submit', 'checkbox', 'radio', 'range', 'hidden', 'file', 'image', 'reset'].includes(t));

// La regla que da ancho, borde y tamaño de letra a los campos de texto.
const regla = (css.match(/input\[type=text\][^{]*\{[^}]*width:100%[^}]*\}/) || [])[0] || '';

console.log('\n=== Todo campo de escritura recibe el estilo base ===');
chk('existe la regla base de inputs', regla.length > 0);
usados.forEach(t => {
  chk(`type="${t}" está en la regla de estilo`, regla.includes('input[type=' + t + ']'));
});

console.log('\n=== Y se puede tocar con el pulgar ===');
// 44px es el mínimo que recomiendan iOS y Android para un objetivo táctil.
// El selector puede venir agrupado (`input[type=date],input[type=time]{...}`),
// así que la búsqueda no exige que la llave venga pegada al tipo: si no, la
// prueba falla por un cambio de forma y no de comportamiento.
const altoDe = t => {
  const m = css.match(new RegExp('input\\[type=' + t + '\\][^{]*\\{[^}]*min-height:(\\d+)px'));
  return m ? Number(m[1]) : 0;
};
chk('el campo de fecha declara alto táctil (≥44px)', altoDe('date') >= 44);
// La hora se toca con el mismo pulgar que la fecha.
chk('el campo de hora declara alto táctil (≥44px)', altoDe('time') >= 44);
chk('el ícono del calendario se agranda respecto del nativo',
  /calendar-picker-indicator\{[^}]*width:\s*(1[6-9]|[2-9]\d)px/.test(css));
// Menos de 16px hace que iOS haga zoom al enfocar y descuadre la pantalla.
//
// Desde que la escala es fluida, el campo ya no dice "16px": dice `1rem`, y los
// 16 salen del mínimo del clamp de la raíz. Son dos mitades de la misma
// garantía y por eso se comprueban juntas — si alguien baja el mínimo del clamp
// a 15px para "apretar" la interfaz, el campo cae bajo 16 y iOS vuelve a hacer
// zoom, sin que nada más lo delate.
const remCampo = Number((regla.match(/font-size:([0-9.]+)rem/) || [])[1]);
const minRaiz = Number((css.match(/html\{font-size:clamp\(\s*([0-9.]+)px/) || [])[1]);
chk('el campo mide al menos 1rem', remCampo >= 1);
chk('y la raíz nunca baja de 16px, así que iOS no hace zoom', minRaiz >= 16);

console.log('\n=== Los campos especializados pueden reservar su espacio ===');
// La regla base incluye un atributo (`input[type=text]`): una clase sola tiene
// menos especificidad y pierde aunque aparezca después. Eso montaba el % sobre
// el valor en el reporte de ponderaciones porque volvía de 25px a 13px.
const especificidad = selector => {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const clases = (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const limpio = selector
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g, ' ')
    .replace(/[>*+~(),]/g, ' ');
  const tipos = (limpio.match(/\b[a-z][\w-]*\b/gi) || []).length;
  return [ids, clases, tipos];
};
const comparaEspecificidad = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};
const selectorPeso = (css.match(/([^{}]*rep-peso-input[^{}]*)\{[^}]*padding:\s*9px\s+25px/) || [])[1] || '';
chk('el peso del reporte no pierde contra input[type=text]',
  comparaEspecificidad(especificidad(selectorPeso), especificidad('input[type=text]')) >= 0);
chk('reserva 25px para el sufijo %', /padding:\s*9px\s+25px\s+9px\s+9px/.test(css));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
