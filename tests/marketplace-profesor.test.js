// La puerta de profesor no puede saltarse la aprobación ni confundir un fallo
// de la tabla con una cuenta sin postulación.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const raiz=path.join(__dirname,'..');
const src=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE||path.join(raiz,'marketplace.js'),'utf8');
const html=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
const uid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const menu={click:null,addEventListener(tipo,fn){if(tipo==='click')this.click=fn;}};
const modal={innerHTML:'',querySelector(){return null;}};
const ctx={currentUser:{id:uid},supabaseClient:null,console,
  document:{getElementById(id){return id==='um-profesor'?menu:id==='modal-content'?modal:null;}},
  openModal(){ctx.modalAbierto=true;},umGo(fn){return fn();},esc(s){return String(s).replace(/</g,'&lt;');}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let n=0,consultas=0,inserciones=0,perfil=null,fallar=false;
function check(nombre,condicion){if(!condicion)throw Error(nombre);n++;}
ctx.supabaseClient={from(tabla){
  if(tabla!=='tutor_perfiles')throw Error('No corresponde abrir anuncios sin aprobación');
  const consulta={payload:null};
  return {
    select(){return this;},eq(campo,valor){check('consulta del propio usuario',campo==='user_id'&&valor===uid);return this;},
    insert(payload){consulta.payload=payload;inserciones++;return this;},
    async maybeSingle(){consultas++;return fallar?{data:null,error:{message:'SQL pendiente'}}:{data:perfil,error:null};},
    async single(){return {data:{...consulta.payload,estado:'pendiente'},error:null};}
  };
}};
(async()=>{
  check('entrada visible y sin handler inline',/id="um-profesor"/.test(html)&&menu.click&&
    !/<button[^>]*id="um-profesor"[^>]*onclick=/.test(html));
  fallar=true;
  await menu.click();
  check('SQL ausente explica la falla, no simula una postulación vacía',ctx.modalAbierto&&
    /todavía no está disponible/.test(modal.innerHTML)&&!/Postula para ofrecer clases/.test(modal.innerHTML));
  fallar=false;
  perfil={estado:'pendiente'};
  await run('openEspacioProfesor()');
  check('pendiente no entra al editor',/esperando revisión/.test(modal.innerHTML)&&!/pr-enviar/.test(modal.innerHTML));
  perfil={estado:'suspendido'};
  await run('openEspacioProfesor()');
  check('suspendido no entra al editor',/suspendido/.test(modal.innerHTML)&&!/pr-enviar/.test(modal.innerHTML));
  check('postulación inválida no escribe',!(await run("postularProfesor('A','muy corta')")).ok&&inserciones===0);
  const enviado=await run("postularProfesor('Profesora de Cálculo','Enseño cálculo y álgebra en clases individuales.')");
  check('postulación crea solo ficha pendiente',enviado.ok&&enviado.perfil.estado==='pendiente'&&inserciones===1);
  check('el espacio consulta el estado de la ficha',consultas===3);
  console.log(`Espacio de profesor OK: ${n}`);
})().catch(e=>{console.error('FAIL:',e.message);process.exitCode=1;});
