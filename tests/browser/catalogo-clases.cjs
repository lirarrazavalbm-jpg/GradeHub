// QA en Chrome con HTML real y fixtures sintéticos; bloquea toda red externa.
// PLAYWRIGHT_MODULE y CHROME_PATH permiten usar un runtime local sin dependencias de producción.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const repo=path.resolve(__dirname,'../..');
const salida=process.env.CATALOGO_CAPTURAS||'/tmp/catalogo-capturas';
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='catalogo.test')return route.abort();const p=path.join(repo,u.pathname==='/'?'index.html':u.pathname);if(!fs.existsSync(p))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'application/octet-stream'});});
 await page.goto('http://catalogo.test/');
 await page.evaluate(async()=>{
  S.tenant='uc';S.modo='claro';S.fondo='neutro';applyTheme();
  window.calls=[];currentUser={id:'cuenta-sintetica'};supabaseClient={rpc:async(n,p)=>{calls.push({n,p});return {data:true,error:null};}};
  const base={estado:'publicado',ramos_siglas:['MAT1620'],precio_clp:15000,ubicacion:'online',modalidad:'individual',contacto_tipo:'email',contacto_valor:'prueba@example.com',publicado_at:'2026-09-01T00:00:00Z',vence_at:'2099-01-01T00:00:00Z',detalles:[{etiqueta:'Duración',valor:'60 minutos'},{etiqueta:'Incluye',valor:'Guía de ejercicios'}]};
  window.fixtures=[{...base,id:'pagado',titulo:'Cálculo II, paso a paso',descripcion:'Revisamos los conceptos y resolvemos ejercicios con calma. Trae tus dudas y prepara tu próxima interrogación.'},{...base,id:'gratis',precio_clp:0,modalidad:'grupal',titulo:'Repaso abierto de integrales',descripcion:'Un encuentro gratuito para repasar conceptos y resolver dudas comunes. No necesitas preparación previa.'},{...base,id:'presencial',ubicacion:'presencial',precio_clp:20000,titulo:'Cálculo con ejercicios',descripcion:'Matrices, espacios vectoriales y transformaciones.'},{...base,id:'pausado',estado:'pausado',titulo:'No debe aparecer'}];
  cargarAnunciosClases=async()=>fixtures;logosDeAnuncios=async()=>new Map();await openCatalogoClases();
 });
 await page.locator('#catalogo-clases-buscar').blur();
 fs.mkdirSync(salida,{recursive:true});
 for(const width of [390,1280])for(const mode of ['claro','oscuro']){
  await page.setViewportSize({width,height:width===390?844:960});await page.evaluate(mode=>{S.modo=mode;applyTheme();document.querySelector('.modal-sheet').scrollTop=0;},mode);
  await page.locator('#catalogo-clases-buscar').blur();
  await page.waitForTimeout(350);
  await page.screenshot({path:`${salida}/catalogo-${width}-${mode}.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>[...document.querySelectorAll('.catalogo-redisenado button,.catalogo-redisenado select,.catalogo-redisenado input:not([type=checkbox]),.catalogo-gratis')].every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
  await page.locator('#catalogo-clases-buscar').focus();
  assert(await page.locator('.catalogo-clases-busqueda').evaluate(el=>getComputedStyle(el).boxShadow!=='none'));
  assert(await page.locator('.catalogo-clases-busqueda').evaluate(el=>getComputedStyle(el).transitionDuration==='0s'));
  await page.locator('[data-abrir="pagado"]').click();
  await page.screenshot({path:`${salida}/detalle-${width}-${mode}.png`});
  await page.evaluate(()=>openCatalogoClases());
  assert(await page.evaluate(()=>{const e=document.querySelector('.modal-sheet');return e.scrollWidth<=e.clientWidth;}));
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-abrir="pagado"]').click();assert(await page.locator('[data-contactar="pagado"]').isVisible());
 await page.screenshot({path:`${salida}/detalle-390-oscuro.png`});
 await page.locator('[data-contactar="pagado"]').evaluate(el=>{el.addEventListener('click',e=>e.preventDefault());el.click();});
 assert(await page.evaluate(()=>calls.some(c=>c.n==='registrar_interaccion_anuncio'&&c.p.p_tipo==='apertura')));
 assert(await page.evaluate(()=>calls.some(c=>c.n==='registrar_interaccion_anuncio'&&c.p.p_tipo==='contacto')));
 await page.locator('#catalogo-gratis').check();assert.equal(await page.locator('[data-catalogo-anuncio]').count(),1);
 await page.locator('#catalogo-gratis').uncheck();await page.locator('#catalogo-desde').fill('16000');assert.equal(await page.locator('[data-catalogo-anuncio]').count(),1);
 await page.locator('#catalogo-hasta').fill('10000');assert.match(await page.locator('#catalogo-precio-error').textContent(),/Hasta/);
 await page.locator('#catalogo-limpiar').click();assert.equal(await page.locator('[data-catalogo-anuncio]').count(),3);
 await page.evaluate(()=>{cargarAnunciosClases=async()=>{throw Error('sin red')};return openCatalogoClases();});assert.match(await page.locator('#catalogo-clases-estado').textContent(),/No pudimos/);
 console.log('Navegador OK: filtros, apertura/contacto RPC, errores, 390/1280 claro/oscuro sin desborde');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
