// Una pauta que deja la mitad o más del ramo en grupos sin decir cuántas
// evaluaciones llevan ("Evaluaciones sumativas 60%") no se carga ni se anuncia
// (pedido de Lucas del 2026-09-25, a partir de Cálculo III). Y lo que alguien
// ya tiene cargado no se toca: su pauta y sus notas siguen iguales.
//
// Las pautas de este test son sintéticas: lo que se prueba es el mecanismo,
// no el catálogo, que se edita a propósito y todo el tiempo.
const fs=require('fs'),vm=require('vm');
const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null},querySelectorAll(){return []},querySelector(){return stub},clientWidth:400,dataset:{},click(){}};
const ctx={window:{addEventListener(){},matchMedia:()=>({matches:true,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'',hash:''},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(['data.js','engine.js','app.js'].map(f=>fs.readFileSync(__dirname+'/../'+f,'utf8')).join('\n'),ctx);
const run=e=>vm.runInContext(e,ctx);
let ok=0,fail=0;
const chk=(n,c)=>{if(c){ok++;console.log('  OK   '+n);}else{fail++;console.log('  FAIL '+n);}};

run(`PRESETS_FEN['Sintético Casi Todo Grupos']={evals:[['Evaluaciones sumativas',60,{lista:true}],['Laboratorios',10,{lista:true}],['Examen',30]]};
PRESETS_FEN['Sintético Con Casillas']={evals:[['Pruebas',60,{lista:true,slots:3}],['Controles',10,{lista:true}],['Examen',30]]};
PRESETS_FEN['Sintético Mitad Grupos']={evals:[['Trabajos',50,{lista:true}],['Examen',50]]};`);

console.log('=== El criterio ===');
chk('70% en grupos sin cantidad no alcanza',run(`pautaPresetSuficiente(PRESETS_FEN['Sintético Casi Todo Grupos'].evals)`)===false);
chk('justo la mitad tampoco',run(`pautaPresetSuficiente(PRESETS_FEN['Sintético Mitad Grupos'].evals)`)===false);
chk('un grupo con casillas declaradas sí cuenta como pauta',run(`pautaPresetSuficiente(PRESETS_FEN['Sintético Con Casillas'].evals)`)===true);
chk('una pauta sin grupos sí',run(`pautaPresetSuficiente([['Prueba 1',50],['Examen',50]])`)===true);
chk('una sin ponderaciones no',run(`pautaPresetSuficiente([])`)===false);

console.log('\n=== No se carga ni se anuncia ===');
chk('no se carga al agregar el ramo',run(`presetRamo('Sintético Casi Todo Grupos','fen','ICO')`)===null);
chk('no sale con estrella en el buscador',run(`findPresetName('Sintético Casi Todo Grupos','fen','ICO')`)===null);
chk('la que sí sirve se sigue cargando',!!run(`presetRamo('Sintético Con Casillas','fen','ICO')`));

console.log('\n=== Lo que alguien ya tenía cargado no se toca ===');
const cats=[{id:'c1',nombre:'Evaluaciones sumativas',peso:60,directNota:true,notas:[{id:'n1',valor:5.5,peso:1}]},
  {id:'c2',nombre:'Laboratorios',peso:10,directNota:true,notas:[]},{id:'c3',nombre:'Examen',peso:30,directNota:true,notas:[]}];
ctx.__r={id:'r1',nombre:'Sintético Casi Todo Grupos',color:'#888',origen:{tenant:'fen',carrera:'ICO'},categorias:JSON.parse(JSON.stringify(cats)),gates:[],
  pautaHuella:run(`huellaPauta(${JSON.stringify(cats)})`)};
// Lo que pasa al abrir la app con un gradehub_v1 guardado: normalize() arma el
// estado. La pauta que ya tenía tiene que salir igual, con su nota.
ctx.__n=run(`normalize({ramos:[JSON.parse(JSON.stringify(__r))],tenant:'fen',carrera:'ICO',onboardingDone:true})`);
chk('al abrir la app, normalize() deja la pauta y la nota como estaban',
  run('__n.ramos[0].categorias.map(c=>c.nombre+":"+c.peso).join("|")')==='Evaluaciones sumativas:60|Laboratorios:10|Examen:30'&&
  run('__n.ramos[0].categorias[0].notas[0].valor')===5.5);
chk('no aparece "la pauta cambió"',run('cambioDePauta(__r)')===null);
chk('sus evaluaciones y su nota siguen ahí',run('__r.categorias.length')===3&&run('__r.categorias[0].notas[0].valor')===5.5);
chk('y se puede aportar su pauta al catálogo',run('pautaCatalogoSinOficial(__r)')===true);

console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail?1:0);
