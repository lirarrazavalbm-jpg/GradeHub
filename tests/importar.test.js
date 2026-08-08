// Importar es la única acción que destruye datos sin deshacer: reemplaza el
// estado local Y lo sube a la nube, así que también se lleva el respaldo.
// Antes bastaba pegar {"userName":"Ana"} para borrar todos los ramos, y la app
// respondía "Datos importados correctamente".
const fs = require('fs'), vm = require('vm');
const src = ['data.js','engine.js','app.js','render-agenda.js']
  .map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { _d: {}, getItem(k) { return this._d[k] ?? null }, setItem(k, v) { this._d[k] = v }, removeItem(k) { delete this._d[k] } },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console
};
vm.createContext(ctx); vm.runInContext(src, ctx);

let ok = 0, fail = 0;
const chk = (n, cond) => { if (cond) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Qué cuenta como respaldo de GradeHub ===');
const valido = ctx.esExportValido;
chk('un export real pasa', valido({ userName: 'Ana', ramos: [] }) === true);
chk('un export con ramos pasa', valido({ ramos: [{ id: 'x' }] }) === true);
// El caso que borraba los datos: JSON legítimo, sin ramos.
chk('{"userName":"Ana"} NO pasa', valido({ userName: 'Ana' }) === false);
chk('un objeto vacío NO pasa', valido({}) === false);
chk('null NO pasa', valido(null) === false);
chk('un arreglo NO pasa', valido([1, 2]) === false);
chk('ramos que no es arreglo NO pasa', valido({ ramos: 'muchos' }) === false);
chk('un número NO pasa', valido(42) === false);

console.log('\n=== Eliminar cuenta: la política y la app deben coincidir ===');
// La política de privacidad promete que borrar la cuenta no deja copias. Si el
// botón desaparece o la política vuelve a decir "escríbenos", quedan
// desalineados y le estamos mintiendo al estudiante.
const appSrc = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const pol = fs.readFileSync(__dirname + '/../privacidad.html', 'utf8');
chk('la app llama a la función de la base, no borra desde el cliente',
  /rpc\(\s*['"]eliminar_mi_cuenta['"]/.test(appSrc));
chk('la función se invoca sin parámetros (usa auth.uid del token)',
  !/rpc\(\s*['"]eliminar_mi_cuenta['"]\s*,/.test(appSrc));
chk('lo local se limpia DESPUÉS de que la nube confirme',
  appSrc.indexOf("rpc('eliminar_mi_cuenta')") < appSrc.indexOf('localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CACHE_OWNER_KEY);localStorage.removeItem(PRE_IMPORT_KEY)'));
chk('hay doble confirmación', (appSrc.match(/showConfirm\(/g) || []).length >= 2 && /¿Seguro\?/.test(appSrc));
const flujoEliminar=appSrc.slice(appSrc.indexOf('function confirmarEliminarCuenta'),appSrc.indexOf('async function eliminarCuenta'));
chk('la tercera confirmación muestra el impacto y rompe el automatismo',
  (flujoEliminar.match(/showConfirm\(/g) || []).length === 3 && /Última confirmación/.test(flujoEliminar) && /nRamos/.test(flujoEliminar) && /nNotas/.test(flujoEliminar) && /actionFirst:true/.test(flujoEliminar) && /focusCancel:true/.test(flujoEliminar));
const showConfirmSrc=appSrc.slice(appSrc.indexOf('function showConfirm'),appSrc.indexOf('function closeConfirm'));
chk('las confirmaciones encadenadas no se cierran entre sí',
  showConfirmSrc.indexOf('closeConfirm();') < showConfirmSrc.indexOf('if(confirmar)confirmar();'));
chk('la política ya no manda a escribir un correo para borrar',
  !/hoy no hay un botón en la app/.test(pol));
chk('la política apunta al botón real', /Eliminar mi cuenta/.test(pol));

// La función de Postgres estuvo dos días bajo sospecha sin que nadie pudiera
// leerla: era la única pieza del borrado que no existía en el repo. Ahora está
// versionada, y estos chequeos son para que no vuelva a desaparecer ni a
// mutar en algo inseguro sin que se note en el diff.
const sqlPath = __dirname + '/../supabase/eliminar_mi_cuenta.sql';
chk('la función de la base está versionada en el repo', fs.existsSync(sqlPath));
const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
chk('borra de auth.users, que es lo que dispara las cascadas',
  /delete\s+from\s+auth\.users/i.test(sql));
chk('el id sale del token, no de un parámetro: con parámetro cualquiera podría borrarle la cuenta a otro',
  /auth\.uid\(\)/.test(sql) && /create\s+or\s+replace\s+function\s+public\.eliminar_mi_cuenta\s*\(\s*\)/i.test(sql));
chk('es security definer: el cliente no tiene permiso sobre auth.users',
  /security\s+definer/i.test(sql));
chk('sin sesión activa no borra nada', /raise\s+exception/i.test(sql));
chk('anon no puede ejecutarla', /revoke\s+all\s+on\s+function\s+public\.eliminar_mi_cuenta/i.test(sql));

console.log('\n=== Contar lo que está en juego antes de reemplazarlo ===');
const conNotas = [
  { categorias: [{ notas: [1, 2] }, { notas: [3] }] },
  { categorias: [{ notas: [] }] },
];
chk('cuenta las notas de todos los ramos', ctx.contarNotas(conNotas) === 3);
chk('sin ramos cuenta 0', ctx.contarNotas([]) === 0);
chk('tolera ramos sin categorías', ctx.contarNotas([{}]) === 0);

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
