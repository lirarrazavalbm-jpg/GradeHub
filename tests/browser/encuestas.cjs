// App real, transporte sintético y toda red externa bloqueada.
// PLAYWRIGHT_MODULE=/ruta/playwright CHROME_PATH=/ruta/Chrome node tests/browser/encuestas.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),salida=process.env.ENCUESTAS_CAPTURAS||'/tmp/encuestas-capturas';
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='encuestas.test')return route.abort();
  const p=path.join(repo,u.pathname==='/'?'index.html':u.pathname);
  if(!fs.existsSync(p)||!fs.statSync(p).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/octet-stream'});
 });
 await page.goto('https://encuestas.test/');await page.waitForFunction(()=>typeof consultarEncuestaAlEntrar==='function');
 await page.evaluate(async()=>{
  S.tenant='uc';S.onboardingDone=true;S.modo='claro';S.fondo='neutro';S.ramos=[];currentUser={id:'cuenta-sintetica'};
  window.calls=[];window.nivel='aal2';window.fallo=null;
  window.encuestaQA={id:'00000000-0000-4000-8000-000000000011',pregunta:'¿Qué te ayudaría a organizar el semestre?',tipo:'una',opciones:['Recordatorios','Vista del semestre'],publico:'uc',inicio:diaChileEncuesta(),termino:diaChileEncuesta(),estado:'activa',respuesta:null};
  window.listaQA=[encuestaQA];window.totalQA={total:2,opciones:[{opcion:'Recordatorios',total:1},{opcion:'Vista del semestre',total:1}],textos:[{texto:'<img src=x onerror=alert(1)>',total:1},{texto:'=SUM(1,2)',total:1}]};
  supabaseClient={auth:{mfa:{listFactors:async()=>({data:{totp:[{id:'factor-qa',status:'verified'}]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:nivel}})}},rpc:async(n,p)=>{
   calls.push({n,p});if(n==='soy_administrador')return {data:true};
   if(fallo)return {error:fallo};
   if(n.startsWith('admin_')&&nivel!=='aal2')return {error:{code:'42501'}};
   if(n==='encuesta_al_entrar')return {data:{encuesta:structuredClone(encuestaQA),mostrar:true}};
   if(n==='mi_encuesta_activa')return {data:structuredClone(encuestaQA)};
   if(n==='responder_encuesta'){encuestaQA.respuesta={opciones:p.p_opciones,texto:p.p_texto};return {data:true};}
   if(n==='admin_panel_clases')return {data:[]};
   if(n==='admin_encuestas')return {data:structuredClone(listaQA)};
   if(n==='admin_resultados_encuesta')return {data:structuredClone(totalQA)};
   if(n==='admin_estado_encuesta'){listaQA.find(x=>x.id===p.p_encuesta).estado=p.p_estado;return {data:true};}
   if(n==='admin_crear_encuesta'){listaQA.push({id:'00000000-0000-4000-8000-000000000012',pregunta:p.p_pregunta,tipo:p.p_tipo,opciones:p.p_opciones,publico:p.p_publico,inicio:p.p_inicio,termino:p.p_termino,estado:'activa'});return {data:listaQA.at(-1).id};}
   return {data:[]};
  }};
  showMainApp();await consultarEncuestaAlEntrar();
 });
 await page.waitForSelector('#encuesta-hoja');assert.equal(await page.locator('#encuesta-hoja').getAttribute('aria-modal'),'false');
 assert(await page.locator('.encuesta-enviar').isDisabled());
 // La navegación de la app sigue operable detrás, sin backdrop ni inert.
 await page.locator('#nav-stats').click();assert(await page.locator('#screen-stats').isVisible());
 await page.locator('[name=opcion][value="1"]').check();await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.waitForSelector('#encuesta-hoja',{state:'detached'});
 assert.deepEqual(await page.evaluate(()=>encuestaQA.respuesta),{opciones:[1],texto:null});
 await page.evaluate(()=>abrirMiEncuesta());await page.waitForSelector('#encuesta-hoja');
 assert(await page.locator('[name=opcion][value="1"]').isChecked());
 await page.locator('[name=opcion][value="2"]').check();await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.waitForSelector('#encuesta-hoja',{state:'detached'});assert.deepEqual(await page.evaluate(()=>encuestaQA.respuesta.opciones),[2]);
 assert(await page.evaluate(()=>calls.filter(c=>c.n==='responder_encuesta').every(c=>Object.keys(c.p).sort().join()==='p_encuesta,p_opciones,p_texto')));
 await page.evaluate(()=>abrirMiEncuesta());await page.waitForSelector('#encuesta-hoja');
 await page.keyboard.press('Escape');await page.waitForSelector('#encuesta-hoja',{state:'detached'});
 await page.evaluate(()=>abrirMiEncuesta());await page.waitForSelector('#encuesta-hoja');
 await page.locator('[name=opcion][value="1"]').check();await page.keyboard.press('Escape');assert(await page.locator('.encuesta-confirmar').isVisible());
 await page.getByRole('button',{name:'Seguir respondiendo'}).click();assert(await page.locator('[name=opcion][value="1"]').isChecked());
 await page.getByRole('button',{name:'Ahora no',exact:true}).click();await page.waitForSelector('#encuesta-hoja',{state:'detached'});
 await page.evaluate(()=>abrirHojaEncuesta({...encuestaQA,tipo:'varias',respuesta:null}));
 await page.locator('[name=opcion][value="1"]').check();await page.locator('[name=opcion][value="2"]').check();
 await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.waitForSelector('#encuesta-hoja',{state:'detached'});assert.deepEqual(await page.evaluate(()=>encuestaQA.respuesta.opciones),[1,2]);
 await page.evaluate(()=>abrirHojaEncuesta({...encuestaQA,tipo:'texto',opciones:[],respuesta:null}));
 await page.locator('[name=texto]').fill('😀'.repeat(280));assert(await page.getByRole('button',{name:'Enviar',exact:true}).isEnabled());
 assert.equal(await page.locator('[data-encuesta-cuenta]').textContent(),'280 / 280');
 await page.locator('[name=texto]').fill('a'.repeat(281));assert(await page.getByRole('button',{name:'Enviar',exact:true}).isDisabled());
 await page.locator('[name=texto]').fill('Respuesta sintética');
 await page.evaluate(()=>fallo={code:'42501'});await page.getByRole('button',{name:'Enviar',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-encuesta-estado]').textContent.includes('ya no está disponible'));
 await page.evaluate(()=>fallo=null);await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.waitForSelector('#encuesta-hoja',{state:'detached'});
 fs.mkdirSync(salida,{recursive:true});
 async function qa(selector){
  const errores=await page.locator(selector).evaluate(root=>{
   const errores=[],visible=el=>el.getClientRects().length>0;
   const canales=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
   const lum=color=>canales(color).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
   const fondo=el=>{for(let x=el;x;x=x.parentElement){const c=getComputedStyle(x).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return 'rgb(255, 255, 255)';};
   for(const el of root.querySelectorAll('button,input,select,textarea,summary,.encuesta-opcion'))if(visible(el)){
    const r=el.getBoundingClientRect();if(r.width<43.99||r.height<43.99)errores.push('44pt '+el.outerHTML.slice(0,100));
   }
   for(const el of root.querySelectorAll('p,h1,h2,button,label,summary,blockquote,input[type=text],textarea,select'))if(visible(el)){
    const fg=lum(getComputedStyle(el).color),bg=lum(fondo(el)),ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    if(ratio<4.5)errores.push('Contraste '+ratio.toFixed(2)+' '+el.outerHTML.slice(0,100));
   }
   if(root.scrollWidth>root.clientWidth)errores.push('desborde de hoja/panel');
   if(document.documentElement.scrollWidth>innerWidth)errores.push('desborde de página');
   if(getComputedStyle(root).animationName!=='none'||parseFloat(getComputedStyle(root).transitionDuration)!==0)errores.push('movimiento');
   return errores;
  });assert.deepEqual(errores,[]);
 }
 for(const width of [390,1280])for(const modo of ['claro','oscuro'])for(const fondo of ['neutro','papel','pizarra']){
  await page.setViewportSize({width,height:width===390?844:960});
  await page.evaluate(({modo,fondo})=>{S.modo=modo;S.fondo=fondo;applyTheme();abrirHojaEncuesta({...encuestaQA,tipo:'una',respuesta:null});},{modo,fondo});
  await page.locator('[name=opcion][value="1"]').check();await qa('#encuesta-hoja');
  await page.screenshot({path:`${salida}/hoja-${width}-${modo}-${fondo}.png`});
 }
 await page.evaluate(()=>cerrarHojaEncuesta());
 // Arrastre cierra sin cambios, y Escape respeta un modal abierto por la app.
 await page.evaluate(()=>abrirHojaEncuesta({...encuestaQA,tipo:'una',respuesta:null}));
 const r=await page.locator('.encuesta-agarre').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+10);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+80);await page.mouse.up();await page.waitForSelector('#encuesta-hoja',{state:'detached'});
 await page.evaluate(()=>{abrirHojaEncuesta({...encuestaQA,tipo:'una',respuesta:null});showConfirm('Prueba','Prueba sintética',()=>{},{});});
 await page.keyboard.press('Escape');assert(await page.locator('#encuesta-hoja').isVisible());await page.evaluate(()=>{closeModal();closeConfirm();cerrarHojaEncuesta();});
 // Entrada existente a admin y segundo factor antes de abrir encuestas.
 await page.evaluate(async()=>{nivel='aal1';await cargarSoyAdministrador();recalcularNavTabs();showTab('admin',true);await renderAdmin();});
 assert.equal(await page.locator('[data-admin-encuestas]').count(),0);
 await page.evaluate(async()=>{nivel='aal2';await renderAdmin();});await page.locator('[data-admin-encuestas]').click();await page.waitForSelector('.encuestas-admin');
 await page.getByText('Crear encuesta',{exact:true}).first().click();
 await page.locator('[name=pregunta]').fill('¿Qué herramienta te sirve?');await page.locator('[name=opciones]').fill('Una sola');
 await page.getByRole('button',{name:'Crear encuesta',exact:true}).click();assert.match(await page.locator('[data-crear-estado]').textContent(),/2 y 6/);
 await page.locator('[name=tipo]').selectOption('texto');assert(await page.locator('[data-opciones-admin]').isHidden());
 await page.locator('[name=publico]').selectOption('uai');await page.getByRole('button',{name:'Crear encuesta',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-encuesta-admin]').length===2);
 const card=page.locator('[data-encuesta-admin="00000000-0000-4000-8000-000000000011"]');
 await card.getByRole('button',{name:'Pausar',exact:true}).click();await page.waitForFunction(()=>listaQA[0].estado==='pausada');
 await card.getByRole('button',{name:'Reanudar',exact:true}).click();await page.waitForFunction(()=>listaQA[0].estado==='activa');
 await card.getByRole('button',{name:'Ver resultados'}).click();await card.locator('[data-encuesta-csv]').waitFor();
 assert.equal(await card.locator('[data-encuesta-totales] img').count(),0,'los textos libres no se ejecutan como HTML');
 const antes=await page.evaluate(()=>calls.filter(c=>c.n==='admin_resultados_encuesta').length);
 const [download]=await Promise.all([page.waitForEvent('download'),card.locator('[data-encuesta-csv]').click()]);
 const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/"'=SUM\(1,2\)"/);assert.doesNotMatch(csv,/user_id|correo|cuenta-sintetica/);
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.n==='admin_resultados_encuesta').length),antes+1,'exportar vuelve a exigir MFA');
 await page.evaluate(()=>nivel='aal1');await card.locator('[data-encuesta-csv]').click();await page.waitForFunction(()=>document.body.textContent.includes('No pudimos exportar'));
 await page.evaluate(()=>nivel='aal2');
 for(const width of [390,1280])for(const modo of ['claro','oscuro']){
  await page.setViewportSize({width,height:width===390?844:960});await page.evaluate(modo=>{S.modo=modo;applyTheme();},modo);await qa('.encuestas-admin');
  await page.screenshot({path:`${salida}/admin-${width}-${modo}.png`});
 }
 await card.getByRole('button',{name:'Terminar',exact:true}).click();assert(await page.locator('#confirm-overlay').isVisible());
 await page.locator('#confirm-action').click();await page.waitForFunction(()=>listaQA[0].estado==='terminada');
 await page.evaluate(()=>{currentUser={id:'otra-cuenta'};sesionEncuestasCambio('SIGNED_IN','otra-cuenta');});assert.equal(await page.locator('.encuestas-admin').count(),0);
 console.log('Chrome OK: hoja no modal, envío/edición, 280 caracteres Unicode, cierre/Escape/arrastre, controles 44 pt, 4.5:1 en seis fondos, reduced-motion, admin MFA, crear/pausar/terminar, CSV y aislamiento de cuenta.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
