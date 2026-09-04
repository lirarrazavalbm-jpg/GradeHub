// El marketplace puede ayudar a encontrar clases sin convertirse en una
// tubería de información académica hacia el servidor. Este test fija esa
// frontera antes de que exista la interfaz.
const fs=require('fs'),path=require('path'),vm=require('vm');
const raiz=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(raiz,'supabase/clases_particulares.sql'),'utf8');
const src=['data.js','engine.js','app.js','app-session.js','marketplace.js']
  .map(f=>fs.readFileSync(path.join(raiz,f),'utf8')).join('\n');

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
  chk('el corte de cuatro eventos no se devuelve y el de cinco sí',
    /m\.eventos >= 5/.test(sql)&&!/m\.eventos >= 4/.test(sql));
  chk('el corte se aplica dentro de la RPC de lectura, no en la vista',
    /create or replace function public\.resumen_metricas_anuncio[\s\S]*?m\.eventos >= 5/.test(sql)&&
    !/\.filter\([^\n]*5/.test(fs.readFileSync(path.join(raiz,'marketplace.js'),'utf8')));

  console.log(fail?`\nFAIL: ${fail}`:`\nMarketplace OK: ${ok}`);
  process.exit(fail?1:0);
})().catch(err=>{console.error(err);process.exit(1);});
