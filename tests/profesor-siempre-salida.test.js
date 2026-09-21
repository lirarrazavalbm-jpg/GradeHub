// Toda pantalla del espacio de profesor tiene que poder cerrarse.
//
// Desde que el modal no se cierra ni arrastrándolo ni tocando fuera (#424), una
// ventana sin botón deja a la persona encerrada. Pasó: al mandar la postulación,
// "Tu postulación está esperando revisión" no tenía cómo salir.
//
// El test anterior no lo cazó porque buscaba un patrón de texto —asignaciones a
// modal-content— y estas pantallas reciben el contenedor como parámetro. Así que
// acá NO se busca texto: se dibuja cada estado y se mira si hay salida.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const leer=f=>fs.readFileSync(raiz+f,'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function elemento(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',textContent:'',dataset:{},
 addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return n},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){}};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v)}});return n;}
const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
 document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>elemento(),querySelectorAll:()=>[],body:elemento()},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js','render-main.js','render-agenda.js','marketplace.js'].map(leer).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
run("openModal=()=>{};closeModal=()=>{};showToast=()=>{};S={ramos:[],tenant:'uc',carrera:'ING-PC',careerSemestre:2,onboardingDone:true,historial:[],sortMode:'manual',userName:''};currentUser={id:'u1'};supabaseClient={};");

// Cada estado en el que puede quedar alguien, y cómo se llega.
const estados={
  'no se pudo consultar (SQL sin aplicar)': "perfilProfesorActual=async()=>({ok:false,error:'El espacio de profesor todavía no está disponible.'});",
  'postulación en revisión':                "perfilProfesorActual=async()=>({ok:true,perfil:{estado:'pendiente',nombre_publico:'P'}});",
  'postulación rechazada':                  "perfilProfesorActual=async()=>({ok:true,perfil:{estado:'rechazado',nombre_publico:'P'}});",
  'acceso suspendido':                      "perfilProfesorActual=async()=>({ok:true,perfil:{estado:'suspendido',nombre_publico:'P'}});",
  'no se pudo abrir el borrador':           "perfilProfesorActual=async()=>({ok:true,perfil:{estado:'aprobado',nombre_publico:'P'}});abrirBorradorClase=async()=>({ok:false,error:'No pudimos abrir tu borrador.'});",
  'todavía no postula':                     "perfilProfesorActual=async()=>({ok:true,perfil:null});",
};

console.log('=== En la ventana, cada estado tiene cómo cerrarse ===');
(async()=>{
  for(const [nombre,preparar] of Object.entries(estados)){
    run(preparar);
    const caja=elemento();
    ctx.__caja=caja;
    await run('renderEspacioProfesor(__caja,{titulo:true})');
    chk(nombre, /closeModal\(\)/.test(caja.innerHTML));
  }

  console.log('\n=== En la pestaña no se ofrece cerrar, porque no hay qué ===');
  run(estados['postulación en revisión']);
  const enPestana=elemento(); ctx.__caja=enPestana;
  await run('renderEspacioProfesor(__caja,{titulo:false})');
  chk('la misma pantalla dentro de la pestaña no lleva botón de cerrar', !/closeModal\(\)/.test(enPestana.innerHTML));
  chk('y tampoco repite el título de ventana', !/modal-title/.test(enPestana.innerHTML));

  console.log('\n=== El formulario de postulación se puede cancelar ===');
  const form=elemento(); ctx.__caja=form;
  run('renderPostulacionProfesor(__caja)');
  chk('tiene Cancelar además de Enviar',
    /closeModal\(\)/.test(form.innerHTML) && /Enviar postulación/.test(form.innerHTML));

  console.log('\nPASS: '+ok+'   FAIL: '+fail);
  process.exit(fail?1:0);
})();
