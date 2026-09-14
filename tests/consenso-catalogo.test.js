const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const appPath = process.env.GRADEHUB_APP || raiz + 'app.js';
const src = ['data.js', 'engine.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).concat(fs.readFileSync(appPath, 'utf8'), fs.readFileSync(raiz + 'render-agenda.js', 'utf8')).join('\n');
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
const siglaUC = val('siglaUC'), siglaReporteUC = val('siglaReporteUC'), claveReporte = val('claveReporte');
const estructuraReporte = val('estructuraReporte'), aplicarPesoReporte = val('aplicarPesoReporte');
const estadoReporte = val('estadoReporte');
const estructuraParaConsenso = val('estructuraParaConsenso'), huellaEstructura = val('huellaEstructura');
const editorEstructuraPresente = /function aplicarNombreReporte\(/.test(src) &&
  /function agregarFilaReporte\(/.test(src) && /function quitarFilaReporte\(/.test(src);
const aplicarNombreReporte = editorEstructuraPresente ? val('aplicarNombreReporte') : null;
const agregarFilaReporte = editorEstructuraPresente ? val('agregarFilaReporte') : null;
const quitarFilaReporte = editorEstructuraPresente ? val('quitarFilaReporte') : null;

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
// Los majors UC no tienen malla cargada, pero sus ramos sí tienen una sigla
// oficial en CREDITOS_UC. Si se agrupan por nombre, un homónimo de otra
// facultad puede contaminar el consenso que luego recibe un estudiante.
const sistemas = { nombre: 'Sistemas Operativos y Redes', origen: { tenant: 'uc', carrera: 'ING-PC' } };
chk('un ramo de major UC conserva su sigla al reportar aunque no esté en la malla',
  siglaReporteUC(sistemas) === 'IIC2333' && claveReporte(sistemas) === 'IIC2333');
chk('un ramo FEN conserva nombre normalizado hasta tener una sigla oficial',
  claveReporte({ nombre: 'Contabilidad', origen: { tenant: 'fen', carrera: 'IC' } }) === 'contabilidad');

console.log('\n=== El reporte corrige porcentajes sin tocar el ramo ===');
const ramoReporte = {
  categorias: [
    { id: 'i1', nombre: 'Interrogación 1', peso: 30 },
    { id: 'ex', nombre: 'Examen', peso: 70 },
  ],
  gates: [],
};
const borradorReporte = estructuraReporte(ramoReporte);
aplicarPesoReporte(borradorReporte, 0, '40,5');
aplicarPesoReporte(borradorReporte, 1, '59.5');
chk('acepta coma y punto decimal en los porcentajes',
  borradorReporte[0].peso === 40.5 && borradorReporte[1].peso === 59.5);
chk('editar el reporte no modifica la pauta ni los promedios del estudiante',
  ramoReporte.categorias[0].peso === 30 && ramoReporte.categorias[1].peso === 70);
chk('el total vivo reconoce cuándo la propuesta suma 100',
  estadoReporte(borradorReporte).lista && estadoReporte(borradorReporte).total === 100);
aplicarPesoReporte(borradorReporte, 1, '50');
chk('el total vivo dice cuánto falta',
  !estadoReporte(borradorReporte).lista && estadoReporte(borradorReporte).diferencia === 9.5);
const bordesReporte = estructuraReporte(ramoReporte);
aplicarPesoReporte(bordesReporte, 0, '-5');
aplicarPesoReporte(bordesReporte, 1, '150');
chk('cada porcentaje queda dentro del rango que acepta Supabase',
  bordesReporte[0].peso === 0 && bordesReporte[1].peso === 100);
chk('la interfaz usa campos editables y envía el borrador, no la pauta original',
  /class="rep-peso-input"/.test(src) &&
  /const est=estructuraParaConsenso\(reporteRamoId===ramoId\?reporteDraft/.test(src));
chk('y lo que viaja no lleva las evaluaciones en 0%',
  estructuraParaConsenso([{nombre:'Examen',peso:40},{nombre:'X',peso:0}]).length === 1);
chk('un total distinto de 100 se explica antes de llamar a Supabase',
  /if\(!est\.length\|\|!estado\.lista\)\{[\s\S]{0,280}showToast/.test(src));

console.log('\n=== El reporte también puede corregir la estructura ===');
const estructuraVieja = [
  { nombre: 'Prueba 1', peso: 20 },
  { nombre: 'Evaluación que ya no existe', peso: 20 },
  { nombre: 'Examen', peso: 60 },
];
if(editorEstructuraPresente){
  quitarFilaReporte(estructuraVieja, 1);
  agregarFilaReporte(estructuraVieja);
  aplicarNombreReporte(estructuraVieja, 2, 'Control 3');
  aplicarPesoReporte(estructuraVieja, 2, '20');
}
const estructuraCorregida = estructuraParaConsenso(estructuraVieja);
chk('quitar y agregar cambian solo el borrador que se reporta',
  editorEstructuraPresente && estructuraCorregida.length === 3 &&
  !estructuraCorregida.some(e => e.nombre === 'Evaluación que ya no existe') &&
  estructuraCorregida.some(e => e.nombre === 'Control 3') &&
  estadoReporte(estructuraVieja).lista);
chk('una misma pauta genera la misma huella aunque se agregue en otro orden',
  editorEstructuraPresente && huellaEstructura(estructuraCorregida) === huellaEstructura([...estructuraCorregida].reverse()));
chk('el modal permite editar nombres, quitar y agregar evaluaciones',
  /id="m-rep-nombre-\$\{i\}"/.test(src) &&
  /onclick="quitarReporteFila\(\$\{i\}\)"/.test(src) &&
  /onclick="agregarReporteFila\(\)"/.test(src));

console.log('\n=== Huella: la misma pauta escrita distinto ===');
const h = e => huellaEstructura(e);
const EXAMEN = { nombre: 'Examen', peso: 40 };
const tresControles = [{ nombre: 'Control 1', peso: 20 }, { nombre: 'Control 2', peso: 20 }, { nombre: 'Control 3', peso: 20 }, EXAMEN];
chk('Control 1, 2 y 3 de 20% suman con "Controles" de 60% en 3 casillas',
  h(tresControles) === h([{ nombre: 'Controles', peso: 60, slots: 3 }, EXAMEN]));
chk('mayúsculas, tildes, plural y número pegado no parten el grupo',
  h([{ nombre: 'interrogacion1', peso: 20 }, { nombre: 'Interrogación 2', peso: 20 }, { nombre: 'INTERROGACION 3', peso: 20 }, EXAMEN]) ===
  h([{ nombre: 'Interrogaciones', peso: 60, slots: 3 }, { nombre: 'examen', peso: 40 }]));
chk('el 20% repartido en tres (6,67 cada uno) es el mismo 20% con 3 casillas',
  h([{ nombre: 'Quiz 1', peso: 6.67 }, { nombre: 'Quiz 2', peso: 6.67 }, { nombre: 'Quiz 3', peso: 6.66 }, { nombre: 'Examen', peso: 80 }]) ===
  h([{ nombre: 'Quizzes', peso: 20, slots: 3 }, { nombre: 'Examen', peso: 80 }]));
chk('con pesos distintos NO se juntan: 30/35/35 no es un promedio en partes iguales',
  h([{ nombre: 'Prueba 1', peso: 30 }, { nombre: 'Prueba 2', peso: 35 }, { nombre: 'Prueba 3', peso: 35 }]) !==
  h([{ nombre: 'Pruebas', peso: 100, slots: 3 }]));
chk('dos numeradas no alcanzan para agruparse',
  h([{ nombre: 'Control 1', peso: 10 }, { nombre: 'Control 2', peso: 10 }, { nombre: 'Examen', peso: 80 }]) !==
  h([{ nombre: 'Controles', peso: 20, slots: 2 }, { nombre: 'Examen', peso: 80 }]));
chk('una numerada con compuerta propia no se esconde dentro del grupo',
  h([{ nombre: 'Prueba 1', peso: 20, min: 3, cap: 3.9 }, { nombre: 'Prueba 2', peso: 20 }, { nombre: 'Prueba 3', peso: 20 }, EXAMEN]) !==
  h([{ nombre: 'Pruebas', peso: 60, slots: 3 }, EXAMEN]));
chk('distinta cantidad de casillas sigue siendo otra pauta',
  h([{ nombre: 'Talleres', peso: 10, slots: 11 }, { nombre: 'Examen', peso: 90 }]) !==
  h([{ nombre: 'Talleres', peso: 10, slots: 12 }, { nombre: 'Examen', peso: 90 }]));
chk('el orden en que se escribieron no cambia la huella',
  h(tresControles) === h([...tresControles].reverse()));
chk('una fila en 0% guardada antes del #272 no separa el reporte',
  h([...tresControles, { nombre: 'X', peso: 0 }]) === h(tresControles));
chk('la ficha compara con la huella calculada acá, no con la del servidor',
  /huellaEstructura\(estructuraParaConsenso\(c\.estructura\)\)!==mine/.test(src) && !/c\.huella!==mine/.test(src));

console.log('\n=== La huella la decide el servidor ===');
const fnHuella = sql.slice(sql.indexOf('create or replace function public.huella_catalogo'), sql.indexOf('create or replace function public.submit_catalog_report'));
chk('el servidor calcula la huella desde la estructura al guardar e ignora la del cliente',
  (sql.match(/huella = public\.huella_catalogo\(p_estructura\)/g) || []).length === 1 &&
  /p_estructura, public\.huella_catalogo\(p_estructura\), nullif/.test(sql) && !/huella = p_huella|p_estructura, p_huella,/.test(sql));
chk('la función del servidor aplica las mismas reglas: 0% fuera, singular, 3+ del mismo peso',
  /peso'\)::numeric > 0/.test(fnHuella) && /\(\[lrndjz\]\)e\$/.test(fnHuella) &&
  /having count\(\*\) >= 3 and max\(peso\) - min\(peso\) <= 0\.011/.test(fnHuella) && /collate "C"/.test(fnHuella));
chk('el consenso agrupa solo por ramo y huella, no por el texto de la estructura',
  /group by 1, 2\s+having count\(distinct cr\.user_id\) >= 3/.test(consensoSql()) && !/group by [^\n]*cr\.estructura/.test(sql));
chk('los reportes existentes se recalculan sin tocar su estructura',
  /update public\.catalog_reports\s+set huella = coalesce\(public\.huella_catalogo\(estructura\), ''\)\s+where huella is distinct from/.test(sql));
function consensoSql() { return sql.slice(sql.indexOf('create or replace function public.catalog_consensus')); }

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
