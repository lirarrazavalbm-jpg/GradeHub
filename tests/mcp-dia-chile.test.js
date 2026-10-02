// UTC cambia de fecha antes que Chile: un examen de hoy no es uno pasado.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function servidor(instante,estado){
  const fijo=Date.parse(instante),llamadas=[];
  class Reloj extends Date{constructor(...args){super(...(args.length?args:[fijo]));}static now(){return fijo;}}
  const ctx={console,Date:Reloj,Intl,Response,structuredClone,module:{exports:{}},HERRAMIENTAS:[],NOMBRES:['resumen_para_hoy','estado_semestre','evaluaciones_proximas'],
    fetch:async(url,opts)=>{llamadas.push({url,opts});return {ok:true,json:async()=>structuredClone(estado)};}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../engine.js','utf8'),ctx);
  ctx.motorCompartido=ctx.module.exports;
  vm.runInContext(fs.readFileSync(__dirname+'/../functions/mcp/[[ruta]].js','utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx);
  return {llamadas,async llamar(name){const r=await ctx.onRequestPost({params:{ruta:['a'.repeat(64)]},request:{json:async()=>({id:1,method:'tools/call',params:{name,arguments:{dias:1}}})}});const b=await r.json();assert.equal(b.error,undefined);return JSON.parse(b.result.content[0].text);}};
}
(async()=>{
  for(const [instante,hoy] of [
    ['2026-10-02T01:30:00Z','2026-10-01'],['2026-06-02T02:30:00Z','2026-06-01'],
    ['2026-01-01T01:30:00Z','2025-12-31'],['2026-09-06T03:30:00Z','2026-09-05'],
    ['2026-04-05T02:30:00Z','2026-04-04'],['2026-10-02T03:01:00Z','2026-10-02'],
  ]){
    const manana=new Date(Date.parse(hoy+'T00:00:00Z')+864e5).toISOString().slice(0,10),fuera=new Date(Date.parse(hoy+'T00:00:00Z')+2*864e5).toISOString().slice(0,10);
    const estado={ramos:[{id:'r',nombre:'Ramo sintético',categorias:[hoy,manana,fuera].map((fecha,i)=>({id:'c'+i,nombre:'Prueba '+i,peso:100/3,fecha,notas:[]})),gates:[]}]};
    const antes=JSON.stringify(estado),s=servidor(instante,estado);
    const resumen=await s.llamar('resumen_para_hoy');
    assert.equal(resumen.fecha,hoy,instante+': fecha civil chilena');
    assert.equal(resumen.hoy.length,1);assert.equal(resumen.hoy[0].fecha,hoy);assert.equal(resumen.porRegistrar.length,0);
    assert.deepEqual(resumen.proximas.map(x=>x.fecha),[hoy,manana]);
    assert.deepEqual((await s.llamar('estado_semestre')).proximas.map(x=>x.fecha),[hoy,manana]);
    assert.deepEqual((await s.llamar('evaluaciones_proximas')).map(x=>x.fecha),[hoy,manana]);
    assert.equal(JSON.stringify(estado),antes,'solo lectura, ninguna fecha guardada cambia');
    assert.equal(s.llamadas.length,3);assert.ok(s.llamadas.every(x=>x.url.endsWith('/agente_datos')));
  }
  console.log('OK: día chileno, medianoche, verano/invierno, cambio de año y horario');
})().catch(e=>{console.error(e);process.exitCode=1;});
