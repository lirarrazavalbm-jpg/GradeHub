// Identidad compartida: registro, favicon y tarjeta social no deben mostrar
// versiones distintas. GRADEHUB_ROOT permite probar contra un árbol anterior.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const icon=read('icon.svg'),html=read('index.html'),sw=read('sw.js');
const deploy=read('.github/workflows/deploy.yml'),og=read('bin/og-editorial.html');
let failed=0;
function check(name,fn){try{fn();console.log('OK',name);}catch(e){failed++;console.error('ERROR',name,e.message);}}
// Logo aprobado el 2026-09-29: tres marcos isométricos, monocromo. La marca
// maestra es negra; el ícono la usa blanca sobre un negro apenas aclarado.
check('el logo vectorial es plano, monocromo y trae las tres capas',()=>{
  const logo=read('logo.svg');
  assert(!/<(?:linearGradient|radialGradient|filter|image|mask)\b/.test(logo+icon),'sin degradados, filtros, imágenes ni máscaras');
  assert.match(logo,/<g fill="#000">/);
  assert.equal((logo.match(/<path\b/g)||[]).length,3,'tres capas');
  assert.match(icon,/<g fill="#fff">/);
  // HIG, App icons: el fondo no es negro puro, para no fundirse con la pantalla.
  assert.match(icon,/<rect [^>]*fill="#111113"/);
  assert(!/<rect [^>]*fill="#000(000)?"/.test(icon));
});
check('registro y onboarding usan el mismo SVG, no dos copias raster antiguas',()=>{
  assert(!/data:image\/png;base64/.test(html));
  assert.equal((html.match(/<img src="logo\.svg\?v=__ASSET_VERSION__"/g)||[]).length,2);
});
check('el HTML y el precache piden exactamente la misma versión del icono',()=>{
  assert.match(html,/href="icon\.svg\?v=__ASSET_VERSION__"/);
  assert.match(sw,/'\/icon\.svg\?v=__ASSET_VERSION__'/);
  assert.match(sw,/'\/logo\.svg\?v=__ASSET_VERSION__'/);
  assert.match(deploy,/for asset in [^\n]* icon\.svg/);
});
check('el fondo de la marca respeta el tema de la app, no solo el sistema',()=>{
  assert.equal((html.match(/class="ob-icon ob-icon-logo ob-icon-brand"/g)||[]).length,2);
  const css=read('styles.css');
  assert.match(css,/\.ob-icon-brand\{background:var\(--card\)/);
  // La marca es negra: en oscuro se invierte con los MISMOS selectores que
  // cambian --card, así sigue a Ajustes aunque contradiga al sistema.
  assert.match(css,/:root:not\(\[data-modo="claro"\]\) \.ob-icon-brand img\{filter:invert\(1\);\}/);
  assert.match(css,/:root\[data-modo="oscuro"\] \.ob-icon-brand img\{filter:invert\(1\);\}/);
  const logo=read('logo.svg');
  assert(!/<rect[^>]+fill="#/.test(logo),'la marca no incluye una pastilla opaca');
  const expected=logo.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">',
    '<svg x="0" y="0" width="128" height="128" viewBox="0 0 128 128" fill="none">')
    .replace('<g fill="#000">','<g fill="#fff">').trim();
  assert(icon.includes(expected),'el icono debe derivarse de la misma marca, no divergir');
});
check('la tarjeta usa el SVG y una URL nueva para las previews cacheadas',()=>{
  assert.match(og,/src="\.\.\/icon\.svg"/);
  assert.equal((html.match(/content="https:\/\/gradehub\.cl\/og-v3\.png"/g)||[]).length,3);
  assert.match(deploy,/icon\.svg icon-192\.png icon-512\.png og-v3\.png/);
});
check('las salidas PNG existen en sus dimensiones y el social pesa menos de 200 KB',()=>{
  for(const [file,w,h] of [['icon-192.png',192,192],['icon-512.png',512,512],['og-v3.png',1200,630]]){
    const png=fs.readFileSync(path.join(root,file));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);
    if(file==='og-v3.png')assert(png.length<200000);
  }
});
process.exitCode=failed?1:0;
