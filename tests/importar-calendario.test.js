// Importar un calendario no puede convertirse en "adivinar y cambiar cosas".
//
// El archivo llega de fuera, por lo que primero se valida como texto; después se
// propone una asociación por prefijo y ramo, y solo al confirmar se toca el
// estado. Estas fixtures son sintéticas: no contienen calendarios ni nombres de
// estudiantes reales.
const fs = require('fs'), vm = require('vm');
const raiz = __dirname + '/../';
const src = ['data.js','engine.js','app.js','render-agenda.js']
  .map(f => fs.readFileSync(raiz + f, 'utf8')).join('\n');

const stub = { style: { setProperty() {}, removeProperty() {} }, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {}, contains() { return false } }, value: '', innerHTML: '', textContent: '', focus() {}, select() {}, setAttribute() {}, removeAttribute() {}, getAttribute() { return null }, querySelectorAll() { return [] }, querySelector() { return stub }, clientWidth: 400, dataset: {}, click() {} };
const ctx = {
  window: { addEventListener() {}, matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }) },
  document: { getElementById: () => stub, createElement: () => stub, addEventListener() {}, documentElement: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute() { return null } }, querySelector: () => stub, querySelectorAll: () => [], body: stub },
  localStorage: { getItem() { return null }, setItem() {}, removeItem() {} },
  navigator: {}, location: { origin: '', pathname: '/', search: '', hash: '' }, history: { replaceState() {} }, setTimeout, clearTimeout, console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val = n => vm.runInContext(n,ctx);

let ok=0,fail=0;
const chk=(n,cond)=>{if(cond){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const falla=(fn)=>{try{fn();return false;}catch(e){return true;}};

const ics = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'SUMMARY:I1 Cálculo II',
  'DTSTART;VALUE=DATE:20260908',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:C2 Cálculo II',
  'DTSTART:20260915T090000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:I3 Cálculo II',
  'DTSTART;VALUE=DATE:20260922',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:C3 Cálculo II',
  'DTSTART;VALUE=DATE:20260924',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:EX Física I',
  'DTSTART;VALUE=DATE:20260930',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

val('S='+JSON.stringify({ramos:[{
  id:'r-calculo',nombre:'Cálculo II',categorias:[
    {id:'cat-i1',nombre:'Interrogación 1',peso:30,fecha:null,notas:[]},
    {id:'cat-casos',nombre:'Casos',peso:30,fecha:'2026-10-01',notas:[{id:'nota-c2',nombre:'Control 2',valor:null,peso:1,fecha:null}]},
    {id:'cat-i3',nombre:'Interrogación 3',peso:40,fecha:null,fechaQuitada:true,notas:[]},
    {id:'cat-quitada-nota',nombre:'Taller',peso:0,fecha:'2026-10-02',notas:[{id:'nota-c3',nombre:'Control 3',valor:null,peso:1,fecha:null,fechaQuitada:true}]},
  ]
}]}));

const preparar=val('prepararImportacionIcs');
const aplicar=val('aplicarPropuestasIcs');
const parsear=val('parseIcsCalendario');
const draft=preparar(ics);

console.log('\n=== El archivo se lee como calendario, no como texto confiable ===');
chk('parsea cinco eventos sintéticos', draft.length===5);
chk('rechaza un archivo basura antes de tocar el estado', falla(()=>parsear('esto no es un calendario')));
chk('rechaza eventos sin fecha', falla(()=>parsear('BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:I1 Cálculo II\nEND:VEVENT\nEND:VCALENDAR')));
const muchos=['BEGIN:VCALENDAR'];
for(let i=0;i<251;i++)muchos.push('BEGIN:VEVENT','SUMMARY:I1 Cálculo II','DTSTART:20260908','END:VEVENT');
muchos.push('END:VCALENDAR');
chk('limita la cantidad de eventos', falla(()=>parsear(muchos.join('\n'))));

console.log('\n=== El prefijo y el ramo proponen, no inventan ===');
chk('I1 Cálculo II encuentra Interrogación 1', draft[0].target==='r-calculo|cat-i1|');
chk('C2 Cálculo II encuentra una nota con fecha propia', draft[1].target==='r-calculo|cat-casos|nota-c2');
chk('una fecha quitada a propósito no se vuelve a ofrecer', draft[2].target===null);
chk('una fecha propia quitada tampoco se vuelve a ofrecer', draft[3].target===null);
chk('un ramo que no calza queda sin asignar', draft[4].target===null);

console.log('\n=== Solo lo elegido llega al estado ===');
const aplicadas=aplicar(draft);
chk('aplica solo las dos coincidencias revisables', aplicadas===2);
chk('la categoría recibe su fecha', val('S.ramos[0].categorias[0].fecha')==='2026-09-08');
chk('la nota recibe su fecha propia', val('S.ramos[0].categorias[1].notas[0].fecha')==='2026-09-15');
chk('la fecha quitada sigue ausente', val('S.ramos[0].categorias[2].fecha')===null&&val('S.ramos[0].categorias[2].fechaQuitada')===true);
chk('lo que no calza no se aplica solo', val('S.ramos[0].categorias[3].notas[0].fecha')===null);

const antes=val('JSON.stringify(S)');
chk('ni un destino forzado puede saltarse fechaQuitada',
  falla(()=>aplicar([{titulo:'I3 Cálculo II',fecha:'2026-09-22',target:'r-calculo|cat-i3|'}]))&&val('JSON.stringify(S)')===antes);

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
