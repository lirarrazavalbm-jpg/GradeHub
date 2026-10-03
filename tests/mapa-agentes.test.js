// Las rutas tienen que resolver definiciones reales sin cargar código de la app.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main,mapa,definiciones,temas}=require('../bin/mapa.js');
const raiz=path.resolve(__dirname,'..');
const enlace=path.join(raiz,'tests','mapa-enlace-temporal-'+process.pid+'.js');
try{
  fs.symlinkSync(process.execPath,enlace);
  assert.throws(()=>main(['leer',path.relative(raiz,enlace),'1']),/enlace apunta fuera del repo/);
}finally{fs.rmSync(enlace,{force:true});}
for(const tema of Object.keys(temas)){
  const salida=mapa(tema);assert.ok(salida.length<4500,tema+' produce contexto acotado');
  for(const m of salida.matchAll(/^([^\n]+\.js):(\d+) · (\w+)$/gm)){
    const linea=fs.readFileSync(path.join(raiz,m[1]),'utf8').split('\n')[Number(m[2])-1];
    assert.ok(linea.includes(m[3]),'la línea anunciada contiene su definición');
  }
}
assert.deepEqual(definiciones(['// function demo()','demo();','  function demo(x){','export async function demo(y){','const demo = () => {};'],'demo'),[3,4,5]);
assert.match(main(['funcion','ramoAvg']),/^engine\.js:\d+ · ramoAvg$/);
assert.doesNotMatch(main(['funcion','ramoAvg']),/app\.js:/,'la búsqueda devuelve la definición, no sus llamadas/alias');
const muestra=main(['leer','engine.js','ramoAvg','--lineas','3']);
assert.equal(muestra.split('\n').length,4);assert.match(muestra,/continúa en engine\.js:/);
assert.match(main(['leer','docs/contexto.md','Marketplace de clases','--lineas','2']),/^\d+: ### Marketplace de clases/);
for(const args of [['desconocido'],['funcion','noExisteEnElRepo'],['funcion','a.*'],['leer','engine.js','ramoAvg','--lineas','121'],['leer','engine.js','ramoAvg','--lineas','0'],['leer','../gradehub/AGENTS.md','1'],['leer','.claude/settings.local.json','1'],['leer','ocr/eng.traineddata.gz','1'],['leer','engine.js','999999']])assert.throws(()=>main(args));
const cli=spawnSync(process.execPath,[path.join(raiz,'bin/mapa.js'),'funcion','noExisteEnElRepo'],{encoding:'utf8'});
assert.equal(cli.status,2);assert.equal(cli.stdout,'');assert.match(cli.stderr,/No hay definición/);
assert.ok(main([]).length<1500);
console.log('OK: temas vigentes, definiciones sin llamadas, fragmentos limitados, rutas inválidas y errores del CLI');
