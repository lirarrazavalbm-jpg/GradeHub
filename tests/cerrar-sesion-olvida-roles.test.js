// Cerrar sesión olvida que la cuenta anterior era admin o profesor. Pasó el
// 2026-09-30: al crear una cuenta nueva en el mismo navegador, sin recargar,
// después de usar la de admin, la cuenta nueva mostraba las pestañas Clases y
// Admin. Cuentas y fichas sintéticas.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const src=['data.js','engine.js','app.js','app-session.js','marketplace.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');
const els={};
function el(id){return els[id]||(els[id]={id,hidden:false,value:'',innerHTML:'',textContent:'',style:{setProperty(){},removeProperty(){}},
  classList:{add(){},remove(){},contains(){return false},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},
  querySelector(){return null},querySelectorAll(){return []},focus(){},dataset:{}});}
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:el,createElement:()=>el('x'+Math.random()),addEventListener(){},documentElement:el('html'),body:el('body'),querySelector:()=>null,querySelectorAll:()=>[]},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const run=c=>vm.runInContext(c,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

(async()=>{
  // La cuenta anterior: admin y profesor aprobado, con sus pestañas visibles.
  run(`supabaseClient={auth:{signOut:async()=>({error:null})}};currentUser={id:'cuenta-a'};
    closeModal=()=>{};showAuthScreen=()=>{};
    soyAdministradorCache=true;perfilProfesorCache={estado:'aprobado',nombre_publico:'Profesor sintético'};
    perfilProfesorPedido=true;perfilProfesorResuelto=true;recalcularNavTabs();`);
  chk('antes de salir, la cuenta admin ve Clases y Admin',!els['nav-admin'].hidden&&!els['nav-profesor'].hidden);
  await run('signOut()');
  chk('al salir deja de ser admin',run('esAdministrador()')===false);
  chk('y deja de ser profesor aprobado',run('esProfesorAprobado()')===false);
  chk('las pestañas Clases y Admin se esconden',els['nav-admin'].hidden===true&&els['nav-profesor'].hidden===true);
  chk('la ficha de profesor anterior no queda en memoria',run('perfilProfesorConocido()')===undefined);
  chk('y la próxima cuenta vuelve a preguntar por su ficha',run('perfilProfesorPedido')===false);
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
