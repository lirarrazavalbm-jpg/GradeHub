// El fin de un VEVENT debe ser posterior al inicio, también a las 23:xx.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/../app.js','utf8');
let evento;
const ctx={Date,agendaEvents:()=>[evento],pesoEventoAgenda:()=>100,nombreEventoAgenda:()=>evento.cat.nombre,r2:x=>x};
vm.createContext(ctx);
for(const nombre of ['icsEscape','icsFold','isoOf','icsDate','icsDateTime','sumaUnaHora','icsDatePlus1','buildICS']){
  // Las funciones de una línea se cierran en esa línea; las demás al inicio de línea.
  const i=app.indexOf('function '+nombre+'('),primera=app.slice(i,app.indexOf('\n',i));
  const codigo=primera.endsWith('}')?primera:app.slice(i,app.indexOf('\n}',i)+2);
  vm.runInContext(codigo,ctx);
}
const casos=[['2026-10-03','23:30','20261004T003000'],['2026-12-31','23:15','20270101T001500'],['2028-02-28','23:00','20280229T000000'],['2028-02-29','23:45','20280301T004500'],['2026-09-05','23:00','20260906T000000'],['2026-10-03','14:30','20261003T153000']];
for(const [fecha,hora,fin] of casos){
  evento={ramo:{id:'r',nombre:'Ramo sintético'},cat:{id:'c',nombre:'Evaluación',peso:100},fecha,hora,pending:true};
  const foto=JSON.stringify(evento),ics=ctx.buildICS();
  assert.match(ics,new RegExp('DTEND:'+fin),'fecha de término correcta para '+fecha+' '+hora);
  const inicio=ics.match(/DTSTART:(\d+T\d+)/)[1],termino=ics.match(/DTEND:(\d+T\d+)/)[1];
  assert.ok(termino>inicio,'el fin siempre es posterior');assert.equal(JSON.stringify(evento),foto);
  assert.doesNotMatch(ics,/TZID|DTSTART:[^\r\n]*Z/,'mantiene la hora local flotante');
}
evento={...evento,hora:null};assert.match(ctx.buildICS(),/DTEND;VALUE=DATE:20261004/);
console.log('OK: exportar ICS a las 23:xx termina al día siguiente sin cambiar datos');
