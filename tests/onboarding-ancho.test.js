const fs=require('fs');
const css=fs.readFileSync(process.env.GRADEHUB_CSS||__dirname+'/../styles.css','utf8');
let ok=0,fail=0;
const chk=(nombre,condicion)=>{if(condicion){ok++;console.log('  OK   '+nombre);}else{fail++;console.log('  FAIL '+nombre);}};
const regla=selector=>(css.match(new RegExp('\\'+selector.replace('.', '.')+'\\{[^}]*\\}'))||[])[0]||'';
const ancho=selector=>Number((regla(selector).match(/max-width:(\d+)px/)||[])[1]);

console.log('\n=== Onboarding que usa una pantalla grande sin soltar el móvil ===');
const medidas=['.ob-progress','.ob-step','.ob-nav','.course-picker','.courses-loaded'];
medidas.forEach(selector=>{
  const r=regla(selector);
  chk(`${selector} conserva ancho fluido`,/width:100%/.test(r));
  chk(`${selector} comparte la medida legible de 640px`,ancho(selector)===640);
});

// A 375px, los 20px de padding de cada lado dejan 335px. Como las cajas son
// width:100% y su tope es mayor, se encogen a esos 335px: no aparece scroll
// horizontal ni se hace más angosto que el diseño móvil anterior.
const wrap=regla('.ob-wrap');
const padding=(wrap.match(/padding:[^;]*\s(\d+)px\s/)||[])[1];
const disponible=375-2*Number(padding);
chk('375px conserva 335px útiles dentro del onboarding',disponible===335);
chk('el tope de escritorio no puede desbordar el móvil',medidas.every(selector=>ancho(selector)>=disponible));
chk('las cajas críticas ya no quedan fijadas en 340px',medidas.every(selector=>ancho(selector)!==340));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
