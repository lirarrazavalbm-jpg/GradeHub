const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fuente=fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8');
const llamadas=[],avisos=[],ventanas=[],timers=[];
let fallarCobro=true,fallarMetrica=true;
const link={dataset:{contactar:'anuncio-sintetico',sigla:'MAT1620'},target:'_blank',href:'https://wa.me/56900000000',listeners:{},
  setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},addEventListener(k,f){this.listeners[k]=f;}};
const raiz={querySelectorAll(selector){return selector==='[data-contactar]'?[link]:[];}};
const ctx={console,Intl,currentUser:{id:'estudiante-sintetico'},showToast:(s,e)=>avisos.push({s,e}),
  window:{open(){const v={closed:false,location:{href:'about:blank'},close(){this.closed=true;}};ventanas.push(v);return v;}},
  supabaseClient:{rpc:async(n,p)=>{llamadas.push({n,p});if(n==='registrar_interaccion_anuncio'&&fallarCobro)return {data:null,error:{message:'sin red'}};
    if(n==='registrar_metrica_anuncio'&&fallarMetrica)return {data:null,error:{message:'sin red'}};
    return {data:true,error:null};}},
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length;}};
vm.createContext(ctx);vm.runInContext(fuente,ctx);vm.runInContext('activarTarjetasClases(__raiz)',Object.assign(ctx,{__raiz:raiz}));
(async()=>{
  let prevenido=false;
  await link.listeners.click({preventDefault(){prevenido=true;}});
  assert.equal(prevenido,true);
  assert.equal(ventanas[0].closed,true,'el contacto fallido cierra la pestaña vacía');
  assert.equal(ventanas[0].location.href,'about:blank');
  assert.match(avisos.at(-1).s,/No pudimos registrar el contacto/);
  assert.equal(llamadas.filter(x=>x.n==='registrar_metrica_anuncio').length,0,'no hay gráfico sin cobro confirmado');
  fallarCobro=false;
  await link.listeners.click({preventDefault(){}});
  assert.equal(llamadas.filter(x=>x.n==='registrar_interaccion_anuncio').length,2,'se reintenta el cobro');
  assert.equal(ventanas[1].location.href,link.href,'solo el cobro confirmado abre WhatsApp');
  assert.equal(llamadas.filter(x=>x.n==='registrar_metrica_anuncio').length,1);
  fallarMetrica=false;
  await link.listeners.click({preventDefault(){}});
  assert.equal(llamadas.filter(x=>x.n==='registrar_interaccion_anuncio').length,2,'no se duplica el contacto');
  assert.equal(llamadas.filter(x=>x.n==='registrar_metrica_anuncio').length,2,'se completa el gráfico pendiente');
  fallarCobro=true;
  const desde=llamadas.length;
  await vm.runInContext('registrarInteraccionMedida("otro-aviso","apertura","MAT1620")',ctx);
  const reintento=timers.at(-1);assert.equal(reintento.ms,5000);
  fallarCobro=false;
  await reintento.fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(llamadas.slice(desde).filter(x=>x.n==='registrar_interaccion_anuncio').length,2,'la apertura reintenta sola tras fallar la red');
  assert.equal(llamadas.slice(desde).filter(x=>x.n==='registrar_metrica_anuncio').length,1);
  console.log('OK contacto: sin falso éxito, reintento cobrable y métrica auxiliar deduplicada');
})().catch(e=>{console.error(e);process.exitCode=1;});
