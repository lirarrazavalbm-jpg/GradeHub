// Cuando un ramo aporta a otro con un mínimo, la nota necesaria tiene que
// respetar ese mínimo — no solo el promedio ponderado.
//
// Dinámica y su laboratorio son dos actas y una nota: 70% Dinámica, 30%
// laboratorio, y `combinarConRamoVinculado` dice que si CUALQUIERA de las dos
// partes queda bajo 4,0 la nota final es la MENOR de las dos.
//
// `notaNecesaria` resolvía solo el 70/30. Con el laboratorio en 4,0 decía
// "necesitas 1,07" y poniendo esa nota la final quedaba en 3,9, porque la parte
// propia se iba bajo 4,0 y mandaba ella. Con el laboratorio en 3,5 pedía 1,93
// cuando ya no hay nota que salve el ramo.
//
// Lo reportó Lucas: "simulé que me faltaba la última interrogación y iba con
// 4,9, me decía que necesitaba 3,5 y tampoco sirve".
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
['data.js','engine.js','app.js'].forEach(f=>vm.runInContext(fs.readFileSync(raiz+f,'utf8'),ctx));
const g=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const S=g('S');

// La pauta va escrita acá: es un test de mecanismo y el catálogo se edita.
const escena=(notaLab,i2)=>{
  const din={id:'d',nombre:'Dinámica',color:'#3aa',creditos:10,origen:null,gates:[],
    aporta:{ramo:'Laboratorio de Dinámica',peso:30,min:4.0},categorias:[
    {id:'i1',nombre:'Interrogación 1',peso:25,notas:[{id:'a',valor:5.0,peso:1}]},
    {id:'i2',nombre:'Interrogación 2',peso:25,notas:i2===undefined?[]:[{id:'z',valor:i2,peso:1}]},
    {id:'co',nombre:'Controles',peso:20,slots:3,notas:[0,1,2].map(i=>({id:'c'+i,slot:i,valor:5.0,peso:1}))},
    {id:'ex',nombre:'Examen',peso:30,notas:[{id:'e',valor:4.7,peso:1}]}]};
  const lab={id:'l',nombre:'Laboratorio de Dinámica',color:'#a73',creditos:0,origen:null,gates:[],
    categorias:[{id:'x',nombre:'Nota',peso:100,notas:[{id:'n',valor:notaLab,peso:1}]}]};
  S.ramos=[din,lab];return din;
};
// Lo decisivo: seguir lo que dice la app tiene que alcanzar.
const siguiendoElConsejo=notaLab=>{
  const nec=g('notaNecesaria')(escena(notaLab));
  if(nec===null||nec>7)return {nec,final:null};
  const v=Math.max(1,Math.ceil((nec-1e-9)*10)/10);
  const din=escena(notaLab,v);
  return {nec,puesta:v,final:g('notaFinalOficial')(g('ramoAvg')(din))};
};

console.log('\n=== Seguir el consejo tiene que servir ===');
[5.5,4.5,4.0].forEach(nl=>{
  const x=siguiendoElConsejo(nl);
  chk(`laboratorio en ${nl}: pide ${x.nec.toFixed(2)}, poniendo ${x.puesta} la final queda ${x.final}`,
    x.final!==null&&x.final>=4.0);
});

console.log('\n=== La parte propia tiene que llegar al mínimo por su cuenta ===');
// Con el laboratorio en 4,0 el 70/30 solo pedía 1,07. Pero con esa nota la
// parte propia cae bajo 4,0 y entonces manda la menor de las dos.
const conLab4=g('notaNecesaria')(escena(4.0));
const din4=escena(4.0,Math.max(1,Math.ceil((conLab4-1e-9)*10)/10));
const propio4=g('calculoRamoConCompuertas')(din4).valor;
// El mínimo se compara ANTES de redondear, así que lo que hace falta no es que
// la parte propia llegue a 4,00 sino que su nota oficial lo haga: con 3,96 el
// vínculo topa la final en 3,96, que se informa como 4,0 y aprueba.
chk(`la parte propia queda en ${propio4.toFixed(2)}, que se informa como ${g('notaFinalOficial')(propio4)}`,
  g('notaFinalOficial')(propio4)>=4.0);

console.log('\n=== Si el laboratorio ya cerró bajo el mínimo, no hay nota que salve ===');
const imposible=g('notaNecesaria')(escena(3.5));
chk(`con el laboratorio cerrado en 3,5 devuelve fuera de escala (${imposible})`, imposible>7);
// Los que dibujan usan `> 7` para decir "ya no es posible aprobar".
chk('y eso es lo que la interfaz lee como imposible', imposible>7);

console.log('\n=== Un ramo sin vínculo no cambia ===');
const solo={id:'s',nombre:'Suelto',color:'#3aa',creditos:10,origen:null,gates:[],categorias:[
  {id:'a',nombre:'Prueba',peso:50,notas:[{id:'n',valor:5.0,peso:1}]},
  {id:'b',nombre:'Examen',peso:50,notas:[]}]};
S.ramos=[solo];
chk('sigue pidiendo lo mismo que el promedio ponderado exige', Math.abs(g('notaNecesaria')(solo)-2.9)<0.05);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
