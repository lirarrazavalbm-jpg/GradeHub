// Subir una foto del horario: se lee en el teléfono (Tesseract.js servido
// desde /ocr/) y lo leído pasa por el mismo filtro que el texto pegado. Acá no
// corre el lector real: se reemplaza por el texto que devolvería, sacado de
// pruebas con pantallazos sintéticos. Las siglas son del catálogo UC; no hay
// datos de ninguna persona.
const fs=require('fs'),vm=require('vm'),path=require('path');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const elementos={};
function elemento(){return {innerHTML:'',textContent:'',value:'',disabled:false,checked:true,dataset:{},files:[],style:{setProperty(){}},
  classList:{add(){},remove(){},contains(){return true}},addEventListener(){},appendChild(){},focus(){},setAttribute(){},removeAttribute(){},querySelector(){return null}};}
const get=id=>elementos[id]||(elementos[id]=elemento());
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:get,querySelector:()=>elemento(),querySelectorAll:()=>[],createElement:elemento,addEventListener(){},documentElement:elemento(),body:elemento(),head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'https://gradehub.cl',href:'https://gradehub.cl/',pathname:'/',search:'',hash:''},
  history:{replaceState(){}},setTimeout,clearTimeout,requestAnimationFrame(){return 1},cancelAnimationFrame(){},URL};
vm.createContext(ctx);
for(const f of ['data.js','engine.js','app.js'])vm.runInContext(leer(f),ctx,{filename:f});
const run=s=>vm.runInContext(s,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const codigos=t=>run(`extraerCodigosHorarioBuscacursos(normalizarTextoOcrHorario(${JSON.stringify(t)}))`).map(r=>r.sigla+'-'+r.seccion).join(' ');

(async()=>{
  console.log('=== Lo que el lector confunde ===');
  chk('un uno al inicio de las letras es una I',codigos('9:40 | 1IC2233-2 | FIS1514-1')==='IIC2233-2 FIS1514-1');
  chk('una O o una D entre los números es un cero',codigos('MAT161O-3 MAT162D')==='MAT1610-3 MAT1620-null');
  chk('una hora o un número suelto no se vuelven sigla',codigos('8:20 11:00 2026-2 CAT LAB AYUD')==='');
  chk('las palabras normales no se tocan',run("normalizarTextoOcrHorario('Horario cat')")==='HORARIO CAT');

  console.log('\n=== La sección es opcional ===');
  chk('sin sección igual se reconoce la sigla',codigos('FIS1514-\nCAT ICS1113')==='FIS1514-null ICS1113-null');
  chk('si aparece con y sin sección, manda la que la trae',codigos('MAT1620- 3 MAT1620-3')==='MAT1620-3');
  chk('el texto pegado de siempre sigue igual',run("extraerCodigosHorarioBuscacursos('MAT1610-01, IIC2333–3')").map(r=>r.sigla+'-'+r.seccion).join(' ')==='MAT1610-1 IIC2333-3');

  console.log('\n=== L e I solo se cambian si una sola variante existe ===');
  const existe="x=>['IIC2233','MAT1620','ILE1000','LLE1000'].includes(x)";
  chk('LIC2233 es IIC2233',run(`siglaOcrEnCatalogo('LIC2233',${existe})`)==='IIC2233');
  chk('una sigla que existe no se cambia',run(`siglaOcrEnCatalogo('MAT1620',${existe})`)==='MAT1620');
  chk('con dos candidatas no se adivina',run(`siglaOcrEnCatalogo('LIE1000',${existe})`)==='LIE1000');

  console.log('\n=== Mi UC: la sección va en la línea de abajo ===');
  // Cajas como las que entrega el lector con un pantallazo de Mi UC: la sigla
  // termina en guion y el número de sección queda debajo, dentro de su ancho.
  // El número de módulo de la fila (9) está al lado, fuera de la celda.
  const palabras=[
    {texto:'MAT1620-',x0:955,y0:1012,x1:1150,y1:1042},{texto:'2',x0:1044,y0:1060,x1:1062,y1:1090},
    {texto:'09:40',x0:141,y0:1056,x1:282,y1:1114},{texto:'9',x0:142,y0:1240,x1:161,y1:1273},
    {texto:'1IC1103-',x0:534,y0:1062,x1:708,y1:1092},{texto:'11',x0:602,y0:1111,x1:642,y1:1140},
    {texto:'FIS1514-',x0:316,y0:1062,x1:496,y1:1092},{texto:'13',x0:386,y0:1110,x1:428,y1:1140},
    {texto:'TTF012-1',x0:742,y0:1234,x1:928,y1:1285},{texto:'1',x0:1046,y0:1269,x1:1061,y1:1298},
    {texto:'BIO143M-',x0:524,y0:1220,x1:720,y1:1250},
  ];
  ctx.__lect=[{texto:'MAT1620-9',palabras}];
  chk('la sección es el número de abajo, no el de la fila',
    run('codigosDeFotoHorario(__lect)').map(r=>r.sigla+'-'+r.seccion).join(' ')==='MAT1620-2 IIC1103-11 FIS1514-13 TTF012-1 BIO143M-null');
  ctx.__lect=[{palabras:[{texto:'MAT1620-3',x0:0,y0:0,x1:100,y1:30}]},{palabras:[{texto:'MAT1620-8',x0:0,y0:0,x1:100,y1:30}]}];
  chk('con lecturas empatadas el ramo va sin sección',run('codigosDeFotoHorario(__lect)')[0].seccion===null);
  ctx.__lect=[{palabras:[{texto:'MAT1620-3',x0:0,y0:0,x1:100,y1:30}]},{palabras:[{texto:'MAT1620-3',x0:0,y0:0,x1:100,y1:30}]},{palabras:[{texto:'MAT1620-8',x0:0,y0:0,x1:100,y1:30}]}];
  chk('gana la sección que más se repite',run('codigosDeFotoHorario(__lect)')[0].seccion===3);
  chk('sin cajas, solo cuenta la sección en la misma línea',
    run("codigosDeFotoHorario([{texto:'MAT1620-\\n9 FIS1514-1'}])").map(r=>r.sigla+'-'+r.seccion).join(' ')==='MAT1620-null FIS1514-1');

  console.log('\n=== De la foto a la propuesta, sin tocar el semestre ===');
  run("S.tenant='uc';S.carrera='ING-PC';S.ramos=[];globalThis.__g=0;save=()=>{__g++};renderHome=()=>{};openModal=()=>{};closeModal=()=>{};showToast=()=>{};track=()=>{};");
  run("var CURSOS_UC_FULL=[['MAT1620','Cálculo II',10],['IIC2233','Programación Avanzada',10],['FIS1514','Dinámica',10]];cargarCursosUC=async()=>true;");
  run('openAddRamoModal()');
  chk('Agregar ramo ofrece subir la foto',/Subir foto de tu horario/.test(get('modal-content').innerHTML)&&!/Pegar horario de BuscaCursos/.test(get('modal-content').innerHTML));
  run('abrirImportarHorarioBuscacursos()');
  const modal=get('modal-content').innerHTML;
  chk('el modal pide una imagen y dice que no sale del teléfono',/type="file"[^>]*accept="image\/\*"/.test(modal)&&/no sale de tu dispositivo/.test(modal));
  chk('pegar texto queda como alternativa',/<details[^>]*horario-texto-alt/.test(modal)&&/m-horario-texto/.test(modal));
  run("leerFotoOcr=async(f,p)=>{p&&p(0.5);return [{texto:'Horario 2026-2\\nMAT1620-3 MAT1620-3\\n1IC2233-2 | FIS1514-\\nCAT',palabras:[]}];}");
  const input={files:[{type:'image/png',size:200000}],value:'x',disabled:false};
  ctx.__input=input;
  await run('leerFotoHorario(__input)');
  chk('propone lo leído, validado contra el catálogo',run("_horarioUCReconocido.map(r=>r.sigla+'-'+r.seccion).join(' ')")==='MAT1620-3 IIC2233-2 FIS1514-null');
  chk('y todavía no agrega nada',run('S.ramos.length===0&&__g===0'));
  chk('la sección que falta no se inventa',/Dinámica<\/b><small>FIS1514<\/small>/.test(get('modal-content').innerHTML));
  chk('el input queda listo para otra foto',input.disabled===false&&input.value==='');
  chk('lo que no calza con el catálogo no se nombra: sería ruido del lector',!/No reconocimos/.test(get('modal-content').innerHTML));
  chk('pero se dice qué hacer si falta un ramo',/Falta alguno/.test(get('modal-content').innerHTML));
  ctx.document.querySelectorAll=sel=>sel==='.horario-ramo-check'?[{checked:true,dataset:{i:'2'}}]:[];
  run('aplicarHorarioBuscacursos()');
  chk('sin sección, el ramo se agrega sin ella',run("S.ramos.length===1&&S.ramos[0].sigla==='FIS1514'&&S.ramos[0].seccion==null&&__g===1"));

  console.log('\n=== Una sigla que solo existe como pauta también vale ===');
  run('abrirImportarHorarioBuscacursos()');
  run("leerFotoOcr=async()=>[{texto:'TTF012-1'}]");
  ctx.__input={files:[{type:'image/png',size:1000}],value:'x'};
  await run('leerFotoHorario(__input)');
  chk('TTF012 no está en cursos-uc.js pero sí en PRESETS_UC',run("_horarioUCReconocido.length===1&&_horarioUCReconocido[0].sigla==='TTF012'&&_horarioUCReconocido[0].nombre==='Revelación y Fe'"));

  console.log('\n=== Si algo falla, se dice y no se escribe nada ===');
  run('abrirImportarHorarioBuscacursos()');
  ctx.__input={files:[{type:'application/pdf',size:1000}],value:'x'};
  await run('leerFotoHorario(__input)');
  chk('un archivo que no es imagen se rechaza',/Elige una imagen/.test(get('m-horario-estado').textContent));
  run("leerFotoOcr=async()=>{throw new Error('ocr-no-carga')}");
  ctx.__input={files:[{type:'image/jpeg',size:1000}],value:'x'};
  await run('leerFotoHorario(__input)');
  chk('si el lector no carga, lo dice',/No pudimos leer la foto/.test(get('m-horario-estado').textContent)&&run('__g===1'));
  run("leerFotoOcr=async()=>[{texto:'Lunes Martes CAT',palabras:[]}]");
  await run('leerFotoHorario(__input)');
  chk('una foto sin siglas lo dice',/No encontramos siglas en la foto/.test(get('m-horario-estado').textContent));

  console.log('\n=== El lector vive en este dominio ===');
  const archivos=['tesseract.min.js','worker.min.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-lstm.wasm.js','eng.traineddata.gz','LICENSE.txt'];
  chk('los archivos de /ocr/ están en el repo',archivos.every(f=>fs.existsSync(path.join(raiz,'ocr',f))));
  const deploy=leer('.github/workflows/deploy.yml');
  chk('y el deploy los publica',archivos.every(f=>deploy.includes('ocr/'+f)));
  chk('la CSP permite compilar WebAssembly',/script-src[^;\n]*'wasm-unsafe-eval'/.test(leer('_headers')));
  chk('el lector se pide a este dominio, no a un CDN',/const OCR_BASE='\/ocr\/'/.test(leer('app.js'))&&/workerBlobURL:false/.test(leer('app.js')));

  console.log(`\nPASS: ${ok}   FAIL: ${fail}`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
