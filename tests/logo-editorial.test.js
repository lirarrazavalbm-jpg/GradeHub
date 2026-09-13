// Identidad compartida: registro, favicon y tarjeta social no deben mostrar
// versiones distintas. GRADEHUB_ROOT permite probar contra un árbol anterior.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=process.env.GRADEHUB_ROOT||path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const icon=read('icon.svg'),html=read('index.html'),sw=read('sw.js');
const deploy=read('.github/workflows/deploy.yml'),og=read('bin/og-editorial.html');
let failed=0;
function check(name,fn){try{fn();console.log('OK',name);}catch(e){failed++;console.error('ERROR',name,e.message);}}
check('el logo vectorial es plano y reutiliza las tres capas aprobadas',()=>{
  assert(!/<(?:linearGradient|radialGradient|filter|image)\b/.test(icon));
  assert.match(icon,/<use href="#plano" fill="#A6A8B1"\/>/);
  assert.match(icon,/<use href="#plano" fill="#2DD4BF" transform="translate\(0 25\)"\/>/);
  assert.match(icon,/<use href="#plano" fill="#A78BFA" transform="translate\(0 50\)"\/>/);
  assert.match(icon,/mask="url\(#bajo-superior\)"/);
  assert.match(icon,/mask="url\(#bajo-intermedio\)"/);
});
check('registro y onboarding usan el mismo SVG, no dos copias raster antiguas',()=>{
  assert(!/data:image\/png;base64/.test(html));
  assert.equal((html.match(/<img src="icon\.svg\?v=__ASSET_VERSION__"/g)||[]).length,2);
});
check('el HTML y el precache piden exactamente la misma versión del icono',()=>{
  assert.match(html,/href="icon\.svg\?v=__ASSET_VERSION__"/);
  assert.match(sw,/'\/icon\.svg\?v=__ASSET_VERSION__'/);
  assert.match(deploy,/for asset in [^\n]* icon\.svg/);
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
