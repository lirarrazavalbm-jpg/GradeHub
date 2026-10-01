const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8');
const consultas=[];
const propios=Array.from({length:61},(_,i)=>({id:`propio-${i}`,estado:i%2?'publicado':'borrador'}));
const ctx={console,currentUser:{id:'profesor-sintetico'},supabaseClient:{
  rpc:async(nombre,args)=>{
    consultas.push({nombre,args});
    if(nombre!=='mis_anuncios_profesor')throw Error('RPC ajena');
    return {data:propios.slice(args.p_desde,args.p_desde+args.p_tamano),error:null};
  },
  from(){throw Error('No debe descargar el catálogo público para buscar avisos propios');}
}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
(async()=>{
  const resultado=await run('misAnunciosClase()');
  assert.equal(resultado.ok,true);
  assert.equal(resultado.anuncios.length,61,'incluye los avisos antiguos después de la primera página');
  assert.deepEqual(consultas.map(c=>c.args.p_desde),[0,60]);
  assert(consultas.every(c=>c.args.p_tamano===60));
  assert(consultas.every(c=>c.nombre==='mis_anuncios_profesor'));

  ctx.supabaseClient.rpc=async()=>({data:null,error:{code:'42501',message:'sin acceso'}});
  const denegado=await run('misAnunciosClase()');
  assert.equal(denegado.ok,false,'un error de permiso no se presenta como una lista vacía');
  console.log('OK anuncios propios: dos páginas y ningún barrido del catálogo público');
})().catch(e=>{console.error(e);process.exitCode=1;});
