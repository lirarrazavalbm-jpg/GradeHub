// Comprueba que app.js parsea y que las llaves de styles.css están balanceadas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const raiz = path.join(__dirname, '..');

new vm.Script(fs.readFileSync(path.join(raiz, 'data.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(raiz, 'engine.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(raiz, 'app.js'), 'utf8'));
new vm.Script(fs.readFileSync(path.join(raiz, 'render-agenda.js'), 'utf8'));

const css = fs.readFileSync(path.join(raiz, 'styles.css'), 'utf8');
const abre = (css.match(/\{/g) || []).length;
const cierra = (css.match(/\}/g) || []).length;
if (abre !== cierra) {
  console.error('CSS desbalanceado: ' + abre + ' { vs ' + cierra + ' }');
  process.exit(1);
}

// El HTML debe apuntar a los archivos externos, no tener el código inline
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
if (!html.includes('href="styles.css"') || !html.includes('src="app.js"') || !html.includes('src="data.js"') || !html.includes('src="engine.js"') || !html.includes('src="render-agenda.js"')) {
  console.error('index.html no enlaza data.js, engine.js, app.js, render-agenda.js y styles.css');
  process.exit(1);
}
// data.js declara los const que app.js consume: si se carga después, ReferenceError
if (!(html.indexOf('src="data.js"') < html.indexOf('src="engine.js"') && html.indexOf('src="engine.js"') < html.indexOf('src="app.js"') && html.indexOf('src="app.js"') < html.indexOf('src="render-agenda.js"'))) {
  console.error('index.html no respeta el orden data.js → engine.js → app.js → render-agenda.js');
  process.exit(1);
}

// El service worker precachea la shell: si falta un archivo, la PWA queda a medias
const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
['/data.js', '/engine.js', '/app.js', '/render-agenda.js', '/styles.css', '/index.html'].forEach(f => {
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

// sw.js no lo parseaba NADIE. Un merge mal resuelto dejó marcadores de conflicto
// commiteados y llegaron a producción: el service worker no instalaba, y con él
// se cayeron la caché, el modo offline y el aviso de versión nueva. No lanza
// error visible — la app sigue andando, solo pierde todo lo que el SW aporta.
new vm.Script(fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8'));

// Marcadores de conflicto en cualquier archivo que se despliega. Con varias
// ramas en paralelo esto pasa, y lo caro es que llegue a producción.
['sw.js', 'app.js', 'data.js', 'engine.js', 'render-agenda.js', 'styles.css', 'index.html', 'privacidad.html', 'package.json']
  .forEach(f => {
    const src = fs.readFileSync(path.join(raiz, f), 'utf8');
    if (/^(<{7}|={7}|>{7})/m.test(src)) {
      console.error(f + ' tiene marcadores de conflicto sin resolver');
      process.exit(1);
    }
  });

// El SHELL del service worker tiene que apuntar a archivos que existan: uno que
// falte hace que la instalación entera falle y el SW quede inservible.
const swSrc = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
(swSrc.match(/'\/([a-zA-Z0-9._-]+)'/g) || []).forEach(m => {
  const f = m.replace(/'/g, '').replace(/^\//, '');
  if (!f || f === '') return;
  if (!fs.existsSync(path.join(raiz, f))) {
    console.error('sw.js precachea ' + f + ', que no existe');
    process.exit(1);
  }
});

// Política de contraseñas: un mínimo suelto por el código se desincroniza del
// resto. Y el largo NO puede exigirse al iniciar sesión — quien creó su cuenta
// con el mínimo anterior tiene que poder entrar.
const app = fs.readFileSync(path.join(raiz, 'app.js'), 'utf8');
const min = (app.match(/const PASS_MIN\s*=\s*(\d+)/) || [])[1];
if (!min || Number(min) < 8) {
  console.error('PASS_MIN tiene que existir y ser >= 8 (es ' + min + ')');
  process.exit(1);
}
if (/length\s*<\s*[0-9]/.test(app)) {
  console.error('quedó un mínimo de contraseña hardcodeado: usa PASS_MIN');
  process.exit(1);
}
if (!/authMode\s*===\s*'signup'\s*&&\s*p\.length\s*<\s*PASS_MIN/.test(app)) {
  console.error('el mínimo de contraseña debe exigirse SOLO en registro, no al iniciar sesión');
  process.exit(1);
}

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
