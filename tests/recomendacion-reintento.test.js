const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8');
const timers=new Map(),observers=[];let siguiente=0,alcances=0,metricas=0;
const ctx={console,Intl,currentUser:{id:'estudiante-sintetico'},
  setTimeout(fn,ms){const id=++siguiente;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
  IntersectionObserver:class{constructor(cb,options){this.cb=cb;this.options=options;observers.push(this);}observe(){}disconnect(){this.desconectado=true;}}};
vm.createContext(ctx);vm.runInContext(src,ctx);
ctx.__banner={isConnected:true};ctx.__anuncio={id:'anuncio-sintetico',publicado_at:'2026-09-30T12:00:00Z'};
ctx.__alcance=async()=>{alcances++;return alcances===1?null:true;};
ctx.__metrica=()=>{metricas++;return Promise.resolve(true);};
vm.runInContext('registrarAlcanceAnuncio=__alcance;registrarMetricaAnuncio=__metrica;observarRecomendacionClase(__banner,__anuncio,"MAT1620")',ctx);
(async()=>{
  const obs=observers[0];assert.equal(obs.options.threshold[0],.5);
  obs.cb([{isIntersecting:true,intersectionRatio:.5}]);
  let t=[...timers.values()][0];assert.equal(t.ms,1000);timers.clear();await t.fn();
  t=[...timers.values()][0];assert.equal(t.ms,5000);timers.clear();await t.fn();
  assert.equal(alcances,2);assert.equal(metricas,1);assert.equal(obs.desconectado,true);
  console.log('OK recomendación reintenta el alcance sin duplicar la impresión auxiliar');
})().catch(e=>{console.error(e);process.exitCode=1;});
