// La página de Clases muestra cómo le va a cada anuncio. Lo que importa acá no
// es el formato: es que no invente números.
//
// Dos reglas que vienen del servidor y la pantalla tiene que respetar:
//   · `alcance_anuncio` da cuentas DISTINTAS, que es lo que se cobra. Es exacto.
//   · `resumen_metricas_anuncio` NO devuelve cortes con menos de quince eventos.
//     Ahí no se muestra "0 clics": se dice que todavía son pocos datos.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const leer=f=>fs.readFileSync(raiz+f,'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function elemento(){let html='';const hijos=[];const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:hijos,value:'',textContent:'',dataset:{},isConnected:true,
 addEventListener(){},appendChild(h){hijos.push(h);return h},setAttribute(){},removeAttribute(){},getAttribute(){return null},
 querySelector(sel){return (n._buscados=n._buscados||{})[sel]||(n._buscados[sel]=elemento())},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){}};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v)}});return n;}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
 document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>elemento(),querySelectorAll:()=>[],body:elemento()},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console,Intl};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js','render-main.js','render-agenda.js','marketplace.js'].map(leer).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
run("openModal=()=>{};closeModal=()=>{};showToast=()=>{};S={ramos:[],tenant:'uc',carrera:'ING-PC',careerSemestre:2,onboardingDone:true,historial:[],sortMode:'manual',userName:''};currentUser={id:'u1'};");

const anuncio=(extra)=>Object.assign({id:'a1',titulo:'Clases de Cálculo II',estado:'publicado',
  ramos_siglas:['MAT1620'],precio_clp:15000,criterios:{promedioMenorA:5,avanceMinimo:20}},extra||{});

// Supabase de mentira: se le dice qué contesta cada RPC.
function montar({alcance=null,cortes=[]}={}){
  ctx.__alcance=alcance;ctx.__cortes=cortes;
  run(`supabaseClient={rpc:(n)=>Promise.resolve(n==='alcance_anuncio'?{data:__alcance,error:null}:{data:__cortes,error:null})};`);
}
const pintar=async(anuncios,datos)=>{
  montar(datos);
  const caja=elemento();ctx.__caja=caja;ctx.__anuncios=anuncios;
  await run("renderPanelProfesor(__caja,__anuncios,{cabecera:t=>'',salida:()=>''})");
  // Las métricas se escriben en el sub-contenedor de cada anuncio.
  return caja.innerHTML+' '+Object.values(caja._buscados||{}).map(e=>e.innerHTML).join(' ');
};

(async()=>{
  console.log('=== Lo que se cobra va al frente ===');
  let html=await pintar([anuncio()],{alcance:18});
  chk('muestra las personas distintas alcanzadas',/Personas alcanzadas/.test(html)&&/>18</.test(html));
  chk('y lo que lleva gastado con la tarifa real',/Va costando/.test(html));
  // 18 personas · bajo 5,0 y 20% evaluado = $1.400 c/u + $3.000 de publicación.
  chk('el costo usa la misma cotización que al armar el anuncio',/28\.200|\$28/.test(html));

  console.log('\n=== Sin datos suficientes no se inventa un cero ===');
  chk('no dice "0 clics" cuando el servidor no devolvió cortes',
    !/Clics/.test(html) && /aparecen cuando hay suficientes datos/.test(html));

  console.log('\n=== Con datos suficientes sí se muestran ===');
  html=await pintar([anuncio()],{alcance:40,cortes:[
    {dia:'2026-09-20',tipo:'clic',tenant:'uc',ramo_sigla:'MAT1620',eventos:22},
    {dia:'2026-09-20',tipo:'contacto',tenant:'uc',ramo_sigla:'MAT1620',eventos:17},
    {dia:'2026-09-19',tipo:'clic',tenant:'uc',ramo_sigla:'MAT1620',eventos:15}]});
  chk('suma los clics de todos los días',/Clics/.test(html)&&/>37</.test(html));
  chk('y los contactos',/Contactos/.test(html)&&/>17</.test(html));

  console.log('\n=== Lo que nadie vio todavía no tiene números ===');
  html=await pintar([anuncio({estado:'borrador',id:'b1'})],{alcance:99});
  chk('un borrador lo dice en vez de mostrar números',
    /Todavía no se publica/.test(html) && !/Personas alcanzadas/.test(html));
  // Y uno esperando aprobación tampoco: nunca se mostró, así que no pudo costar.
  html=await pintar([anuncio({estado:'en_revision',id:'r9'})],{alcance:99});
  chk('uno en revisión tampoco, ni alcance ni costo',
    /Cuando lo aprobemos/.test(html) && !/Personas alcanzadas/.test(html) && !/Va costando/.test(html));

  console.log('\n=== Cada anuncio con su estado ===');
  html=await pintar([anuncio({id:'p1'}),anuncio({id:'r1',estado:'en_revision',titulo:'Clases de Álgebra'})],{alcance:5});
  chk('publicado y en revisión se distinguen',/Publicado/.test(html)&&/En revisión/.test(html));
  chk('y el título de cada uno aparece',/Cálculo II/.test(html)&&/Álgebra/.test(html));

  console.log('\n=== Si no se puede medir, no se rellena con cero ===');
  html=await pintar([anuncio()],{alcance:null});
  chk('un alcance desconocido sale como raya, no como 0',/Personas alcanzadas/.test(html)&&/>—</.test(html));
  chk('y sin alcance no se afirma un costo',!/Va costando/.test(html));

  console.log('\n=== Administrar la campaña desde la página ===');
  // La RLS deja al profesor llevar su aviso a borrador, revisión o pausa, y NO
  // a publicado ni expirado: eso lo marca el equipo. Los botones tienen que
  // ofrecer exactamente eso y nada más.
  html=await pintar([anuncio({id:'p2'})],{alcance:7});
  chk('un anuncio publicado se puede pausar',/data-pausar="p2"/.test(html));
  chk('y no se ofrece terminarlo, que no le corresponde',!/expirad/i.test(html));
  html=await pintar([anuncio({id:'z1',estado:'pausado'})],{alcance:7});
  chk('uno pausado ofrece volver a editarlo',/data-retomar="z1"/.test(html));
  html=await pintar([anuncio({id:'b2',estado:'borrador'})],{alcance:7});
  chk('un borrador no ofrece ni pausar ni retomar',!/data-pausar|data-retomar/.test(html));
  const mk=leer('marketplace.js');
  chk('el cambio de estado rechaza los que no le tocan al profesor',
    /\['borrador','en_revision','pausado'\]\.includes\(estado\)/.test(mk));
  chk('y antes de pausar se avisa que no se reanuda sola',
    /no se reanuda sola/.test(mk));

  console.log('\nPASS: '+ok+'   FAIL: '+fail);
  process.exit(fail?1:0);
})();
