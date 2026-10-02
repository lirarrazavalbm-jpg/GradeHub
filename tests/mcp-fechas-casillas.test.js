// La misma fecha por casilla debe llegar a todas las consultas de calendario.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const instante=Date.parse('2026-10-02T15:00:00Z');
class Reloj extends Date{constructor(...args){super(...(args.length?args:[instante]));}static now(){return instante;}}
const estado={ramos:[{id:'r',nombre:'Laboratorio sintético',gates:[],categorias:[
  {id:'c',nombre:'Informes',peso:70,slots:6,notas:[
    {id:'n0',nombre:'Informe 1',slot:0,valor:null,peso:1,fecha:'2026-10-02',hora:'09:00'},
    {id:'n1',nombre:'Informe 2',slot:1,valor:5,peso:1,fecha:'2026-10-03'},
    {id:'n2',nombre:'Informe 3',slot:2,valor:null,peso:1,fecha:'2026-10-20'},
    {id:'n3',nombre:'Sin fecha',slot:3,valor:null,peso:1},
  ]},
  {id:'e',nombre:'Examen',peso:30,fecha:'2026-10-04',hora:'10:00',notas:[]},
]}]};
const ctx={console,Date:Reloj,Response,module:{exports:{}},HERRAMIENTAS:[],NOMBRES:['resumen_para_hoy','estado_semestre','evaluaciones_proximas'],fetch:async()=>({ok:true,json:async()=>structuredClone(estado)})};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../engine.js','utf8'),ctx);ctx.motorCompartido=ctx.module.exports;
vm.runInContext(fs.readFileSync(__dirname+'/../functions/mcp/[[ruta]].js','utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx);
async function llamar(name){const r=await ctx.onRequestPost({params:{ruta:['a'.repeat(64)]},request:{json:async()=>({id:1,method:'tools/call',params:{name,arguments:{dias:2}}})}});const b=await r.json();assert.equal(b.error,undefined);return JSON.parse(b.result.content[0].text);}
(async()=>{
  const antes=JSON.stringify(estado),agenda=await llamar('evaluaciones_proximas'),semestre=await llamar('estado_semestre'),hoy=await llamar('resumen_para_hoy');
  assert.deepEqual(agenda.map(x=>x.evaluacion),['Informe 1','Informe 2','Examen']);
  assert.deepEqual(semestre.proximas,agenda,'estado_semestre no debe perder las fechas por casilla');
  assert.equal(semestre.ramos[0].proximaEvaluacion.evaluacion,'Informe 1');
  assert.equal(semestre.ramos[0].proximaEvaluacion.fecha,'2026-10-02');
  assert.deepEqual(hoy.proximas.map(({esHoy,...x})=>x),agenda);
  assert.deepEqual(hoy.hoy.map(x=>x.evaluacion),['Informe 1']);
  assert.equal(hoy.hoy[0].hora,'09:00');assert.equal(hoy.hoy[0].grupo,'Informes');
  assert.equal(hoy.proximas[1].rendida,true);
  assert.equal(JSON.stringify(estado),antes,'las consultas no alteran notas ni fechas guardadas');
  console.log('OK: calendario MCP consistente para categorías y fechas por casilla');
})().catch(e=>{console.error(e);process.exitCode=1;});
