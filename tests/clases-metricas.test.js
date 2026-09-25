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
// Sin `porCanal`, la función por camino no existe: es un servidor sin el SQL
// nuevo, y el panel tiene que caer al total de siempre.
// Lo mismo con `totales`: sin ella, los totales se arman desde los cortes.
// `campana` es la fila de campana_anuncio; sin ella, el SQL de campañas no está
// aplicado y no hay costo que mostrar.
function montar({alcance=null,cortes=[],porCanal=null,totales=null,campana=null}={}){
  ctx.__alcance=alcance;ctx.__cortes=cortes;ctx.__porCanal=porCanal;ctx.__totales=totales;ctx.__campana=campana;
  run(`supabaseClient={rpc:(n)=>Promise.resolve(
    n==='campana_anuncio'?(__campana?{data:[__campana],error:null}:{data:null,error:{message:'no existe'}})
    :n==='alcance_anuncio_por_canal'?(__porCanal?{data:__porCanal,error:null}:{data:null,error:{message:'no existe'}})
    :n==='totales_metricas_anuncio'?(__totales?{data:__totales,error:null}:{data:null,error:{message:'no existe'}})
    :n==='alcance_anuncio'?{data:__alcance,error:null}:{data:__cortes,error:null})};`);
}
const pintar=async(anuncios,datos)=>{
  montar(datos);
  const caja=elemento();ctx.__caja=caja;ctx.__anuncios=anuncios;
  await run("renderPanelProfesor(__caja,__anuncios,{cabecera:t=>'',salida:()=>''})");
  // Las métricas se escriben en el sub-contenedor de cada anuncio.
  return caja.innerHTML+' '+Object.values(caja._buscados||{}).map(e=>e.innerHTML).join(' ');
};

(async()=>{
  console.log('=== Lo que se cobraría va al frente ===');
  const campana={dias:10,inicio:null,tope_clp:10000,dias_cobrados:6,vistas:120,aperturas:15,contactos:4,costo:6550,agotada:false};
  let html=await pintar([anuncio()],{alcance:18,campana});
  chk('las personas vienen de la campaña, que es lo que se cobra',/Se mostró/.test(html)&&/>120<\/b><small>personas distintas/.test(html));
  chk('y también cuántas la abrieron y contactaron',/La abrieron/.test(html)&&/>15<\/b><small>personas distintas/.test(html)&&/Te contactaron/.test(html)&&/>4<\/b><small>personas distintas/.test(html));
  chk('lo que va costando, contra el tope',/Va costando/.test(html)&&/6\.550/.test(html)&&/de tu tope de \$10\.000/.test(html));
  chk('con cada concepto escrito',/120 personas te vieron \(\$1\.200\)/.test(html)&&/4 te contactaron \(\$4\.000\)/.test(html)&&/6 días publicada \(\$600\)/.test(html));
  chk('y se aclara que en el piloto no se cobra',/no se cobra/.test(html));

  html=await pintar([anuncio()],{alcance:18,campana:{...campana,vistas:900,dias_cobrados:10,contactos:9}});
  chk('al llegar al tope lo dice y no pasa del tope',/Llegó a tu tope/.test(html)&&/\$10\.000/.test(html)&&!/Va costando<\/span><b>\$15/.test(html));

  console.log('\n=== Sin la campaña medida no se inventa un costo ===');
  html=await pintar([anuncio()],{alcance:18});
  chk('muestra el alcance de siempre',/Se mostró/.test(html)&&/>18<\/b><small>personas distintas/.test(html));
  chk('pero ningún costo',!/Va costando/.test(html));

  html=await pintar([anuncio()],{alcance:18});
  console.log('\n=== Sin datos suficientes no se inventa un cero ===');
  chk('no dice "0 veces" cuando el servidor no devolvió cortes',
    !/La abrieron/.test(html) && !/<small>veces en total/.test(html) && /aparecen cuando hay suficientes datos/.test(html));

  console.log('\n=== Con datos suficientes sí se muestran ===');
  html=await pintar([anuncio()],{alcance:40,cortes:[
    {dia:'2026-09-20',tipo:'clic',tenant:'uc',ramo_sigla:'MAT1620',eventos:22},
    {dia:'2026-09-20',tipo:'contacto',tenant:'uc',ramo_sigla:'MAT1620',eventos:17},
    {dia:'2026-09-19',tipo:'clic',tenant:'uc',ramo_sigla:'MAT1620',eventos:15}]});
  chk('suma los clics de todos los días',/La abrieron/.test(html)&&/>37<\/b><small>veces en total/.test(html));
  chk('y los contactos',/Te contactaron/.test(html)&&/>17<\/b><small>veces en total/.test(html));
  chk('sin veces medidas, la etapa muestra solo las personas',/<span>Se mostró<\/span><div class="clase-par"><div><b>40<\/b><small>personas distintas<\/small><\/div><\/div>/.test(html));

  console.log('\n=== Con los totales del servidor ===');
  // 40 impresiones en total, aunque ningún día por separado llegue a quince.
  html=await pintar([anuncio({publicado_at:new Date(Date.now()-3*864e5).toISOString(),vence_at:new Date(Date.now()+27*864e5).toISOString()})],
    {porCanal:[{canal:'recomendacion',cuentas:6},{canal:'lista',cuentas:2}],
     totales:[{vista:'total',clave:'',tipo:'impresion',eventos:40},{vista:'total',clave:'',tipo:'contacto',eventos:16}]});
  chk('usa el total aunque ningún día llegue a quince',/Se mostró/.test(html)&&/>40<\/b><small>veces en total/.test(html));
  chk('dibuja la dona de cómo llegaron, con números escritos',/Cómo llegaron/.test(html)&&/Recomendado en Inicio/.test(html)&&/>6</.test(html));
  chk('el anillo de la campaña dice cuántos días quedan',/días quedan/.test(html));
  chk('un día sin datos suficientes no se dibuja como cero',/menos de 15 eventos/.test(html));
  chk('los días de campaña se cuentan',/días quedan/.test(html));
  html=await pintar([anuncio()],{campana:{dias:10,inicio:null,tope_clp:null,dias_cobrados:2,vistas:30,aperturas:5,contactos:1,costo:1750,agotada:false},
     totales:[{vista:'total',clave:'',tipo:'impresion',eventos:90},{vista:'total',clave:'',tipo:'clic',eventos:20}]});
  chk('personas y veces de una misma etapa van juntas',/<span>Se mostró<\/span><div class="clase-par"><div><b>30<\/b><small>personas distintas<\/small><\/div><div><b>90<\/b><small>veces en total/.test(html)
    &&/<span>La abrieron<\/span><div class="clase-par"><div><b>5<\/b><small>personas distintas<\/small><\/div><div><b>20<\/b><small>veces en total/.test(html));

  console.log('\n=== Lo que nadie vio todavía no tiene números ===');
  html=await pintar([anuncio({estado:'borrador',id:'b1'})],{alcance:99});
  chk('un borrador lo dice en vez de mostrar números',
    /Todavía no se publica/.test(html) && !/personas distintas/.test(html));
  // Y uno esperando aprobación tampoco: nunca se mostró, así que no pudo costar.
  html=await pintar([anuncio({estado:'en_revision',id:'r9'})],{alcance:99});
  chk('uno en revisión tampoco, ni alcance ni costo',
    /Cuando lo aprobemos/.test(html) && !/personas distintas/.test(html) && !/Va costando/.test(html));

  console.log('\n=== Cada anuncio con su estado ===');
  html=await pintar([anuncio({id:'p1'}),anuncio({id:'r1',estado:'en_revision',titulo:'Clases de Álgebra'})],{alcance:5});
  chk('publicado y en revisión se distinguen',/Publicado/.test(html)&&/En revisión/.test(html));
  chk('y el título de cada uno aparece',/Cálculo II/.test(html)&&/Álgebra/.test(html));

  console.log('\n=== Si no se puede medir, no se rellena con cero ===');
  html=await pintar([anuncio()],{alcance:null});
  chk('un alcance desconocido sale como raya, no como 0',/Se mostró/.test(html)&&/>—<\/b><small>personas distintas/.test(html));
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
