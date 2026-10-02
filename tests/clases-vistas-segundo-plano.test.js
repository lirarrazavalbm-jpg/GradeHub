// Ver media tarjeta durante un segundo requiere que la página esté visible.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function arnes(){
  let ahora=0,id=0;const timers=new Map(),listeners=new Set(),observadores=[],llamadas=[];
  const card={isConnected:true,dataset:{catalogoAnuncio:'aviso'}},raiz={isConnected:true,querySelectorAll:()=>[card]};
  const ctx={console,currentUser:{id:'a'},supabaseClient:{},
    document:{getElementById:()=>null,visibilityState:'visible',addEventListener:(n,f)=>{if(n==='visibilitychange')listeners.add(f);},removeEventListener:(n,f)=>listeners.delete(f)},
    IntersectionObserver:class{constructor(fn){this.fn=fn;observadores.push(this);}observe(){}disconnect(){this.desconectado=true;}},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,hasta:ahora+ms});return id;},clearTimeout:n=>timers.delete(n)};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../marketplace.js','utf8'),ctx);
  ctx.__alcance=async()=>{llamadas.push('alcance');return true;};ctx.__metrica=async()=>{llamadas.push('metrica');return true;};ctx.__card=card;ctx.__raiz=raiz;
  vm.runInContext('registrarAlcanceAnuncio=__alcance;registrarMetricaAnuncio=__metrica;',ctx);
  return {ctx,card,llamadas,listeners,run:s=>vm.runInContext(s,ctx),
    intersectar:()=>observadores.at(-1).fn([{target:card,isIntersecting:true,intersectionRatio:0.75}]),
    ocultar:valor=>{ctx.document.visibilityState=valor?'hidden':'visible';for(const f of [...listeners])f();},
    async avanzar(ms){ahora+=ms;for(const [n,t] of [...timers])if(t.hasta<=ahora){timers.delete(n);await t.fn();}}};
}
(async()=>{
  for(const origen of ['catalogo','recomendacion']){
    const h=arnes();
    h.run(origen==='catalogo'?"observarImpresionesClases(__raiz,[{id:'aviso',ramos_siglas:['TEST100']}])":"observarRecomendacionClase(__card,{id:'aviso'},'TEST100')");
    h.intersectar();await h.avanzar(500);h.ocultar(true);await h.avanzar(2000);
    assert.equal(h.llamadas.length,0,origen+': estar en segundo plano no registra vista ni evento');
    h.ocultar(false);await h.avanzar(500);
    assert.equal(h.llamadas.length,0,'al volver exige un segundo visible completo');
    await h.avanzar(500);assert.deepEqual(h.llamadas,['alcance','metrica']);
    h.ocultar(true);h.ocultar(false);await h.avanzar(2000);
    assert.equal(h.llamadas.length,2,'volver no duplica una vista ya confirmada');
    if(origen==='catalogo'){
      h.run("observarImpresionesClases(__raiz,[{id:'aviso',ramos_siglas:['TEST100']}])");
      assert.equal(h.listeners.size,1,'reemplazar catálogo no acumula listeners');
    }else assert.equal(h.listeners.size,0,'la recomendación medida libera su listener');
  }
  console.log('OK: catálogo y recomendación solo miden segundos completos en primer plano');
})().catch(e=>{console.error(e);process.exitCode=1;});
