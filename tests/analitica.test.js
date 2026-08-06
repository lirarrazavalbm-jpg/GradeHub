// La analítica nunca puede llevarse datos del usuario.
//
// La app guarda notas de estudiantes. Un track() con la nota o el nombre del
// ramo convierte a la herramienta de analítica en un tercero que recibe datos
// personales — y la política de privacidad dice que eso no pasa.
//
// Este test revienta si alguien (persona o agente) agrega un evento con una
// clave que lleve contenido escrito por el usuario. Conteos y banderas sí.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');

// Todos los .js de la raíz, no solo app.js: el motor y el render ya se separaron
// y van a seguir separándose. Un track() nuevo en el archivo de mañana también
// tiene que pasar por acá.
const fuentes = fs.readdirSync(raiz)
  .filter(f => f.endsWith('.js') && f !== 'sw.js')
  .map(f => ({ archivo: f, texto: fs.readFileSync(path.join(raiz, f), 'utf8') }));
const app = fuentes.map(f => f.texto).join('\n');

let fallos = 0;
const mal = m => { console.error('  FAIL ' + m); fallos++; };
const bien = m => console.log('  OK   ' + m);

// Claves que arrastran texto del usuario o el rendimiento de alguien.
// 'carrera', 'tenant' o 'semestre' sí pasan: son demográficos agregados, no
// identifican a nadie y son justo lo que necesitamos para decidir el catálogo.
const PROHIBIDAS = [
  'nombre', 'ramo', 'valor', 'nota', 'titulo', 'label',
  'email', 'correo', 'usuario', 'username', 'texto', 'comentario', 'rut',
];

// track('evento', {a:1, b:2}) → captura el evento y las claves del objeto
const RE_TRACK = /track\(\s*'([^']+)'\s*(?:,\s*(\{[\s\S]{0,200}?\}))?\s*\)/g;
const sucias = [];
let total = 0;

for (const { archivo, texto } of fuentes) {
  for (const [, evento, obj] of texto.matchAll(RE_TRACK)) {
    total++;
    if (!obj) continue;
    // Solo claves reales: las que abren el objeto o vienen después de una coma.
    // Así un ternario (a ? b : c) no se confunde con una clave.
    for (const [, clave] of obj.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) {
      if (PROHIBIDAS.includes(clave.toLowerCase())) {
        sucias.push(`${archivo} · ${evento} → {${clave}: …}`);
      }
    }
  }
}
if (!total) mal('no se encontró ninguna llamada a track() — ¿cambió la forma?');
if (sucias.length) {
  sucias.forEach(s => mal('evento con dato del usuario: ' + s));
  console.error('\n  Manda un conteo o una bandera en vez del contenido.');
  console.error('  Ej: {ramo: r.nombre} → {del_catalogo: !!r.origen}\n');
} else {
  bien(`ningún evento lleva datos del usuario (${total} llamadas en ${fuentes.length} archivos)`);
}

// track() tiene que apuntar a la herramienta que realmente está instalada.
// Esto es lo que pasó antes: el código llamaba a gtag y el script no estaba en
// el HTML, así que los eventos se perdían en silencio durante semanas.
if (!/typeof\s+gtag\s*===\s*'function'/.test(app)) {
  mal('track() no envía a Google Analytics: la app quedaría ciega');
} else {
  bien('track() envía a Google Analytics');
}

// El script tiene que estar en el HTML, o track() no hace nada
const idGA = (html.match(/gtag\/js\?id=(G-[A-Z0-9]+)/) || [])[1];
if (!/googletagmanager\.com\/gtag\/js/.test(html)) {
  mal('index.html no carga el script de Google Analytics');
} else if (html.includes('REEMPLAZAR_GA_ID')) {
  mal('el ID de GA sigue siendo el placeholder — pon el real antes de mergear');
} else if (!idGA) {
  mal('el ID de GA no tiene forma de measurement id (G-XXXXXXXXXX)');
} else if (!html.includes(`gtag('config', '${idGA}')`)) {
  mal(`el script carga ${idGA} pero el gtag('config', …) usa otro ID`);
} else if (idGA === 'G-FCTGPM7LB3') {
  mal('ese es el ID de FENnotas: GradeHub necesita su propia propiedad o se mezclan los datos');
} else {
  bien(`index.html carga Google Analytics (${idGA})`);
}

console.log(fallos ? `\nFAIL: ${fallos}` : '\nAnalítica OK: sin datos de usuario y bien enchufada');
process.exit(fallos ? 1 : 0);
