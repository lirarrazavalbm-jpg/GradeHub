// El marketplace puede ayudar a encontrar clases sin convertirse en una
// tubería de información académica hacia el servidor. Este test fija esa
// frontera antes de que exista la interfaz.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const sql=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE_SQL||path.join(raiz,'supabase/clases_particulares.sql'),'utf8');
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

console.log('\n=== El flyer es opcional y no acepta contenido activo ===');
const validaFlyer=val("typeof validarFlyerClase==='function'");
chk('existe una validación antes de intentar subirlo',validaFlyer);
if(validaFlyer){
  ctx.flyerBueno={type:'image/webp',size:480000};
  ctx.flyerPesado={type:'image/jpeg',size:5*1024*1024+1};
  ctx.flyerSvg={type:'image/svg+xml',size:12000};
  chk('un anuncio puede seguir sin flyer',val('validarFlyerClase(null).ok===true&&validarFlyerClase(null).opcional===true'));
  chk('JPG, PNG y WebP bajo 5 MB son válidos',
    val("validarFlyerClase({type:'image/jpeg',size:100}).ok&&validarFlyerClase({type:'image/png',size:100}).ok&&validarFlyerClase(flyerBueno).ok"));
  chk('un archivo sobre 5 MB se rechaza explicando el límite',
    val("!validarFlyerClase(flyerPesado).ok&&validarFlyerClase(flyerPesado).error.includes('5 MB')"));
  chk('SVG se rechaza aunque pese poco',val('validarFlyerClase(flyerSvg).ok===false'));
  chk('el path generado no reutiliza el nombre original del archivo',
    !/file\.name|\.name\b/.test(val('subirFlyerClase.toString()')));
}
const demo=fs.readFileSync(process.env.GRADEHUB_MARKETPLACE_DEMO||path.join(raiz,'bin/marketplace-demo.html'),'utf8');
chk('el borrador guía clase, público y revisión en ese orden',
  demo.indexOf('1 · Tu clase')<demo.indexOf('2 · Público y presupuesto')&&
  demo.indexOf('2 · Público y presupuesto')<demo.indexOf('3 · Revisión'));
chk('el formulario muestra que sigue siendo borrador y termina en revisión',
  /Borrador · no publicado/.test(demo)&&/id="submit-review"[^>]*>Enviar a revisión</.test(demo));
chk('el flyer se ofrece como opcional con los mismos formatos validados',
  /Flyer <span class="muted">· opcional/.test(demo)&&
  /accept="image\/jpeg,image\/png,image\/webp"/.test(demo)&&/máximo 5 MB/.test(demo));
chk('la vista del estudiante usa el flyer y el texto que escribió el profesor',
  /className='ad-flyer'/.test(demo)&&/\$\('title'\)\.value/.test(demo)&&/\$\('description'\)\.value/.test(demo));

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
  if(validaFlyer){
    const uid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',ad='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    ctx.clienteAntes=val('supabaseClient');
    ctx.flyerArchivo={name:'nombre-original.png',type:'image/png',size:1200};
    ctx.crypto={randomUUID:()=> 'cccccccc-cccc-4ccc-cccc-cccccccccccc'};
    ctx.operaciones=[];
    vm.runInContext(`
      currentUser={id:'${uid}'};
      let estadoFlyer='publicado',archivoPrevio='${uid}/${ad}/dddddddd-dddd-4ddd-dddd-dddddddddddd.png';
      supabaseClient={
        from(tabla){return {
          mutacion:false,select(){return this;},eq(){return this;},update(datos){this.mutacion=true;operaciones.push(['update',datos]);return this;},
          single(){return Promise.resolve(this.mutacion?{data:{flyer_path:operaciones.find(o=>o[0]==='update')[1].flyer_path},error:null}:
            {data:{estado:estadoFlyer,flyer_path:archivoPrevio},error:null});}
        };},
        storage:{from(){return {
          upload(path){operaciones.push(['upload',path]);return Promise.resolve({error:null});},
          remove(paths){operaciones.push(['remove',paths[0]]);return Promise.resolve({error:null});},
          createSignedUrl(path,ttl){operaciones.push(['sign',ttl]);return Promise.resolve({data:{signedUrl:'firmada'},error:null});}
        };}}
      };
    `,ctx);
    const publicado=await val(`subirFlyerClase('${ad}',flyerArchivo)`);
    chk('un anuncio publicado no sube un flyer ni cambia de estado a escondidas',
      !publicado.ok&&ctx.operaciones.length===0&&/borrador/.test(publicado.error));
    vm.runInContext("estadoFlyer='borrador'",ctx);
    const subido=await val(`subirFlyerClase('${ad}',flyerArchivo)`);
    chk('el borrador enlaza el archivo nuevo antes de quitar el anterior, sin usar su nombre',
      subido.ok&&ctx.operaciones.map(o=>o[0]).join(',')==='upload,update,remove'&&
      !subido.path.includes('nombre-original')&&ctx.operaciones[2][1].includes('dddddddd'));
    const firmada=await val(`urlFlyerClase('${uid}/${ad}/cccccccc-cccc-4ccc-cccc-cccccccccccc.png')`);
    chk('la URL temporal del flyer vence pronto',firmada==='firmada'&&ctx.operaciones.at(-1)[1]===60);
    vm.runInContext('supabaseClient=clienteAntes',ctx);
  }
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
  ['tutor_perfiles','tutor_anuncios','anuncio_metricas','anuncio_inscritos'].forEach(tabla=>{
    chk(`${tabla} tiene RLS activa`,new RegExp(`alter table public\\.${tabla} enable row level security`,'i').test(sql));
  });
  chk('las tablas con identidad borran sus filas junto con la cuenta',
    (sql.match(/references auth\.users\(id\) on delete cascade/gi)||[]).length===3);
  chk('una postulación nueva siempre parte pendiente',
    /create table if not exists public\.tutor_perfiles[\s\S]*?estado\s+text not null default 'pendiente'/.test(sql)&&
    /tutor_perfiles_insert_pendiente_propio[\s\S]*?estado = 'pendiente'[\s\S]*?revisado_at is null/.test(sql));
  chk('el profesor no puede aprobar ni suspender su propia ficha',
    /grant insert \(user_id, nombre_publico, presentacion\)[\s\S]*?to authenticated/i.test(sql)&&
    /grant update \(nombre_publico, presentacion\)[\s\S]*?to authenticated/i.test(sql)&&
    !/grant (?:insert|update) \([^)]*estado[^)]*\)[\s\S]*?public\.tutor_perfiles to authenticated/i.test(sql));
  chk('solo una ficha aprobada puede crear anuncios',
    /tutor_anuncios_insert_borrador_propio[\s\S]*?estado = 'borrador'[\s\S]*?tutor_aprobado\(\(select auth\.uid\(\)\)\)/.test(sql));
  chk('suspender al profesor oculta también sus anuncios publicados',
    /tutor_anuncios_select_publicados_o_propios[\s\S]*?estado = 'publicado'[\s\S]*?tutor_aprobado\(autor_id\)/.test(sql)&&
    /where user_id = p_user_id and estado = 'aprobado'/.test(sql));
  chk('el bucket del flyer es privado, raster y de máximo 5 MB',
    /values \('tutor-flyers', 'tutor-flyers', false, 5242880,[\s\S]*?image\/jpeg[\s\S]*?image\/png[\s\S]*?image\/webp/.test(sql)&&
    !/allowed_mime_types[\s\S]{0,180}?image\/svg/.test(sql));
  chk('el título se persiste sin exigirlo a anuncios antiguos',
    /add column if not exists titulo text/.test(sql)&&/grant insert \([^)]*titulo/.test(sql)&&
    /grant select \([^)]*titulo/.test(sql));
  chk('un aviso no puede apuntar al flyer de otra cuenta o anuncio',
    /split_part\(flyer_path, '\/', 1\) = autor_id::text/.test(sql)&&
    /split_part\(flyer_path, '\/', 2\) = id::text/.test(sql));
  chk('solo el dueño de un borrador aprobado puede subir o borrar su flyer',
    /tutor_flyers_insert_propio[\s\S]*?flyer_clase_editable\(name, \(select auth\.uid\(\)\)\)/.test(sql)&&
    /tutor_flyers_delete_propio[\s\S]*?flyer_clase_editable\(name, \(select auth\.uid\(\)\)\)/.test(sql)&&
    /a\.autor_id = p_user_id[\s\S]*?a\.estado in \('borrador','en_revision','pausado'\)[\s\S]*?tutor_aprobado\(p_user_id\)/.test(sql));
  chk('un flyer ajeno solo se lee si su anuncio y profesor están aprobados',
    /flyer_clase_visible[\s\S]*?a\.flyer_path = p_path[\s\S]*?a\.estado = 'publicado'[\s\S]*?tutor_aprobado\(a\.autor_id\)/.test(sql));
  chk('un tutor no puede publicarse ni marcarse pago desde el cliente',
    /grant insert \(autor_id,[\s\S]{0,300}?\)\s*on public\.tutor_anuncios to authenticated/i.test(sql)&&
    /tutor_anuncios_insert_borrador_propio[\s\S]*?with check \([\s\S]*?estado = 'borrador'[\s\S]*?\);/i.test(sql)&&
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
