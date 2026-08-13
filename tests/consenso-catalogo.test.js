const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');
const sql = fs.readFileSync(raiz + 'supabase/catalog_consensus.sql', 'utf8');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

const MALLA_UC = val('MALLA_UC'), SIGLAS_UC = val('SIGLAS_UC');
const siglaUC = val('siglaUC'), claveReporte = val('claveReporte');

console.log('\n=== Siglas UC ===');
['ING-PC', 'COM'].forEach(carrera => {
  const ramos = Object.values(MALLA_UC[carrera]).flat();
  chk(`${carrera} tiene sigla para cada ramo de su malla`,
    ramos.every(nombre => typeof siglaUC(nombre, carrera) === 'string' && siglaUC(nombre, carrera).length));
  chk(`${carrera} no repite siglas dentro de su malla`,
    new Set(ramos.map(nombre => siglaUC(nombre, carrera))).size === ramos.length);
});
chk('un ramo compartido conserva una sola sigla oficial',
  siglaUC('Cálculo I', 'ING-PC') === 'MAT1610' &&
  siglaUC('Cálculo I', 'COM') === 'MAT1610');
chk('los ramos parecidos de facultades distintas no heredan sigla',
  siglaUC('Probabilidades y Estadística', 'ING-PC') === 'EYP1113' &&
  siglaUC('Probabilidad y Estadística', 'COM') === 'EAA1510');
chk('la tabla Comercial tiene los 31 ramos actuales', Object.keys(SIGLAS_UC.COM).length === 31);

console.log('\n=== Clave de consenso ===');
const calculoIng = { nombre: 'Cálculo I', origen: { tenant: 'uc', carrera: 'ING-PC' } };
const calculoCom = { nombre: 'Cálculo I', origen: { tenant: 'uc', carrera: 'COM' } };
chk('el mismo ramo UC coincide aunque venga de mallas distintas',
  claveReporte(calculoIng) === 'MAT1610' && claveReporte(calculoCom) === 'MAT1610');
chk('un ramo FEN conserva nombre normalizado hasta tener una sigla oficial',
  claveReporte({ nombre: 'Contabilidad', origen: { tenant: 'fen', carrera: 'IC' } }) === 'contabilidad');

console.log('\n=== RPC segura y agregada ===');
const consenso = sql.slice(sql.indexOf('create or replace function public.catalog_consensus'));
chk('el reporte se escribe por RPC, no desde el cliente a la tabla',
  /rpc\('submit_catalog_report'/.test(src) && !/from\('catalog_reports'\)\.upsert/.test(src));
chk('el consenso pide solo la universidad al backend',
  /rpc\('catalog_consensus',\{p_tenant:S\.tenant\}\)/.test(src));
chk('la función no filtra por carrera ni semestre',
  !/p_carrera|semestre/i.test(consenso));
chk('el consenso cuenta personas distintas y exige tres',
  /count\(distinct cr\.user_id\)/.test(consenso) && />= 3/.test(consenso));
chk('la función no expone usuario ni comentario',
  /returns table \(\s*ramo text,\s*ramo_key text,\s*estructura jsonb,\s*huella text,\s*respaldos integer\s*\)/.test(consenso) &&
  !/cr\.nota|cr\.user_id\s+as/.test(consenso));
chk('las dos RPC requieren sesión y no quedan públicas',
  (sql.match(/security definer/g) || []).length === 2 && /auth\.uid\(\)/.test(sql) &&
  /grant execute on function public\.submit_catalog_report[\s\S]*to authenticated/.test(sql) &&
  /grant execute on function public\.catalog_consensus\(text\) to authenticated/.test(sql));
chk('la RPC limita largos, cantidad y tamaño aunque se salten la interfaz',
  /length\(p_tenant\) > 20/.test(sql) &&
  /jsonb_array_length\(p_estructura\) not between 1 and 30/.test(sql) &&
  /octet_length\(p_estructura::text\) > 32768/.test(sql));
chk('pesos, slots y compuertas se validan en el servidor',
  /peso'[\s\S]*not between 0 and 100/.test(sql) &&
  /slots'[\s\S]*not between 1 and 100/.test(sql) &&
  /min'[\s\S]*not between 1 and 7/.test(sql) &&
  /cap'[\s\S]*not between 1 and 7/.test(sql));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
