// QA sobre la app real. Toda red externa se bloquea; el transporte de Supabase
// usa solo fixtures sintéticos y conserva los handlers y validaciones reales.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'../..'),salida=process.env.ADMIN_CAPTURAS||'/tmp/admin-capturas';
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:960},reducedMotion:'reduce'});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='admin.test')return route.abort();const p=path.join(repo,u.pathname==='/'?'index.html':u.pathname);if(!fs.existsSync(p))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'application/octet-stream'});});
 await page.goto('http://admin.test/');
 await page.waitForTimeout(800);
 await page.evaluate(async()=>{
  S.tenant='uc';S.onboardingDone=true;S.modo='claro';S.fondo='neutro';applyTheme();currentUser={id:'admin-sintetico'};
  window.calls=[];window.nivel='aal1';window.autorizado=true;window.fallo='';
  const fecha=d=>new Date(Date.now()+d*864e5).toISOString();
  const base={estado:'publicado',ramos_siglas:['MAT1620'],precio_clp:15000,publicado_at:fecha(-4),vence_at:fecha(10),campana:{dias:14,tope_clp:15000,dias_cobrados:4,vistas:186,aperturas:24,contactos:3}};
  window.profesoresQA=[{user_id:'profe-1',nombre:'Docente de prueba',correo:'docente@example.com',estado:'aprobado',anuncios:[
   {...base,id:'a1',titulo:'Cálculo II, paso a paso',cobro:{estado:'deuda',monto_clp:6460},cobros:[{publicado_at:base.publicado_at,estado:'deuda',monto_clp:6460},{publicado_at:fecha(-40),estado:'deuda',monto_clp:6000}]},
   {...base,id:'a2',titulo:'Repaso de integrales',estado:'pausado',cobro:null,cobros:[]},
   {...base,id:'a3',titulo:'Prepara tu interrogación',estado:'en_revision',publicado_at:null,vence_at:null,campana:null,cobro:null,cobros:[]}
  ]},{user_id:'profe-2',nombre:'Otra docente de prueba',correo:'otra@example.com',estado:'pendiente',anuncios:[]}];
  supabaseClient={auth:{mfa:{listFactors:async()=>({data:{totp:[{id:'factor-qa',status:'verified'}]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:nivel}})}},rpc:async(n,p)=>{
   calls.push({n,p});if(n==='soy_administrador')return {data:autorizado};
   if(!autorizado||nivel!=='aal2')return {error:{code:'42501',message:'sin acceso'}};
   if(n==='admin_panel_clases')return {data:profesoresQA};
   if(fallo==='red')throw Error('sin red');if(fallo==='false')return {data:false};
   if(n==='admin_pausar_anuncio'){profesoresQA[0].anuncios.find(a=>a.id===p.p_anuncio_id).estado='pausado';return {data:true};}
   if(n==='admin_estado_profesor'){profesoresQA.find(x=>x.user_id===p.p_user_id).estado=p.p_estado;return {data:true};}
   if(n==='admin_marcar_cobro_publicacion')return {data:true};
   throw Error('RPC inesperada: '+n);
  }};
  await cargarSoyAdministrador();document.querySelector('.app').classList.add('tab-mode');recalcularNavTabs();showTab('admin',true);await renderAdmin();
 });
 assert.equal(await page.locator('.admin-hig').count(),0);assert(await page.locator('#dos-pasos-codigo').isVisible());
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.n==='admin_panel_clases').length),0);
 await page.evaluate(async()=>{nivel='aal2';await renderAdmin();});await page.waitForSelector('.admin-hig');
 fs.mkdirSync(salida,{recursive:true});
 async function qa(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('#admin-body').evaluate(el=>el.scrollWidth<=el.clientWidth));}
 for(const width of [390,1280])for(const modo of ['claro','oscuro']){
  await page.setViewportSize({width,height:width===390?844:960});
  await page.evaluate(async modo=>{S.modo=modo;applyTheme();await pintarPanelAdmin(document.getElementById('admin-body'));document.querySelector('#screen-admin .scroll').scrollTop=0;},modo);
  await page.waitForTimeout(800);await qa();await page.screenshot({path:`${salida}/panel-${width}-${modo}.png`});
  await page.locator('[data-admin-seccion="revision"]').click();assert.equal(await page.locator('[data-admin-fila]:visible').count(),1);
  await page.locator('[data-admin-fila="a3"]>summary').click();await page.locator('[data-admin-fila="a3"]').scrollIntoViewIfNeeded();await qa();await page.screenshot({path:`${salida}/revision-${width}-${modo}.png`});
  await page.locator('[data-admin-seccion="cobros"]').click();assert.equal(await page.locator('[data-admin-fila]:visible').count(),2);
  await page.locator('[data-admin-fila="a1"]>summary').click();await page.locator('[data-admin-fila="a1"] .admin-anuncio details>summary').click();
  await page.locator('[data-admin-fila="a1"] .admin-anuncio details').scrollIntoViewIfNeeded();await qa();await page.screenshot({path:`${salida}/cobros-${width}-${modo}.png`});
  assert(await page.locator('.admin-hig').evaluate(root=>[...root.querySelectorAll('button,summary,input,select')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
 }
 const historico=page.locator('[data-admin-fila="a1"] .admin-anuncio details [data-admin-cobro]');
 const fecha=await historico.getAttribute('data-publicado-at');
 await historico.locator('[data-cobro-estado]').selectOption('cobrado');await historico.locator('[data-cobro-monto]').fill('6000');
 await historico.locator('[data-cobro-guardar]').click();await page.waitForFunction(()=>calls.some(c=>c.n==='admin_marcar_cobro_publicacion'));
 assert.equal(await page.evaluate(()=>calls.find(c=>c.n==='admin_marcar_cobro_publicacion').p.p_publicado_at),fecha);
 assert.equal(await page.evaluate(()=>calls.find(c=>c.n==='admin_marcar_cobro_publicacion').p.p_monto_clp),6000);
 await page.locator('#admin-hig-buscar').fill('integrales');assert.equal(await page.locator('[data-admin-fila]:visible').count(),1);
 await page.locator('#admin-hig-buscar').fill('');await page.locator('#admin-hig-estado').selectOption('pausado');assert.equal(await page.locator('[data-admin-fila]:visible').count(),1);
 await page.locator('#admin-hig-estado').selectOption('');await page.locator('[data-admin-fila="a1"]>summary').click();
 // Capturar avisos sin cambiar acciones ni RPC de producción.
 await page.evaluate(()=>{window.avisosQA=[];const original=showToast;showToast=(t,e)=>{avisosQA.push({t,e});original(t,e);};fallo='red';});
 await page.locator('[data-admin-fila="a1"] [data-cobro-guardar]').first().click();await page.waitForFunction(()=>avisosQA.length>0);assert(await page.evaluate(()=>avisosQA.at(-1).e));
 await page.locator('[data-admin-pausar]').click();await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.waitForFunction(()=>avisosQA.length>1);assert(await page.evaluate(()=>avisosQA.at(-1).e));
 await page.evaluate(async()=>{autorizado=false;await cargarSoyAdministrador();await renderAdmin();});
 await page.waitForFunction(()=>document.getElementById('admin-body').textContent.includes('no tiene acceso'));
 assert.equal(await page.locator('.admin-hig').count(),0);assert.equal(await page.evaluate(()=>esAdministrador()),false);
 assert.equal(await page.evaluate(()=>calls.filter(c=>/^registrar_/.test(c.n)).length),0);
 console.log('Chrome OK: MFA real, acceso denegado, filtros, cobro histórico por fecha, errores de red, cero medición y 12 capturas sin desborde.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
