// Comprueba que app.js parsea y que las llaves de styles.css están balanceadas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');

new vm.Script(fs.readFileSync(path.join(raiz, 'data.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(raiz, 'app.js'), 'utf8'));

const css = fs.readFileSync(path.join(raiz, 'styles.css'), 'utf8');
const abre = (css.match(/\{/g) || []).length;
const cierra = (css.match(/\}/g) || []).length;
if (abre !== cierra) {
  console.error('CSS desbalanceado: ' + abre + ' { vs ' + cierra + ' }');
  process.exit(1);
}

// El HTML debe apuntar a los archivos externos, no tener el código inline
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
if (!html.includes('href="styles.css"') || !html.includes('src="app.js"') || !html.includes('src="data.js"')) {
  console.error('index.html no enlaza data.js, app.js y styles.css');
  process.exit(1);
}
// data.js declara los const que app.js consume: si se carga después, ReferenceError
if (html.indexOf('src="data.js"') > html.indexOf('src="app.js"')) {
  console.error('index.html carga data.js DESPUÉS de app.js');
  process.exit(1);
}

// El service worker precachea la shell: si falta un archivo, la PWA queda a medias
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
['/data.js', '/app.js', '/styles.css', '/index.html'].forEach(f => {
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

console.log('JS OK · CSS ' + abre + '/' + cierra + ' OK · HTML enlaza bien · data.js sin lógica');
