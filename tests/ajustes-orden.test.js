// Navegar y buscar opciones no guarda preferencias ni reconstruye el formulario.
// GRADEHUB_APP permite ejecutar estos mismos casos contra el árbol anterior.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=__dirname+'/../';
const source=['data.js','engine.js','app.js','app-session.js'].map(f=>fs.readFileSync(f==='app.js'?(process.env.GRADEHUB_APP||root+f):root+f,'utf8')).join('\n');
function kit(){
  const ids={},writes=[];
  function node(){return {innerHTML:'',value:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},contains(){return false;}},addEventListener(k,fn){this['on'+k]=fn;},setAttribute(){},removeAttribute(){},focus(){this.focused=true;},select(){},appendChild(){},querySelector(){return null;},querySelectorAll(){return [];}};}
  const get=id=>ids[id]||(ids[id]=node());
  function buttons(){
    const html=get('settings-nav-list').innerHTML||get('modal-content').innerHTML;
    return [...html.matchAll(/data-settings-section="([^"]+)"/g)].map(m=>{const b=get('nav-'+m[1]);b.dataset.settingsSection=m[1];return b;});
  }
  const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},document:{getElementById:get,querySelector:s=>s==='.settings-back'?get('back'):node(),querySelectorAll:s=>s==='[data-settings-section]'?buttons():[],createElement:node,addEventListener(){},documentElement:node(),body:node()},localStorage:{getItem(){return null;},setItem(k,v){writes.push([k,v]);}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout:fn=>fn(),clearTimeout(){},requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  writes.length=0; // La prueba de disponibilidad de localStorage ocurre al cargar, no en Ajustes.
  vm.runInContext(`S={ramos:[],historial:[],tenant:'uc',carrera:'ING-PC',careerSemestre:2,userName:'Prueba',modo:'sistema',acento:'turquesa',fondo:'neutro'};currentUser={id:'sintetico',email:'estudiante@example.test'};openModal=()=>{};cargarAgentesConectados=()=>{};pintarFeedCalendario=()=>{};`,ctx);
  return {ctx,get,writes,buttons,html:()=>get('modal-content').innerHTML,nav:()=>get('settings-nav-list').innerHTML||get('modal-content').innerHTML};
}
let failed=0;
function test(name,fn){try{fn();console.log('OK '+name);}catch(e){failed++;console.error('ERROR '+name+'\n'+e.message);}}
test('cada grupo aparece una vez, sin perder ninguna de las siete secciones',()=>{
  const k=kit();vm.runInContext('openSettings()',k.ctx);
  const groups=[...k.nav().matchAll(/class="settings-nav-group">([^<]+)/g)].map(m=>m[1]);
  assert.equal(groups.length,3);assert.equal(new Set(groups).size,groups.length);
  assert.equal(k.buttons().length,7);
});
test('el buscador encuentra opciones internas, ignora tildes y explica cero resultados',()=>{
  const k=kit();vm.runInContext('openSettings()',k.ctx);
  assert.match(k.html(),/id="settings-search"/);
  for(const [query,section] of [['cambiar mi carrera','academico'],['correo','perfil'],['borrar mi cuenta','datos'],['ICS','calendario'],['estadísticas-no-es-un-ajuste',null],['APARIÉNCIA','apariencia']]){
    k.get('settings-search').value=query;k.get('settings-search').oninput();
    assert.deepEqual(k.buttons().map(b=>b.dataset.settingsSection),section?[section]:[]);
    if(!section)assert.match(k.nav(),/No encontramos/);
  }
  k.get('settings-search').value='';k.get('settings-search').oninput();assert.equal(k.buttons().length,7);
});
test('buscar no borra lo escrito en el panel ni guarda estado; volver mantiene la consulta',()=>{
  const k=kit();vm.runInContext("openSettings('perfil')",k.ctx);
  assert.match(k.html(),/id="settings-search"/);
  const before=vm.runInContext('JSON.stringify(S)',k.ctx);
  k.get('s-name').value='Nombre sin guardar';k.get('s-name').oninput();
  const panel=k.html();k.get('settings-search').value='apariencia';k.get('settings-search').oninput();
  assert.equal(k.html(),panel);assert.equal(k.get('s-name').value,'Nombre sin guardar');
  k.buttons()[0].onclick();k.get('back').onclick();
  assert.match(k.html(),/id="settings-search"[^>]*value="apariencia"/);
  assert.equal(vm.runInContext('JSON.stringify(S)',k.ctx),before);assert.equal(k.writes.length,0);
});
test('correo vive en Perfil y las acciones destructivas siguen en Datos y cuenta',()=>{
  const k=kit();vm.runInContext("openSettings('perfil')",k.ctx);
  assert.match(k.html(),/id="s-account-email"/);assert.doesNotMatch(k.html(),/onclick="confirmarEliminarCuenta/);
  vm.runInContext("openSettings('datos')",k.ctx);
  assert.match(k.html(),/onclick="confirmarEliminarCuenta\(\)"/);assert.doesNotMatch(k.html(),/id="s-account-email"/);
});
test('Apariencia tiene exactamente un selector de fondo',()=>{
  const k=kit();vm.runInContext("openSettings('apariencia')",k.ctx);
  assert.equal((k.html().match(/id="s-fondo-grid"/g)||[]).length,1);
});
process.exitCode=failed?1:0;
