// La página de administración de clases. Lo que no puede pasar: que una
// función de la página entregue o cambie algo sin exigir primero la lista de
// administradores y el segundo factor, y que la página muestre un costo
// distinto del que ve el profesor.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const leer=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

console.log('=== El servidor ===');
const sql=leer('supabase/administradores.sql').split('\n').map(l=>l.replace(/--.*$/,'')).join('\n');
const funciones=[...sql.matchAll(/create or replace function public\.(admin_\w+)\s*\([\s\S]*?\$\$;/g)];
chk('existen las cuatro funciones de la página',['admin_panel_clases','admin_pausar_anuncio','admin_estado_profesor','admin_marcar_cobro']
  .every(f=>funciones.some(m=>m[1]===f)));
chk('cada una exige administración verificada antes de hacer nada',funciones.length===4&&
  funciones.every(m=>/\bbegin\s+perform admin\.exigir_administrador\(\);/.test(m[0])));
chk('y esa exigencia pide la lista y el segundo factor',/function admin\.exigir_administrador[\s\S]*?administrador_verificado\(\)[\s\S]*?raise exception/.test(sql));
chk('anon no puede llamarlas',funciones.every(m=>new RegExp(`revoke all on function public\\.${m[1]}\\([^)]*\\) from public, anon;`).test(sql)));
chk('cobros y acciones viven en admin, con RLS y sin permisos',['cobros','acciones'].every(t=>
  new RegExp(`create table if not exists admin\\.${t}`).test(sql)&&new RegExp(`alter table admin\\.${t} enable row level security`).test(sql)&&
  new RegExp(`revoke all on admin\\.${t} from public, anon, authenticated`).test(sql)));
chk('cada acción queda registrada',['pausar_anuncio','estado_profesor','marcar_cobro'].every(a=>new RegExp(`insert into admin\\.acciones[\\s\\S]{0,160}'${a}'`).test(sql)));
chk('pausar a un profesor solo va y vuelve entre aprobado y suspendido',/p_estado not in \('aprobado', 'suspendido'\)/.test(sql));

console.log('\n=== La página ===');
function nodo(){const n={textContent:'',value:'',hijos:{},addEventListener(){},querySelectorAll(){return [];},querySelector(s){return this.hijos[s]||(this.hijos[s]=nodo());}};
  let html='';Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);}});return n;}
const ctx={console,Intl,Promise,esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  document:{getElementById(){return null;},addEventListener(){}},showToast(){},showConfirm(){}};
vm.createContext(ctx);vm.runInContext(leer('marketplace.js'),ctx);
const run=c=>vm.runInContext(c,ctx);
const ahora=Date.parse('2026-10-01T15:00:00Z');ctx.__ahora=ahora;
const iso=d=>new Date(ahora+d*864e5).toISOString();
const profesores=[{user_id:'p1',nombre:'Profe Sintética',estado:'aprobado',correo:'profe@ejemplo.cl',anuncios:[
  {id:'a1',titulo:'Cálculo II',estado:'publicado',ramos_siglas:['MAT1620'],precio_clp:15000,publicado_at:iso(-5),vence_at:iso(5),
   campana:{dias:10,tope_clp:10000,dias_cobrados:5,vistas:300,aperturas:40,contactos:9,costo_bruto:15500},cobro:{estado:'deuda',monto_clp:10000}},
  {id:'a2',titulo:'Álgebra',estado:'publicado',ramos_siglas:['MAT1203'],precio_clp:0,publicado_at:iso(3),vence_at:iso(13),
   campana:{dias:10,tope_clp:5000,dias_cobrados:0,vistas:0,aperturas:0,contactos:0,costo_bruto:0},cobro:null},
  {id:'a3',titulo:'Física',estado:'en_revision',ramos_siglas:['FIS1514'],precio_clp:12000,publicado_at:null,vence_at:null,campana:null,cobro:null}]},
  {user_id:'p2',nombre:'Otra Profe',estado:'suspendido',correo:'otra@ejemplo.cl',anuncios:[]}];
ctx.__p=profesores;
const r=run('resumenAdminClases(__p,__ahora)');
chk('el resumen separa activas, programadas y en revisión',r.activas===1&&r.programadas===1&&r.revision===1);
chk('lo gastado aplica el tope, igual que lo ve el profesor',r.gastado===10000);
chk('la deuda se suma aparte',r.deuda===10000&&r.cobrado===0);
const html=run('tarjetaAdminProfesor(__p[0],__ahora)');
chk('un anuncio sobre su tope dice que llegó',/Llegó al tope/.test(html));
chk('uno programado se ve como programado y se puede pausar',/Programado/.test(html)&&/data-admin-pausar="a2"/.test(html));
chk('uno en revisión no ofrece cobro ni pausa',!/data-admin-anuncio="a3"[\s\S]*?data-cobro-estado[\s\S]*?data-admin-anuncio/.test(html)&&!/data-admin-pausar="a3"/.test(html));
chk('el cobro guardado aparece elegido',/<option value="deuda" selected>En deuda/.test(html));
chk('un profesor aprobado se puede pausar',/data-admin-profesor="p1" data-estado="suspendido"/.test(html));
chk('uno pausado se puede reactivar',/data-admin-profesor="p2" data-estado="aprobado"/.test(run('tarjetaAdminProfesor(__p[1],__ahora)')));

(async()=>{
  const raiz=nodo();ctx.__raiz=raiz;
  ctx.__sb={rpc:async()=>({data:null,error:{code:'42501',message:'sin acceso'}})};
  run('supabaseClient=__sb');
  await run('pintarPanelAdmin(__raiz)');
  chk('sin acceso lo dice en vez de mostrar una página vacía',/no tiene acceso/.test(raiz.innerHTML));
  console.log(`\n${ok} OK, ${fail} FAIL`);
  process.exit(fail?1:0);
})();
