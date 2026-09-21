// Una categoría colectiva no convierte cada entrega en "Controles 1".
// Los nombres propios y las notas ya guardadas siguen perteneciendo al alumno.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
const appPath=process.env.GRADEHUB_APP||path.join(root,'app.js');
const files=['data.js','engine.js',appPath,'render-agenda.js'];
const stub={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},addEventListener(){},appendChild(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return null},focus(){},value:'',innerHTML:'',textContent:'',dataset:{}};
const ctx={console,window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},document:{getElementById(){return stub},createElement(){return stub},addEventListener(){},documentElement:stub,body:stub,querySelector(){return null},querySelectorAll(){return[]}},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout};
vm.createContext(ctx);
files.forEach(file=>vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file}));
const run=expr=>vm.runInContext(expr,ctx);
let failures=0;
function check(label,ok){console.log((ok?'OK  ':'FAIL ')+label);if(!ok)failures++}

const ramo={nombre:'Ramo manual',origen:null};
const etiqueta=run('etiquetaCasilla');
check('Controles se muestra como Control 1',etiqueta(ramo,{nombre:'Controles',slots:3},0)==='Control 1');
check('Pruebas teóricas conserva género y singular',etiqueta(ramo,{nombre:'Pruebas teóricas',slots:2},1)==='Prueba teórica 2');
check('Controles de lectura conserva el complemento',etiqueta(ramo,{nombre:'Controles de lectura',slots:2},0)==='Control de lectura 1');
check('Trabajos prácticos concuerda en singular',etiqueta(ramo,{nombre:'Trabajos prácticos',slots:2},0)==='Trabajo práctico 1');
check('UC: Interrogaciones se muestra como Interrogación 1',etiqueta(ramo,{nombre:'Interrogaciones',slots:3},0)==='Interrogación 1');
check('FEN: Solemnes se muestra como Solemne 1',etiqueta(ramo,{nombre:'Solemnes',slots:2},0)==='Solemne 1');
check('un nombre explícito del preset manda sobre la derivación',etiqueta(ramo,{nombre:'Informes',slots:6,slotLabel:'Informe de taller',slotStart:0},0)==='Informe de taller 0');
check('un nombre desconocido no se singulariza a ciegas',etiqueta(ramo,{nombre:'Análisis',slots:2},0)==='Análisis 1');

const notaVieja={id:'n1',nombre:'Controles 1',valor:5.4,peso:1,slot:0,fecha:'2026-10-01'};
const categoria={id:'c1',nombre:'Controles',peso:100,directNota:true,slots:3,notas:[notaVieja]};
const evento={fecha:notaVieja.fecha,ramo,cat:categoria,nota:notaVieja,notas:[notaVieja],pending:false};
check('Agenda muestra el singular sin reescribir la nota antigua',run('nombreEventoAgenda')(evento)==='Control 1'&&notaVieja.nombre==='Controles 1');
check('un nombre personalizado se respeta',run('nombreEventoAgenda')({...evento,nota:{...notaVieja,nombre:'Primer control de lectura'}})==='Primer control de lectura');
check('la fila de Agenda muestra el mismo nombre',run('agendaRendidaHTML')(evento).includes('Control 1')&&!run('agendaRendidaHTML')(evento).includes('Controles 1'));
const destino={ramo:{...ramo,id:'r1'},cat:categoria,nota:notaVieja};
const key=run('claveDestinoIcs')(destino);
check('importar un calendario reconoce títulos viejos y nuevos',
  run('coincidenciaIcs')({titulo:'Controles 1 — Ramo manual'},[destino])===key&&
  run('coincidenciaIcs')({titulo:'Control 1 — Ramo manual'},[destino])===key);

const normalizar=run('normalize');
const estado=normalizar({tenant:'uc',ramos:[{id:'r1',nombre:'Manual',origen:null,categorias:[{...categoria,notas:[{...notaVieja,slot:undefined}]}],gates:[]}]});
const recuperada=estado.ramos[0].categorias[0].notas[0];
check('una nota antigua sin slot conserva su casilla y su valor',recuperada.slot===0&&recuperada.nombre==='Controles 1'&&recuperada.valor===5.4);
check('el promedio existente no cambia',run('ramoAvg')(estado.ramos[0])===5.4);

process.exit(failures?1:0);
