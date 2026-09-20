// Cambiar la clave desde Perfil debe funcionar para correo y Google sin tocar
// la recuperación. GRADEHUB_APP / GRADEHUB_SESSION prueban el árbol anterior.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=__dirname+'/../';
const source=['data.js','engine.js','app.js','app-session.js'].map(f=>fs.readFileSync(
  f==='app.js'?(process.env.GRADEHUB_APP||root+f):f==='app-session.js'?(process.env.GRADEHUB_SESSION||root+f):root+f,'utf8')).join('\n');
function kit(){
  const ids={},updates=[];
  function el(){return {innerHTML:'',value:'',textContent:'',hidden:false,disabled:false,dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},focus(){this.focused=true;},select(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return []}};}
  const get=id=>ids[id]||(ids[id]=el());
  const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
    document:{getElementById:get,querySelector:()=>el(),querySelectorAll:()=>[],createElement:el,addEventListener(){},documentElement:el(),body:el()},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout(){},clearTimeout(){}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  ctx.__updates=updates;
  vm.runInContext(`S={...freshState(),ramos:[]};currentUser={id:'prueba',email:'alumno@example.test',app_metadata:{providers:['google']}};
    supabaseClient={auth:{async updateUser(payload){__updates.push(payload);return {data:{user:currentUser},error:null};}}};
    openModal=()=>{};`,ctx);
  return {ctx,get,updates,run:s=>vm.runInContext(s,ctx)};
}
let fallas=0;
async function test(nombre,fn){try{await fn();console.log('OK '+nombre);}catch(e){fallas++;console.error('FAIL '+nombre+'\n'+e.stack);}}
(async()=>{
  await test('Perfil da una puerta a la clave también para quien entró con Google',()=>{
    const k=kit();k.run("openSettings('perfil')");const html=k.get('modal-content').innerHTML;
    assert.match(html,/id="s-account-pass"/);assert.match(html,/id="s-account-pass2"/);
    assert.match(html,/autocomplete="new-password"/);assert.match(html,/Google/);
    assert.doesNotMatch(html,/id="s-account-pass-current"/);
  });
  await test('política y confirmación frenan el envío antes de llegar a Supabase',async()=>{
    const k=kit();k.get('s-account-pass').value='corta';k.get('s-account-pass2').value='corta';
    assert.equal(await k.run('cambiarClaveCuenta()'),false);
    assert.match(k.get('s-account-pass-status').textContent,/8/);
    k.get('s-account-pass').value='clave123';k.get('s-account-pass2').value='distinta123';
    assert.equal(await k.run('cambiarClaveCuenta()'),false);
    assert.match(k.get('s-account-pass-status').textContent,/no coinciden/);
    assert.equal(k.updates.length,0);
  });
  await test('un usuario Google puede establecer la clave y recibe éxito solo tras respuesta',async()=>{
    const k=kit();k.get('s-account-pass').value='clave123';k.get('s-account-pass2').value='clave123';
    assert.equal(await k.run('cambiarClaveCuenta()'),true);
    assert.equal(JSON.stringify(k.updates),JSON.stringify([{password:'clave123'}]));
    assert.match(k.get('s-account-pass-status').textContent,/actualizada/);
    assert.equal(k.get('s-account-pass').value,'');assert.equal(k.get('s-account-pass2').value,'');
    assert.equal(k.get('s-account-pass-save').disabled,false);
  });
  await test('si la sesión vence durante el cambio, no finge éxito ni toca notas',async()=>{
    const k=kit();k.get('s-account-pass').value='clave123';k.get('s-account-pass2').value='clave123';
    k.run(`supabaseClient.auth.updateUser=async()=>({data:null,error:{name:'AuthSessionMissingError',message:'Auth session missing!',status:401}});`);
    const antes=k.run('JSON.stringify(S)');
    assert.equal(await k.run('cambiarClaveCuenta()'),false);
    assert.match(k.get('s-account-pass-status').textContent,/sesión.*(venció|iniciar sesión)/i);
    assert.equal(k.get('s-account-pass-save').disabled,false);
    assert.equal(k.run('JSON.stringify(S)'),antes);
  });
  console.log(`FAIL: ${fallas}`);process.exitCode=fallas?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
