// Solo errores explícitos de esquema habilitan compatibilidad. Los permisos,
// la red y una campaña realmente ausente nunca se confunden con SQL antiguo.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx={console,esc:s=>String(s),currentUser:{id:'00000000-0000-0000-0000-000000000001'},supabaseClient:null};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../marketplace.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),id='00000000-0000-0000-0000-000000000010';
const codes=['42883','42703','PGRST202','PGRST204','42P01','PGRST205'];
let schemaError=null,campaign={dias:10,inicio:null,tope_clp:10000},writes=0;
const draft={id,estado:'borrador',criterios:{promedioMenorA:5,avanceMinimo:20},tenant:'uc',ramos_siglas:['TEST101'],titulo:'Clase sintética',
  descripcion:'Descripción de una clase completamente ficticia.',precio_clp:10000,modalidad:'individual',ubicacion:'online',
  contacto_tipo:'whatsapp',contacto_valor:'+56 9 0000 0000'};
ctx.abrir=async()=>({ok:true,anuncio:draft});run('abrirBorradorClase=abrir');
ctx.supabaseClient={from(table){return {select(){return this},eq(){return this},
  maybeSingle:async()=>({data:campaign,error:schemaError}),upsert:async()=>({error:schemaError}),
  update(){assert.equal(table,'tutor_anuncios');writes++;return this},single:async()=>({data:{id,estado:'en_revision'}})}}};
(async()=>{
  for(const code of codes){
    schemaError={code};const before=writes;
    assert.equal((await ctx.guardarCampanaClase(id,campaign)).falta,true,code);
    const result=await ctx.enviarBorradorClase(id);assert.equal(result.ok,true,code+JSON.stringify(result));assert.equal(result.sqlAnterior,true);assert.equal(writes,before+1);
  }
  for(const error of [{code:'42501'},{code:'23514'},{code:'NETWORK'},{message:'column timeout'}]){
    schemaError=error;const before=writes;
    assert.ok(!(await ctx.guardarCampanaClase(id,campaign)).falta);
    assert.equal((await ctx.enviarBorradorClase(id)).ok,false);assert.equal(writes,before);
  }
  schemaError=null;campaign=null;
  assert.equal((await ctx.enviarBorradorClase(id)).ok,false,'SQL nuevo con fila ausente bloquea');
  campaign={dias:10,inicio:null,tope_clp:10000};
  assert.equal((await ctx.enviarBorradorClase(id)).ok,true,'SQL nuevo con campaña guardada envía');
  draft.contacto_valor='+56 123';schemaError={code:'42P01'};
  assert.equal((await ctx.enviarBorradorClase(id)).campo,'contacto_valor','WhatsApp se exige incluso con SQL antiguo');

  const args={p_anuncio_id:id,p_publicado_at:'2026-09-01T00:00:00Z',p_estado:'deuda',p_monto_clp:1000};
  let error=null,fecha=args.p_publicado_at,calls=[];
  ctx.supabaseClient={rpc:async(fn,a)=>{calls.push({fn,a});if(fn==='admin_marcar_cobro_publicacion')return {data:!error,error};
    if(fn==='admin_panel_clases')return {data:[{anuncios:[{id,publicado_at:fecha}]}]};
    assert.equal(fn,'admin_marcar_cobro');assert.ok(!('p_publicado_at' in a));return {data:true};}};
  await ctx.marcarCobroAdmin(args);assert.equal(calls.length,1,'SQL nuevo usa fecha y no repite');
  for(const code of codes){error={code};calls=[];assert.ok(!(await ctx.marcarCobroAdmin(args)).error);assert.deepEqual(calls.map(c=>c.fn),['admin_marcar_cobro_publicacion','admin_panel_clases','admin_marcar_cobro']);}
  for(const code of ['42501','23514','NETWORK']){error={code};calls=[];assert.ok((await ctx.marcarCobroAdmin(args)).error);assert.equal(calls.length,1,'No reintentar una escritura denegada o de resultado incierto');}
  error={code:'PGRST202'};fecha='2026-09-02T00:00:00Z';calls=[];
  assert.match((await ctx.marcarCobroAdmin(args)).error.message,/histórica/);assert.equal(calls.length,2,'No redirigir cobro histórico a publicación actual');
  // El aviso permanece visible en el panel, incluso tras repintarlo.
  const root={innerHTML:'',querySelectorAll:()=>[]};ctx.supabaseClient={rpc:async()=>({data:[]})};
  await ctx.pintarPanelAdmin(root);assert.match(root.innerHTML,/SQL de campañas pendiente/);assert.match(root.innerHTML,/role="status"/);
  console.log('Compatibilidad SQL: viejo/nuevo, 6 códigos, permisos, red, WhatsApp y cobro histórico OK');
})().catch(e=>{console.error(e);process.exitCode=1});
