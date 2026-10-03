// QA de la app real; red externa bloqueada y video de color/tono generado con ffmpeg.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const repo=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wrapped-saludos-'));
const video=path.join(tmp,'saludo.mp4'),poster=path.join(tmp,'poster.png'),ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=0x48515d:s=360x640:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest',video]);
execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',video,'-frames:v','1',poster]);
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',timezoneId:'America/Santiago'}),peticiones=[];
 await page.addInitScript(()=>{
  const Real=Date;window.relojWrapped='2026-12-19T15:00:00Z';window.Date=class extends Real{constructor(...args){super(...(args.length?args:[window.relojWrapped]));}static now(){return new Real(window.relojWrapped).getTime();}};
 });
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='wrapped.test')return route.abort();peticiones.push(u.pathname);
  if(u.pathname==='/media/saludo.mp4')return route.fulfill({body:fs.readFileSync(video),contentType:'video/mp4'});
  if(u.pathname==='/media/poster.png')return route.fulfill({body:fs.readFileSync(poster),contentType:'image/png'});
  if(u.pathname==='/media/saludo.vtt')return route.fulfill({body:'WEBVTT\n\n00:00.000 --> 00:02.000\nSaludo sintético, sin personas reales.\n',contentType:'text/vtt'});
  const f=path.join(repo,u.pathname==='/'?'index.html':u.pathname);
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':f.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
 });
 await page.goto('https://wrapped.test/');await page.waitForFunction(()=>typeof saludoWrapped==='function');
 await page.evaluate(()=>{
  S={...freshState(),tenant:'uc',modo:'oscuro',fondo:'neutro',onboardingDone:true,userName:'Nombre privado',ramos:[{id:'sintetico',nombre:'Ramo de prueba',sigla:'SYN101',color:'#654321',creditos:null,origen:{tenant:'uc'},categorias:[{id:'c',nombre:'Prueba',peso:100,directNota:true,notas:[{id:'n',nombre:'Evaluación',valor:5.2,peso:1}]}],gates:[]}]};
  currentUser={id:'cuenta-sintetica',email:'sintetico@example.invalid'};supabaseClient=null;
  SALUDOS_WRAPPED.push({id:'saludo-sintetico',universidad:'uc',docente:'Docente de prueba',siglas:['SYN101'],nombres:[],video:'/media/saludo.mp4',poster:'/media/poster.png',subtitulos:'/media/saludo.vtt',transcripcion:'Saludo sintético, sin personas reales.',segundos:2});
  showMainApp();window.antesWrapped=JSON.stringify(S);
 });
 assert.equal(await page.locator('#home-wrapped-btn').count(),0);await page.evaluate(()=>abrirWrapped());assert.equal(await page.locator('.wrapped').count(),0);
 assert.equal(peticiones.filter(x=>x.startsWith('/media/')).length,0,'antes de fecha no revela ni pide medios');
 await page.evaluate(()=>{relojWrapped='2026-12-21T15:00:00Z';renderWrappedHome();});await page.locator('#home-wrapped-btn').click();await page.locator('.wrapped').waitFor();
 const n=await page.evaluate(()=>_wrapped.slides.length),gpa=await page.evaluate(()=>gpa(S.ramos));
 assert.equal(peticiones.filter(x=>x.startsWith('/media/')).length,0,'no precarga saludos al abrir');
 assert(await page.getByRole('button',{name:'Anterior',exact:true}).isDisabled());
 await page.locator('.wrapped-historias').click();assert(await page.getByRole('navigation',{name:'Historias del semestre'}).isVisible());
 await page.getByRole('button',{name:/Saludo de Docente de prueba/}).click();await page.locator('.wrapped-saludo video').waitFor();
 assert.equal(await page.evaluate(()=>_wrapped.i),n-2);assert.equal(await page.locator('video').getAttribute('preload'),'none');
 assert.equal(await page.locator('video').getAttribute('autoplay'),null);assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
 assert.equal(await page.locator('video').evaluate(v=>v.playsInline),true);assert.equal(await page.locator('track').getAttribute('kind'),'captions');
 const idx=await page.evaluate(()=>_wrapped.i);await page.locator('video').click();await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>!document.querySelector('.wrapped-saludo video').paused);
 assert.equal(await page.evaluate(()=>_wrapped.i),idx,'tocar controles no cambia de historia');
 await page.evaluate(()=>{window.videoAnterior=document.querySelector('video');});
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();assert(await page.evaluate(()=>videoAnterior.paused));
 assert.equal(await page.locator('.wrapped-tarjeta-big').innerText(),String(gpa)+'\npromedio del semestre');
 await page.getByRole('button',{name:'Anterior',exact:true}).click();await page.getByText('Leer el saludo',{exact:true}).click();
 assert.match(await page.locator('.wrapped-saludo details').innerText(),/Saludo sintético/);assert.equal(await page.evaluate(()=>_wrapped.i),idx);
 await page.locator('video').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>_wrapped.i),idx,'flechas propias del video');
 await page.locator('.wrapped-historias').click();await page.keyboard.press('Escape');assert(await page.locator('.wrapped').isVisible());assert(await page.locator('.wrapped-historias-lista').isHidden());
 await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('error')));
 assert(await page.locator('.wrapped-saludo-estado').isVisible());assert(await page.locator('video').isHidden());assert(await page.locator('.wrapped-saludo details').evaluate(d=>d.open));
 // Sin perder el diseño original, verificar nuevos controles sobre todos los fondos.
 for(const width of [390,1280])for(const modo of ['claro','oscuro'])for(const fondo of ['neutro','papel','pizarra']){
  await page.setViewportSize({width,height:width===390?844:960});
  await page.evaluate(({modo,fondo})=>{S.modo=modo;S.fondo=fondo;applyTheme();pintarWrapped();},{modo,fondo});
  const errores=await page.locator('.wrapped').evaluate(root=>{
   const err=[],lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
   for(const el of root.querySelectorAll('.wrapped-pasos button,.wrapped-historias,.wrapped-cerrar,.wrapped-saludo summary')){
    const r=el.getBoundingClientRect();if(r.width<44||r.height<44)err.push('44pt '+el.className);
   }
   for(const el of root.querySelectorAll('.wrapped-pasos button,.wrapped-saludo details')){
    const cs=getComputedStyle(el),a=lum(cs.color),b=lum(cs.backgroundColor);if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5)err.push('contraste');
   }
   const contenido=root.querySelector('.wrapped-slide');if(contenido.scrollWidth>contenido.clientWidth||document.documentElement.scrollWidth>innerWidth)err.push('desborde de contenido');
   if(root.getAnimations({subtree:true}).some(a=>a.playState==='running'))err.push('movimiento');
   return err;
  });assert.deepEqual(errores,[]);
 }
 const salida=process.env.WRAPPED_CAPTURAS||'/tmp/wrapped-saludos-capturas';fs.mkdirSync(salida,{recursive:true});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await page.locator('.wrapped').count(),1);
 assert(await page.locator('.wrapped-pasos').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
 await page.screenshot({path:path.join(salida,'saludo-390.png')});
 await page.locator('.wrapped-historias').click();await page.screenshot({path:path.join(salida,'historias-390.png')});
 await page.getByRole('button',{name:/Resumen para compartir/}).click();await page.locator('.wrapped-compartir:not(:disabled)').waitFor();
 await page.screenshot({path:path.join(salida,'resumen-390.png')});
 assert.doesNotMatch(await page.locator('.wrapped-tarjeta').innerText(),/Nombre privado|sintetico@example/);
 await page.locator('.wrapped-cerrar').click();await page.waitForSelector('.wrapped',{state:'detached'});
 assert(await page.evaluate(()=>document.activeElement.id==='home-wrapped-btn'));
 assert.equal(await page.evaluate(()=>JSON.stringify(S)),await page.evaluate(()=>antesWrapped).then(x=>JSON.stringify({...JSON.parse(x),modo:'oscuro',fondo:'pizarra'})));
 // Sin material publicable no hay hueco, profesor inventado ni error.
 await page.evaluate(()=>{SALUDOS_WRAPPED.length=0;});await page.locator('#home-wrapped-btn').click();assert.equal(await page.evaluate(()=>_wrapped.slides.some(s=>s.tipo==='saludo')),false);
 await page.evaluate(()=>{relojWrapped='2027-03-01T15:00:00Z';renderWrappedHome();});assert.equal(await page.locator('.wrapped').count(),0);assert.equal(await page.locator('#home-wrapped-btn').count(),0);
 console.log('Chrome OK: sorpresa por fecha, capítulos, salto/repetición, saludo por ramo, video real sintético inline sin autoplay/precarga, controles/teclado, pausa al salir, subtítulos/transcripción/error, 44 pt/contraste/reduced-motion en seis fondos, resumen sin identidad y datos intactos.');
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
