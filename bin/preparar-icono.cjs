// Solo genera un derivado gráfico; no es un build de la aplicación.
// Uso: node bin/preparar-icono.cjs. Luego exportar PNG con bin/iconos.html.
//
// logo.svg es la marca en negro. El ícono la pone EN BLANCO sobre un negro
// apenas aclarado (#111113): las HIG piden no usar negro puro de fondo para
// que el ícono no se funda con la pantalla. La marca va a escala 1:1 sobre el
// cuadro de 128, que es la composición aprobada el 2026-09-29; sus puntas
// quedan dentro del círculo seguro de los íconos maskable (radio 51,2).
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const logo=fs.readFileSync(path.join(root,'logo.svg'),'utf8');
const marker='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">';
if(!logo.startsWith(marker))throw Error('logo.svg cambió de formato: revisar el encuadre antes de generar');
if(!logo.includes('<g fill="#000">'))throw Error('logo.svg ya no pinta la marca en negro: revisar el color antes de generar');
const framed=logo
  .replace(marker,'<svg x="0" y="0" width="128" height="128" viewBox="0 0 128 128" fill="none">')
  .replace('<g fill="#000">','<g fill="#fff">')
  .trim();
fs.writeFileSync(path.join(root,'icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128">
  <title>GradeHub</title>
  <!-- Generado desde logo.svg con node bin/preparar-icono.cjs.
       Para exportar los PNG, ver bin/iconos.html. No editar este derivado. -->
  <rect x=".25" y=".25" width="127.5" height="127.5" rx="28.5" fill="#111113" stroke="#242427" stroke-width=".5"/>
${framed}
</svg>
`);
