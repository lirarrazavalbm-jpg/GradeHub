// En escritorio (≥1024px) la barra de navegación se convierte en un riel
// vertical a la izquierda, y `body` le reserva su ancho con padding-left.
//
// El problema: la nav NO existe antes de entrar. `showAuthScreen` y
// `showResetScreen` la esconden, y el onboarding y la pantalla de error de
// arranque tampoco la muestran. El espacio se reservaba igual, así que el login
// aparecía con una franja vacía de 224px a la izquierda y todo corrido hacia la
// derecha. Se veía en producción y nada fallaba.
//
// El arreglo es que el riel esté APAGADO por defecto y se encienda solo en las
// pantallas de la app. Ese sentido importa más que el resultado: al revés —una
// lista de pantallas donde apagarlo— cada pantalla nueva anterior al login nace
// corrida y hay que acordarse de agregarla. Ya pasó una vez: la pantalla de
// error de arranque llegó después que el riel y salió mal sin que nadie tocara
// el bloque de escritorio.
const fs = require('fs');
const css = fs.readFileSync(__dirname + '/../styles.css', 'utf8');

let ok = 0, fail = 0;
function chk(nombre, cond) { if (cond) { ok++; console.log('  ok   ' + nombre); } else { fail++; console.log('  FAIL ' + nombre); } }

// El bloque de escritorio, recortado con conteo de llaves para no depender de
// dónde termine en el archivo.
const inicio = css.indexOf('@media(min-width:1024px){');
chk('existe el bloque de escritorio', inicio >= 0);
let i = css.indexOf('{', inicio), prof = 0, fin = i;
for (; fin < css.length; fin++) {
  if (css[fin] === '{') prof++;
  else if (css[fin] === '}') { prof--; if (prof === 0) break; }
}
const bloque = css.slice(inicio, fin + 1);
const sinEspacios = bloque.replace(/\s+/g, '');

console.log('=== El riel nace apagado ===');
chk('--rail arranca en 0 en el bloque de escritorio', /--rail:0px/.test(sinEspacios));
chk('el ancho del riel vive en su propia variable, no repetido',
  /--rail-ancho:224px/.test(sinEspacios));
chk('body sigue reservando el espacio con padding-left:var(--rail)',
  /body\{[^}]*padding-left:var\(--rail\)/.test(sinEspacios));

console.log('\n=== Y se enciende solo dentro de la app ===');
const encendido = (sinEspacios.match(/((?:body:has\([^)]*\),?)+)\{--rail:var\(--rail-ancho\);?\}/) || [])[1] || '';
['#screen-home', '#screen-ramo', '#screen-stats', '#screen-agenda'].forEach(s =>
  chk('lo enciende en ' + s, encendido.includes(s + '.active')));

console.log('\n=== Nunca antes de entrar ===');
// Si alguna de estas aparece encendiendo el riel, vuelve la franja vacía.
['#screen-auth', '#screen-reset', '#screen-onboard', '#screen-app-error'].forEach(s =>
  chk('NO lo enciende en ' + s, !encendido.includes(s)));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
