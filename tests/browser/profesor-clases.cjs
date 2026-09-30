// QA sobre la app real. Toda red externa se bloquea; el transporte de Supabase
// usa solo fixtures sintéticos y conserva los handlers y validaciones reales.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'../..'),salida=process.env.PROFESOR_CAPTURAS||'/tmp/profesor-capturas';
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:960},reducedMotion:'reduce'});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='profesor.test')return route.abort();const p=path.join(repo,u.pathname==='/'?'index.html':u.pathname);if(!fs.existsSync(p))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'application/octet-stream'});});
 await page.goto('http://profesor.test/');
 await page.waitForTimeout(800);
 await page.evaluate(async()=>{
  S.tenant='uc';S.onboardingDone=true;S.modo='claro';S.fondo='neutro';applyTheme();
  window.calls=[];window.writes=[];window.failWrite=false;window.failReadCampaign=false;
  currentUser={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};
  const base={tenant:'uc',estado:'publicado',ramos_siglas:['MAT1620'],precio_clp:15000,ubicacion:'online',modalidad:'individual',contacto_tipo:'whatsapp',contacto_valor:'+56 9 1234 5678',criterios:{promedioMenorA:5,avanceMinimo:20},publicado_at:new Date(Date.now()-4*864e5).toISOString(),vence_at:new Date(Date.now()+10*864e5).toISOString(),descripcion:'Repasamos integrales y series a tu ritmo, con una guía para seguir practicando después.',detalles:[]};
  window.fixtures=[{...base,id:'11111111-1111-4111-8111-111111111111',titulo:'Cálculo II, paso a paso'},{...base,id:'22222222-2222-4222-8222-222222222222',estado:'pausado',titulo:'Repaso de integrales'},{...base,id:'33333333-3333-4333-8333-333333333333',estado:'borrador',titulo:'Prepara tu próxima interrogación'}];
  window.campaigns=Object.fromEntries(fixtures.map(a=>[a.id,{dias:21,inicio:null,tope_clp:23000}]));
  supabaseClient={rpc:async(n,p)=>{calls.push({n,p});return {data:n==='anuncio_propio'?true:n==='campana_anuncio'?[{dias:14,tope_clp:15000,dias_cobrados:4,vistas:186,aperturas:24,contactos:3}]:n==='alcance_anuncio'?186:[],error:null};},from(table){let payload=null,filters={},mode='read';const q={select(){return q;},order(){return q;},eq(k,v){filters[k]=v;return q;},update(d){payload=d;mode='update';return q;},insert(d){payload=d;mode='insert';return q;},upsert(d){payload=d;mode='upsert';return q;},async execute(single){
   if(table==='tutor_perfiles')return {data:{estado:'aprobado',nombre_publico:'Profesora sintética',presentacion:'Apoyo académico'},error:null};
   if(table==='anuncio_campanas'){
    if(mode==='read'){if(failReadCampaign)throw Error('sin red');return {data:campaigns[filters.anuncio_id]||null,error:null};}
    if(failWrite)throw Error('sin red');writes.push({table,mode,payload});campaigns[payload.anuncio_id]=payload;return {data:payload,error:null};
   }
   if(table!=='tutor_anuncios')throw Error('Consulta no esperada: '+table);
   if(mode!=='read'){
    if(failWrite)throw Error('sin red');writes.push({table,mode,payload});
    const row=mode==='insert'?{id:'44444444-4444-4444-8444-444444444444',estado:'borrador',...payload}:fixtures.find(a=>a.id===filters.id&&(!filters.estado||a.estado===filters.estado));
    if(!row)return {data:null,error:{message:'no corresponde'}};if(mode==='insert')fixtures.push(row);else Object.assign(row,payload);return {data:row,error:null};
   }
   const rows=fixtures.filter(a=>Object.entries(filters).every(([k,v])=>a[k]===v));return {data:single?rows[0]||null:rows,error:null};
  },single(){return q.execute(true);},maybeSingle(){return q.execute(true);},then(resolve,reject){return q.execute(false).then(resolve,reject);}};return q;}};
  perfilProfesorCache={estado:'aprobado'};perfilProfesorPedido=true;perfilProfesorResuelto=true;
  document.querySelector('.app').classList.add('tab-mode');recalcularNavTabs();showTab('profesor',true);
  await renderProfesor();
 });
 fs.mkdirSync(salida,{recursive:true});
 async function noOverflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('#profesor-body').evaluate(el=>el.scrollWidth<=el.clientWidth));}
 for(const width of [390,1280])for(const modo of ['claro','oscuro']){
  await page.setViewportSize({width,height:width===390?844:960});
  await page.evaluate(async modo=>{S.modo=modo;applyTheme();await renderProfesor();document.querySelector('#screen-profesor .scroll').scrollTop=0;},modo);
  await page.waitForTimeout(800);await noOverflow();await page.screenshot({path:`${salida}/panel-${width}-${modo}.png`});
  await page.locator('.profesor-hig-fila').first().locator('summary').first().click();
  await page.locator('.profesor-hig-presupuesto').first().scrollIntoViewIfNeeded();await noOverflow();await page.screenshot({path:`${salida}/detalle-${width}-${modo}.png`});
  await page.locator('#clase-nueva').click();await page.locator('#pr-titulo').scrollIntoViewIfNeeded();await noOverflow();
  assert(await page.locator('.profesor-hig').evaluate(root=>[...root.querySelectorAll('button,summary,select,input:not([type=checkbox]):not([type=hidden])')].filter(el=>el.getClientRects().length&&!el.closest('.profesor-vista-previa')).every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
  await page.locator('#pr-titulo').focus();assert(await page.locator('#pr-titulo').evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
  assert(await page.locator('.profesor-seccion summary').first().evaluate(el=>getComputedStyle(el).transitionDuration==='0s'));
  await page.locator('#pr-titulo').blur();await page.screenshot({path:`${salida}/formulario-${width}-${modo}.png`});
  await page.locator('#pr-tope').scrollIntoViewIfNeeded();await noOverflow();await page.screenshot({path:`${salida}/campana-${width}-${modo}.png`});
 }
 // Retomar borrador recupera datos reales a través del transporte simulado.
 await page.evaluate(()=>renderProfesor());
 await page.locator('.profesor-hig-fila').filter({has:page.locator('[data-editar]')}).locator('summary').first().click();
 await page.locator('[data-editar]').click();await page.waitForFunction(()=>!document.querySelector('#pr-guardar').disabled);
 assert.equal(await page.locator('#pr-tope').inputValue(),'$23.000');assert.equal(await page.locator('#pr-dias').inputValue(),'21');
 await page.evaluate(()=>{failWrite=true;});await page.locator('#pr-enviar').click();
 await page.waitForFunction(()=>document.querySelector('.profesor-estado').textContent.includes('No se guardó'));
 assert.equal(await page.evaluate(()=>fixtures[2].estado),'borrador');
 await page.evaluate(()=>{failWrite=false;});await page.locator('#pr-guardar').click();
 await page.waitForFunction(()=>document.querySelector('.profesor-estado').textContent.includes('Borrador guardado'));
 assert.equal(await page.evaluate(()=>campaigns[fixtures[2].id].tope_clp),23000);
 await page.locator('#pr-enviar').click();await page.waitForFunction(()=>document.querySelector('#profesor-body').textContent.includes('Recibimos tu anuncio'));
 assert.equal(await page.evaluate(()=>fixtures[2].estado),'en_revision');
 // Una lectura fallida nunca habilita sobrescribir el presupuesto.
 await page.evaluate(()=>{fixtures[2].estado='borrador';failReadCampaign=true;renderBorradorProfesor(document.getElementById('profesor-body'),fixtures[2]);});
 await page.waitForFunction(()=>!document.querySelector('#pr-reintentar-campana').hidden);
 assert(await page.locator('#pr-guardar').isDisabled());assert(await page.locator('#pr-enviar').isDisabled());
 await page.evaluate(()=>{failReadCampaign=false;});await page.locator('#pr-reintentar-campana').click();
 await page.waitForFunction(()=>!document.querySelector('#pr-guardar').disabled);
 assert.equal(await page.locator('#pr-tope').inputValue(),'$23.000');
 assert.equal(await page.evaluate(()=>calls.filter(c=>/^registrar_/.test(c.n)).length),0);
 console.log('Chrome OK: panel/detalle/formulario/campaña 390/1280 claro/oscuro, sin desborde; guardado/envío real con transporte sintético, fallas y recuperación de presupuesto; cero eventos facturables.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
