// Pegar un horario no debe agregar nada hasta que el estudiante vea y confirme
// las siglas verificadas contra el catálogo UC completo.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(raiz,'app.js');
const elementos={};
function elemento(){return {
  innerHTML:'',textContent:'',value:'',disabled:false,checked:true,dataset:{},style:{setProperty(){}},
  classList:{add(){},remove(){},contains(){return true}},
  addEventListener(){},appendChild(){},focus(){},setAttribute(){},removeAttribute(){},querySelector(){return null},
};}
function get(id){return elementos[id]||(elementos[id]=elemento());}
const ctx={
  console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:get,querySelector:()=>elemento(),querySelectorAll:()=>[],createElement:elemento,
    addEventListener(){},documentElement:elemento(),body:elemento(),head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},
  location:{origin:'https://gradehub.cl',pathname:'/',search:'',hash:''},history:{replaceState(){}},
  setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},
};
vm.createContext(ctx);
for(const file of ['data.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(raiz,file),'utf8'),ctx,{filename:file});
vm.runInContext(fs.readFileSync(appPath,'utf8'),ctx,{filename:'app.js'});
const run=src=>vm.runInContext(src,ctx);
let ok=0,fail=0;
function chk(n,c){if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}}

(async()=>{
  console.log('\n=== Un horario pegado se reconoce sin alterar el semestre ===');
  chk('Agregar ramo ofrece pegar un horario solo para UC',
    /function openAddRamoModal\(\)[\s\S]*?S\.tenant==='uc'[\s\S]*?abrirImportarHorarioBuscacursos/.test(fs.readFileSync(appPath,'utf8')));
  chk('existe extracción y confirmación separadas',
    run('typeof extraerCodigosHorarioBuscacursos')==='function'&&
    run('typeof reconocerHorarioBuscacursos')==='function'&&
    run('typeof aplicarHorarioBuscacursos')==='function');
  if(fail){console.log(`\nPASS: ${ok}   FAIL: ${fail}`);process.exit(1);}

  const codigos=run("extraerCodigosHorarioBuscacursos('Lunes MAT1610-01, martes MAT1610-01; IIC2333–3; FAK1234-2; MAT1610-02')");
  chk('repeticiones de una clase no crean ramos duplicados',codigos.length===4);
  chk('dos secciones distintas del mismo ramo quedan detectables',
    codigos.filter(r=>r.sigla==='MAT1610').length===2);
  const atipicos=run("extraerCodigosHorarioBuscacursos('EDU21DC-1 ESM01AD-2 UC_0001-3')");
  chk('admite las formas atípicas que sí existen en el catálogo UC',
    atipicos.map(r=>r.sigla).join('|')==='EDU21DC|ESM01AD|UC_0001');

  run("S.tenant='uc'; S.carrera='ING-PC'; S.ramos=[]; globalThis.__guardados=0; save=()=>{globalThis.__guardados++};renderHome=()=>{};openModal=()=>{};closeModal=()=>{};showToast=()=>{};track=()=>{};");
  run("cargarCursosUC=()=>new Promise(resolve=>{globalThis.__resolverCatalogo=resolve})");
  run('abrirImportarHorarioBuscacursos()');
  get('m-horario-texto').value='MAT1610-01 MAT1610-01 IIC2333-3 FAK1234-2';
  const pendiente=run('reconocerHorarioBuscacursos()');
  chk('mientras carga el archivo no hay propuesta ni escrituras',
    run('S.ramos.length===0 && __guardados===0 && !_horarioUCReconocido'));
  run("var CURSOS_UC_FULL=[['MAT1610','Cálculo I',10],['IIC2333','Sistemas Operativos y Redes',10]];__resolverCatalogo(true)");
  await pendiente;
  chk('solo propone siglas presentes en cursos-uc.js',
    run("_horarioUCReconocido.length===2 && _horarioUCReconocido.every(r=>r.sigla!=='FAK1234')"));
  chk('antes de confirmar las notas y el semestre siguen intactos',
    run('S.ramos.length===0 && __guardados===0'));
  chk('el estudiante ve nombre, sigla y sección antes de aceptar',
    /Cálculo I/.test(get('modal-content').innerHTML)&&/MAT1610/.test(get('modal-content').innerHTML)&&/Sección 1/.test(get('modal-content').innerHTML));

  ctx.document.querySelectorAll=sel=>sel==='.horario-ramo-check'?
    [{checked:true,dataset:{i:'0'}},{checked:false,dataset:{i:'1'}}]:[];
  run('aplicarHorarioBuscacursos()');
  chk('agrega solo los marcados con sección y créditos del catálogo',
    run("S.ramos.length===1 && S.ramos[0].seccion===1 && S.ramos[0].creditos===10 && S.ramos[0].origen.ramoKey==='MAT1610'"));
  chk('un ramo con preset llega con su pauta oficial',run('S.ramos[0].categorias.length>0'));
  chk('guarda una sola vez al confirmar',run('__guardados===1'));

  console.log('\n=== Secciones contradictorias y errores de descarga ===');
  run('cargarCursosUC=async()=>true');
  run('abrirImportarHorarioBuscacursos()');
  get('m-horario-texto').value='IIC2333-1 IIC2333-2 MAT1610-3';
  await run('reconocerHorarioBuscacursos()');
  chk('una sigla con dos secciones no se agrega a escondidas',
    run("_horarioUCReconocido.length===0")&&/varias secciones/.test(get('modal-content').innerHTML));
  run('abrirImportarHorarioBuscacursos(true)');
  chk('Corregir conserva el texto pegado',get('m-horario-texto').value==='IIC2333-1 IIC2333-2 MAT1610-3');

  run("CURSOS_UC_FULL=undefined;cargarCursosUC=async()=>false");
  get('m-horario-texto').value='FIS1514-1';
  await run('reconocerHorarioBuscacursos()');
  chk('si el catálogo falla no se declara inválido el horario ni se escribe',
    /No pudimos cargar el catálogo UC/.test(get('m-horario-estado').textContent)&&
    get('m-horario-texto').value==='FIS1514-1'&&run('__guardados===1'));

  console.log('\n=== Una sigla no hereda la pauta de un homónimo ===');
  run("CURSOS_UC_FULL=[['TEB110','Revelación y Fe',8],['TTF012','Revelación y Fe',10]];S.ramos=[]");
  run("var distinto=crearRamoDesdeCatalogo('Revelación y Fe','TEB110')");
  chk('TEB110 conserva su sigla y no recibe la pauta de TTF012',
    run("distinto.sigla==='TEB110' && distinto.categorias.length===0 && distinto.creditos===8 && siglaDeRamo(distinto)==='TEB110'"));
  chk('TTF012 no se toma por duplicado solo porque comparte el nombre',
    run("!ramoPropuestoYaEsta({nombre:'Revelación y Fe',sigla:'TTF012'})"));
  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
