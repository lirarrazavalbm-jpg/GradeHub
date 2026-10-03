// Cuentas sintéticas y reloj dentro de la ventana. Ejecuta el motor y renderer reales.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
let ahora=new Date(2026,11,21,12).getTime(),reducido=true;
class Reloj extends Date{constructor(...args){super(...(args.length?args:[ahora]));}static now(){return ahora;}}
const ids={},eventos={},timers=[],writes=[],downloads=[];
function el(){const subs=new Map(),attrs={},listeners={};return {style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false;}},dataset:{},children:[],inert:false,isConnected:true,disabled:false,innerHTML:'',textContent:'',scrollTop:0,clientWidth:375,
  addEventListener(k,fn){listeners[k]=fn;},listeners,setAttribute(k,v){attrs[k]=v;},removeAttribute(k){delete attrs[k];},getAttribute(k){return attrs[k];},
  querySelector(sel){if(!subs.has(sel))subs.set(sel,el());return subs.get(sel);},querySelectorAll(){return [];},
  appendChild(child){this.children.push(child);return child;},remove(){this.isConnected=false;},focus(){ctx.document.activeElement=this;},
  closest(){return null;},click(){downloads.push(this.download);}};}
const ctx={Date:Reloj,console,window:{addEventListener(){},matchMedia:q=>({matches:q.includes('reduced-motion')&&reducido,addEventListener(){},addListener(){}})},
 document:{getElementById:id=>ids[id]||(ids[id]=el()),createElement:el,addEventListener(k,fn){eventos[k]=fn;},removeEventListener(k){delete eventos[k];},documentElement:el(),querySelector:()=>el(),querySelectorAll:()=>[],body:el(),activeElement:null},
 localStorage:{getItem:()=>null,setItem:(...x)=>writes.push(x),removeItem:(...x)=>writes.push(x)},navigator:{},location:{origin:'',pathname:'/',hash:''},history:{replaceState(){}},
 setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame(){throw Error('no debe animar con Reducir movimiento');},
 URL:{createObjectURL:()=> 'blob:sintetico',revokeObjectURL(){}},getComputedStyle:()=>({getPropertyValue:()=>''})};
vm.createContext(ctx);for(const f of ['data.js','engine.js','app.js','app-session.js','render-main.js','render-agenda.js'])vm.runInContext(read(f),ctx,{filename:f});
writes.length=0; // Ignorar la comprobación inicial de disponibilidad de localStorage.
const run=s=>vm.runInContext(s,ctx),set=(k,v)=>{ctx.fixture=v;run(`${k}=fixture`);};
const cat=(id,peso,valor)=>({id,nombre:id,peso,directNota:true,notas:valor==null?[]:[{id:'n-'+id,nombre:'Evaluación '+id,valor,peso:1}]});
const ramo=(id,valor=5,creditos=null)=>({id,nombre:'Ramo '+id,color:'#456789',creditos,origen:null,categorias:[cat(id,100,valor)],gates:[]});
const mostrar=(rs,tenant='uc')=>{set('S',{...run('freshState()'),tenant,ramos:rs,userName:'Nombre Privado',historial:[]});return run('datosWrapped(S.ramos)');};
const check=(nombre,fn)=>{fn();console.log('  OK   '+nombre);};
(async()=>{
 check('cuentas límite conservan las cifras de ramoAvg/gpa sin NaN ni undefined',()=>{
  for(const tenant of ['uc','fen','uai','uandes'])for(const rs of [[],[ramo('uno')],[ramo('uno',2),ramo('dos',3)],[ramo('uno',3.95,10),ramo('dos',6,20)],[ramo('manual',4,null)]]){
   const antes=JSON.stringify(rs),d=mostrar(rs,tenant);assert.equal(JSON.stringify(rs),antes);
   if(!rs.length){assert.equal(d,null);assert.equal(run('ramosWrapped()'),null);continue;}
   assert.equal(d.gpa,run('gpa(S.ramos)'));
   for(const x of d.ranking){const r=rs.find(r=>r.nombre===x.nombre);ctx.fixture=r;assert.equal(x.avg,run('ramoAvg(fixture,undefined,S.ramos)'));}
   assert.equal(d.aprobando,rs.filter(r=>{ctx.fixture=r;return run('notaAprobada(ramoAvg(fixture))');}).length);
   assert.doesNotMatch(JSON.stringify(run('slidesWrapped(datosWrapped(S.ramos),null,semester())')),/NaN|undefined/);
   if(rs.length===1)assert.equal(d.dificil,null);
  }
 });
 check('eximición sintética usa el motor, sin inventar la nota de examen',()=>{
  const r=ramo('eximido');r.categorias=[cat('Presentación',70,5.5),cat('Examen',30,null)];r.eximicionConfirmada=true;
  run("PRESETS_UC['Ramo eximido']={eximicion:{evaluacion:'Examen',segun:['Presentación'],min:5,ignoraDescartes:true,requiereConfirmacion:true}}");
  r.origen={tenant:'uc',carrera:'ING-PC'};const d=mostrar([r]);
  assert.equal(run('estadoEximicion(S.ramos[0]).activa'),true);assert.equal(d.gpa,run('gpa(S.ramos)'));assert.equal(d.nNotas,1);
 });
 check('inasistencia justificada usa el mismo traspaso del motor',()=>{
  const r=ramo('inasistencia');r.categorias=[cat('control',20,null),cat('examen',30,5),cat('prueba',50,5)];
  r.reglasAusenciaJustificadaUsuario={declaradaPor:'estudiante',rezagos:[],reemplazos:[],traspasos:[{desdeId:'control',haciaId:'examen'}]};r.ausenciasJustificadas=['control'];
  const d=mostrar([r]);assert.equal(d.gpa,run('gpa(S.ramos)'));assert.equal(d.gpa,5);assert.equal(d.nNotas,2);
 });
 check('no afirma cierre de un ramo todavía pendiente ni celebra todos reprobados',()=>{
  const r=ramo('pendiente');r.categorias=[cat('control',50,3),cat('examen',50,null)];mostrar([r]);
  const slides=JSON.stringify(run('slidesWrapped(datosWrapped(S.ramos),null,semester())'));assert.doesNotMatch(slides,/Cerraste|sacaste adelante|sobre el 4,0/);assert.match(slides,/con promedio de aprobación/);
 });
 check('historial sin etiqueta no imprime undefined ni inventa un período',()=>{
  mostrar([]);set('S.historial',[{ramos:[ramo('archivado')]}]);assert.equal(run('ramosWrapped().label'),'Semestre archivado');
 });
 check('fuera de ventana ni hash ni apertura directa revelan Wrapped',()=>{
  mostrar([ramo('uno')]);ahora=new Date(2026,11,19,23,59).getTime();ctx.location.hash='#wrapped';run('renderWrappedHome()');assert.equal(ids['home-wrapped'].innerHTML,'');
  assert.equal(ids['home-wrapped'].style.display,'none');
 });
 await run('abrirWrapped()');assert.equal(run('_wrapped'),null);assert.equal(run('_wrappedAbriendo'),false);
 ahora=new Date(2026,11,20).getTime();assert.equal(run('wrappedDisponible()'),true);
 ahora=new Date(2027,1,28,23,59).getTime();assert.equal(run('wrappedDisponible()'),true);
 ahora=new Date(2027,2,1).getTime();assert.equal(run('wrappedDisponible()'),false);
 ahora=new Date(2026,11,21).getTime();
 // RPC opcionales: solo proyecciones numéricas válidas, mínimo cinco.
 set('currentUser',{id:'sintetico',email:'privado-sintetico@example.invalid'});run('subirNotasCurso=async()=>{};cargarPosicionesCurso=async()=>({});invalidarPosicionesCurso=()=>{}');
 set('supabaseClient',{rpc:async()=>({error:{message:'function does not exist'}})});
 assert.equal(JSON.stringify(await run('comparacionWrapped()')),'{}');
 ctx.cargarPosicionesCurso=async()=>({uno:{total:5,mejorQue:75}});
 assert.equal(JSON.stringify(await run('comparacionWrapped()')),'{"curso":{"ramo":"Ramo uno","total":5,"mejorQue":75}}','la RPC de universidad ausente conserva la pantalla del curso');
 ctx.cargarPosicionesCurso=async()=>({});
 check('comparación rechaza grupos pequeños y cifras no finitas',()=>{
  for(const f of [{total:4,mejorQue:80},{total:5,mejorQue:NaN},{total:5,mejorQue:101},{total:undefined,mejorQue:0}])assert.equal(ctx.posicionWrappedValida(f),false);
  assert.equal(ctx.posicionWrappedValida({total:5,mejorQue:0}),true);
 });
 set('supabaseClient',{rpc:async()=>({data:[{total:5,mejor_que:75,user_id:'no-proyectar'}]})});
 assert.equal(JSON.stringify(await run('comparacionWrapped()')),'{"uni":{"total":5,"mejorQue":75}}');
 console.log('  OK   RPC ausente funciona sin pantalla ni error; solo proyecta agregados');
 let resolverCurso;ctx.cargarPosicionesCurso=()=>new Promise(resolve=>{resolverCurso=resolve;});
 let invalidaciones=0;ctx.invalidarPosicionesCurso=()=>{invalidaciones++;};
 const cursoPendiente=run('comparacionWrapped()');await Promise.resolve();await Promise.resolve();
 set('currentUser',{id:'otra-cuenta'});resolverCurso({});assert.equal(await cursoPendiente,null);assert.equal(invalidaciones,2,'una respuesta de cursos de otra cuenta no deja caché compartida');
 set('currentUser',{id:'sintetico'});ctx.cargarPosicionesCurso=async()=>({});
 console.log('  OK   cambio de cuenta invalida también una caché de cursos tardía');
 let terminar;set('supabaseClient',{rpc:()=>new Promise(resolve=>{terminar=resolve;})});
 const pendiente=run('comparacionWrapped()');for(let i=0;i<20&&!terminar;i++)await Promise.resolve();assert.equal(typeof terminar,'function');
 set('currentUser',{id:'otro'});terminar({data:[{total:5,mejor_que:99}]});assert.equal(await pendiente,null);
 console.log('  OK   una respuesta de otra cuenta se descarta');
 // Una apertura pendiente no puede duplicarse ni abrir tras salir de la ventana.
 mostrar([ramo('uno')]);set('currentUser',null);run('comparacionWrapped=()=>new Promise(resolve=>{resolverComparacion=resolve})');
 const apertura=run('abrirWrapped()');assert.equal(run('_wrappedAbriendo'),true);await run('abrirWrapped()');assert.equal(run('_wrapped'),null);
 ahora=new Date(2027,2,1).getTime();run('resolverComparacion(null)');await apertura;assert.equal(run('_wrapped'),null);
 console.log('  OK   apertura única y guarda de fecha tras una respuesta lenta');
 ahora=new Date(2026,11,21).getTime();run('comparacionWrapped=async()=>null');
 const foco=el();ctx.document.activeElement=foco;const fondo=el(),yaInert=el();yaInert.inert=true;ctx.document.body.children=[fondo,yaInert];
 await run('abrirWrapped()');assert.equal(fondo.inert,true);assert.equal(yaInert.inert,true);
 check('Tab permanece en el modal y Espacio respeta Compartir',()=>{
  const ov=run('_wrapped.ov'),a=el(),b=el();ov.querySelectorAll=()=>[a,b];ctx.document.activeElement=b;let prevenido=false;
  ctx.teclaWrapped({key:'Tab',preventDefault(){prevenido=true;}});assert.ok(prevenido);assert.equal(ctx.document.activeElement,a);
  const i=run('_wrapped.i');ctx.teclaWrapped({key:' ',target:{closest:()=>a},preventDefault(){throw Error('Espacio secuestrado');}});assert.equal(run('_wrapped.i'),i);
 });
 const ov=run('_wrapped.ov');ctx.arrastreWrapped(ov);
 ov.listeners.touchstart({touches:[{clientY:0}],timeStamp:0});ov.listeners.touchmove({touches:[{clientY:160}],timeStamp:100});
 assert.equal(ov.style.transform,undefined);ov.listeners.touchend();assert.equal(run('_wrapped'),null);assert.equal(fondo.inert,false);assert.equal(yaInert.inert,true);assert.equal(ctx.document.activeElement,foco);
 const cancelado=el();ctx.arrastreWrapped(cancelado);reducido=false;
 cancelado.listeners.touchstart({touches:[{clientY:0}],timeStamp:0});cancelado.listeners.touchmove({touches:[{clientY:60}],timeStamp:100});
 assert.match(cancelado.style.transform,/translateY/);cancelado.listeners.touchcancel();assert.equal(cancelado.style.transform,'');
 reducido=true;console.log('  OK   touchcancel devuelve la historia a su lugar');
 console.log('  OK   Reducir movimiento: arrastre sin transform y cierre inmediato, restaura foco/inert');
 // Al retroceder desde Compartir, el repaint retira el botón enfocado del DOM.
 // Modelar esa pérdida reproduce lo que hace el navegador, sin compartir nada.
 const pintarAntes=ctx.pintarWrapped,anterior=el(),siguiente=el(),cerrar=el();
 const historia=el(),navegacion=el();
 navegacion.querySelector=sel=>sel==='[data-paso="-1"]'?anterior:sel==='[data-paso="1"]'?siguiente:cerrar;
 const enfocado=el();enfocado.closest=sel=>sel==='.wrapped-slide'?historia:null;
 ctx.pintarWrapped=()=>{ctx.document.activeElement=ctx.document.body;};
 set('_wrapped',{ov:navegacion,slides:[{},{}],i:1});ctx.document.activeElement=enfocado;
 ctx.pasarWrapped(-1);assert.equal(ctx.document.activeElement,anterior,'retroceder conserva el foco dentro del Wrapped');
 set('_wrapped',{ov:navegacion,slides:[{},{}],i:0});ctx.document.activeElement=enfocado;
 ctx.pasarWrapped(1);assert.equal(ctx.document.activeElement,siguiente,'avanzar vuelve al control de navegación correspondiente');
 ctx.pintarWrapped=()=>{};ctx.document.activeElement=cerrar;
 ctx.pasarWrapped(-1);assert.equal(ctx.document.activeElement,cerrar,'un control persistente conserva su foco');
 ctx.pasarWrapped(-1);assert.equal(ctx.document.activeElement,cerrar,'retroceder en la primera historia no salta de foco');
 ctx.pintarWrapped=()=>{set('_wrapped',null);ctx.document.activeElement=foco;};
 set('_wrapped',{ov:navegacion,slides:[{},{}],i:1});ctx.document.activeElement=enfocado;
 ctx.pasarWrapped(-1);assert.equal(ctx.document.activeElement,foco,'si la historia se cierra al repintar, no vuelve a enfocar el overlay retirado');
 ctx.pintarWrapped=pintarAntes;
 console.log('  OK   cambio de historia restaura solo el foco retirado y conserva navegación persistente');
 // Compartir se llama sin esperar ninguna promesa: requisito de Safari iOS.
 const archivo={name:'mi-semestre-gradehub.png',type:'image/png'};set('_wrapped',{ov:el(),archivo,imagen:new Promise(()=>{}),slides:[],i:0});
 let invocado=false;ctx.navigator.canShare=()=>true;ctx.navigator.share=()=>{invocado=true;return Promise.resolve();};
 const share=ctx.compartirWrapped();assert.equal(invocado,true);await share;
 ctx.navigator.share=()=>Promise.reject({name:'NotAllowedError'});await ctx.compartirWrapped();assert.equal(downloads.at(-1),archivo.name);
 const n=downloads.length;ctx.navigator.share=()=>Promise.reject({name:'AbortError'});await ctx.compartirWrapped();assert.equal(downloads.length,n);
 ctx.navigator.canShare=()=>false;await ctx.compartirWrapped();assert.equal(downloads.length,n+1);
 set('_wrapped',{ov:el(),archivo:null,imagen:new Promise(()=>{})});invocado=false;await ctx.compartirWrapped();assert.equal(invocado,false);
 console.log('  OK   compartir síncrono, descarga cuando no se permite y cancelación sin descarga');
 // El botón permanece inactivo hasta disponer del File, incluso con canvas lento.
 const preparado=el();set('_wrapped',{ov:preparado,archivo:null,imagen:null,imagenTerminada:false});
 let resolverImagen;ctx.imagenWrapped=()=>new Promise(resolve=>{resolverImagen=resolve;});
 ctx.prepararImagenWrapped({});ctx.actualizarCompartirWrapped();
 assert.equal(preparado.querySelector('.wrapped-slide').querySelector('.wrapped-compartir').disabled,true);
 resolverImagen(archivo);await run('_wrapped.imagen');
 assert.equal(preparado.querySelector('.wrapped-slide').querySelector('.wrapped-compartir').disabled,false);
 assert.equal(run('_wrapped.archivo.name'),archivo.name);
 console.log('  OK   preparación lenta habilita compartir solo cuando el File está listo');
 mostrar([ramo('uno')]);const final=run('slidesWrapped(datosWrapped(S.ramos),null,semester()).at(-1)');assert.doesNotMatch(JSON.stringify(final),/Nombre Privado|privado-sintetico@example\.invalid|correo|email/);
 // Exportación sin Canvas.roundRect (Safari antiguo); nunca dibuja la identidad.
 const dibujado=[],curvas=[];
 const canvasCtx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(...x){curvas.push(x);},closePath(){},fill(){},stroke(){},clip(){},save(){},restore(){},drawImage(){},
  fillText(texto){dibujado.push(texto);},measureText:texto=>({width:texto.length*20}),createRadialGradient:()=>({addColorStop(){}})};
 const crear=ctx.document.createElement;let canvas;
 ctx.document.createElement=tipo=>tipo==='canvas'?(canvas={getContext:()=>canvasCtx,toBlob:fn=>fn(new Blob(['imagen-sintetica'],{type:'image/png'}))}):crear(tipo);
 ctx.Image=class{set src(x){this.onerror();}};
 ctx.DOMParser=class{parseFromString(html){return{body:{textContent:html.replace(/<[^>]*>/g,'')}};}};
 ctx.File=File;ctx.Blob=Blob;ctx.getComputedStyle=()=>({backgroundColor:'#0a1a1c',color:'#ffffff'});
 // Recuperar la función real, sustituida arriba solo para simular preparación lenta.
 const renderer=read('render-main.js');vm.runInContext(renderer.slice(renderer.indexOf('async function imagenWrapped('),renderer.indexOf('// Preparar fuera del gesto')),ctx);
 const image=await ctx.imagenWrapped(final);assert.equal(image.name,'mi-semestre-gradehub.png');assert.equal(canvas.width,1080);assert.equal(canvas.height,1920);
 assert.ok(curvas.length>=8);assert.doesNotMatch(dibujado.join(' '),/Nombre Privado|privado-sintetico@example\.invalid|correo|email/);assert.ok(dibujado.includes(final.big));
 console.log('  OK   imagen 1080×1920 sin identidad y fallback de roundRect para Safari');
 assert.equal(writes.length,0,'revisar Wrapped no escribe notas ni gradehub_v1');
 // Esta regresión se complementa con getAnimations y tamaños reales en Chrome.
 check('CSS apaga toda animación y conserva controles/safe areas',()=>{
  const css=read('styles.css');assert.match(css,/\.wrapped,\.wrapped \*,\.wrapped \*::before,\.wrapped \*::after\{animation:none!important;transition:none!important;/);
  assert.match(css,/\.wrapped-pasos button\{[^}]*min-width:44px;height:44px/);
  assert.match(css,/\.wrapped\{[^}]*background-color:#050608;/);assert.match(css,/\.home-wrapped\{[^}]*background-color:#06070a;/); // Safari sin colores modernos mantiene el texto blanco legible.
  const regla=css.match(/\.wrapped\{[^}]*\}/)[0];
  for(const lado of ['top','right','bottom','left'])assert.ok(regla.includes('safe-area-inset-'+lado));
 });
})().catch(e=>{console.error(e);process.exitCode=1;});
