// Un profesor aprobado puede guardar y enviar; si el guardado falla, el aviso
// nunca debe llegar a revisión aunque haya apretado ese botón.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE||path.join(__dirname,'..','marketplace.js'),'utf8');
const ctx={console,S:{tenant:'uc'},currentUser:{id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
  supabaseClient:{},document:{getElementById(){return null;}},esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
const events={},elements={};
function element(id,value=''){
  return elements[id]={value,files:[],hidden:false,disabled:false,isConnected:true,textContent:'',
    addEventListener(type,handler){events[id+':'+type]=handler;},
    focus(){this.enfocado=true;},querySelector(selector){return elements[selector];}};
}
const form=element('#profesor-borrador');form.reportValidity=()=>true;
['titulo','descripcion','precio','modalidad','ubicacion','contacto-tipo','contacto','flyer',
  'tenant','siglas','promedio','avance'].forEach(id=>element('#pr-'+id));
Object.assign(elements['#pr-titulo'],{value:'Clases de Cálculo I'});
Object.assign(elements['#pr-descripcion'],{value:'Trabajamos ejercicios y preparamos las pruebas de Cálculo I.'});
Object.assign(elements['#pr-precio'],{value:'15000'});
Object.assign(elements['#pr-modalidad'],{value:'individual'});
Object.assign(elements['#pr-ubicacion'],{value:'online'});
Object.assign(elements['#pr-contacto-tipo'],{value:'whatsapp'});
Object.assign(elements['#pr-contacto'],{value:'+56 9 1234 5678'});
Object.assign(elements['#pr-tenant'],{value:'uc'});
Object.assign(elements['#pr-siglas'],{value:'MAT1610'});
Object.assign(elements['#pr-promedio'],{value:'5'});
Object.assign(elements['#pr-avance'],{value:'20'});
element('#pr-guardar');element('#pr-enviar');element('#pr-quitar-flyer');
element('.profesor-estado');element('strong');element('p');element('img');
const preview=element('.profesor-flyer-preview');preview.querySelector=sel=>elements[sel];
const vista=element('.profesor-vista');vista.querySelector=sel=>elements[sel];
form.querySelector=sel=>elements[sel];
const raiz={innerHTML:'',querySelector(sel){return elements[sel];}};
let guardados=0,enviados=0,fallar=true;
ctx.guardarSimulado=async(datos,id)=>{
  guardados++;
  if(fallar)return {ok:false,error:'No se guardó el borrador.'};
  return {ok:true,anuncio:{id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',estado:'borrador',...datos}};
};
ctx.enviarSimulado=async()=>{enviados++;return {ok:true};};
run('guardarBorradorClase=guardarSimulado; enviarBorradorClase=enviarSimulado');
let n=0;
function check(nombre,condicion){if(!condicion)throw Error(nombre);n++;}
(async()=>{
  ctx.raiz=raiz;
  run('renderBorradorProfesor(raiz,null)');
  check('el formulario tiene guardado y envío distintos',events['#pr-guardar:click']&&events['#pr-enviar:click']);
  await events['#pr-enviar:click']();
  check('un guardado fallido no envía ni finge éxito',guardados===1&&enviados===0&&
    /No se guardó/.test(elements['.profesor-estado'].textContent));
  fallar=false;
  await events['#pr-guardar:click']();
  check('guardar no publica ni envía',guardados===2&&enviados===0&&
    /Borrador guardado/.test(elements['.profesor-estado'].textContent));
  ctx.subirSimulado=async()=>({ok:false,error:'No se pudo subir el flyer.'});
  run('subirFlyerClase=subirSimulado');
  elements['#pr-flyer'].files=[{type:'image/png',size:1200}];
  await events['#pr-enviar:click']();
  check('si el flyer falla, no envía un anuncio incompleto',guardados===3&&enviados===0&&
    /No se pudo subir el flyer/.test(elements['.profesor-estado'].textContent));
  elements['#pr-flyer'].files=[];
  await events['#pr-enviar:click']();
  check('enviar pasa por guardado y queda en revisión',guardados===4&&enviados===1&&
    /En revisión/.test(raiz.innerHTML)&&!/publicado/i.test(raiz.innerHTML));
  console.log(`Formulario de profesor OK: ${n}`);
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1;});
