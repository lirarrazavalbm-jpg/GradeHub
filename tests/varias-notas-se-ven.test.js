// Una evaluación de "varias notas" tiene que mostrar sus notas.
//
// Reporte de TRES personas distintas entre el 2026-08-29 y el 08-30, el más
// repetido de la lista: "cuando agrego controles y le pongo que son varias
// notas dentro de esa categoría, no me aparece después y deja de funcionar. Si
// saco que son varias notas, vuelven a aparecer todos."
//
// La causa era una asimetría de una línea. La rama de casillas fijas se abría
// sola cuando tenía notas; la de lista abierta solo si había un descarte. O sea
// una categoría creada a mano con "varias notas" quedaba plegada SIEMPRE:
//
//   · vacía escondía el "+ Agregar nota", que vive adentro — no había forma
//     visible de poner la primera nota;
//   · con notas las escondía también — se guardaban y desaparecían de la vista.
//
// Esto explica además las cuentas que tienen la pauta armada y ninguna nota
// guardada, que al 2026-09-24 eran 79.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const src=['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js']
  .map(f=>fs.readFileSync(raiz+f,'utf8')).join('\n');
function classList(){const c=new Set();return{add(...x){x.forEach(v=>c.add(v));},remove(...x){x.forEach(v=>c.delete(v));},contains(v){return c.has(v);}};}
function el(){let html='';const attrs={};
  const nodo={style:{setProperty(){},removeProperty(){}},classList:classList(),children:[],textContent:'',value:'',dataset:{},
    addEventListener(){},appendChild(h){this.children.push(h);return h;},setAttribute(k,v){attrs[k]=String(v);},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k]||null;},
    querySelector(){return nodo;},querySelectorAll(){return [];},focus(){},select(){},click(){},remove(){},clientWidth:400};
  Object.defineProperty(nodo,'innerHTML',{get(){return html;},set(v){html=String(v);this.children=[];}});
  return nodo;}
const ids={};const byId=id=>ids[id]||(ids[id]=el());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:byId,createElement:el,addEventListener(){},documentElement:el(),querySelector(){return el();},querySelectorAll(){return [];},body:el()},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,fail=0;const chk=(n,c)=>{console.log(`  ${c?'OK  ':'FAIL'} ${n}`);if(c)ok++;else fail++;};
const juntar=n=>(n.innerHTML||'')+(n.children||[]).map(juntar).join('');

// Exactamente lo que guarda confirmAddCat con la casilla marcada: sin `slots`,
// que es a propósito — ahí no se sabe cuántas evaluaciones son.
const pintar=notas=>{
  ctx.__notas=notas;
  vm.runInContext(`S=normalize({tenant:'uc',onboardingDone:true,ramos:[{id:'r1',nombre:'R',color:'#6d5dd3',creditos:10,origen:null,gates:[],
    categorias:[{id:'c1',nombre:'Controles',peso:100,ponderaNotas:false,directNota:false,notas:JSON.parse(JSON.stringify(__notas))}]}]});
    currentRamoId='r1';openCats={};renderRamo();`,ctx);
  return juntar(byId('cat-list'));
};
// El contenedor plegable de una lista abierta es `.cat-body`, y lleva ` open`
// solo cuando está desplegada. Comprobarlo por ahí y no por una alternativa
// laxa: una comprobación que también pasa con el código viejo no prueba nada.
const abierta=h=>/class="cat-body open"/.test(h);

console.log('\n=== Recién creada, sin notas ===');
let h=pintar([]);
chk('la lista se muestra desplegada', abierta(h));
chk('y el "+ Agregar nota" queda alcanzable', /gregar nota/.test(h));

console.log('\n=== Con notas adentro ===');
h=pintar([{id:'n1',nombre:'Control 1',valor:5.5,peso:1},{id:'n2',nombre:'Control 2',valor:4.0,peso:1}]);
chk('sigue desplegada', abierta(h));
chk('se ve la primera nota', /5[.,]5/.test(h));
chk('y la segunda', /4[.,]0/.test(h));
chk('el contador dice 2 notas', /2 notas/.test(h));

console.log('\n=== Sin slots, que es a propósito ===');
// "Sin `slots`, no se inventa cuántas evaluaciones faltan" (AGENTS.md). El
// arreglo es de visibilidad: no se le pone un número que nadie declaró.
chk('no se le inventa una cantidad', vm.runInContext('S.ramos[0].categorias[0].slots',ctx)===undefined);

console.log('\n=== Cerrarla a mano sigue funcionando ===');
vm.runInContext(`openCats['c1']=false;renderRamo();`,ctx);
h=juntar(byId('cat-list'));
chk('quien la cierra la deja cerrada', /class="cat-body"/.test(h) && !/class="cat-body open"/.test(h));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
