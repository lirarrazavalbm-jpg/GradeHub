// En un monitor de 1680px la app quedaba en 960px de ancho y dejaba 720 en
// blanco: el 43% de la pantalla sin usar.
//
// La causa no fue una decisión, fue la cascada. La escala de anchos existía y
// llegaba a 1360px en pantallas grandes, pero un bloque agregado después en el
// archivo declaraba `.app{max-width:960px}` para min-width:1024px. A igual
// especificidad gana el último que aparece, así que el tope chico pisaba al
// grande justamente en los monitores donde más se notaba. No hay error, no hay
// consola roja: solo espacio desperdiciado que nadie atribuye a una regla.
//
// Este test simula la cascada y exige que el ancho CREZCA con el viewport.
const fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const bloques=[...css.matchAll(/@media\s*\(min-width:\s*(\d+)px\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
  .map(m=>({bp:Number(m[1]),cuerpo:m[2]}));
const base=(css.match(/^\.app\{[^}]*\}/m)||[''])[0];
// El tope puede venir como `min(1800px,97%)`: hay que resolver las dos mitades
// contra el viewport, no quedarse con el número en píxeles, o el test afirmaría
// un ancho que la app nunca alcanza.
const anchoDe=(texto,viewport)=>{
  const rel=texto.match(/\.app\s*\{[^}]*max-width:\s*min\(\s*([0-9]+)px\s*,\s*([0-9]+)%\s*\)/);
  if(rel)return Math.min(Number(rel[1]),Math.round(viewport*Number(rel[2])/100));
  const abs=texto.match(/\.app\s*\{[^}]*max-width:\s*(?:min\()?([0-9]+)px/);
  return abs?Number(abs[1]):null;
};
// La cascada de verdad: el último bloque cuyo breakpoint aplique es el que manda.
const efectivo=v=>{
  let w=anchoDe(base,v);
  bloques.filter(b=>b.bp<=v).forEach(b=>{const x=anchoDe(b.cuerpo,v); if(x!==null)w=x;});
  return w;
};

console.log('=== El ancho crece con la pantalla, nunca al revés ===');
const puntos=[375,768,1024,1280,1440,1680];
const medidos=puntos.map(efectivo);
puntos.forEach((v,i)=>chk(`en ${v}px la app mide ${medidos[i]}px`, medidos[i]!==null));
chk('nunca se encoge al agrandar la ventana',
  medidos.every((w,i)=>i===0||w>=medidos[i-1]));

console.log('\n=== Y aprovecha de verdad un monitor ===');
// 960px en una pantalla de 1440 es la mitad en blanco. El tope existe porque un
// renglón que cruza el monitor entero se lee peor, pero el espacio que sobra se
// gasta en columnas, no se deja vacío.
chk('en 1440px usa al menos 1200px de ancho', efectivo(1440)>=1200);
const grande=bloques.filter(b=>b.bp>=1440).map(b=>b.cuerpo).join('');
chk('y pone los ramos en tres columnas', /#home-ramos\s*\{[^}]*grid-template-columns:\s*(?:repeat\(3|1fr 1fr 1fr)/.test(grande));

// Un tope en píxeles siempre le queda corto a algún monitor: en uno de 1512px
// la app se quedaba en 1360 y dejaba una franja muerta al costado. El límite
// relativo hace que el margen se mantenga chico en cualquier tamaño.
chk('en 1512px deja menos de 80px sin usar', 1512-efectivo(1512)<80);
chk('en 1920px deja menos de 160px sin usar', 1920-efectivo(1920)<160);

console.log('\n=== Sin romper el teléfono ===');
chk('en 375px sigue siendo una columna angosta', efectivo(375)<=480);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
