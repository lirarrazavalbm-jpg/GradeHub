// La barra de avance de cada ramo va anclada al fondo de su tarjeta
// (`.ramo-progress-track` es absolute con `bottom`). Desde que los ramos se
// muestran en grilla, las celdas de una fila se estiran a la altura de la más
// alta: bastaba con que un ramo tuviera el nombre en dos líneas para que las
// barras de sus vecinas bajaran con la caja y quedaran flotando lejos del texto.
// Medido a 1512px: el hueco entre el subtítulo y la barra pasaba de 14px a 39.
//
// No es un error de cálculo ni rompe nada, y por eso nadie lo atribuye a una
// regla: se ve como "algunas barras están raras".
const fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== La barra sigue anclada al fondo de su tarjeta ===');
// Si algún día deja de ser absolute, este test deja de tener sentido y hay que
// borrarlo — por eso se comprueba la premisa y no solo la consecuencia.
const track=(css.match(/\.ramo-progress-track\{[^}]*\}/)||[''])[0];
chk('.ramo-progress-track existe y se posiciona sola', /position:\s*absolute/.test(track));
chk('y se ancla al borde inferior', /bottom:/.test(track));

console.log('\n=== Entonces la grilla de ramos no puede estirar las tarjetas ===');
const bloques=[...css.matchAll(/@media\s*\(min-width:\s*(\d+)px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
const enGrilla=bloques.filter(m=>/#home-ramos\s*\{[^}]*grid-template-columns/.test(m[2]));
chk('los ramos se muestran en grilla en pantalla ancha', enGrilla.length>0);
const declaraStart=bloques.some(m=>/#home-ramos\s*\{[^}]*align-items:\s*(?:start|flex-start)/.test(m[2]))
  || /#home-ramos\s*\{[^}]*align-items:\s*(?:start|flex-start)/.test(css);
chk('la grilla no estira las tarjetas a la altura de la más alta', declaraStart);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
