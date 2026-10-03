// Transporte sintético: nunca hace fetch, consulta GitHub ni corre la suite anidada.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const temporal=fs.mkdtempSync(path.join(os.tmpdir(),'gradehub-estado-'));
try{
  for(const nombre of ['git','gh','npm'])fs.writeFileSync(path.join(temporal,nombre),`#!/bin/sh\nprintf '%s\\n' '${nombre} '"$*" >> "$GRADEHUB_ESTADO_LOG"\ncase '${nombre}' in\n git) exit 0;;\n gh) exit 1;;\n npm) exit "\${GRADEHUB_NPM_RESULTADO:-0}";;\nesac\n`,{mode:0o755});
  const log=path.join(temporal,'llamadas');
  const correr=(args,resultado='0')=>{
    fs.writeFileSync(log,'');
    const r=spawnSync('/bin/bash',[path.resolve(__dirname,'../bin/estado.sh'),...args],{encoding:'utf8',env:{...process.env,PATH:temporal+':'+process.env.PATH,GRADEHUB_ESTADO_LOG:log,GRADEHUB_NPM_RESULTADO:resultado}});
    return {...r,llamadas:fs.readFileSync(log,'utf8')};
  };
  const rapido=correr(['--rapido','--local']);assert.equal(rapido.status,0);assert.match(rapido.stdout,/SKIP — arranque rápido/);assert.doesNotMatch(rapido.llamadas,/git fetch|gh |npm /);assert.doesNotMatch(rapido.stdout,/\nPASS\n/);
  const completo=correr([]);assert.equal(completo.status,0);assert.match(completo.llamadas,/git fetch/);assert.match(completo.llamadas,/gh pr list/);assert.match(completo.llamadas,/npm test/);assert.match(completo.stdout,/\nPASS\n/);assert.match(completo.stdout,/verifica red, permisos o sesión/);assert.doesNotMatch(completo.stdout,/gh sin auth|gh auth login/);
  const fallo=correr(['--local'],'1');assert.match(fallo.stdout,/FAIL — corre 'npm test'/);assert.doesNotMatch(fallo.stdout,/\nPASS\n/);
  const desconocido=correr(['--inventado']);assert.equal(desconocido.status,2);assert.equal(desconocido.llamadas,'');
  const ayuda=correr(['--help']);assert.equal(ayuda.status,0);assert.match(ayuda.stdout,/Uso:/);assert.equal(ayuda.llamadas,'');
  console.log('OK: arranque rápido/local, chequeo completo, fallo de suite, red fallida y opciones inválidas');
}finally{fs.rmSync(temporal,{recursive:true,force:true});}
