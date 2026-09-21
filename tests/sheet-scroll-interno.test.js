// Arrastrar el sheet para cerrarlo NO puede competir con el scroll de una lista
// que vive adentro. Nace de un reporte de Lucas y de un usuario: "pongo notas,
// se agregan, pero si scrolleo un poco se cierra de la nada", en el simulador
// de Cálculo II.
//
// La causa: el arrastre solo miraba `sheet.scrollTop`, y varios modales llevan
// su propia caja con scroll —`.sim-cats`, `.cat-results`, `.simg-list`,
// `.agent-proposals`, `.agent-ramo-list`—. El sheet nunca se mueve, así que su
// scrollTop es siempre 0: volver arriba en la lista contaba como tirar el sheet
// hacia abajo y la ventana se cerraba a media edición.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(process.env.GRADEHUB_APP||path.join(raiz,'app.js'),'utf8');
const css=fs.readFileSync(path.join(raiz,'styles.css'),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// `openModal` se prueba sola, extraída: por eso la guarda vive dentro de ella.
let capturas=0,cerrado=false;
const classes={add(){},remove(){}};
const sheet={scrollTop:0,classList:classes,style:{},setPointerCapture(){capturas++;},releasePointerCapture(){},offsetHeight:600};
const ctx={
  document:{activeElement:null,getElementById:id=>id==='modal'?{classList:classes}:{querySelector:()=>null},querySelector:()=>sheet},
  cancelAnimationFrame(){},requestAnimationFrame(){return 1;},_sheetRaf:null,_quienAbrioModal:null,
  etiquetarCamposDelModal(){},performance:{now:()=>Date.now()},
  closeModal(){cerrado=true;},sheetResorte(){},sheetVelocidad(){return 0;},sheetGoma(){return 0;},
  // Sin esto la guarda no sabe si la caja scrollea: es el dato que decide.
  getComputedStyle:el=>({overflowY:el.overflowY||'visible'}),
};
vm.createContext(ctx);
vm.runInContext(app.match(/\nfunction openModal\([\s\S]*?\n\}/)[0],ctx);
ctx.openModal();

// Una fila dentro de una lista con scroll propio, dentro del sheet.
const nodo=(props,padre)=>({nodeType:1,scrollHeight:0,clientHeight:0,scrollTop:0,overflowY:'visible',
  parentElement:padre||null,closest:()=>null,...props});
function arrastrar(destino,dy){
  capturas=0;cerrado=false;
  sheet.onpointerdown({pointerType:'touch',button:0,clientY:200,pointerId:1,target:destino});
  sheet.onpointermove({pointerId:1,clientY:200+dy});
  sheet.onpointerup({pointerId:1,clientY:200+dy});
  return {empezoAArrastrar:capturas>0,cerro:cerrado};
}
const listaScrolleada=()=>{const l=nodo({scrollHeight:900,clientHeight:300,scrollTop:600,overflowY:'auto'});return nodo({},l);};
const listaEnSuTope=()=>{const l=nodo({scrollHeight:900,clientHeight:300,scrollTop:0,overflowY:'auto'});return nodo({},l);};
const sinLista=()=>nodo({},nodo({scrollHeight:100,clientHeight:100,overflowY:'visible'}));

console.log('=== Volver arriba en una lista no cierra la ventana ===');
const a=arrastrar(listaScrolleada(),200);
chk('con la lista scrolleada, el gesto no arrastra el sheet',!a.empezoAArrastrar);
chk('y la ventana sigue abierta',!a.cerro);

console.log('\n=== Tampoco cierra desde el tope de la lista ===');
// La regla clásica del bottom sheet permite cerrar cuando la lista está arriba
// del todo. Se probó y no sirve acá: `.sim-cats` mide 36vh, el dedo choca con el
// tope a cada rato, y la ventana se cerraba igual a media simulación.
const b=arrastrar(listaEnSuTope(),200);
chk('con la lista en su tope tampoco arrastra el sheet',!b.empezoAArrastrar&&!b.cerro);

console.log('\n=== Pero el sheet se sigue pudiendo cerrar ===');
// Si esto se rompe, la ventana queda sin salida por gesto.
const c=arrastrar(sinLista(),200);
chk('en un modal sin lista adentro, cierra como siempre',c.empezoAArrastrar&&c.cerro);
// Y al revés: desde una lista scrolleada no cierra ni con un tirón largo, que
// es lo que pasaba cuando alguien recorría una pauta de cinco evaluaciones.
const d=arrastrar(listaScrolleada(),400);
chk('desde una lista scrolleada no cierra ni con un tirón largo',!d.empezoAArrastrar&&!d.cerro);
// El tirador vive fuera de la lista, así que sigue siendo el camino directo.
const e=arrastrar(nodo({},null),200);
chk('el tirador de arriba cierra igual que siempre',e.empezoAArrastrar&&e.cerro);

console.log('\n=== Las listas que dependen de esto ===');
// Si alguien agrega otra caja con scroll dentro de un modal, la guarda la cubre
// sola: mira el overflow calculado, no una lista de clases.
['sim-cats','cat-results','simg-list','agent-proposals','agent-ramo-list'].forEach(clase=>{
  chk(`.${clase} tiene scroll propio dentro del modal`,
    new RegExp('\\.'+clase+'\\{[^}]*overflow(-y)?:auto').test(css));
});
chk('la guarda mira el overflow calculado y no una lista de clases',
  /desborde==='auto'\|\|desborde==='scroll'/.test(app));
chk('y una lista con scroll bloquea el arrastre sin mirar dónde va',
  /if\(desborde==='auto'\|\|desborde==='scroll'\)return false;/.test(app));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
