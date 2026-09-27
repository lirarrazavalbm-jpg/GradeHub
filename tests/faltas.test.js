// Contador de faltas: opcional por ramo, se enciende en Editar ramo y no toca
// ningún promedio. Las cuentas anteriores no lo tienen y tienen que cargar igual.
// Todo lo de acá es sintético.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(raiz,f),'utf8');
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

function elemento(){let html='';const n={style:{setProperty(){},removeProperty(){}},classList:{add(){},remove(){},contains(){return false}},children:[],value:'',checked:false,textContent:'',dataset:{},hidden:false,className:'',
 addEventListener(){},appendChild(h){this.children.push(h);return h},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelector(){return n},querySelectorAll(){return[]},focus(){},select(){},remove(){},click(){}};
 Object.defineProperty(n,'innerHTML',{get(){return html},set(v){html=String(v);this.children=[]}});return n;}

const ids={};const porId=id=>ids[id]||(ids[id]=elemento());
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:porId,createElement:elemento,addEventListener(){},documentElement:elemento(),querySelector:()=>elemento(),querySelectorAll:()=>[],body:elemento(),head:{appendChild(){}}},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js','render-main.js'].map(leer).join('\n'),ctx);
const run=c=>vm.runInContext(c,ctx);
run(`save=function(){};track=function(){};closeModal=function(){};openModal=function(){};renderModalColors=function(){};`);

const RAMO={id:'r1',nombre:'Ramo Sintético',color:'#2563eb',categorias:[{id:'c1',nombre:'Prueba',peso:100,notas:[{id:'n1',valor:5.5}]}],gates:[]};

console.log('=== Cuentas anteriores ===');
let d=run(`normalize({ramos:[${JSON.stringify(RAMO)}]})`);
chk('un ramo guardado sin faltas queda con faltas null',d.ramos[0].faltas===null);
chk('y su promedio no cambia',run(`ramoAvg(${JSON.stringify(d.ramos[0])})`)===5.5);

console.log('\n=== Lo que se guarda se limpia al cargar ===');
const norm=f=>run(`normalize({ramos:[${JSON.stringify({...RAMO,faltas:f})}]})`).ramos[0].faltas;
chk('se conserva la cuenta y el máximo',JSON.stringify(norm({activo:true,cantidad:3,limite:4}))==='{"activo":true,"cantidad":3,"limite":4}');
chk('apagado conserva la cuenta',JSON.stringify(norm({activo:false,cantidad:2,limite:null}))==='{"activo":false,"cantidad":2,"limite":null}');
chk('una cuenta negativa o con decimales vuelve a 0',norm({activo:true,cantidad:-2}).cantidad===0&&norm({activo:true,cantidad:1.5}).cantidad===0);
chk('un máximo inválido queda sin máximo',norm({activo:true,cantidad:1,limite:0}).limite===null&&norm({activo:true,cantidad:1,limite:'4'}).limite===null);
chk('algo que no es objeto es null',norm('3')===null&&norm([1])===null);
chk('con faltas el promedio es el mismo',run(`ramoAvg(normalize({ramos:[${JSON.stringify({...RAMO,faltas:{activo:true,cantidad:9,limite:2}})}]}).ramos[0])`)===5.5);

console.log('\n=== Editar ramo ===');
run(`S={ramos:[normalize({ramos:[${JSON.stringify(RAMO)}]}).ramos[0]],userName:'',careerSemestre:1,carrera:null,tenant:'uc',onboardingDone:true,historial:[],sortMode:'manual'};currentRamoId='r1';__renderReal=renderRamo;renderRamo=function(){};`);
run(`openEditRamoModal()`);
chk('el modal ofrece el contador',/m-ramo-faltas/.test(porId('modal-content').innerHTML));
const guardar=(activo,limite)=>{porId('m-ramo-name').value='Ramo Sintético';porId('m-ramo-faltas').checked=activo;porId('m-ramo-faltas-limite').value=limite;return run('confirmEditRamo()');};
guardar(true,'4');
chk('al encenderlo parte en 0 con el máximo',JSON.stringify(run('S.ramos[0].faltas'))==='{"activo":true,"cantidad":0,"limite":4}');
run('cambiarFaltas(1);cambiarFaltas(1);cambiarFaltas(1)');
chk('sumar cuenta de a una',run('S.ramos[0].faltas.cantidad')===3);
run('cambiarFaltas(-1)');
chk('restar también',run('S.ramos[0].faltas.cantidad')===2);
run('cambiarFaltas(-1);cambiarFaltas(-1);cambiarFaltas(-1)');
chk('no baja de 0',run('S.ramos[0].faltas.cantidad')===0);
run('cambiarFaltas(1);cambiarFaltas(1)');
chk('un máximo mal escrito no guarda nada',guardar(true,'x')===false&&run('S.ramos[0].faltas.limite')===4);
guardar(false,'');
chk('apagarlo no borra la cuenta',JSON.stringify(run('S.ramos[0].faltas'))==='{"activo":false,"cantidad":2,"limite":4}');
run('cambiarFaltas(1)');
chk('apagado no suma',run('S.ramos[0].faltas.cantidad')===2);
guardar(true,'');
chk('al volver a encenderlo sigue la cuenta, ahora sin máximo',JSON.stringify(run('S.ramos[0].faltas'))==='{"activo":true,"cantidad":2,"limite":null}');

console.log('\n=== La ficha ===');
const ficha=f=>{run(`S.ramos[0].faltas=${JSON.stringify(f)};__renderReal();`);return porId('faltas-contador');};
let el=ficha({activo:false,cantidad:2,limite:4});
chk('apagado no se muestra',el.style.display==='none'&&el.innerHTML==='');
el=ficha(null);
chk('sin contador no se muestra',el.style.display==='none');
el=ficha({activo:true,cantidad:2,limite:4});
chk('muestra la cuenta y lo que queda',el.style.display==='flex'&&/faltas-num[^>]*>2</.test(el.innerHTML)&&/Te quedan 2 de 4/.test(el.innerHTML));
el=ficha({activo:true,cantidad:3,limite:4});
chk('singular cuando queda una',/Te queda 1 de 4/.test(el.innerHTML));
el=ficha({activo:true,cantidad:4,limite:4});
chk('avisa al llegar al máximo',/Llegaste al máximo de 4/.test(el.innerHTML)&&/is-limite/.test(el.className));
el=ficha({activo:true,cantidad:6,limite:4});
chk('y cuando lo pasa',/Pasaste el máximo de 4 por 2/.test(el.innerHTML)&&/is-excedido/.test(el.className));
el=ficha({activo:true,cantidad:0,limite:null});
chk('sin máximo no inventa uno, y en 0 no deja restar',/Anota cada clase/.test(el.innerHTML)&&/Restar una falta" disabled/.test(el.innerHTML));

console.log('\nPASS: '+ok+'   FAIL: '+fail);
process.exit(fail?1:0);
