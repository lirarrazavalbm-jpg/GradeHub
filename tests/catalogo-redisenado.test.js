// Ejecuta render, handlers y observador con el HTML de producción.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fuente=fs.readFileSync(require('node:path').join(__dirname,'../marketplace.js'),'utf8');
// DOM mínimo: parsea la jerarquía y atributos producidos, no inventa tarjetas.
class Nodo{
  constructor(tag='div',attrs={},parent=null){this.tag=tag;this.attrs=attrs;this.parent=parent;this.children=[];this.listeners={};this.value='';this.checked=false;this.validity={badInput:false};this.hidden='hidden'in attrs;this.isConnected=true;this.dataset={};for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  matches(s){return s[0]==='#'?this.attrs.id===s.slice(1):s[0]==='.'?(this.attrs.class||'').split(' ').includes(s.slice(1)):s[0]==='['?s.slice(1,-1)in this.attrs:this.tag===s;}
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){return this.matches(s)?this:this.parent?.closest(s);}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){this.listeners[k]=f;}
  focus(){this.focused=true;}
  remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(c=>c!==this);}
  set innerHTML(html){
    this.querySelectorAll('article').forEach(n=>n.isConnected=false);this.children=[];this.html=html;let p=this;
    for(const m of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)){
      if(m[0][1]==='/'){if(p!==this)p=p.parent;continue;}
      const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
      const n=new Nodo(m[1],attrs,p);p.children.push(n);if(!['input','img','br','hr'].includes(n.tag))p=n;
    }
  }
  get innerHTML(){return this.html;}
}
const modal=new Nodo(),root=new Nodo(),timers=new Map(),calls=[],observers=[];let timerId=0;
modal.classList={contains:()=>true};
const ctx={console,URL,Intl,S:{tenant:'uc',get ramos(){throw Error('No leer ramos');}},currentUser:{id:'estudiante-sintetico'},
 document:{getElementById:id=>id==='modal-content'?root:id==='modal'?modal:root.querySelector('#'+id)},
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),
 openModal(){},setTimeout(f,ms){const id=++timerId;timers.set(id,{f,ms});return id;},clearTimeout(id){timers.delete(id);},
 IntersectionObserver:class{constructor(cb,opts){this.cb=cb;this.opts=opts;this.nodes=[];observers.push(this);}observe(n){this.nodes.push(n);}disconnect(){}},
 supabaseClient:{rpc:async(n,p)=>{calls.push({n,p});return {data:true,error:null};}}};
vm.createContext(ctx);const run=s=>vm.runInContext(s,ctx);run(fuente);
const base={id:'pagado',estado:'publicado',titulo:'Cálculo sintético',descripcion:'Apoyo',ramos_siglas:['MAT1620'],precio_clp:15000,ubicacion:'online',contacto_tipo:'email',contacto_valor:'prueba@example.com',publicado_at:'2026-09-01T00:00:00Z',vence_at:'2099-01-01T00:00:00Z'};
ctx.fixtures=[base,{...base,id:'gratis',precio_clp:0},{...base,id:'presencial',ubicacion:'presencial',precio_clp:20000},{...base,id:'pausado',estado:'pausado'}];
// Una clase híbrida no puede desaparecer al elegir Online ni Presencial.
ctx.hibridas=[...ctx.fixtures,{...base,id:'hibrida',ubicacion:'hibrido',precio_clp:18000}];
const ids=exp=>Array.from(run(exp).anuncios,a=>a.id).join(',');
assert.equal(ids("filtrarPrecioCatalogoClases(fixtures,{desde:'15000',hasta:'15000'})"),'pagado,pausado');
assert.equal(ids("filtrarPrecioCatalogoClases(fixtures,{gratis:true,desde:'-10',hasta:'2'})"),'gratis');
assert.equal(ids("filtrarPrecioCatalogoClases(fixtures,{ubicacion:'presencial'})"),'presencial');
assert.equal(ids("filtrarPrecioCatalogoClases(hibridas,{ubicacion:'presencial'})"),'presencial,hibrida');
assert.ok(ids("filtrarPrecioCatalogoClases(hibridas,{ubicacion:'online'})").split(',').includes('hibrida'));
for(const f of ["{desde:'2',hasta:'1'}","{desde:'-1'}","{hasta:'1.5'}","{desde:'abc'}","{invalido:true}"])
 assert.equal(run(`filtrarPrecioCatalogoClases(fixtures,${f}).error`),true);
assert.equal(run("prepararCatalogoClases(fixtures,'').some(a=>a.id==='pausado')"),false);
run("logosDeAnuncios=async()=>new Map(); cargarAnunciosClasesOriginal=cargarAnunciosClases; cargarAnunciosClases=async()=>fixtures;");
(async()=>{
 await run('openCatalogoClases()');
 const results=root.querySelector('#catalogo-clases-resultados');
 assert.equal(results.querySelectorAll('[data-catalogo-anuncio]').length,3);
 assert.match(results.innerHTML,/Publicidad/);assert.doesNotMatch(root.innerHTML,/piloto|no se cobra|bin\//);
 const observer=observers.at(-1),card=observer.nodes.find(n=>n.dataset.catalogoAnuncio==='pagado');
 assert.equal(observer.opts.threshold[0],0.5);
 const enter=(ratio)=>observer.cb([{target:card,isIntersecting:ratio>0,intersectionRatio:ratio}]);
 enter(.49);assert.equal(timers.size,0);
 enter(.5);assert.equal([...timers.values()][0].ms,1000);
 enter(.2);assert.equal(timers.size,0);
 enter(.5);for(const[id,t]of [...timers]){timers.delete(id);await t.f();}
 enter(.8);assert.equal(timers.size,0);
 assert(calls.some(c=>c.n==='registrar_alcance_anuncio'&&c.p.p_canal==='lista'));
 assert(calls.some(c=>c.n==='registrar_metrica_anuncio'&&c.p.p_tipo==='impresion'));
 const abrir=card.querySelector('[data-abrir]');abrir.listeners.click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(card.querySelector('.catalogo-clase-mas').hidden,false);
 await card.querySelector('[data-contactar]').listeners.click({preventDefault(){}});
 assert(calls.some(c=>c.n==='registrar_interaccion_anuncio'&&c.p.p_tipo==='apertura'));
 assert(calls.some(c=>c.n==='registrar_interaccion_anuncio'&&c.p.p_tipo==='contacto'));
 assert(calls.some(c=>c.n==='registrar_metrica_anuncio'&&c.p.p_tipo==='clic'&&c.p.p_ramo_sigla==='MAT1620'));
 assert(calls.some(c=>c.n==='registrar_metrica_anuncio'&&c.p.p_tipo==='contacto'));
 // Buscar cambia el canal; filtros de precio sin texto siguen siendo lista.
 run("renderCatalogoClases('MAT1620')");const search=observers.at(-1);
 search.cb([{target:search.nodes[0],isIntersecting:true,intersectionRatio:1}]);for(const[id,t]of [...timers]){timers.delete(id);await t.f();}
 assert(calls.some(c=>c.n==='registrar_alcance_anuncio'&&c.p.p_canal==='busqueda'));
 root.querySelector('#catalogo-gratis').checked=true;root.querySelector('#catalogo-gratis').listeners.change();
 assert.equal(results.querySelectorAll('[data-catalogo-anuncio]').length,1);
 assert.equal(root.querySelector('#catalogo-desde').disabled,true);
 root.querySelector('#catalogo-limpiar').listeners.click();assert.equal(results.querySelectorAll('[data-catalogo-anuncio]').length,3);
 // Si la RPC cobrable falla después de un segundo visible, la misma tarjeta
 // reintenta mientras siga en pantalla; el evento anónimo no se duplica.
 let fallaAlcance=true;
 ctx.currentUser={id:'estudiante-reintento'};
 ctx.supabaseClient.rpc=async(n,p)=>{calls.push({n,p});if(n==='registrar_alcance_anuncio'&&fallaAlcance){fallaAlcance=false;return {data:null,error:{message:'sin red'}};}return {data:true,error:null};};
 await run('openCatalogoClases()');
 const reintento=observers.at(-1),visible=reintento.nodes.find(n=>n.dataset.catalogoAnuncio==='pagado');
 const inicio=calls.length;
 reintento.cb([{target:visible,isIntersecting:true,intersectionRatio:.5}]);
 for(const[id,t]of [...timers]){timers.delete(id);await t.f();}
 assert([...timers.values()].some(t=>t.ms===5000));
 for(const[id,t]of [...timers]){timers.delete(id);await t.f();}
 assert.equal(calls.slice(inicio).filter(c=>c.n==='registrar_alcance_anuncio').length,2);
 assert.equal(calls.slice(inicio).filter(c=>c.n==='registrar_metrica_anuncio'&&c.p.p_tipo==='impresion').length,1);
 run("cargarAnunciosClases=async()=>{throw Error('sin red')}");await run('openCatalogoClases()');
 assert.match(root.querySelector('#catalogo-clases-estado').textContent,/No pudimos cargar/);
 assert(root.querySelector('.catalogo-reintentar'));
 run('cargarAnunciosClases=async()=>fixtures');await root.querySelector('.catalogo-reintentar').listeners.click();
 assert.equal(root.querySelector('#catalogo-clases-resultados').querySelectorAll('[data-catalogo-anuncio]').length,3);
 // El modo estricto propaga también errores reales del transporte.
 run("supabaseClient.from=()=>{throw Error('sin red')}");
 await assert.rejects(run("cargarAnunciosClasesOriginal('uc',{propagarError:true})"),/sin red/);
 console.log('OK catálogo: HTML, filtros, anuncio publicado/pausado, umbral/tiempo, RPC/canales, apertura/contacto, error y reintento');
})().catch(e=>{console.error(e);process.exitCode=1;});
