// Los archivos que hablan con los buscadores. Ninguno se ve en la app, así que
// si se rompen nadie lo nota: el sitio simplemente deja de indexarse bien.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(raiz, f), 'utf8');

let ok = 0, fail = 0;
const chk = (n, c) => { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n=== robots.txt ===');
const robots = leer('robots.txt');
chk('permite indexar la app', /User-agent: \*/.test(robots) && /Allow: \//.test(robots));
chk('no bloquea el sitio entero por accidente', !/^Disallow: \/$/m.test(robots));
chk('apunta al sitemap con URL absoluta', /Sitemap: https:\/\/gradehub\.cl\/sitemap\.xml/.test(robots));

console.log('\n=== sitemap.xml ===');
const sitemap = leer('sitemap.xml');
// El namespace es sitemapS.org, en plural. Con el singular el archivo parsea
// igual pero Google lo rechaza, y no hay forma de notarlo desde acá.
chk('usa el namespace correcto (sitemaps.org, plural)',
  /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sitemap));
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
chk('lista las tres páginas reales', urls.length === 3);
chk('todas absolutas y en https', urls.every(u => u.startsWith('https://gradehub.cl/')));
// Una URL en el sitemap que no existe le dice al buscador que el sitio está mal
// mantenido. Se comprueba contra los archivos del repo.
chk('cada URL corresponde a un archivo que existe',
  urls.every(u => {
    const ruta = u.replace('https://gradehub.cl/', '') || 'index.html';
    return fs.existsSync(path.join(raiz, ruta));
  }));

console.log('\n=== Metadatos de las páginas ===');
const PAGINAS = [['index.html', 'la app'], ['preguntas.html', 'las preguntas'], ['privacidad.html', 'la política']];
PAGINAS.forEach(([f, que]) => {
  const html = leer(f);
  const titulo = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || '';
  chk(`${que} tiene título propio (${titulo.slice(0, 34)}…)`, titulo.length > 15);
  chk(`${que} tiene descripción`, desc.length > 50);
});
// Dos páginas con el mismo título compiten entre sí en los resultados.
const titulos = PAGINAS.map(([f]) => (leer(f).match(/<title>([^<]+)</) || [])[1]);
chk('los títulos son distintos entre sí', new Set(titulos).size === titulos.length);

console.log('\n=== Preguntas frecuentes ===');
// Google premia el FAQPage mostrando las preguntas desplegables en el resultado,
// pero exige que cada pregunta del schema esté TEXTUALMENTE en la página. Si se
// separan —se edita un <h2> y no el JSON— deja de ser un premio y pasa a ser una
// penalización, y no hay forma de notarlo mirando la página.
const faq = leer('preguntas.html');
const faqLd = (faq.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
chk('el JSON-LD de preguntas parsea', (() => { try { JSON.parse(faqLd); return true; } catch (e) { return false; } })());
const faqDatos = JSON.parse(faqLd);
chk('se declara como FAQPage', faqDatos['@type'] === 'FAQPage');
chk('trae al menos cinco preguntas', (faqDatos.mainEntity || []).length >= 5);
const enSchema = (faqDatos.mainEntity || []).map(q => q.name);
const enPagina = [...faq.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
const huerfanas = enSchema.filter(q => !enPagina.includes(q));
chk(`cada pregunta del schema existe como <h2> en la página (${enSchema.length})`, huerfanas.length === 0);
if (huerfanas.length) console.log('     sin <h2>: ' + huerfanas.join(' · '));
const sinSchema = enPagina.filter(q => !enSchema.includes(q));
chk('y ningún <h2> se quedó fuera del schema', sinSchema.length === 0);
if (sinSchema.length) console.log('     sin schema: ' + sinSchema.join(' · '));
chk('todas las respuestas tienen texto', (faqDatos.mainEntity || []).every(q => (q.acceptedAnswer || {}).text));
// Se llega desde la pantalla de login: es donde duda quien todavía no tiene cuenta.
chk('la app enlaza a las preguntas', /href="\/preguntas\.html"/.test(leer('index.html')));

console.log('\n=== Promesas de privacidad ===');
const privacidad = leer('privacidad.html');
chk('la política no usa absolutos que el modelo futuro podría romper',
  !/\b(nunca|jamás|siempre)\b/i.test(privacidad));
chk('declara la posible personalización según rendimiento',
  /rangos de notas[\s\S]*perfilamiento[\s\S]*publicidad/i.test(privacidad));
chk('aclara que anticiparlo no equivale a activarlo ni autorizarlo',
  /no activa publicidad ni constituye una\s+autorización/i.test(privacidad));

console.log('\n=== Página 404 ===');
const pagina404=leer('404.html');
const titulo404=(pagina404.match(/<title>([^<]+)<\/title>/)||[])[1]||'';
const desc404=(pagina404.match(/<meta name="description" content="([^"]+)"/)||[])[1]||'';
chk('existe con título y descripción propios', titulo404.length>15&&desc404.length>50);
chk('su título no repite ninguna página real', ![leer('index.html'),leer('privacidad.html')].some(html=>(html.match(/<title>([^<]+)<\/title>/)||[])[1]===titulo404));
chk('enlaza a la raíz en un toque', /href="\/"/.test(pagina404));
chk('no se indexa ni aparece en el sitemap', /name="robots" content="noindex,follow"/.test(pagina404)&&!urls.includes('https://gradehub.cl/404.html'));

console.log('\n=== El schema declara lo que la app es ===');
const ld = (leer('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
chk('el JSON-LD parsea', (() => { try { JSON.parse(ld); return true; } catch (e) { return false; } })());
const datos = JSON.stringify(JSON.parse(ld));
chk('se declara como WebApplication', /"WebApplication"/.test(datos));
// LocalBusiness sería falso: GradeHub no tiene local, ni dirección, ni horario.
// Declararlo para "cumplir un checklist" es mentirle a un buscador.
chk('NO se declara como LocalBusiness', !/LocalBusiness/.test(datos));

console.log('\n=== Las páginas sueltas no se desincronizan del tema ===');
// La 404 no carga app.js —tiene que servir aunque la app esté a medio cargar—,
// así que no puede recibir el tema por applyTheme() y copia los valores del modo
// oscuro a mano. Una copia se desincroniza sola: al abrir el PR que la creó, tres
// de los cinco valores ya estaban desfasados y apuntaban a un acento de dos
// versiones atrás. Nadie lo habría notado: la página se ve bien igual, solo con
// el color equivocado.
const vm404 = require('vm'), ctx404 = {};
vm404.createContext(ctx404);
vm404.runInContext(leer('data.js'), ctx404);
const TEMA = vm404.runInContext('GRADEHUB_THEME', ctx404);
// La guarda cubría solo 404.html, y mientras tanto privacidad.html se quedó dos
// identidades atrás con el azul #3b82f6 sin que nadie lo notara — que es
// exactamente lo que este chequeo existía para impedir. Ahora recorre TODA página
// suelta: la que no carga app.js copia el tema a mano, y una copia se desincroniza
// sola. Se revisan los tokens que cada página declara, no los cinco a la fuerza.
const ESPERADO = {
  '--primary': TEMA.darkPrimary, '--primary-fg': TEMA.darkPrimaryFg,
  '--primary-light': TEMA.darkPrimaryLight, '--accent': TEMA.accent,
  '--secondary': TEMA.darkSecondary,
};
['404.html', 'preguntas.html', 'privacidad.html'].forEach(f => {
  const bloque = (leer(f).match(/:root\{([^}]+)\}/) || [])[1] || '';
  const fijados = Object.fromEntries(
    bloque.split(';').filter(p => p.includes(':')).map(p => {
      const i = p.indexOf(':');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }));
  const declarados = Object.keys(ESPERADO).filter(k => k in fijados);
  chk(`${f}: declara algún token de identidad (${declarados.length})`, declarados.length > 0);
  declarados.forEach(k => chk(`${f}: ${k} calza con el tema (${ESPERADO[k]})`, fijados[k] === ESPERADO[k]));
});

console.log('\nPASS: ' + ok + '   FAIL: ' + fail);
process.exit(fail ? 1 : 0);
