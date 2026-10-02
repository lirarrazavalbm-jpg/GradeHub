const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../render-main.js'),'utf8');
function elemento(){return {innerHTML:'',textContent:'',hidden:false,disabled:false,isConnected:true,value:'',children:new Map(),
  querySelector(s){if(!this.children.has(s))this.children.set(s,elemento());return this.children.get(s);},
  replaceChildren(){this.innerHTML='';this.children.clear();},appendChild(el){this.form=el;},
  remove(){this.isConnected=false;},focus(){this.focused=true;}};}
const raiz=elemento(),r={id:'local-1',seccion:2,nombre:'Ramo sintético',categorias:[{notas:[{valor:4.7}]}]};
const llamadas=[],avisos=[];
const ctx={S:{tenant:'uc',ramos:[r],userName:'Persona sintética'},currentUser:{id:'cuenta-1'},currentRamoId:r.id,
  semester:()=> '2026-2',showToast:x=>avisos.push(x),openEditRamoModal:()=>{},
  esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  document:{getElementById:()=>raiz,createElement:()=>elemento()},
  supabaseClient:{rpc:async(nombre,args)=>{llamadas.push({nombre,args});return {data:[{nombre_publico:null,mi_nombre:null}]};}}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const base=JSON.stringify(ctx.S);
(async()=>{
  await ctx.renderDocenteRamo(r);assert.match(raiz.innerHTML,/¿Quién te hace clases\?/);
  raiz.querySelector('button').onclick();let form=raiz.form;
  form.querySelector('input').value='María José Pérez';
  await form.onsubmit({preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas.find(x=>x.nombre==='profesor_docente_informar').args)),{
    p_ramo_id:'local-1',p_seccion:2,p_periodo:'2026-2',p_nombre:'María José Pérez'});
  assert.equal(JSON.stringify(ctx.S),base,'no toca ramo, notas ni estado persistido');
  assert.equal(avisos.length,1);
  // Error de escritura preserva el campo y habilita reintentar, sin éxito falso.
  raiz.querySelector('button').onclick();form=raiz.form;form.querySelector('input').value='Otro Docente';
  ctx.supabaseClient.rpc=async()=>({error:{message:'red caída'}});
  await form.onsubmit({preventDefault(){}});
  assert.match(form.querySelector('[role=alert]').textContent,/reintenta/);
  assert.equal(form.querySelector('input').value,'Otro Docente');
  assert.equal(form.querySelector('[type=submit]').disabled,false);assert.equal(avisos.length,1);
  await ctx.renderDocenteRamo(r);assert.match(raiz.innerHTML,/Reintentar/);
  assert.doesNotMatch(raiz.innerHTML,/¿Quién te hace clases/,'error de lectura no simula ausencia de consenso');
  // El nombre de un tercero se escapa antes de mostrarse.
  ctx.supabaseClient.rpc=async()=>({data:[{nombre_publico:'<img src=x onerror=alert(1)>',mi_nombre:'" autofocus onfocus="alert(1)'}]});
  await ctx.renderDocenteRamo(r);assert.match(raiz.innerHTML,/Profesor:/);assert.doesNotMatch(raiz.innerHTML,/<img/);
  raiz.querySelector('button').onclick();assert.match(raiz.form.innerHTML,/&quot;/);
  // Las respuestas de otra cuenta o de una solicitud anterior no repintan.
  let resolver;ctx.supabaseClient.rpc=()=>new Promise(resolve=>{resolver=resolve;});
  const pendiente=ctx.renderDocenteRamo(r);ctx.currentUser={id:'cuenta-2'};
  resolver({data:[{nombre_publico:'No debe aparecer',mi_nombre:'Privado'}]});await pendiente;
  assert.doesNotMatch(raiz.innerHTML,/No debe aparecer|Privado/);
  let consultas=0;ctx.supabaseClient.rpc=async()=>{consultas++;return{data:[]};};
  ctx.currentUser=null;await ctx.renderDocenteRamo(r);assert.equal(raiz.innerHTML,'');
  ctx.currentUser={id:'cuenta-1'};r.seccion=null;await ctx.renderDocenteRamo(r);assert.match(raiz.innerHTML,/Agregar sección/);
  assert.equal(consultas,0);
  ctx.S.ramos=[];assert.equal(ctx.contextoDocente(r),null,'un ramo fuera del semestre no habilita envío');
  console.log('OK docentes UI: payload mínimo, cuentas existentes, errores, XSS y cambio de cuenta');
})().catch(e=>{console.error(e);process.exitCode=1;});
