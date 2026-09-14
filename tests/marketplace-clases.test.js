// El marketplace puede ayudar a encontrar clases sin convertirse en una
// tubería de información académica hacia el servidor. Este test fija esa
// frontera antes de que exista la interfaz.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(raiz,'supabase/clases_particulares.sql'),'utf8');
const src=['data.js','engine.js','app.js','app-session.js','marketplace.js']
  .map(f=>fs.readFileSync(f==='marketplace.js'&&process.env.GRADEHUB_MARKETPLACE?process.env.GRADEHUB_MARKETPLACE:path.join(raiz,f),'utf8')).join('\n');

const stub={style:{setProperty(){},removeProperty(){}},addEventListener(){},appendChild(){},classList:{add(){},remove(){},contains(){return false;}},value:'',innerHTML:'',textContent:'',focus(){},select(){},setAttribute(){},removeAttribute(){},getAttribute(){return null;},querySelectorAll(){return [];},querySelector(){return stub;},clientWidth:400,dataset:{},click(){}};
const ctx={
  window:{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},addListener(){}})},
  document:{getElementById:()=>stub,createElement:()=>stub,addEventListener(){},documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){},removeAttribute(){},getAttribute(){return null;}},querySelector:()=>stub,querySelectorAll:()=>[],body:stub},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{},location:{origin:'',pathname:'/',search:'',hash:''},history:{replaceState(){}},setTimeout,clearTimeout,console,
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const val=n=>vm.runInContext(n,ctx);
let ok=0,fail=0;
const chk=(nombre,pasa)=>{console.log(`  ${pasa?'OK  ':'FAIL'} ${nombre}`);if(pasa)ok++;else fail++;};

console.log('\n=== El servidor no recibe la situación académica ===');
const payload=val("payloadMetricaAnuncio('11111111-1111-1111-1111-111111111111','clic','mat1610')");
const PERMITIDAS=['p_anuncio_id','p_tipo','p_ramo_sigla'];
chk('la métrica usa una lista blanca de tres claves',
  !!payload&&Object.keys(payload).length===3&&Object.keys(payload).every(k=>PERMITIDAS.includes(k))&&payload.p_ramo_sigla==='MAT1610');
chk('el módulo no ofrece identidad, correo, ramos ni notas en la métrica',
  !Object.keys(payload||{}).some(k=>/user|email|correo|nota|ramo(s)?$|device/i.test(k)));

console.log('\n=== La segmentación ocurre localmente ===');
const anuncios=[
  {id:'a',tenant:'uc',ramos_siglas:['MAT1610','FIS1523']},
  {id:'b',tenant:'uc',ramos_siglas:['IIC2333']},
];
const ramos=[{nombre:'Cálculo I',origen:{tenant:'uc',ramoKey:'MAT1610'}}];
const segmentados=val(`anunciosParaRamosLocales(${JSON.stringify(anuncios)},${JSON.stringify(ramos)})`);
chk('solo deja el anuncio que coincide con un ramo cargado',
  segmentados.length===1&&segmentados[0].id==='a'&&segmentados[0].siglasCoincidentes.join('|')==='MAT1610');
chk('cero ramos o cero anuncios no rompe ni muestra nada',
  val('anunciosParaRamosLocales([],[])').length===0&&val(`anunciosParaRamosLocales(${JSON.stringify(anuncios)},[])`).length===0);
chk('la misma sigla de otra universidad no recibe el aviso',
  val(`anunciosParaRamosLocales([{id:'otra',tenant:'fen',ramos_siglas:['MAT1610']}],${JSON.stringify(ramos)})`).length===0);
chk('una sigla sellada de UAI encuentra su aviso sin inventarla desde el nombre',
  val("anunciosParaRamosLocales([{id:'uai',tenant:'uai',ramos_siglas:['MAT101']}],[{nombre:'Ramo sintético',sigla:'MAT101',origen:{tenant:'uai'}}])").length===1);
chk('FEN usa solo la sigla que ya está verificada en su catálogo',
  val("siglaRamoParaClases({nombre:'Contabilidad',origen:{tenant:'fen',ramoKey:'contabilidad'}})")==='CON1005'&&
  val("siglaRamoParaClases({nombre:'Introducción a la Economía',origen:{tenant:'fen',ramoKey:'introduccion a la economia'}})")==='');

console.log('\n=== Pedir anuncios no manda ramos al servidor ===');
const consultas=[];
ctx.consultas=consultas;
vm.runInContext(`
  currentUser={id:'usuario-de-prueba'};
  supabaseClient={from(tabla){consultas.push({tabla,pasos:[]});const q=consultas[consultas.length-1];return{
    select(campos){q.campos=campos;return this;},
    eq(clave,valor){q.pasos.push(['eq',clave,valor]);return this;},
    or(valor){q.pasos.push(['or',valor]);return this;},
    order(clave,opciones){q.pasos.push(['order',clave,opciones]);return this;},
    limit(n){q.pasos.push(['limit',n]);return Promise.resolve({data:[],error:null});}
    ,range(desde,hasta){q.pasos.push(['range',desde,hasta]);return Promise.resolve({data:[],error:null});}
  };}};
  S.ramos=[{nombre:'Cálculo II',notas:[{valor:1.5}],origen:{ramoKey:'MAT1620'}}];
`,ctx);
(async()=>{
  await val("cargarAnunciosClases('uc')");
  const consulta=vm.runInContext('consultas[0]',ctx);
  const serie=JSON.stringify(consulta);
  chk('solo filtra por universidad y estado publicado',
    consulta.tabla==='tutor_anuncios'&&consulta.pasos.some(p=>p[0]==='eq'&&p[1]==='tenant'&&p[2]==='uc')&&
    consulta.pasos.some(p=>p[0]==='eq'&&p[1]==='estado'&&p[2]==='publicado'));
  chk('la consulta no lleva ramos ni notas locales',
    !serie.includes('Cálculo II')&&!serie.includes('MAT1620')&&!serie.includes('1.5')&&!/notas|ramos\]/i.test(serie));

  console.log('\n=== Un aviso relevante no desaparece después de la primera página ===');
  const paginas=[];
  ctx.paginas=paginas;
  vm.runInContext(`supabaseClient={from(){return {
    select(){return this;},eq(){return this;},or(){return this;},order(){return this;},
    limit(){return Promise.resolve({data:Array.from({length:60},(_,i)=>({id:'a'+i})),error:null});},
    range(desde,hasta){paginas.push([desde,hasta]);return Promise.resolve({data:desde===0?Array.from({length:60},(_,i)=>({id:'a'+i})):[{id:'aviso-61'}],error:null});}
  };}}`,ctx);
  const completos=await val("cargarAnunciosClases('uc')");
  chk('trae también el aviso 61 para poder filtrar localmente',completos.some(a=>a.id==='aviso-61'));
  vm.runInContext("supabaseClient={from(){throw new Error('red desconectada');}}",ctx);
  let caida;
  try{caida=await val("cargarAnunciosClases('uc')");}catch(e){caida=null;}
  chk('una caída de red no propaga la excepción a la app',Array.isArray(caida)&&caida.length===0);

  console.log('\n=== La recomendación usa el cálculo real y solo vive en memoria ===');
  const nota=(slot,valor)=>({id:'n'+slot,nombre:'Informe '+slot,slot,valor,peso:1});
  const ramo=(nombre,notas,peso=70)=>({id:nombre,nombre,sigla:'MAT1610',origen:{tenant:'uc',ramoKey:'MAT1610'},gates:[],categorias:[
    {id:'informes',nombre:'Informes',peso,slots:6,directNota:true,notas},
    {id:'examen',nombre:'Examen',peso:30,directNota:true,notas:[]}
  ]});
  const aviso={id:'clase',tenant:'uc',ramos_siglas:['MAT1610'],criterios:{promedioMenorA:4,avanceMinimo:20},estado:'publicado',vence_at:'2099-01-01T00:00:00Z'};
  const existe=val("typeof seleccionarClaseApoyo==='function'");
  chk('existe la selección contextual que faltaba en el borrador',existe);
  if(existe){
    const elegir=(r,avisos=[aviso],opciones={})=>{
      ctx.ramosSinteticos=[r];ctx.avisosSinteticos=avisos;ctx.opciones=opciones;
      return val("seleccionarClaseApoyo(avisosSinteticos,ramosSinteticos,'uc',opciones)");
    };
    const primero=ramo('primer informe',[nota(0,3.5)]);
    const segundo=ramo('dos informes',[nota(0,3.5),nota(1,3.5)]);
    chk('un informe de seis (11,67% evaluado) no activa publicidad contextual',elegir(primero)===null);
    chk('dos informes (23,33%) y promedio 3,5 sí encuentran una clase',elegir(segundo)?.anuncio.id==='clase');
    chk('corregir dos veces la misma casilla no aumenta el público',elegir(ramo('duplicado',[nota(0,3.5),nota(0,3.5)]))===null);
    chk('al subir a 4,0 deja de destacar la clase',elegir(ramo('aprobando',[nota(0,4),nota(1,4)]))===null);
    chk('otro aviso puede apuntar a bajo 5,0 sin cambiar la regla del primero',
      elegir(ramo('refuerzo',[nota(0,4.5),nota(1,4.5)]),[{...aviso,criterios:{promedioMenorA:5,avanceMinimo:20}}])?.anuncio.id==='clase');
    chk('el 40% se exige solo si ese aviso lo declara',
      elegir(segundo,[{...aviso,criterios:{promedioMenorA:4,avanceMinimo:40}}])===null);
    chk('un aviso sin regla no hereda una segmentación por defecto',elegir(segundo,[{...aviso,criterios:null}])===null);
    chk('un umbral inválido no amplía el público',elegir(segundo,[{...aviso,criterios:{promedioMenorA:8,avanceMinimo:0}}])===null);
    const borde=ramo('borde',[nota(0,3.5),nota(1,3.5)],60);borde.categorias[1].peso=40;
    chk('el 20% exacto sí cumple el umbral',elegir(borde)?.anuncio.id==='clase');
    borde.categorias[0].peso=59.7;borde.categorias[1].peso=40.3;
    chk('19,9% no entra aunque la barra redondee a 20%',elegir(borde)===null);
    chk('una pauta que suma 50% no se trata como completa',elegir(ramo('incompleta',[nota(0,3.5),nota(1,3.5)],20))===null);
    const completo=ramo('terminado',Array.from({length:6},(_,i)=>nota(i,3.5)));completo.categorias[1].notas=[{id:'ex',valor:3,peso:1}];
    chk('un ramo terminado no sigue recibiendo apoyo por una evaluación pendiente',elegir(completo)===null);
    const sinSigla=ramo('manual',[nota(0,3.5),nota(1,3.5)]);sinSigla.origen=null;
    chk('un ramo manual no hereda audiencia solo por llamarse igual',elegir(sinSigla)===null);
    chk('el aviso pausado no se recomienda',elegir(segundo,[{...aviso,estado:'pausado'}])===null);
    chk('el aviso vencido no se recomienda',elegir(segundo,[{...aviso,vence_at:'2000-01-01T00:00:00Z'}])===null);
    chk('cerrar un aviso evita que se vuelva a seleccionar en esa vista',elegir(segundo,[aviso],{descartados:['clase']})===null);
    chk('la universidad también delimita la recomendación',elegir(segundo,[{...aviso,tenant:'fen'}])===null);
    const antes=JSON.stringify(segundo);elegir(segundo);
    chk('seleccionar no cambia notas, reglas ni el estado guardado',JSON.stringify(segundo)===antes);
    const conCompuerta=ramo('compuerta',[nota(0,5),nota(1,5)]);
    conCompuerta.gates=[{type:'min_grade_required',catId:'informes',min:5.5,cap:3.9}];
    chk('la compuerta se calcula en el motor antes de elegir el público',elegir(conCompuerta)?.anuncio.id==='clase');
    // Si intenta llamar al servidor, el stub de arriba lanza: todo este bloque
    // debe funcionar con Supabase fuera de servicio y notas solo locales.
  }

  console.log('\n=== La cotización distingue público disponible de alcance ===');
  const cotiza=val("typeof cotizarCampanaClases==='function'");
  chk('existe una cotización configurable, sin convertir eventos en personas',cotiza);
  if(cotiza){
    ctx.tarifas=[{criterios:{promedioMenorA:7,avanceMinimo:0},precioPorCuenta:1000},
      {criterios:{promedioMenorA:4,avanceMinimo:40},precioPorCuenta:2000}];
    const cotizar=(c,datos)=>{ctx.criterios=c;ctx.datos=datos;return val('cotizarCampanaClases(criterios,tarifas,datos)');};
    const general={promedioMenorA:5,avanceMinimo:20},especifico={promedioMenorA:4,avanceMinimo:40};
    const a=cotizar(general,{elegibles:30,alcanzados:12});
    chk('30 elegibles cotizan $30.000, pero 12 alcanzados representan $12.000',a.costoEstimado===30000&&a.costoPorAlcance===12000);
    const b=cotizar(especifico,{elegibles:10,alcanzados:6});
    chk('el perfil exigente usa $2.000: 10 cotizan $20.000, seis cuestan $12.000',b.precioPorCuenta===2000&&b.costoEstimado===20000&&b.costoPorAlcance===12000);
    chk('bajar la nota sin exigir el avance no toma la tarifa de ambos criterios',cotizar({promedioMenorA:4,avanceMinimo:20},{elegibles:10}).precioPorCuenta===1000);
    const limitado=cotizar(especifico,{elegibles:30,alcanzados:20,presupuestoClp:15000});
    chk('un tope de $15.000 a $2.000 por persona permite siete alcances, no ocho',limitado.alcanceCotizado===7&&limitado.costoEstimado===14000&&limitado.costoPorAlcance===14000);
    chk('sin medición no inventa cero cuentas ni un cobro',cotizar(general,{}).costoEstimado===null&&cotizar(general,{}).costoPorAlcance===null);
    chk('cero elegibles sí significa cotización cero',cotizar(general,{elegibles:0}).costoEstimado===0);
    chk('conteos negativos o fraccionarios se rechazan',cotizar(general,{elegibles:-1})===null&&cotizar(general,{alcanzados:1.5})===null);
    chk('una tarifa cambiada se respeta sin editar el motor',
      val('cotizarCampanaClases({promedioMenorA:5,avanceMinimo:20},[{criterios:{promedioMenorA:7,avanceMinimo:0},precioPorCuenta:500}],{elegibles:10}).costoEstimado')===5000);
  }

  console.log('\n=== RLS, borrado y métricas agregadas ===');
  ['tutor_anuncios','anuncio_metricas','anuncio_inscritos'].forEach(tabla=>{
    chk(`${tabla} tiene RLS activa`,new RegExp(`alter table public\\.${tabla} enable row level security`,'i').test(sql));
  });
  chk('las tres tablas borran al autor junto con su cuenta',
    (sql.match(/references auth\.users\(id\) on delete cascade/gi)||[]).length===2);
  chk('un tutor no puede publicarse ni marcarse pago desde el cliente',
    /grant insert \(autor_id,[\s\S]{0,300}?\)\s*on public\.tutor_anuncios to authenticated/i.test(sql)&&
    /with check \(\(select auth\.uid\(\)\) = autor_id and estado = 'borrador'\)/i.test(sql)&&
    /grant update \(ramos_siglas,[\s\S]{0,260}?estado\)\s*on public\.tutor_anuncios to authenticated/i.test(sql)&&
    /estado in \('borrador', 'en_revision', 'pausado'\)/.test(sql));
  chk('las métricas no se leen ni escriben directo desde el cliente',
    /revoke all on public\.anuncio_metricas from public, anon, authenticated/i.test(sql)&&
    !/grant .* on public\.anuncio_metricas to authenticated/i.test(sql));
  const rpc=(sql.match(/create or replace function public\.registrar_metrica_anuncio[\s\S]*?\n\$\$;/)||[])[0]||'';
  chk('la RPC exige sesión y descarta su identidad antes de guardar',
    /if auth\.uid\(\) is null/.test(rpc)&&
    /insert into public\.anuncio_metricas \(anuncio_id, dia, tipo, tenant, ramo_sigla, eventos\)/.test(rpc)&&
    !/user_id|viewer|device/i.test(rpc.replace(/--[^\n]*/g,'')));
  chk('la frecuencia se limita en el servidor sin guardar una identidad',
    /updated_at <= now\(\) - interval '10 seconds'/.test(rpc));
  chk('el corte de catorce eventos no se devuelve y el de quince sí',
    /m\.eventos >= 15\b/.test(sql)&&!/m\.eventos >= (?!15\b)\d/.test(sql));
  chk('el corte se aplica dentro de la RPC de lectura, no en la vista',
    /create or replace function public\.resumen_metricas_anuncio[\s\S]*?m\.eventos >= 15/.test(sql)&&
    !/\.filter\([^\n]*5/.test(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8')));

  console.log(fail?`\nFAIL: ${fail}`:`\nMarketplace OK: ${ok}`);
  process.exit(fail?1:0);
})().catch(err=>{console.error(err);process.exit(1);});
