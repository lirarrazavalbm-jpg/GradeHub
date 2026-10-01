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
  // Una caída de la métrica auxiliar también reintenta. La segunda llamada
  // de alcance puede devolver false (ya cobrada) y aun así completa el gráfico.
  ctx.__banner2={isConnected:true};ctx.__anuncio2={id:'anuncio-metrica',publicado_at:'2026-09-30T12:00:00Z'};
  let alcance2=0,metrica2=0;
  ctx.__alcance2=async()=>{alcance2++;return alcance2===1?true:false;};
  ctx.__metrica2=async()=>{metrica2++;return metrica2===1?null:true;};
  vm.runInContext('registrarAlcanceAnuncio=__alcance2;registrarMetricaAnuncio=__metrica2;observarRecomendacionClase(__banner2,__anuncio2,"MAT1620")',ctx);
  const obs2=observers.at(-1);obs2.cb([{isIntersecting:true,intersectionRatio:.5}]);
  t=[...timers.values()][0];timers.clear();await t.fn();
  t=[...timers.values()][0];assert.equal(t.ms,5000);timers.clear();await t.fn();
  assert.equal(alcance2,2);assert.equal(metrica2,2);assert.equal(obs2.desconectado,true);
  // Fallar la carga de Inicio no debe cachearse como "sin avisos".
  ctx.__fallar=()=>Promise.reject(Error('sin red'));
  vm.runInContext('cargarAnunciosClases=__fallar;cargarAnunciosRecomendacion("uc",()=>{})',ctx);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('anunciosRecomendacion.lista',ctx),null);
  ctx.__ok=()=>Promise.resolve([{id:'anuncio-nuevo'}]);
  vm.runInContext('cargarAnunciosClases=__ok;cargarAnunciosRecomendacion("uc",()=>{})',ctx);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('anunciosRecomendacion.lista[0].id',ctx),'anuncio-nuevo');
  console.log('OK recomendación reintenta el alcance sin duplicar la impresión auxiliar');
})().catch(e=>{console.error(e);process.exitCode=1;});
