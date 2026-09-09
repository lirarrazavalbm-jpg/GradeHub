const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');

const root=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const leer=f=>fs.readFileSync(path.join(root,f),'utf8');

function cargarEndpoint(estado){
  const llamadas=[];
  const contexto={
    console,Response,structuredClone,
    HERRAMIENTAS:[],NOMBRES:['que_necesito_para_aprobar'],
    validarPropuestaPauta:()=>null,
    fetch:async(url,options)=>{
      llamadas.push({url,options});
      return {ok:true,json:async()=>structuredClone(estado)};
    },
    module:{exports:{}},exports:{},
  };
  vm.createContext(contexto);
  vm.runInContext(leer('engine.js'),contexto,{filename:'engine.js'});
  contexto.motorCompartido={gh_crearCalculoRamo:contexto.module.exports.gh_crearCalculoRamo};
  const endpoint=leer('functions/mcp/[[ruta]].js')
    .replace(/^import .*;\s*$/gm,'')
    .replace(/^export /gm,'');
  vm.runInContext(endpoint+'\n;globalThis.__mcp={onRequestPost};',contexto,{filename:'functions/mcp/[[ruta]].js'});
  return {llamadas,llamar:contexto.__mcp.onRequestPost};
}

const nota=(id,valor,slot)=>({id,nombre:id,valor,peso:1,...(slot===undefined?{}:{slot})});
const categoria=(id,peso,notas=[],extra={})=>({id,nombre:id,peso,notas,directNota:true,...extra});
const ramo=(id,categorias,extra={})=>({id,nombre:id,categorias,gates:[],origen:null,...extra});

async function ejecutar(estado,args){
  const servidor=cargarEndpoint(estado);
  const token='a'.repeat(64);
  const response=await servidor.llamar({
    params:{ruta:[token]},
    request:{json:async()=>({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'que_necesito_para_aprobar',arguments:args}})},
  });
  const body=await response.json();
  assert.equal(body.error,undefined,body.error&&body.error.message);
  assert.equal(servidor.llamadas.length,1);
  const rpc=JSON.parse(servidor.llamadas[0].options.body);
  assert.deepEqual(Object.keys(rpc),['p_token']);
  assert.equal(rpc.p_token,token);
  return JSON.parse(body.result.content[0].text);
}

(async()=>{
  const laboratorio=ramo('Laboratorio de Dinámica',[
    categoria('Controles',10,[],{slots:5}),
    categoria('Informes',70,[nota('Informe 0',6.5,0)],{slots:6}),
    categoria('Evaluación de pares',20,[],{slots:6}),
  ],{origen:{tenant:'uc',carrera:'ING-PC',ramoKey:'FIS0154'}});
  const privado=ramo('Ramo que no se pidió',[categoria('Secreto',100,[nota('n-secreta',1.2)])]);
  const calculo=await ejecutar({ramos:[laboratorio,privado]},{ramo:'FIS0154'});
  assert.equal(calculo.ramo,'Laboratorio de Dinámica');
  assert.equal(calculo.meta,4);
  assert.ok(Math.abs(calculo.promedioNecesario-3.67)<0.005,`esperaba 3,67 y llegó ${calculo.promedioNecesario}`);
  assert.equal(calculo.factibleEnEscala,true);
  assert.doesNotMatch(JSON.stringify(calculo),/Ramo que no se pidió|Secreto|1\.2/);

  const conDescarte=ramo('Curso con descarte',[
    categoria('Controles',100,[nota('Control 1',2,0),nota('Control 2',5,1)],{slots:3,dropLowest:{count:1}}),
  ]);
  const descarte=await ejecutar({ramos:[conDescarte]},{ramo:'Curso con descarte',meta:4});
  assert.ok(Math.abs(descarte.promedioNecesario-3)<1e-6,'el motor debe considerar el descarte al proyectar la nota pendiente');

  const laboratorioVinculado=ramo('Laboratorio',[categoria('Final',100,[nota('lab',6)])]);
  const catedra=ramo('Dinámica',[categoria('Cátedra',100,[])],{aporta:{ramo:'Laboratorio',peso:30}});
  const vinculado=await ejecutar({ramos:[catedra,laboratorioVinculado]},{ramo:'Dinámica',meta:4});
  assert.ok(Math.abs(vinculado.promedioNecesario-(22/7))<1e-6,'el 30% del ramo vinculado debe entrar al cálculo');

  const conCompuerta=ramo('Curso con compuerta',[
    categoria('Examen',50,[nota('Examen',2)]),categoria('Tareas',50,[]),
  ],{gates:[{type:'min_grade_required',catId:'Examen',min:3,cap:3.9,nombre:'Examen'}]});
  const compuerta=await ejecutar({ramos:[conCompuerta]},{ramo:'Curso con compuerta'});
  assert.equal(compuerta.compuertasIncumplidas.length,1);
  assert.equal(compuerta.compuertasIncumplidas[0].tope,3.9);

  console.log('OK: el MCP calcula metas con el motor compartido y solo responde por el estado autorizado');
})().catch(error=>{console.error(error);process.exit(1);});
