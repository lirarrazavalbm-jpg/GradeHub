const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../marketplace.js','utf8');
const privada={ramos:[{nombre:'No enviar',categorias:[{notas:[{valor:6.7}]}]}],userName:'Nombre privado',tenant:'uc',onboardingDone:true};
const e={id:'e',pregunta:'Pregunta sintética',tipo:'una',opciones:['A','B'],respuesta:null};
function contexto(){
  const llamadas=[],vistas=[],almacen=new Map([['gradehub_v1',JSON.stringify(privada)]]),ctx={console,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000011'},
    S:structuredClone(privada),currentUser:{id:'a'},navigator:{onLine:true},esc:x=>String(x??''),
    document:{visibilityState:'visible',activeElement:null,getElementById:()=>null,querySelector:()=>null,addEventListener(){},removeEventListener(){}},
    sessionStorage:{getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v)},
    localStorage:{getItem:k=>almacen.get(k)||null,setItem:(k,v)=>almacen.set(k,v),removeItem:k=>almacen.delete(k)},
    supabaseClient:{rpc:async(n,p)=>{llamadas.push({n,p});return {data:{encuesta:structuredClone(e),mostrar:true},error:null};}}};
  vm.createContext(ctx);vm.runInContext(source,ctx);ctx.abrirHojaEncuesta=x=>vistas.push(x);
  return {ctx,llamadas,vistas,almacen,run:s=>vm.runInContext(s,ctx)};
}
(async()=>{
  const a=contexto(),snapshot=JSON.stringify(a.ctx.S),cache=a.almacen.get('gradehub_v1');
  a.ctx.S.onboardingDone=false;await a.ctx.consultarEncuestaAlEntrar();assert.equal(a.llamadas.length,0);
  a.ctx.S.onboardingDone=true;a.ctx.marcarPrimeraSesionEncuesta('a');await a.ctx.consultarEncuestaAlEntrar();
  assert.equal(a.llamadas.length,1,'registra primera sesión en servidor');assert.equal(a.vistas.length,0);
  a.ctx.olvidarEncuestas();await a.ctx.consultarEncuestaAlEntrar();
  assert.equal(a.vistas.length,0,'recargar no muestra encuestas en la primera visita de una cuenta nueva');
  a.almacen.delete('gradehub_encuesta_primera_a');a.ctx.olvidarEncuestas();await a.ctx.consultarEncuestaAlEntrar();await a.ctx.consultarEncuestaAlEntrar();
  assert.equal(a.vistas.length,1,'no insiste en la misma visita después de cerrar');
  assert.equal(a.llamadas.length,3);
  assert.equal(a.llamadas[0].p.p_visita,a.llamadas[1].p.p_visita,'recargar conserva la visita en sessionStorage');
  assert.equal(JSON.stringify(a.ctx.S),snapshot);assert.equal(a.almacen.get('gradehub_v1'),cache);
  assert.ok(a.llamadas.every(x=>x.n==='encuesta_al_entrar'&&Object.keys(x.p).join()==='p_visita'),'no viajan notas, nombre, correo ni ramos');
  assert.match(a.ctx.entradaEncuestaHTML(),/Responder/);
  a.ctx.sesionEncuestasCambio('SIGNED_OUT');assert.equal(a.ctx.entradaEncuestaHTML(),'');
  for(const error of [{code:'PGRST202'},{code:'42P01'},new Error('Sin conexión')]){
    const x=contexto();x.ctx.supabaseClient.rpc=async()=>{if(error instanceof Error)throw error;return {error};};
    await x.ctx.consultarEncuestaAlEntrar();assert.equal(x.vistas.length,0);assert.equal(x.ctx.entradaEncuestaHTML(),'');
  }
  const offline=contexto();offline.ctx.navigator.onLine=false;await offline.ctx.consultarEncuestaAlEntrar();assert.equal(offline.llamadas.length,0);
  const oculta=contexto();oculta.ctx.document.visibilityState='hidden';await oculta.ctx.consultarEncuestaAlEntrar();assert.equal(oculta.llamadas.length,0);
  const lenta=contexto();let terminar;lenta.ctx.supabaseClient.rpc=()=>new Promise(r=>terminar=r);
  const pendiente=lenta.ctx.consultarEncuestaAlEntrar();lenta.ctx.currentUser={id:'b'};lenta.ctx.sesionEncuestasCambio('SIGNED_IN','b');
  terminar({data:{encuesta:e,mostrar:true}});await pendiente;
  assert.equal(lenta.vistas.length,0);assert.equal(lenta.ctx.entradaEncuestaHTML(),'');
  const reconecta=contexto();let responder;reconecta.ctx.supabaseClient.rpc=()=>new Promise(r=>responder=r);
  const peticion=reconecta.ctx.consultarEncuestaAlEntrar();reconecta.ctx.navigator.onLine=false;responder({data:{encuesta:e,mostrar:true}});await peticion;assert.equal(reconecta.vistas.length,0);
  const csv=a.ctx.csvResultadosEncuesta({pregunta:'Pregunta, con "comillas"',publico:'todos'}, {total:2,opciones:[{opcion:'A',total:1}],textos:[{texto:'=SUM(1,2)',total:1},{texto:'\n@comando',total:1}]});
  assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/"Pregunta, con ""comillas"""/);assert.match(csv,/"'=SUM\(1,2\)"/);assert.match(csv,/"'\n@comando"/);
  assert.doesNotMatch(csv,/user_id|correo|promedio|No enviar|Nombre privado/);
  console.log('OK: onboarding/primera sesión, una vez por visita, offline/SQL opcional, cambio de cuenta, privacidad y CSV');
})().catch(e=>{console.error(e);process.exitCode=1;});
