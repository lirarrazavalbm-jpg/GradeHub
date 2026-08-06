// Comprueba que app.js parsea y que las llaves de styles.css están balanceadas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');

new vm.Script(fs.readFileSync(path.join(raiz, 'data.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(raiz, 'engine.js'), 'utf8'));
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
new vm.Script(app);

// El guardado en nube está agrupado; cerrar sesión debe vaciar ese guardado
// pendiente antes de invalidar la sesión, o se puede perder la última nota.
const inicioSignOut = app.indexOf('async function signOut()');
const finSignOut = inicioSignOut < 0 ? -1 : app.indexOf('\n}\n', inicioSignOut);
const cuerpoSignOut = finSignOut < 0 ? '' : app.slice(inicioSignOut, finSignOut);
if (inicioSignOut < 0 || cuerpoSignOut.indexOf('await syncNow()') < 0 || cuerpoSignOut.indexOf('await syncNow()') > cuerpoSignOut.indexOf('auth.signOut()')) {
  console.error('signOut debe sincronizar antes de cerrar la sesión');
  process.exit(1);
}

const css = fs.readFileSync(path.join(raiz, 'styles.css'), 'utf8');
const abre = (css.match(/\{/g) || []).length;
const cierra = (css.match(/\}/g) || []).length;
if (abre !== cierra) {
  console.error('CSS desbalanceado: ' + abre + ' { vs ' + cierra + ' }');
  process.exit(1);
}

// El HTML debe apuntar a los archivos externos, no tener el código inline
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
if (!html.includes('href="styles.css"') || !html.includes('src="app.js"') || !html.includes('src="engine.js"') || !html.includes('src="data.js"')) {
  console.error('index.html no enlaza data.js, engine.js, app.js y styles.css');
  process.exit(1);
}
// data.js declara los const que app.js consume: si se carga después, ReferenceError
if (html.indexOf('src="data.js"') > html.indexOf('src="engine.js"') || html.indexOf('src="engine.js"') > html.indexOf('src="app.js"')) {
  console.error('index.html debe cargar data.js, engine.js y app.js en ese orden');
  process.exit(1);
}

// El service worker precachea la shell: si falta un archivo, la PWA queda a medias
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
['/data.js', '/engine.js', '/app.js', '/styles.css', '/index.html'].forEach(f => {
  if (!sw.includes("'" + f + "'")) {
    console.error('sw.js no precachea ' + f);
    process.exit(1);
  }
});

// data.js es solo datos: sin DOM, sin estado mutable, sin llamadas
const data = fs.readFileSync(path.join(raiz, 'data.js'), 'utf8');
const sucio = ['document.', 'window.', 'localStorage', 'function '].filter(t => data.includes(t));
if (sucio.length) {
  console.error('data.js dejó de ser solo datos: contiene ' + sucio.join(', '));
  process.exit(1);
}

// Las superficies que se anuncian como botones deben funcionar también con
// teclado; Enter y Espacio son el comportamiento esperado para role=button.
['eval-group-hd', 'eval-row-info', 'cat-info'].forEach(clase => {
  const inicio = app.indexOf('class="' + clase + '" role="button"');
  const cierre = inicio < 0 ? -1 : app.indexOf('>', inicio);
  const etiqueta = cierre < 0 ? '' : app.slice(inicio, cierre);
  if (!etiqueta.includes('onkeydown=') || !etiqueta.includes("event.key==='Enter'") || !etiqueta.includes("event.key===' '")) {
    console.error(clase + ' debe responder a Enter y Espacio');
    process.exit(1);
  }
});

// Un solo archivo de instrucciones con tres nombres. Si alguno deja de ser
// symlink (hay editores que los reemplazan al guardar), cada agente empieza a
// leer una versión distinta y nadie se entera hasta que ya divergieron.
['CLAUDE.md', 'GEMINI.md'].forEach(f => {
  const p = path.join(raiz, f);
  if (!fs.existsSync(p) || !fs.lstatSync(p).isSymbolicLink() || fs.readlinkSync(p) !== 'AGENTS.md') {
    console.error(f + ' tiene que ser un symlink a AGENTS.md');
    process.exit(1);
  }
});

console.log('JS OK · CSS ' + abre + '/' + cierra + ' OK · HTML enlaza bien · data.js sin lógica · instrucciones enlazadas');
