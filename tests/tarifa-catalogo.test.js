// Quien encuentra una clase en el catálogo también se cobra, por fórmula y a
// menos que el público segmentado: base × (0,3 + 0,2 × intención).
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={console,Intl};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','marketplace.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const cot=(crit,datos,tarifa=null)=>{ctx.__c=crit;ctx.__d=datos;ctx.__t=tarifa;return run('cotizarCampanaClases(__c,__t,__d)');};
const bajo5={promedioMenorA:5,avanceMinimo:20};  // $1.400 por cuenta segmentada

console.log('=== La fórmula ===');
let r=cot(bajo5,{alcanzados:0,catalogo:{lista:0,busqueda:0}});
chk('recorriendo la lista vale $300',r.precioCatalogoLista===300);
chk('llegando por búsqueda vale $500',r.precioCatalogoBusqueda===500);
chk('sale de la base: con base $2.000 es el doble',
  cot(bajo5,{catalogo:{lista:0,busqueda:0}},{base:2000}).precioCatalogoBusqueda===1000);
chk('nunca supera el precio segmentado',
  cot({promedioMenorA:7,avanceMinimo:0},{catalogo:{lista:0,busqueda:0}},{base:1000,redondeo:1000}).precioCatalogoBusqueda<=1000);

console.log('\n=== Cobro real ===');
// 10 segmentadas × $1.400 + 4 búsquedas × $500 + 6 de lista × $300 + $3.000 fijo.
r=cot(bajo5,{alcanzados:10,catalogo:{lista:6,busqueda:4}});
chk('suma segmentado y catálogo',r.costoSegmentado===14000&&r.costoCatalogo===3800&&r.costoPorAlcance===17800);
chk('y el total lleva el cargo fijo',r.totalPorAlcance===20800);

console.log('\n=== El presupuesto manda ===');
// $15.000: 10 segmentadas = $14.000, quedan $1.000 → 2 búsquedas ($1.000), 0 de lista.
r=cot(bajo5,{alcanzados:10,presupuestoClp:15000,catalogo:{lista:6,busqueda:4}});
chk('se cobra primero lo segmentado, después la búsqueda',r.catalogoCobrado.busqueda===2&&r.catalogoCobrado.lista===0);
chk('y nunca pasa del presupuesto',r.costoPorAlcance<=15000&&r.costoPorAlcance===15000);
r=cot(bajo5,{alcanzados:0,presupuestoClp:1000,catalogo:{lista:5,busqueda:0}});
chk('lo que sobra no autoriza una fracción',r.catalogoCobrado.lista===3&&r.costoCatalogo===900);

console.log('\n=== Lo que ya estaba no cambia ===');
r=cot(bajo5,{alcanzados:18});
chk('sin catálogo el costo es el de siempre',r.costoPorAlcance===18*1400&&r.costoCatalogo===null);
chk('datos de catálogo inválidos no cotizan',cot(bajo5,{catalogo:{lista:-1,busqueda:0}})===null);

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
