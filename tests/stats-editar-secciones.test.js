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
const app=fs.readFileSync(process.env.GRADEHUB_APP||path.join(raiz,'app.js'),'utf8');
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

console.log('\n=== Los títulos explican qué entrega cada sección ===');
chk('el avance se nombra en el encabezado de la sección',
  /piezas\.ritmo=`[\s\S]*?section-hd-title">Avance del semestre<\/span>/.test(render));
chk('la tarjeta no repite el título de avance',
  !/class="stat-label">Avance del semestre<\/div>/.test(render));
chk('las prioridades se presentan como una ayuda para hoy',
  /piezas\.prioridades=`[\s\S]*?section-hd-title">Tus prioridades hoy<\/span>/.test(render));
chk('la comparación dice explícitamente que es respecto a los demás',
  /piezas\.curso=`[\s\S]*?section-hd-title">Cómo vas respecto a los demás<\/span>/.test(render));
chk('el rango conserva su título',
  /piezas\.rango=`[\s\S]*?section-hd-title">Rango del semestre<\/span>/.test(render));

console.log('\n=== El arrastre del modal respeta el interruptor ===');
// La parte visible es un span dentro de label; el input ocupa 0x0. Capturar
// ese pointerdown redirige el click al sheet y el checkbox nunca cambia.
// Se prueba el handler real instalado al abrir el modal, no una copia.
let capturas=0;
const classes={add(){},remove(){}};
const sheet={scrollTop:0,classList:classes,setPointerCapture(){capturas++;}};
const contenido={querySelector(){return null;}};
const modalCtx={
  document:{activeElement:null,getElementById:id=>id==='modal'?{classList:classes}:contenido,querySelector:()=>sheet},
  cancelAnimationFrame(){},_sheetRaf:null,_quienAbrioModal:null,
  etiquetarCamposDelModal(){},performance:{now:()=>0},
};
vm.createContext(modalCtx);
vm.runInContext(app.match(/\nfunction openModal\([\s\S]*?\n\}/)[0],modalCtx);
modalCtx.openModal();
const target=tags=>({closest:selector=>tags.find(tag=>selector.split(',').includes(tag))||null});
const down=tags=>sheet.onpointerdown({pointerType:'mouse',button:0,clientY:100,pointerId:1,target:target(tags)});
down(['span','label','div']);
chk('clic sobre el riel del switch no captura el puntero',capturas===0);
capturas=0;
down(['label','div']);
chk('clic sobre la etiqueta tampoco empieza a arrastrar',capturas===0);
capturas=0;
down(['input','label','div']);
down(['svg','button','div']);
chk('el campo y los botones conservan su propia acción',capturas===0);
down(['div']);
chk('el espacio libre del modal sigue permitiendo arrastrar',capturas===1);

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
