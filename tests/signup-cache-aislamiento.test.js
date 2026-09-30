// Registrarse en un navegador con una caché de otra cuenta no debe importar
// sus ramos ni dar un falso aviso de respaldo. Fixtures sintéticos únicamente.
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(__dirname+'/../app-session.js','utf8');
const start=source.indexOf("const CACHE_APARTADA_PREFIX=");
const end=source.indexOf('async function afterLogin()',start);
if(start<0||end<0)throw Error('No se encontró afterSignup');
const estado=(nombre='Curso de A')=>({ramos:[{id:'r',nombre,categorias:[{id:'c',nombre:'Evaluación',peso:100,notas:[{id:'n',nombre:'Nota',valor:5.5,peso:1}]}]}],onboardingDone:true,userName:'A'});
function harness(owner,{falloRespaldo=false,falloStorage=false}={}){
  const storage=new Map([['gradehub_v1',JSON.stringify(estado())],...(owner?[
    ['gradehub_cache_owner',owner],['gradehub_v1_base',JSON.stringify({owner,data:estado()})]
  ]:[])]);
  const uploads=[],avisos=[];let screen='',pregunta=null,salio=false;
  const ctx={S:estado(),currentUser:{id:'cuenta-b'},STORAGE_KEY:'gradehub_v1',CACHE_OWNER_KEY:'gradehub_cache_owner',SYNC_BASE_KEY:'gradehub_v1_base',
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(falloStorage||falloRespaldo&&k.startsWith('gradehub_v1_respaldo_'))throw Error('quota');storage.set(k,v);},removeItem:k=>storage.delete(k)},
    getCacheOwner:()=>storage.get('gradehub_cache_owner')||null,setCacheOwner:uid=>storage.set('gradehub_cache_owner',uid),
    freshState:()=>({ramos:[],onboardingDone:false,userName:''}),normalize:x=>x,
    showConfirm:(title,desc,fn)=>{pregunta={title,desc,fn};},supabaseClient:{auth:{signOut:async()=>{salio=true;}}},
    syncNow:async()=>{uploads.push(JSON.parse(JSON.stringify(ctx.S)));return true;},syncProfile:async()=>{},
    enterApp:()=>{screen='app';},enterOnboarding:()=>{screen='onboarding';},
    showToast:(msg,error)=>avisos.push({msg,error}),track(){},console,
  };
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
  return {ctx,storage,uploads,avisos,screen:()=>screen,pregunta:()=>pregunta,salio:()=>salio};
}
let count=0,fail=0;const check=(name,condition)=>{console.log(`  ${condition?'OK  ':'FAIL'} ${name}`);condition?count++:fail++;};
(async()=>{
  console.log('\n=== Nueva cuenta en Chrome con datos de otra cuenta ===');
  const h=harness('cuenta-a');
  await h.ctx.afterSignup();
  check('los ramos de A no se suben a la cuenta B',h.uploads.length===0);
  check('B comienza sin los ramos de A',h.ctx.S.ramos.length===0&&h.screen()==='onboarding');
  check('el aviso no afirma que guardó los datos de A en B',!h.avisos.some(x=>/tus datos están en la nube/i.test(x.msg)));
  check('el respaldo local de A sigue recuperable',h.storage.has('gradehub_v1_respaldo_cuenta-a'));

  console.log('\n=== La cuenta original recupera su copia ===');
  h.storage.delete('gradehub_cache_owner');h.storage.delete('gradehub_v1');
  h.ctx.S=h.ctx.freshState();h.ctx.currentUser={id:'cuenta-a'};
  check('al volver a entrar A recupera ramos, notas y base de sync',h.ctx.restaurarCacheApartada('cuenta-a')===true&&h.ctx.S.ramos[0].nombre==='Curso de A'&&h.ctx.S.ramos[0].categorias[0].notas[0].valor===5.5&&h.storage.get('gradehub_cache_owner')==='cuenta-a'&&JSON.parse(h.storage.get('gradehub_v1_base')).owner==='cuenta-a');

  console.log('\n=== Una caché vacía no pisa un respaldo previo ===');
  const conservado=harness('cuenta-a');
  conservado.ctx.apartarCacheLocal('cuenta-a');
  conservado.storage.set('gradehub_v1',JSON.stringify(conservado.ctx.freshState()));
  conservado.ctx.apartarCacheLocal('cuenta-a');
  check('el respaldo con ramos sigue disponible',JSON.parse(JSON.parse(conservado.storage.get('gradehub_v1_respaldo_cuenta-a')).data).ramos[0].nombre==='Curso de A');
  conservado.ctx.S=conservado.ctx.freshState();
  check('la misma cuenta puede recuperar el respaldo si su caché quedó vacía',conservado.ctx.restaurarCacheApartada('cuenta-a')===true&&conservado.ctx.S.ramos[0].nombre==='Curso de A');

  console.log('\n=== Datos locales sin dueño requieren elección ===');
  const local=harness(null);
  await local.ctx.afterSignup();
  check('registro nuevo no sube datos locales sin dueño automáticamente',local.uploads.length===0&&local.ctx.S.ramos.length===0&&local.pregunta()?.title.includes('Traer datos'));
  await local.pregunta().fn();
  check('al elegir traerlos se guardan en la nueva cuenta',local.uploads.length===1&&local.ctx.S.ramos[0].nombre==='Curso de A'&&local.screen()==='app');

  console.log('\n=== Sin espacio para preservar la caché se detiene el registro ===');
  const sinEspacio=harness('cuenta-a',{falloRespaldo:true});
  let error=null;try{await sinEspacio.ctx.afterSignup();}catch(e){error=e;}
  check('no copia ni borra ramos si el respaldo local falla',error?.code==='CACHE_LOCAL_NO_AISLADA'&&sinEspacio.salio()&&sinEspacio.uploads.length===0&&sinEspacio.ctx.S.ramos[0].nombre==='Curso de A'&&sinEspacio.storage.get('gradehub_cache_owner')==='cuenta-a');

  console.log('\n=== Registro vacío sin localStorage ===');
  const privado=harness(null,{falloStorage:true});
  privado.ctx.S=privado.ctx.freshState();privado.storage.clear();
  await privado.ctx.afterSignup();
  check('una cuenta vacía puede iniciar sin almacenamiento local',privado.screen()==='onboarding'&&!privado.salio()&&privado.uploads.length===0);

  console.log('\n=== Un respaldo corrupto no toca la caché vigente ===');
  const corrupto=harness('cuenta-b');
  corrupto.storage.set('gradehub_v1_respaldo_cuenta-a','{');
  check('la restauración inválida falla cerrada',corrupto.ctx.restaurarCacheApartada('cuenta-a')===false&&corrupto.storage.get('gradehub_cache_owner')==='cuenta-b'&&JSON.parse(corrupto.storage.get('gradehub_v1')).ramos[0].nombre==='Curso de A');
  console.log(`\nPASS: ${count}   FAIL: ${fail}`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
