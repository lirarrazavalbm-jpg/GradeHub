// La campaña (días, inicio, tope) se guardaba con upsert. PostgREST lo traduce a
// ON CONFLICT DO UPDATE SET anuncio_id=…, y el cliente no tiene UPDATE sobre
// anuncio_id: Postgres lo exige aunque no haya conflicto, así que fallaba
// SIEMPRE (42501) y desde #515 ningún anuncio nuevo se podía enviar a revisión.
// Reportado por Lucas el 2026-09-30.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={console,esc:s=>String(s),currentUser:{id:'00000000-0000-0000-0000-000000000001'},supabaseClient:null};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8'),ctx);
const id='00000000-0000-0000-0000-000000000010',datos={dias:10,inicio:null,tope_clp:10000};

function cliente({filas,insertError=null}){
  const log=[];
  ctx.supabaseClient={from(tabla){
    assert.equal(tabla,'anuncio_campanas');
    return {
      upsert(){log.push('upsert');return Promise.resolve({error:{code:'42501'}});},
      update(d){log.push('update');return {eq(){return {select:async()=>({data:filas.has(id)?[{anuncio_id:id}]:[],error:null})};}};},
      insert:async fila=>{log.push('insert');if(insertError){filas.add(id);return {error:insertError};}filas.add(fila.anuncio_id);return {error:null};},
    };
  }};
  return log;
}

(async()=>{
  let log=cliente({filas:new Set()});
  assert.equal((await ctx.guardarCampanaClase(id,datos)).ok,true,'sin fila: se crea');
  assert.deepEqual(log,['update','insert']);

  log=cliente({filas:new Set([id])});
  assert.equal((await ctx.guardarCampanaClase(id,datos)).ok,true,'con fila: se actualiza');
  assert.deepEqual(log,['update'],'no inserta si ya había fila');

  log=cliente({filas:new Set(),insertError:{code:'23505'}});
  assert.equal((await ctx.guardarCampanaClase(id,datos)).ok,true,'otra pestaña la creó entre medio');
  assert.deepEqual(log,['update','insert','update']);

  // Si ni así queda una fila (RLS la oculta), no se reporta como guardada.
  const ocultas={has:()=>false,add(){}};
  log=cliente({filas:ocultas,insertError:{code:'23505'}});
  assert.equal((await ctx.guardarCampanaClase(id,datos)).ok,false,'sin fila visible no dice guardado');

  assert.ok(!/from\('anuncio_campanas'\)\.upsert/.test(fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8')),'nunca vuelve el upsert');
  console.log('OK campaña: crea sin upsert, actualiza si existe y tolera la carrera entre pestañas');
})().catch(e=>{console.error(e);process.exit(1);});
