// Sincronización sin pérdidas (2026-09-29). Hasta ese día se perdían notas en
// dos casos reales, reproducidos con las funciones de verdad:
//   1. Una nota anotada sin conexión no alcanzaba a subir y, al reabrir con
//      red, afterLogin() la pisaba con la nube.
//   2. Una pestaña vieja subía su copia completa y borraba lo que se había
//      anotado en otro dispositivo.
// Cada "dispositivo" de este test carga la app completa con su propio
// localStorage; todos comparten una nube falsa que entiende la escritura
// condicional por versión (`data->>_rev`), igual que PostgREST.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const fuente=['data.js','engine.js','app.js','app-session.js'].map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');

let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

// ── La nube ──────────────────────────────────────────────────────────────────
function crearNube(){
  const filas=new Map();                      // user_id → data
  const nube={filas,red:true,escrituras:0};
  const sinRed=()=>{if(!nube.red)throw new TypeError('Failed to fetch');};
  const leerRev=d=>d&&d._rev!=null?String(d._rev):null;
  const cualquiera=()=>new Proxy(function(){},{
    get:(t,k)=>k==='then'?(r=>r({data:null,error:null})):cualquiera(),
    apply:()=>cualquiera(),
  });
  nube.cliente={
    rpc:async()=>({data:null,error:null}),
    auth:{signOut:async()=>{}},
    from(tabla){
      if(tabla!=='user_ramos')return cualquiera();
      return {
        select:()=>({eq:(_c,uid)=>({maybeSingle:async()=>{sinRed();
          return {data:filas.has(uid)?{data:JSON.parse(JSON.stringify(filas.get(uid)))}:null,error:null};}})}),
        upsert:async fila=>{sinRed();nube.escrituras++;filas.set(fila.user_id,JSON.parse(JSON.stringify(fila.data)));return {error:null};},
        update(valores){
          const filtros=[];
          const q={
            eq(col,val){filtros.push([col,'eq',val]);return q;},
            is(col,val){filtros.push([col,'is',val]);return q;},
            async select(){sinRed();
              const uid=(filtros.find(f=>f[0]==='user_id')||[])[2];
              const actual=filas.get(uid);
              const calza=actual!==undefined&&filtros.every(([col,op,val])=>{
                if(col==='user_id')return true;
                const rev=leerRev(actual);
                return op==='is'?rev===null:rev===val;
              });
              if(!calza)return {data:[],error:null};
              nube.escrituras++;filas.set(uid,JSON.parse(JSON.stringify(valores.data)));
              return {data:[{user_id:uid}],error:null};
            },
          };
          return q;
        },
      };
    },
  };
  return nube;
}

// ── Un dispositivo: la app completa con su propio almacenamiento ────────────
function el(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false;}},children:[],dataset:{},value:'',
  addEventListener(){},removeEventListener(){},appendChild(h){return h;},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},closest(){return null;},src:''};
  Object.defineProperty(n,'innerHTML',{get(){return html;},set(v){html=String(v);}});return n;}
function dispositivo(nube,almacen=new Map()){
  const ids={};let modalAbierto=false;
  const modal=el();modal.classList.contains=c=>c==='open'&&modalAbierto;ids.modal=modal;
  const avisos=[];
  const ctx={
    window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
    document:{getElementById:id=>ids[id]||(ids[id]=el()),createElement:el,addEventListener(){},removeEventListener(){},documentElement:el(),querySelector(){return null;},querySelectorAll(){return [];},body:el(),head:{appendChild(){}},visibilityState:'visible'},
    localStorage:{getItem:k=>almacen.has(k)?almacen.get(k):null,setItem:(k,v)=>almacen.set(k,String(v)),removeItem:k=>almacen.delete(k)},
    navigator:{},location:{origin:'',pathname:'/',hash:'',reload(){}},history:{replaceState(){}},
    setTimeout,clearTimeout,console:{...console,warn(){}},getComputedStyle:()=>({getPropertyValue:()=>''}),
    __nube:nube.cliente,
  };
  vm.createContext(ctx);vm.runInContext(fuente,ctx);
  const run=c=>vm.runInContext(c,ctx);
  ctx.__avisos=avisos;
  run(`showToast=(m)=>__avisos.push(m);enterApp=()=>{};enterOnboarding=()=>{};renderHome=()=>{};aplicarConsensoAuto=async()=>0;aportarPautasAlCatalogo=async()=>0;`);
  return {ctx,run,almacen,avisos,setModal:v=>{modalAbierto=v;},
    entrar:async uid=>{run(`supabaseClient=__nube;currentUser={id:${JSON.stringify(uid)}};`);await run('afterLogin()');},
    // Anotar una nota como lo hace la app: se modifica S y se guarda.
    // save() programa una subida a los 800 ms; se cancela para que el test
    // decida cuándo sube cada dispositivo.
    anotar:(catIdx,valor,idNota)=>run(`S.ramos[0].categorias[${catIdx}].notas.push({id:${JSON.stringify(idNota)},nombre:'N',valor:${valor},peso:1});save();clearTimeout(_syncTimer);_syncTimer=null;`),
    notas:()=>run(`S.ramos.map(r=>r.categorias.map(c=>c.notas.map(n=>n.valor)))`),
    subir:()=>run('syncNow()'),
  };
}
const estadoInicial=()=>({onboardingDone:true,tenant:'fen',userName:'Estudiante',careerSemestre:1,historial:[],sortMode:'manual',
  ramos:[{id:'r1',nombre:'Micro',color:'#2563eb',categorias:[{id:'c1',nombre:'Solemne 1',peso:50,notas:[]},{id:'c2',nombre:'Solemne 2',peso:50,notas:[]}],gates:[]}]});
const notasEnNube=(nube,uid='u1')=>{const d=nube.filas.get(uid);return d?d.ramos.map(r=>r.categorias.map(c=>c.notas.map(n=>n.valor))):null;};
// Deja el dispositivo como después de usar la app con red: nube y caché al día.
async function preparar(nube,uid='u1'){
  nube.filas.set(uid,estadoInicial());
  const d=dispositivo(nube);await d.entrar(uid);return d;
}
const esperar=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  console.log('=== 1. Una nota anotada sin conexión sobrevive al reabrir con red ===');
  {
    const nube=createNubeYa();
    const cel=await preparar(nube);
    nube.red=false;
    cel.anotar(0,6.2,'n1');await cel.subir();
    chk('sin red la subida falla y la nota queda en el teléfono',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[],[]]]));
    nube.red=true;
    const reabierto=dispositivo(nube,cel.almacen);await reabierto.entrar('u1');
    chk('al reabrir, la nota sigue en pantalla',JSON.stringify(reabierto.notas())===JSON.stringify([[[6.2],[]]]));
    await esperar(50);
    chk('y se sube a la nube',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[6.2],[]]]));
    chk('y queda también en el disco',(JSON.parse(reabierto.almacen.get('gradehub_v1')).ramos[0].categorias[0].notas[0]||{}).valor===6.2);
    chk('se le avisa que se guardó',reabierto.avisos.some(m=>/Guardamos en la nube lo que anotaste/.test(m)));
  }

  console.log('\n=== 2. Abrir la app sin internet (arranca sin sesión) no pierde lo anotado ===');
  {
    const nube=createNubeYa();
    const cel=await preparar(nube);
    const offline=dispositivo(nube,cel.almacen);           // supabase-js no cargó: sin cliente
    offline.anotar(1,5.1,'n2');
    const reabierto=dispositivo(nube,cel.almacen);await reabierto.entrar('u1');await esperar(50);
    chk('la nota de la visita sin internet sigue ahí',JSON.stringify(reabierto.notas())===JSON.stringify([[[],[5.1]]]));
    chk('y llegó a la nube',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[],[5.1]]]));
  }

  console.log('\n=== 3. Una pestaña vieja no borra lo anotado en otro dispositivo ===');
  {
    const nube=createNubeYa();
    const pc=await preparar(nube);                          // 9:00, la pestaña queda abierta
    const cel=dispositivo(nube);await cel.entrar('u1');      // 12:00 en el celular
    cel.anotar(0,6.5,'a');await cel.subir();
    pc.anotar(1,5.0,'b');await pc.subir();                   // 20:00 en la pestaña vieja
    chk('la nube tiene las dos notas',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[6.5],[5]]]));
    chk('la pestaña vieja ahora muestra también la del celular',JSON.stringify(pc.notas())===JSON.stringify([[[6.5],[5]]]));
    chk('y avisa que sumó lo del otro dispositivo',pc.avisos.some(m=>/otro dispositivo/.test(m)));
  }

  console.log('\n=== 4. Lo borrado en un dispositivo no revive desde otro ===');
  {
    const nube=createNubeYa();
    const pc=await preparar(nube);
    const cel=dispositivo(nube);await cel.entrar('u1');
    cel.run(`S.ramos[0].categorias=S.ramos[0].categorias.filter(c=>c.id!=='c2');save();`);await cel.subir();
    pc.anotar(0,4.8,'x');await pc.subir();
    const cats=nube.filas.get('u1').ramos[0].categorias.map(c=>c.id);
    chk('la categoría borrada en el celular sigue borrada',JSON.stringify(cats)===JSON.stringify(['c1']));
    chk('y la nota nueva de la pestaña vieja llegó',nube.filas.get('u1').ramos[0].categorias[0].notas.some(n=>n.valor===4.8));
  }

  console.log('\n=== 5. Si los dos cambian la misma nota, gana lo que se ve en pantalla ===');
  {
    const nube=createNubeYa();
    nube.filas.set('u1',{...estadoInicial(),ramos:[{...estadoInicial().ramos[0],categorias:[{id:'c1',nombre:'Solemne 1',peso:50,notas:[{id:'n',nombre:'S1',valor:4.0,peso:1}]},{id:'c2',nombre:'Solemne 2',peso:50,notas:[]}]}]});
    const pc=dispositivo(nube);await pc.entrar('u1');
    const cel=dispositivo(nube);await cel.entrar('u1');
    cel.run(`S.ramos[0].categorias[0].notas[0].valor=5.0;save();`);await cel.subir();
    pc.run(`S.ramos[0].categorias[0].notas[0].valor=6.0;save();`);await pc.subir();
    chk('no se duplica la nota ni se cae la subida',nube.filas.get('u1').ramos[0].categorias[0].notas.length===1);
    chk('queda la del último que editó',nube.filas.get('u1').ramos[0].categorias[0].notas[0].valor===6.0);
  }

  console.log('\n=== 6. Copias de antes del cambio (sin _rev) y la primera apertura ===');
  {
    const nube=createNubeYa();
    // La nube y la caché vienen de la versión anterior: sin _rev y sin base.
    nube.filas.set('u1',estadoInicial());
    const almacen=new Map([['gradehub_v1',JSON.stringify(estadoInicial())],['gradehub_cache_owner','u1']]);
    const viejo=dispositivo(nube,almacen);
    viejo.anotar(0,5.5,'sin-subir');                          // quedó sin subir antes de actualizar
    const nuevo=dispositivo(nube,almacen);await nuevo.entrar('u1');await esperar(50);
    chk('lo que no alcanzó a subir con la versión anterior se conserva',JSON.stringify(nuevo.notas())===JSON.stringify([[[5.5],[]]]));
    chk('y se sube',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[5.5],[]]]));
    chk('la nube queda con número de versión',Number.isInteger(nube.filas.get('u1')._rev));
    nuevo.anotar(1,6.1,'otra');await nuevo.subir();
    chk('y la siguiente subida condicional funciona',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[5.5],[6.1]]]));
  }
  {
    // Sin base y con una copia vieja con elementos sin id: fusionar duplicaría.
    const nube=createNubeYa();
    const conNotaSinId=estadoInicial();conNotaSinId.ramos[0].categorias[0].notas=[{nombre:'S1',valor:4.4}];
    nube.filas.set('u1',conNotaSinId);
    const almacen=new Map([['gradehub_v1',JSON.stringify({...estadoInicial(),userName:'Otro nombre'})],['gradehub_cache_owner','u1']]);
    const d=dispositivo(nube,almacen);await d.entrar('u1');
    chk('una copia vieja sin ids no se fusiona: manda la nube, sin duplicar',JSON.stringify(d.notas())===JSON.stringify([[[4.4],[]]]));
  }

  console.log('\n=== 7. Lo que no debe cambiar ===');
  {
    const nube=createNubeYa();
    const pc=await preparar(nube);
    const cel=dispositivo(nube);await cel.entrar('u1');
    cel.anotar(0,5.9,'z');await cel.subir();
    const antes=nube.escrituras;
    const pc2=dispositivo(nube,pc.almacen);await pc2.entrar('u1');await esperar(50);
    chk('sin cambios locales, al entrar manda la nube',JSON.stringify(pc2.notas())===JSON.stringify([[[5.9],[]]]));
    chk('y no se escribe nada de vuelta',nube.escrituras===antes);
  }
  {
    // Caché de otra cuenta en un navegador compartido: nunca se mezcla.
    const nube=createNubeYa();
    nube.filas.set('u2',estadoInicial());
    const almacen=new Map([['gradehub_v1',JSON.stringify({...estadoInicial(),userName:'Persona A',ramos:[{...estadoInicial().ramos[0],nombre:'Ramo de A'}]})],['gradehub_cache_owner','u1']]);
    const d=dispositivo(nube,almacen);await d.entrar('u2');await esperar(50);
    chk('los datos de otra cuenta no se fusionan',d.run('S.ramos.map(r=>r.nombre).join()')==='Micro'&&d.run('S.userName')!=='Persona A');
    chk('ni se suben a la cuenta nueva',!JSON.stringify(nube.filas.get('u2')).includes('Ramo de A'));
  }
  {
    const nube=createNubeYa();
    const d=await preparar(nube);
    chk('la base existe mientras hay sesión',d.almacen.has('gradehub_v1_base'));
    await d.run('signOut()');
    chk('cerrar sesión borra la base (es una copia de los datos)',!d.almacen.has('gradehub_v1_base'));
  }
  {
    // Con un modal abierto no se reemplaza S: el formulario editaría objetos
    // que ya no están en el estado.
    const nube=createNubeYa();
    const pc=await preparar(nube);                          // la pestaña vieja
    const cel=dispositivo(nube);await cel.entrar('u1');cel.anotar(0,6.6,'m');await cel.subir();
    pc.setModal(true);
    pc.run(`window.__ref=S;`);
    pc.anotar(1,4.2,'k');
    const subio=await pc.subir();
    chk('con un modal abierto la subida espera en vez de fusionar',subio===false&&pc.run('S===window.__ref'));
    chk('y no se pisó nada en la nube',JSON.stringify(notasEnNube(nube))===JSON.stringify([[[6.6],[]]]));
  }

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

function createNubeYa(){return crearNube();}
