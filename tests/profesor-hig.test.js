const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8');
const calls=[],mutaciones=[],toasts=[];let falla=false,metricasFallan=false,confirmacion;
const ctx={console,Intl,S:{tenant:'uc',get ramos(){throw Error('No leer ramos');}},currentUser:{id:'profesor-sintetico'},
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),
 showConfirm:(_t,_d,accion)=>{confirmacion=accion();},showToast:(texto,error)=>toasts.push({texto,error}),
 supabaseClient:{rpc:async(n,p)=>{calls.push({n,p});if(falla)throw Error('sin red');if(metricasFallan&&n!=='campana_anuncio')return {data:null,error:{code:'503',message:'sin red'}};return {data:n==='campana_anuncio'?[{dias:14,tope_clp:p.p_anuncio_id.startsWith('dddd')?1000:15000,dias_cobrados:4,vistas:120,aperturas:12,contactos:2}]:n==='alcance_anuncio'?120:[],error:null};},
 from(){let estado,id;const q={update(d){estado=d.estado;return q;},eq(k,v){if(k==='id')id=v;return q;},select(){return q;},async single(){if(falla)throw Error('sin red');mutaciones.push({id,estado});return {data:{id,estado},error:null};}};return q;}}};
vm.createContext(ctx);const run=c=>vm.runInContext(c,ctx);run(src);
function root(){const nodes=new Map();return {innerHTML:'',querySelector(sel){if(!nodes.has(sel))nodes.set(sel,{textContent:'',innerHTML:'',isConnected:sel!=='#clases-logo',addEventListener(t,f){this[t]=f;}});return nodes.get(sel);},querySelectorAll(sel){const attr=sel.slice(1,-1),re=new RegExp(attr+'="([^"]+)"','g');return [...this.innerHTML.matchAll(re)].map(m=>{const node=this.querySelector(sel+'-'+m[1]);node.dataset={[attr.slice(5)]:m[1]};return node;});}};}
const anuncio={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',estado:'publicado',publicado_at:'2026-01-01T00:00:00Z',vence_at:'2099-01-01T00:00:00Z',titulo:'Clase <sintética>',ramos_siglas:['MAT1620'],precio_clp:15000};
ctx.anuncios=[anuncio,{...anuncio,id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',estado:'pausado'},{...anuncio,id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',estado:'borrador'},{...anuncio,id:'dddddddd-dddd-4ddd-dddd-dddddddddddd'}];
ctx.root=root();
(async()=>{
 await run("renderPanelProfesor(root,anuncios,{cabecera:()=>'',salida:()=>''})");
 assert.match(ctx.root.innerHTML,/profesor-hig-fila/);assert.match(ctx.root.innerHTML,/Crear anuncio/);
 assert.match(ctx.root.innerHTML,/Clase &lt;sintética&gt;/);assert.doesNotMatch(ctx.root.innerHTML,/<sintética>|piloto|no se cobra|bin\//);
 assert.match(ctx.root.innerHTML,/data-pausar="aaaaaaaa/);assert.match(ctx.root.innerHTML,/data-retomar="bbbbbbbb/);assert.match(ctx.root.innerHTML,/data-editar="cccccccc/);
 assert.match(ctx.root.innerHTML,/data-retomar="dddddddd/);assert.doesNotMatch(ctx.root.innerHTML,/data-pausar="dddddddd/);
 assert.equal(run("gruposPanelClases(anuncios.map(a=>a.id.startsWith('dddd')?{...a,campana:{tope_clp:1000,dias_cobrados:4,vistas:120,aperturas:12,contactos:2}}:a)).activos.length"),1);
 const amount=ctx.root.querySelector('[data-costo-campana="'+anuncio.id+'"]');assert.equal(amount.textContent,'$4.200');
 const detail=ctx.root.querySelector('[data-metricas="'+anuncio.id+'"]');assert.match(detail.innerHTML,/Presupuesto utilizado/);assert.match(detail.innerHTML,/Más estadísticas/);
 metricasFallan=true;await run("renderPanelProfesor(root,anuncios,{cabecera:()=>'',salida:()=>''})");
 assert.match(detail.innerHTML,/No pudimos cargar todas las estadísticas/);
 assert.match(ctx.root.querySelector('#clases-kpis').innerHTML,/No pudimos cargar el resumen/);
 metricasFallan=false;await run("renderPanelProfesor(root,anuncios,{cabecera:()=>'',salida:()=>''})");
 assert(calls.every(c=>!/^registrar_/.test(c.n)));assert(!calls.some(c=>c.p.p_anuncio_id.startsWith('cccc')));
 ctx.onDone=()=>{ctx.done=true};
 run("pausarAnuncioClase(anuncios[0].id,onDone)");await confirmacion;assert.equal(mutaciones.at(-1).estado,'pausado');assert.equal(ctx.done,true);
 ctx.done=false;falla=true;run("pausarAnuncioClase(anuncios[0].id,onDone)");await confirmacion;assert.equal(ctx.done,false);assert.equal(toasts.at(-1).error,true);
 await run("renderPanelProfesor(root,anuncios,{cabecera:()=>'',salida:()=>''})");
 assert.equal(amount.textContent,'No disponible');assert.match(detail.innerHTML,/No pudimos cargar todas las estadísticas/);
 assert.match(ctx.root.innerHTML,/Estado sin confirmar/);
 assert.match(ctx.root.innerHTML,/No pudimos confirmar qué campañas/);
 assert.doesNotMatch(detail.innerHTML,/Costo · publicación actual/);
 falla=false;run("retomarAnuncioClase(anuncios[1].id,onDone)");await confirmacion;assert.equal(mutaciones.at(-1).estado,'borrador');
 ctx.root=root();await run("renderPanelProfesor(root,[],{cabecera:()=>'',salida:()=>''})");assert.match(ctx.root.innerHTML,/Todavía no tienes anuncios/);assert(ctx.root.querySelector('#clase-nueva').click);
 assert.equal(run('IMPRESION_VISIBLE'),.5);assert.equal(run('IMPRESION_MS'),1000);
 console.log('OK profesor HIG: publicado/pausado/borrador, costo real, sin identidades ni medición, pausa/retomar y fallas de red');
})().catch(e=>{console.error(e);process.exitCode=1;});
