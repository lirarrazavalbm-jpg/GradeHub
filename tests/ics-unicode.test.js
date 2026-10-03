// El .ics descargado conserva Unicode al plegar líneas de hasta 75 octetos.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const evento={ramo:{id:'r',nombre:'Introducción a la Economía y Organización '.repeat(4)+'📚'},
  cat:{id:'c',nombre:'Evaluación de síntesis; sección A, módulo 1',peso:100},fecha:'2026-10-03',pending:true};
const ctx={Date,TextEncoder,agendaEvents:()=>[evento],pesoEventoAgenda:()=>100,nombreEventoAgenda:()=>evento.cat.nombre,r2:x=>x};
vm.createContext(ctx);
for(const nombre of ['icsEscape','icsFold','isoOf','icsDate','icsDateTime','sumaUnaHora','icsDatePlus1','buildICS']){
  const i=src.indexOf('function '+nombre+'('),primera=src.slice(i,src.indexOf('\n',i));
  assert.ok(i>=0,nombre+' existe');
  vm.runInContext(primera.endsWith('}')?primera:src.slice(i,src.indexOf('\n}',i)+2),ctx);
}
const desplegar=t=>t.replace(/\r\n /g,'');
function comprobar(linea){
  const plegada=ctx.icsFold(linea),bytes=Buffer.from(plegada,'utf8');
  for(const [i,parte] of plegada.split('\r\n').entries()){
    assert.ok(Buffer.byteLength(parte,'utf8')<=75,'línea '+i+' excede 75 octetos: '+Buffer.byteLength(parte));
    if(i)assert.ok(parte.startsWith(' '),'continuación con espacio');
  }
  // Simula serializar/leer el archivo real: partir un surrogate pierde el emoji.
  assert.equal(desplegar(bytes.toString('utf8')),linea,'el contenido sobrevive al archivo UTF-8');
}
for(const linea of ['SUMMARY:Introducción a la Economía y Organización '.repeat(5),
  'SUMMARY:'+'a'.repeat(64)+'📚'+'b'.repeat(80),
  'DESCRIPTION:'+'áéíóú ñ '.repeat(35),'SUMMARY:'+'a'.repeat(67),
  'SUMMARY:'+'a'.repeat(68),'SUMMARY:', 'SUMMARY:e\u0301'.repeat(45)])comprobar(linea);

const antes=JSON.stringify(evento),ics=ctx.buildICS();
ics.split('\r\n').forEach(l=>assert.ok(Buffer.byteLength(l,'utf8')<=75,'exportación real supera el límite'));
const contenido=desplegar(Buffer.from(ics,'utf8').toString('utf8'));
assert.ok(contenido.includes('SUMMARY:'+ctx.icsEscape(evento.cat.nombre+' — '+evento.ramo.nombre)));
assert.ok(contenido.includes('DESCRIPTION:'+ctx.icsEscape('Vale 100% de '+evento.ramo.nombre+'.')));
assert.ok(contenido.includes('DESCRIPTION:'+ctx.icsEscape('Mañana: '+evento.cat.nombre+' — '+evento.ramo.nombre)));
assert.equal(JSON.stringify(evento),antes,'exportar no modifica el estado');
console.log('OK: ICS UTF-8 conserva tildes, emojis y escapes sin superar 75 octetos');
