const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
let hoy=new Date(2026,11,21),pausas=0,writes=0;
class Fecha extends Date{constructor(...args){super(...(args.length?args:[hoy]));}}
function elemento(){const subs=new Map(),attrs={};return {innerHTML:'',hidden:true,children:[],style:{},dataset:{},classList:{add(){},remove(){}},isConnected:true,inert:false,scrollTop:0,
 addEventListener(){},setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k],focus(){},remove(){},closest:()=>null,pause(){pausas++;},
 querySelector(sel){if(sel==='video'&&!this.innerHTML.includes('<video')&&!subs.get('.wrapped-slide')?.innerHTML.includes('<video'))return null;if(!subs.has(sel))subs.set(sel,elemento());return subs.get(sel);},querySelectorAll:()=>[],appendChild(e){this.children.push(e);}};}
const ctx={Date:Fecha,URL,console,S:{tenant:'uc',userName:'Privado'},location:{origin:'https://gradehub.test'},currentUser:null,supabaseClient:null,
 esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),siglaDeRamo:r=>r.sigla||null,
 movimientoReducido:()=>true,track(){},setTimeout,clearTimeout,localStorage:{setItem(){writes++;}},
 document:{visibilityState:'visible',activeElement:null,body:elemento(),getElementById:()=>null,createElement:elemento,addEventListener(){},removeEventListener(){}}};
vm.createContext(ctx);vm.runInContext(read('render-main.js').split('// ─── WRAPPED:')[1].replace(/^.*?\n/,''),ctx);
const run=s=>vm.runInContext(s,ctx),clip={id:'sintetico',universidad:'uc',docente:'Docente de prueba',siglas:['SYN101'],nombres:[],video:'/media/saludo.mp4',poster:'/media/saludo.jpg',subtitulos:'/media/saludo.vtt',transcripcion:'Un mensaje sintético.',segundos:20};
const r={nombre:'Ramo sintético',sigla:'SYN101',origen:{tenant:'uc'}};
const seleccionar=(rs,tenant,lista)=>ctx.saludoWrapped(rs,tenant,lista);
(async()=>{
 assert.equal(seleccionar([r],'uc',[clip]),clip);
 for(const universidad of ['fen','uc','uai','uandes'])assert.equal(seleccionar([] ,universidad,[{...clip,universidad,siglas:[]}])?.universidad,universidad);
 assert.equal(seleccionar([r],'fen',[clip]),null);
 assert.equal(seleccionar([{...r,sigla:'SYN102'}],'uc',[clip]),null,'un homónimo con otra sigla no recibe el saludo');
 assert.equal(seleccionar([{...r,origen:{tenant:'fen'}}],'uc',[clip]),null,'ramo de otra universidad');
 const general={...clip,id:'general',siglas:[]},nombre={...clip,universidad:'uai',siglas:[],nombres:['Economía pública']};
 assert.equal(seleccionar([r],'uc',[general,clip]),clip,'prioriza el ramo sobre el general');
 assert.equal(seleccionar([{nombre:'  economia   publica '}],'uai',[nombre]),nombre,'ramos sin sigla: nombre exacto con tildes/espacios normalizados');
 assert.equal(seleccionar([{nombre:'Economía privada'}],'uai',[nombre]),null);
 const privado=[{...r,notas:[6.8],correo:'sintetico@example.invalid'}],antes=JSON.stringify(privado);
 seleccionar(privado,'uc',[clip]);assert.equal(JSON.stringify(privado),antes);assert.equal(writes,0);
 for(const cambio of [{segundos:31},{segundos:0},{transcripcion:''},{subtitulos:''},{video:'javascript:alert(1)'},{poster:'//otro.test/p.jpg'},{video:'https://user:password@otro.test/v.mp4'},{video:'https://otro.test/v.mp4?cuenta=a'},{nombres:null},{video:'https://otro.test/v.mp4'}])assert.equal(seleccionar([r],'uc',[{...clip,...cambio}]),null);
 assert.equal(seleccionar([r],'uc',null),null);assert.equal(seleccionar([r],'uc',[]),null);
 hoy=new Date(2026,11,19);assert.equal(seleccionar([r],'uc',[clip]),null);await ctx.abrirWrapped();assert.equal(run('_wrapped'),null);
 hoy=new Date(2027,2,1);assert.equal(seleccionar([r],'uc',[clip]),null);hoy=new Date(2026,11,21);
 const ov=elemento();ctx.fixture={ov,slides:[{k:'Inicio'},{tipo:'saludo',k:'Antes de cerrar',saludo:clip},{tipo:'final',k:'Cierre',filas:[]}],i:0};run('_wrapped=fixture');
 ctx.pintarWrapped();assert.equal(ov.querySelector('[data-paso="-1"]').disabled,true);
 ctx.desplegarHistoriasWrapped();assert.equal(ov.querySelector('.wrapped-historias-lista').hidden,false);
 let salto;const original=ctx.pasarWrapped;ctx.pasarWrapped=n=>salto=n;
 ctx.elegirHistoriaWrapped(1);assert.equal(salto,1);assert.equal(ov.querySelector('.wrapped-historias-lista').hidden,true);
 salto=null;ctx.elegirHistoriaWrapped(-1);ctx.elegirHistoriaWrapped(99);assert.equal(salto,null);ctx.pasarWrapped=original;
 ctx.pasarWrapped(1);const html=ov.querySelector('.wrapped-slide').innerHTML;
 assert.match(html,/<video controls playsinline preload="none"/);assert.match(html,/kind="captions"/);assert.match(html,/Leer el saludo/);assert.doesNotMatch(html,/autoplay|Privado|sintetico@example/);
 const n=pausas;ctx.document.visibilityState='hidden';ctx.visibilidadSaludoWrapped();assert.equal(pausas,n+1);
 ctx.teclaWrapped({key:'ArrowRight',target:{closest:()=>({})}});assert.equal(run('_wrapped.i'),1,'teclas del reproductor no saltan historias');
 ctx.desplegarHistoriasWrapped();let cerro=false;const cerrar=ctx.cerrarWrapped;ctx.cerrarWrapped=()=>cerro=true;
 ctx.teclaWrapped({key:'Escape'});assert.equal(cerro,false);assert.equal(ov.querySelector('.wrapped-historias-lista').hidden,true);
 ctx.teclaWrapped({key:'Escape'});assert.equal(cerro,true);ctx.cerrarWrapped=cerrar;
 ctx.fixture={...clip,docente:'<img onerror=alert(1)>',transcripcion:'<script>alert(1)</script>'};run('_wrapped.slides[1].saludo=fixture');ctx.pintarWrapped();assert.doesNotMatch(ov.querySelector('.wrapped-slide').innerHTML,/<script>|<img onerror/);
 assert.match(ov.querySelector('.wrapped-slide').innerHTML,/&lt;script&gt;/);
 assert.match(read('data.js'),/const SALUDOS_WRAPPED=\[\];/,'no publica docentes/videos ficticios');
 console.log('OK: saludos por universidad/ramo, sigla y nombre sin inventar, prioridad editorial, assets válidos, ventana, navegación, video optativo/subtítulos/texto, pausa, teclado y privacidad');
})().catch(e=>{console.error(e);process.exitCode=1;});
