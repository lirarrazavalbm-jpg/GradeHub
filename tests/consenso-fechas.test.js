// El consenso de fechas aprende solo de decisiones explícitas de estudiantes.
// Una fecha del catálogo o sugerida por el propio consenso nunca puede volver a
// contarse: ese eco haría que una sola fuente pareciera respaldo de cinco personas.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js', 'engine.js', 'app.js', 'render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');
const sql = fs.readFileSync(raiz + 'supabase/date_consensus.sql', 'utf8');
const css = fs.readFileSync(raiz + 'styles.css', 'utf8');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '', hash: '' }, history: { replaceState() {} }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const val = n => vm.runInContext(n, ctx);

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== Identidad persistente del ramo ===');
const normalizado = val('normalize')({ramos:[
  {id:'uc1',nombre:'Cálculo I',origen:{tenant:'uc',carrera:'ING-PC'},categorias:[]},
  {id:'fen1',nombre:'Métodos Matemáticos',origen:{tenant:'fen',carrera:'IC'},categorias:[]},
]});
chk('UC persiste la sigla y FEN el nombre normalizado',
  normalizado.ramos[0].origen.ramoKey === 'MAT1610' &&
  normalizado.ramos[1].origen.ramoKey === 'metodos matematicos');
const CURSOS_UC=val('CURSOS_UC'),ramoKey=val('ramoKey');
chk('los cursos UC fuera de malla también persisten su sigla',
  CURSOS_UC.every(([sigla,nombre])=>ramoKey(nombre,'uc','ING-PC')===sigla));

console.log('\n=== Migración compatible de orígenes ===');
const legado = val('normalize')({ramos:[{id:'r1',nombre:'Ramo manual',categorias:[
  {id:'c1',nombre:'Prueba',peso:50,fecha:'2026-09-10',hora:'14:00',notas:[]},
]}]}).ramos[0].categorias[0];
chk('una fecha legada no se atribuye a una persona sin confirmación',
  legado.fechaOrigen === 'desconocido' && legado.horaOrigen === 'desconocido');
chk('los conteos vivos del servidor no se guardan en gradehub_v1',
  !('fechaRespaldos' in legado) && !('horaRespaldos' in legado));
const PRESETS_UC=val('PRESETS_UC');
const oficial=Object.entries(PRESETS_UC).map(([nombre,def])=>{
  const evals=Array.isArray(def)?def:(def.evals||[]);
  const ev=evals.find(e=>e[2]&&e[2].fecha);return ev&&{nombre,ev};
}).find(Boolean);
const legadoOficial=val('normalize')({ramos:[{id:'r2',nombre:oficial.nombre,origen:{tenant:'uc',carrera:'ING-PC'},categorias:[
  {id:'c2',nombre:oficial.ev[0],peso:oficial.ev[1],fecha:oficial.ev[2].fecha,notas:[]},
]}]}).ramos[0].categorias[0];
chk('una coincidencia exacta con el programa sí se reconoce como catálogo',
  legadoOficial.fechaOrigen === 'catalogo');
chk('la migración se guarda localmente sin subir cien cuentas al desplegar',
  /function aplicarCacheConsensoFechas[\s\S]{0,900}guardarSoloLocal\(\)/.test(src) &&
  !/function aplicarCacheConsensoFechas[\s\S]{0,900}\bsave\(\)/.test(src));

console.log('\n=== Aplicación sin sobrescribir decisiones ===');
const ramos = [{id:'r1',nombre:'Cálculo I',origen:{tenant:'uc',carrera:'ING-PC',ramoKey:'MAT1610'},categorias:[
  {id:'vacia',nombre:'Interrogación 1',peso:20,fecha:null,notas:[]},
  {id:'propia',nombre:'Interrogación 2',peso:20,fecha:'2026-09-20',fechaOrigen:'usuario',notas:[]},
  {id:'quitada',nombre:'Interrogación 3',peso:20,fecha:null,fechaQuitada:true,notas:[]},
  {id:'grupo',nombre:'Laboratorio',peso:10,fecha:null,notas:[
    {id:'lab1',nombre:'Lab 1',valor:null,peso:1,fecha:null},
  ]},
]}];
const filas = [
  {ramo_key:'MAT1610',categoria_key:'interrogacion 1',nota_key:null,fecha:'2026-09-24',fecha_respaldos:5,hora:'14:00',hora_respaldos:5},
  {ramo_key:'MAT1610',categoria_key:'interrogacion 2',nota_key:null,fecha:'2026-09-25',fecha_respaldos:7,hora:null,hora_respaldos:null},
  {ramo_key:'MAT1610',categoria_key:'interrogacion 3',nota_key:null,fecha:'2026-09-26',fecha_respaldos:8,hora:null,hora_respaldos:null},
  {ramo_key:'MAT1610',categoria_key:'laboratorio',nota_key:'lab 1',fecha:'2026-09-27',fecha_respaldos:6,hora:'09:30',hora_respaldos:5},
];
const resultado = val('aplicarConsensoFechas')(ramos, filas);
chk('una categoría vacía recibe fecha y hora sin convertirse en voto',
  ramos[0].categorias[0].fecha === '2026-09-24' &&
  ramos[0].categorias[0].hora === '14:00' &&
  ramos[0].categorias[0].fechaOrigen === 'consenso' &&
  ramos[0].categorias[0].horaOrigen === 'consenso');
chk('una nota con fecha propia usa la misma regla',
  ramos[0].categorias[3].notas[0].fecha === '2026-09-27' &&
  ramos[0].categorias[3].notas[0].fechaOrigen === 'consenso');
chk('crear evaluaciones después de cargar la RPC vuelve a aplicar el consenso antes de guardar',
  /function confirmAddCat[\s\S]{0,1800}aplicarCacheConsensoFechas\(\{guardarLocal:false,refrescar:false\}\)[\s\S]{0,120}save\(\)/.test(src) &&
  /function confirmAddNota[\s\S]{0,1800}aplicarCacheConsensoFechas\(\{guardarLocal:false,refrescar:false\}\)[\s\S]{0,160}save\(\)/.test(src));
chk('una fecha distinta se sugiere y no se pisa',
  ramos[0].categorias[1].fecha === '2026-09-20' && resultado.sugerencias.size === 1);
chk('fechaQuitada veta tanto relleno como sugerencia',
  ramos[0].categorias[2].fecha === null && resultado.sugerencias.size === 1);

console.log('\n=== La RPC agrega, no expone blobs ===');
chk('solo cuenta fechas y horas cuyo origen es usuario',
  /fecha_origen\s*=\s*'usuario'/.test(sql) && /hora_origen\s*=\s*'usuario'/.test(sql));
chk('cuatro personas no bastan y cinco sí',
  (sql.match(/count\(distinct user_id\)/g)||[]).length >= 2 &&
  (sql.match(/having count\(distinct user_id\) >= 5/g)||[]).length >= 2);
chk('fecha y hora se consensúan por separado',
  /date_votes[\s\S]*hour_votes/.test(sql) && /hora_respaldos/.test(sql));
chk('un empate máximo no elige fecha ni hora al azar',
  (sql.match(/having count\(\*\) = 1/g)||[]).length === 2);
const firma = sql.slice(sql.indexOf('returns table'), sql.indexOf('language sql', sql.indexOf('returns table')));
chk('la salida no contiene usuarios ni calificaciones',
  /fecha_respaldos integer[\s\S]*hora_respaldos integer/.test(firma) &&
  !/user_id|valor/.test(firma));
chk('la función exige sesión y no queda abierta a anon',
  /auth\.uid\(\)/.test(sql) && /revoke all on function public\.date_consensus\(text\) from public, anon/.test(sql) &&
  /grant execute on function public\.date_consensus\(text\) to authenticated/.test(sql));

console.log('\n=== Confirmar saca a una fecha de desconocido ===');
const item = {fecha:'2026-09-10',hora:'14:00',fechaOrigen:'desconocido',horaOrigen:'desconocido'};
val('marcarFechaUsuario')(item, '2026-09-10', '14:00');
chk('editar o confirmar la fecha la convierte en aporte explícito',
  item.fechaOrigen === 'usuario' && item.horaOrigen === 'usuario');
chk('una fecha legada ofrece una salida visible para confirmarla',
  /fechaOrigen==='desconocido'[\s\S]{0,300}confirmarFechaActual/.test(src));
chk('el indicador no obliga a desbordar una fila angosta',
  /\.nota-row-name\{[^}]*min-width:0[^}]*text-overflow:ellipsis/.test(css) &&
  /\.nota-row\{[^}]*flex-wrap:wrap/.test(css) &&
  /\.fecha-consenso-chip\{[^}]*white-space:nowrap/.test(css));

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
