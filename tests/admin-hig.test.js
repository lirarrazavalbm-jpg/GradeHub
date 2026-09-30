const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// DOM mínimo para ejecutar handlers sobre el HTML generado.
class Nodo{
  constructor(tag='div',attrs={},parent=null){this.tag=tag;this.attrs=attrs;this.parent=parent;this.children=[];this.listeners={};this.value=attrs.value||'';this.checked=false;this.validity={badInput:false};this.hidden='hidden'in attrs;this.isConnected=true;this.dataset={};for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  matches(s){return s[0]==='#'?this.attrs.id===s.slice(1):s[0]==='.'?(this.attrs.class||'').split(' ').includes(s.slice(1)):s[0]==='['?s.slice(1,-1)in this.attrs:this.tag===s;}
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){return this.matches(s)?this:this.parent?.closest(s);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,f){this.listeners[k]=f;}
  focus(){this.focused=true;}
  remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(c=>c!==this);}
  set innerHTML(html){
    this.querySelectorAll('article').forEach(n=>n.isConnected=false);this.children=[];this.html=html;let p=this;
    for(const m of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)){
      if(m[0][1]==='/'){if(p!==this)p=p.parent;continue;}
      const attrs={};for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
      const n=new Nodo(m[1],attrs,p);p.children.push(n);if(n.tag==='option'&&'selected'in attrs)p.value=attrs.value;if(!['input','img','br','hr'].includes(n.tag))p=n;
    }
  }
  get innerHTML(){return this.html;}
}
const root=new Nodo(),calls=[],toasts=[];let modo='ok',confirmacion,pasar=false;
const fecha='2026-09-01T00:00:00Z',historica='2026-08-01T00:00:00Z';
const anuncio={id:'a1',titulo:'Clase <sintética>',estado:'publicado',ramos_siglas:['MAT1620'],precio_clp:15000,publicado_at:fecha,vence_at:'2099-01-01T00:00:00Z',campana:{dias:14,tope_clp:15000,dias_cobrados:4,vistas:120,aperturas:12,contactos:2},cobro:{estado:'deuda',monto_clp:4200},cobros:[{publicado_at:fecha,estado:'deuda',monto_clp:4200},{publicado_at:historica,estado:'deuda',monto_clp:6000}]};
const profesores=[{user_id:'p1',nombre:'Docente sintético',estado:'aprobado',anuncios:[anuncio,{...anuncio,id:'a2',estado:'pausado'},{...anuncio,id:'a3',estado:'en_revision',publicado_at:null,campana:null,cobro:null,cobros:[]}]}];
const ctx={console,Intl,S:{get ramos(){throw Error('No leer notas');}},profesores,root,
 esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])),
 document:{getElementById:()=>root},renderPuertaDosPasos:async(_r,{alPasar})=>{if(pasar)await alPasar();},
 showToast:(text,error)=>toasts.push({text,error}),showConfirm:(_t,_d,fn)=>{confirmacion=fn();},
 supabaseClient:{rpc:async(n,p)=>{calls.push({n,p});if(modo==='throw')throw Error('red caída');if(modo==='denegado')return {error:{code:'42501',message:'sin acceso'}};return {data:n==='admin_panel_clases'?profesores:modo==='false'?false:true,error:null};}}};
vm.createContext(ctx);const run=s=>vm.runInContext(s,ctx);run(fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8'));
(async()=>{
 await run('renderAdmin()');assert.equal(calls.length,0,'Sin MFA no pide el panel');
 pasar=true;await run('renderAdmin()');assert.match(root.innerHTML,/admin-hig-fila/);assert.match(root.innerHTML,/Clase &lt;sintética&gt;/);
 assert.doesNotMatch(root.innerHTML,/piloto|lo que costaría|data-aprobar|bin\//);
 assert.equal(run("filtrarAdminHig(filasAdminHig(profesores),{seccion:'revision'}).length"),1);
 assert.equal(run("filtrarAdminHig(filasAdminHig(profesores),{estado:'pausado',busqueda:'sintetico'}).length"),1);
 assert.equal(run("filtrarAdminHig(filasAdminHig([{...profesores[0],estado:'suspendido'}]),{estado:'publicado'}).length"),0);
 root.querySelectorAll('[data-admin-seccion]').find(b=>b.dataset.adminSeccion==='revision').listeners.click();
 assert.equal(root.querySelectorAll('[data-admin-fila]').filter(n=>!n.hidden).length,1);
 const filas=()=>root.querySelectorAll('[data-admin-cobro]');
 let fila=filas().find(f=>f.dataset.adminCobro==='a1'&&f.dataset.publicadoAt===historica);
 fila.querySelector('[data-cobro-estado]').value='cobrado';fila.querySelector('[data-cobro-monto]').value='$6.000';
 await fila.querySelector('[data-cobro-guardar]').listeners.click();
 const cobro=calls.find(c=>c.n==='admin_marcar_cobro_publicacion');assert.deepEqual(JSON.parse(JSON.stringify(cobro.p)),{p_anuncio_id:'a1',p_publicado_at:historica,p_estado:'cobrado',p_monto_clp:6000});
 assert.match(toasts.at(-1).text,/Cobro guardado/);
 for(const fallo of ['false','throw']){
  modo=fallo;fila=filas()[0];await fila.querySelector('[data-cobro-guardar]').listeners.click();assert.equal(toasts.at(-1).error,true);assert.equal(fila.querySelector('[data-cobro-guardar]').disabled,false);
  root.querySelector('[data-admin-pausar]').listeners.click();await confirmacion;assert.equal(toasts.at(-1).error,true);
 }
 modo='ok';root.querySelector('[data-admin-pausar]').listeners.click();await confirmacion;assert.equal(calls.at(-2).n,'admin_pausar_anuncio');
 root.querySelector('[data-admin-profesor]').listeners.click();await confirmacion;assert(calls.some(c=>c.n==='admin_estado_profesor'&&c.p.p_estado==='suspendido'));
 assert(calls.every(c=>!/^registrar_/.test(c.n)));
 modo='denegado';await run('pintarPanelAdmin(root)');assert.match(root.innerHTML,/no tiene acceso/);assert.doesNotMatch(root.innerHTML,/admin-hig-fila/);
 console.log('OK admin HIG: MFA, acceso denegado, filtros, cobro por fecha histórica, RPC reales y errores sin falso éxito');
})().catch(e=>{console.error(e);process.exitCode=1;});
