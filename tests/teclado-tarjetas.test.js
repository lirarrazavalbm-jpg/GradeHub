// Una tarjeta clickeable que no se puede alcanzar con Tab es funcionalidad que
// existe solo para el mouse. Y una que se alcanza pero no responde a Enter es
// peor: se ve enfocada y no pasa nada, o sea promete algo que no ocurre.
//
// En este repo el patrón estaba escrito de tres formas distintas —con onkeydown,
// con tabindex pero sin él, y sin nada— así que cada elemento nuevo repetía el
// olvido. Por eso la activación vive en un handler delegado y este test cuida
// las dos mitades: que se pueda llegar y que se pueda activar.
const fs=require('fs');
const raiz=__dirname+'/../';
const render=fs.readFileSync(raiz+'render-main.js','utf8');
const app=fs.readFileSync(process.env.GRADEHUB_APP||raiz+'app.js','utf8');
const css=fs.readFileSync(raiz+'styles.css','utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== Todo lo clickeable se alcanza con Tab ===');
// Un <div onclick> sin role+tabindex no entra en el orden de tabulación.
const divsClickeables=render.match(/<div[^>]*onclick=/g)||[];
const sinTeclado=divsClickeables.filter(d=>!/role="button"/.test(d)||!/tabindex="0"/.test(d));
chk(`ningún div clickeable queda fuera del teclado (${divsClickeables.length} revisados)`, sinTeclado.length===0);
if(sinTeclado.length)sinTeclado.forEach(d=>console.log('       → '+d.slice(0,80)));

console.log('\n=== Y se puede activar con el teclado ===');
chk('existe el handler delegado para [role="button"]', /addEventListener\('keydown'[\s\S]{0,400}role="button"/.test(app));
chk('acepta Enter y Espacio, como un botón de verdad',
  /e\.key!=='Enter'&&e\.key!==' '/.test(app));
chk('un campo dentro de la tarjeta se queda con su tecla',
  /INPUT\|TEXTAREA\|SELECT/.test(app));
// Dos caminos para la misma tecla activarían la acción dos veces.
chk('ningún elemento repite el onkeydown que el handler ya cubre',
  !/onkeydown="if\(event\.key==='Enter'\)/.test(render));

console.log('\n=== Ningún foco se apaga sin reemplazo ===');
// `outline:none` es legítimo si el elemento marca el foco de otra forma: borde,
// halo, o :focus-within en su contenedor. Búsqueda literal y no regex armada
// con el selector: los selectores de atributo traen corchetes y la rompen.
// Sin comentarios: uno de ellos menciona `outline:none` al explicarlo y se
// colaba como si fuera una regla.
const cssLimpio=css.replace(/\/\*[\s\S]*?\*\//g,'');
const apagados=cssLimpio.split('}').filter(r=>r.includes('outline:none'))
  .map(r=>(r.split('{')[0]||'').trim()).filter(Boolean);
const sinReemplazo=apagados.filter(sel=>{
  if(sel.includes(':focus'))return false;            // se apaga y se pinta en la misma regla
  return !sel.split(',').some(uno=>{
    const base=uno.trim();
    const ultimo=base.split(/[ >]/).pop();
    // `input.rep-peso-input` declara su foco como `.rep-peso-input`: vale la
    // última clase, no el selector entero.
    const hoja=ultimo.includes('.')?ultimo.slice(ultimo.lastIndexOf('.')):ultimo;
    // `input[type=text]` hereda el foco de la regla genérica `input:focus`.
    const etiqueta=ultimo.split(/[.\[:]/)[0];
    return css.includes(base+':focus')||css.includes(hoja+':focus')
        || css.includes(base+':focus-visible')||css.includes(hoja+':focus-visible')
        || css.includes(base+':focus-within')||css.includes(hoja+':focus-within')
        // El contenedor puede marcar el foco por el hijo.
        || (etiqueta&&css.includes(etiqueta+':focus'))
        || (base.includes(' ')&&css.includes(base.split(' ')[0]+':focus-within'));
  });
});
chk(`cada outline:none tiene su propia señal de foco (${apagados.length} revisados)`, sinReemplazo.length===0);
if(sinReemplazo.length)sinReemplazo.forEach(x=>console.log('       → '+x.slice(0,70)));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
