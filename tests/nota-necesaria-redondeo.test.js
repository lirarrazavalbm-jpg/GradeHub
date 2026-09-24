// La nota que necesitas se redondea HACIA ARRIBA, nunca al más cercano.
//
// Lo pilló Lucas en Dinámica: la ficha decía 3,7, simuló 3,7 en todo lo
// pendiente y sacó 3,9. El motor estaba bien — poniendo la nota necesaria real
// en todas las casillas da exactamente 3,95, que redondea a 4,0— pero la
// PANTALLA la redondeaba al más cercano, así que podía mostrar un número menor
// al que de verdad hace falta.
//
// Es el peor error posible en la pregunta que la app existe para responder: no
// se equivoca avisando de más, se equivoca dejándote reprobar mientras te dice
// que vas bien. Media décima de más nunca hace daño; media décima de menos sí.
const fs=require('fs'),vm=require('vm');
const raiz=__dirname+'/../';
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return[]},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
['data.js','engine.js','app.js'].forEach(f=>vm.runInContext(fs.readFileSync(raiz+f,'utf8'),ctx));
const g=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};
const nfN=g('nfNecesaria');

console.log('\n=== Lo que se muestra nunca es menor que lo que hace falta ===');
[3.803571,3.74999,3.7501,3.6501,3.449,3.9401,3.0001,6.99].forEach(v=>{
  chk(`necesita ${String(v).slice(0,7)} → muestra ${nfN(v)}`, Number(nfN(v))>=v);
});

console.log('\n=== Pero no infla por ruido de punto flotante ===');
chk('3,7 exacto se muestra 3,7', nfN(3.7)==='3.7');
chk('3,7000000001 también', nfN(3.7000000001)==='3.7');
chk('4,0 exacto se muestra 4,0', nfN(4.0)==='4.0');

console.log('\n=== El caso de Dinámica, de punta a punta ===');
// Interrogación 1 y 2 de 25%, Controles 20% en 3 casillas, Examen 30%.
const S=g('S');
const ramo={id:'r',nombre:'Dinámica',color:'#3aa',creditos:10,origen:null,gates:[],categorias:[
  {id:'i1',nombre:'Interrogación 1',peso:25,notas:[]},
  {id:'i2',nombre:'Interrogación 2',peso:25,notas:[]},
  {id:'co',nombre:'Controles',peso:20,slots:3,notas:[{id:'a',slot:0,valor:6.0,peso:1}]},
  {id:'ex',nombre:'Examen',peso:30,notas:[]}]};
S.ramos=[ramo];
const nec=g('notaNecesaria')(ramo);
const mostrada=Number(nfN(nec));
chk(`el motor pide ${String(nec).slice(0,7)} y la pantalla dice ${mostrada}`, mostrada>=nec);
// Y lo decisivo: seguir lo que dice la pantalla tiene que alcanzar.
const conNota=v=>{
  const c=JSON.parse(JSON.stringify(ramo));
  c.categorias.forEach(cat=>{
    const n=cat.slots||1;
    for(let i=0;i<n;i++){
      const hay=(cat.notas||[]).find(x=>cat.slots?x.slot===i:true);
      if(!hay)(cat.notas=cat.notas||[]).push(cat.slots?{id:'f'+cat.id+i,slot:i,valor:v,peso:1}:{id:'f'+cat.id,valor:v,peso:1});
    }
  });
  S.ramos=[c];return g('notaFinalOficial')(g('ramoAvg')(c));
};
chk(`poniendo ${mostrada} en todo lo pendiente, aprueba (${conNota(mostrada)})`, conNota(mostrada)>=4.0);
// Y una décima menos NO alcanza: la mostrada es el mínimo, no está inflada.
const menos=Math.round((mostrada-0.1)*10)/10;
chk(`con ${menos} no alcanza (${conNota(menos)}), o sea el número no está inflado`, conNota(menos)<4.0);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
