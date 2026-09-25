// Ser profesor particular se PIDE desde Ajustes y se TRABAJA en su propia
// pestaña. Decisión de Lucas del 2026-09-21: en Ajustes va solo el botón para
// pedir autorización y en qué va la solicitud; los anuncios y sus estadísticas
// viven en una página aparte, porque armar un anuncio con su público y su
// cotización es una tarea de varios pasos.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const leer=f=>fs.readFileSync(raiz+f,'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

const app=leer('app.js'),html=leer('index.html'),css=leer('styles.css'),mk=leer('marketplace.js');

console.log('=== En Ajustes va la puerta, no el trabajo ===');
chk('hay una sección de clases particulares',
  /\['Tu cuenta','profesor','Clases particulares'/.test(app));
chk('ofrece pedir autorización', /onclick="postularComoProfesor\(\)"/.test(app));
chk('y NO arma anuncios ni muestra métricas ahí',
  !/panelProfesor[\s\S]{0,1500}renderBorradorProfesor/.test(app) &&
  !/panelProfesor[\s\S]{0,1500}resumen_metricas/.test(app));
chk('la sección tiene su ícono, no un hueco', /\n    profesor:'<svg class="ic"/.test(app));

console.log('\n=== La solicitud tiene estados, para no dejar a nadie esperando ===');
// Apretar el botón no enciende nada hasta que alguien del equipo revise.
for(const estado of ['pendiente','aprobado','rechazado','suspendido'])
  chk(`«${estado}» tiene su mensaje`,new RegExp(estado+":\\['").test(app));
chk('y "no se pudo preguntar" no se confunde con "no tiene ficha"',
  /if\(perfil===undefined\)/.test(app) && /if\(perfil===null\)/.test(app) &&
  /todavía no están disponibles/.test(app));

console.log('\n=== La pestaña existe solo para quien está aprobado ===');
chk('la barra de pestañas es una lista viva, no una constante',
  /let NAV_TABS=NAV_TABS_BASE\.slice\(\)/.test(app) && /function recalcularNavTabs\(/.test(app));
chk('la pantalla y el botón nacen escondidos',
  /id="screen-profesor" class="screen" hidden/.test(html) && /id="nav-profesor"[^>]*hidden/.test(html));
// `hidden` es la regla de menor especificidad que existe: sin esto, .nav-item
// con su display:flex lo dejaba a la vista para todo el mundo.
chk('y `hidden` le gana al display de la barra',
  /\.nav-item\[hidden\],\.screen\[hidden\]\{display:none;\}/.test(css));
// La regla del carrusel lleva display:flex!important, que le gana a `hidden`:
// sin esto la pantalla de Clases quedaba ENCIMA de Inicio para quien no es
// profesor —en blanco y tapando todo—, porque tampoco la mueve setTabTransforms.
// Las reglas agrupan a Clases y Administración: se busca cada selector dentro
// del grupo que lleva la declaración.
const grupo=(sel,decl)=>new RegExp('(^|[,}\\s])'+sel.replace(/[.#[\]]/g,'\\$&')+'[\\s,]*(\\.app[^{]*)?\\{'+decl).test(css);
for(const t of ['profesor','admin']){
  chk(`la pantalla ${t} está en la lista del carrusel`,grupo(`.app.tab-mode #screen-${t}`,'\\s*position:absolute'));
  chk(`y escondida (${t}) gana a ese display, para no taparle Inicio a nadie`,grupo(`.app.tab-mode #screen-${t}[hidden]`,'display:none!important;'));
}
chk('al abrirla se pinta el espacio de profesor',
  /tab==='profesor'&&typeof renderProfesor==='function'/.test(app) &&
  /async function renderProfesor\(\)/.test(mk));

console.log('\n=== Y si te suspenden estando ahí, no te deja en blanco ===');
chk('vuelve a Inicio cuando la pestaña desaparece',
  /if\(!NAV_TABS\.includes\(currentTab\)\)showTab\('home'\)/.test(app));
chk('el carrusel se reacomoda con la lista nueva',
  /setTabTransforms\(Math\.max\(0,NAV_TABS\.indexOf\(currentTab\)\),0\)/.test(app));

console.log('\n=== El mismo cuerpo en la pestaña y en el modal ===');
// Dos entradas que pinten cosas distintas es el camino a que una quede vieja.
chk('el espacio se dibuja en una función que recibe dónde ponerse',
  /async function renderEspacioProfesor\(raiz,\{titulo=true\}=\{\}\)/.test(mk));
chk('y no se pregunta el estado dos veces por pintar la pantalla',
  /function cargarPerfilProfesor\(/.test(mk) && /perfilProfesorPedido/.test(mk));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
