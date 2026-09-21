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
// El sheet ya no se arrastra para cerrarlo: se retiró el 2026-09-21 porque el
// gesto chocaba con el scroll de las listas que viven dentro de los modales.
// Lo que se cuida ahora es que TODA ventana tenga cómo cerrarse, porque sin el
// arrastre ni el clic afuera, un modal sin botón deja a la persona encerrada.
const app_=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
const html_=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
chk('el sheet no tiene manejadores de arrastre',
  !/sheet\.onpointerdown|sheet\.onpointermove|sheet\.onpointerup/.test(app_));
chk('el tirador que lo insinuaba ya no está, ni en el HTML ni en el CSS',
  !/modal-drag/.test(html_)&&!/modal-drag/.test(fs.readFileSync(path.join(raiz,'styles.css'),'utf8')));
chk('tocar fuera del sheet tampoco cierra',
  !/closeModalOutside/.test(app_)&&!/closeModalOutside/.test(html_));

// Cada plantilla de modal tiene que ofrecer su salida. Ajustes y el modal de
// calendario no la tenían: se cerraban tocando fuera.
const plantillas=[...app_.matchAll(/getElementById\(.modal-content.\)\.innerHTML\s*=\s*`([\s\S]*?)`;/g)];
// Vale un closeModal() directo o un botón de cancelar que termine cerrando:
// "Ramos por agregar" sale por Descartar, que confirma y cierra.
const sinSalida=plantillas.filter(m=>!/closeModal\(\)/.test(m[1])&&!/class="btn-cancel"/.test(m[1])).length;
chk(`las ${plantillas.length} ventanas ofrecen cómo cerrarse`,plantillas.length>0&&sinSalida===0);
chk('Ajustes tiene su botón Cerrar',/class="settings-cerrar"[^>]*onclick="closeModal\(\)"/.test(app_));
chk('y Escape sigue cerrando, que es lo que espera quien usa teclado',
  /e\.key!=='Escape'/.test(app_));

console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
process.exit(fail?1:0);
