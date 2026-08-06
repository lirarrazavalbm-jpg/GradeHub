// Comprueba que app.js parsea y que las llaves de styles.css están balanceadas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');

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
if (!html.includes('href="styles.css"') || !html.includes('src="app.js"')) {
  console.error('index.html no enlaza app.js y styles.css');
  process.exit(1);
}

console.log('JS OK · CSS ' + abre + '/' + cierra + ' OK · HTML enlaza bien');
