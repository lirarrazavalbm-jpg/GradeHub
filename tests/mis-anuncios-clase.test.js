// La página de Clases de un profesor muestra SOLO sus anuncios. La RLS también
// le deja leer los publicados de otros (son públicos para el catálogo), y hasta
// el 2026-09-26 aparecían mezclados con los suyos.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','marketplace.js'),'utf8');
const ctx={console,Intl,URL,S:{tenant:'uc'},currentUser:{id:'u1'},
  document:{getElementById(){return null;}},esc:s=>String(s)};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// Supabase de mentira: la tabla devuelve lo que dejaría pasar la RLS y
// `anuncio_propio` responde según quién es el autor de verdad.
function montar(filas,autores,{rpcFalla=false}={}){
  ctx.__filas=filas;ctx.__autores=autores;ctx.__rpcFalla=rpcFalla;ctx.__rpcs=[];
  run(`currentUser={id:'u1'};supabaseClient={
    from(){const q={select(){return q},order(){return Promise.resolve({data:__filas,error:null})}};return q;},
    rpc(n,a){__rpcs.push([n,a]);
      if(__rpcFalla)return Promise.resolve({data:null,error:{message:'red'}});
      return Promise.resolve({data:__autores[a.p_anuncio_id]==='u1',error:null});}};`);
}

(async()=>{
  console.log('=== Solo los anuncios propios ===');
  montar([{id:'mio-pub',estado:'publicado'},{id:'ajeno-pub',estado:'publicado'},{id:'mio-borrador',estado:'borrador'}],
    {'mio-pub':'u1','ajeno-pub':'u2','mio-borrador':'u1'});
  let r=await run('misAnunciosClase()');
  chk('el publicado de otro profesor no aparece',r.ok&&!r.anuncios.some(a=>a.id==='ajeno-pub'));
  chk('los propios sí, publicados o no',r.anuncios.map(a=>a.id).join()==='mio-pub,mio-borrador');
  chk('solo se pregunta por los publicados: lo demás ya es propio por la RLS',
    ctx.__rpcs.length===2&&ctx.__rpcs.every(([n,a])=>n==='anuncio_propio'&&a.p_editable===false));

  console.log('\n=== Si no se puede confirmar, no se adivina ===');
  montar([{id:'mio-pub',estado:'publicado'}],{'mio-pub':'u1'},{rpcFalla:true});
  r=await run('misAnunciosClase()');
  chk('falla con un mensaje en vez de mostrar o esconder a ciegas',!r.ok&&/No pudimos/.test(r.error));

  console.log('\nPASS: '+ok+'   FAIL: '+fail);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
