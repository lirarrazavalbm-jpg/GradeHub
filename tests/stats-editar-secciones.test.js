// Estadísticas tiene cinco secciones y no a todos les sirve la misma. Quien ya
// sabe cómo va no necesita el ritmo arriba; a quien le importa compararse lo
// quiere primero. En vez de discutir un orden universal, se deja mover y
// esconder desde "Editar".
//
// Antes había un interruptor suelto en Ajustes para una sola de las secciones.
// Eso se reemplaza: esconder la comparación es lo mismo que esconder cualquier
// otra y no merecía un lugar aparte.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const render=fs.readFileSync(path.join(raiz,'render-main.js'),'utf8');
const html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const ctx={S:{}};vm.createContext(ctx);
vm.runInContext((app.match(/const SECCIONES_STATS=\[[\s\S]*?\n\];/)||[''])[0],ctx);
['ordenSecciones','seccionOculta'].forEach(n=>{
  vm.runInContext((app.match(new RegExp('\\nfunction '+n+'\\([\\s\\S]*?\\n\\}'))||[''])[0],ctx);
});
const run=s=>vm.runInContext(s,ctx);

console.log('=== El orden guardado se respeta ===');
run("S={statsOrden:['historial','curso','ritmo','prioridades','rango'],statsOcultas:[]};");
chk('la pantalla sigue el orden del estudiante',
  run("ordenSecciones().join(',')")==='historial,curso,ritmo,prioridades,rango');

console.log('\n=== Una sección nueva no queda invisible ===');
// Si alguien guardó su orden antes de que existiera una sección, esa sección no
// puede desaparecer para siempre: entra al final en vez de perderse.
run("S={statsOrden:['ritmo','historial'],statsOcultas:[]};");
const conNuevas=run("ordenSecciones()");
chk('las que faltaban se agregan al final', conNuevas.length===run("SECCIONES_STATS.length"));
chk('y las guardadas conservan su lugar', conNuevas[0]==='ritmo'&&conNuevas[1]==='historial');

console.log('\n=== Nada se rompe con datos viejos o corruptos ===');
run("S={};");
chk('sin preferencia guardada salen todas en su orden natural',
  run("ordenSecciones().join(',')")===run("SECCIONES_STATS.map(s=>s.id).join(',')"));
run("S={statsOrden:['inventada','ritmo'],statsOcultas:'no-es-lista'};");
chk('un id que ya no existe se descarta', !run("ordenSecciones().includes('inventada')"));
chk('y una lista de ocultas malformada no esconde nada', !run("seccionOculta('ritmo')"));

console.log('\n=== Esconder de verdad saca la sección ===');
run("S={statsOrden:[],statsOcultas:['curso','ritmo']};");
chk('las escondidas se reconocen', run("seccionOculta('curso')&&seccionOculta('ritmo')"));
chk('y las demás no', !run("seccionOculta('historial')"));
// El render salta las escondidas en vez de pintarlas ocultas con CSS: una
// sección que no se ve tampoco debe pedirle datos al servidor.
chk('el render omite las escondidas',
  /ordenSecciones\(\)\.forEach\(id=>\{[\s\S]{0,120}if\(seccionOculta\(id\)\)return;/.test(render));
chk('y escondida no consulta al servidor',
  /if\(!seccionOculta\('curso'\)\)pintarPosicionesCurso\(\)/.test(render));

console.log('\n=== Se llega desde la propia pantalla ===');
chk('el botón Editar está en la barra de Estadísticas',
  /id="screen-stats"[\s\S]{0,400}openEditarSeccionesModal\(\)/.test(html));
chk('y el interruptor suelto de Ajustes ya no existe',
  !/toggleVerCurso/.test(app) && !/ocultarCurso/.test(app));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
