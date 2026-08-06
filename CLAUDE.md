# GradeHub

App de notas para estudiantes universitarios chilenos. En producción: **gradehub.cl**

Calcula el promedio ponderado, simula escenarios y responde la pregunta que
importa: *¿qué nota necesito para aprobar?*

## Arquitectura

Sin build, sin frameworks. Tres archivos que se despliegan tal cual:

| Archivo | Qué tiene |
|---|---|
| `index.html` | Estructura, logo en base64, metadatos |
| `app.js` | Motor de cálculo, render, catálogo, auth |
| `styles.css` | Estilos y los 4 temas por universidad |

Backend: **Supabase** (auth email + Google, RLS activo). Hosting: **Cloudflare Pages**.

## Reglas que no se rompen

**El motor de cálculo es la razón de existir de la app.** Si tocas `ramoAvg`,
`gpa`, `calculateFinalGrade` o las compuertas, corre los tests antes de entregar.
Un promedio mal calculado destruye la confianza más rápido que cualquier bug visual.

**Nunca inventes ponderaciones.** Los presets salen de programas oficiales. Si un
dato no está en el documento, se marca como faltante — no se rellena con lo
plausible.

**El semáforo es semántico.** Verde/ámbar/rojo significan aprobado / al borde /
reprobado. No se tiñen por tema ni por decoración.

**`gradehub_v1` es la clave de localStorage.** No se renombra sin migración.

**La `sb_secret_*` de Supabase nunca va en el código.** Solo la `sb_publishable_*`,
que es pública por diseño y está protegida por RLS.

## Antes de entregar cualquier cambio

```bash
# 1. Sintaxis
node -e 'new (require("vm").Script)(require("fs").readFileSync("app.js","utf8"));console.log("JS OK")'

# 2. CSS balanceado
node -e 'const c=require("fs").readFileSync("styles.css","utf8");const o=(c.match(/\{/g)||[]).length,x=(c.match(/\}/g)||[]).length;console.log("CSS "+o+"/"+x+(o===x?" OK":" MISMATCH"))'

# 3. Tests de lógica (si tocaste el motor o los temas)
npm test
```

Si tocas cálculo, escribe un test que compruebe casos concretos — incluyendo los
de compuerta que topan la nota.

## Desplegar

```bash
npx wrangler pages deploy . --project-name gradehub --branch=main --commit-dirty=true
```

**Sube el `CACHE_NAME` en `sw.js`** (va en `gradehub-vN`) en cada deploy, o los
usuarios con la PWA instalada no reciben la actualización.

## Modelo de datos

```js
S = { ramos, userName, careerSemestre, carrera, tenant, onboardingDone, historial, sortMode }

ramo = {
  id, nombre, color,
  creditos,          // SCT — si TODOS los ramos lo tienen, el promedio se pondera
  origen,            // {tenant, carrera} si vino del catálogo; null si es manual
  categorias: [{ id, nombre, peso, fecha, slots, directNota, notas: [] }],
  gates: []
}
```

### Compuertas

```js
// Una evaluación bajo su mínimo topa la nota final
{ type:'min_grade_required', catId, min: 3.0, cap: 3.9 }

// El promedio de un CONJUNTO bajo su mínimo topa la final.
// cap:'self' → el tope es el promedio del propio grupo.
// Modela la regla FEN "la nota final es la más baja entre los dos requisitos".
{ type:'group_min', catIds: [...], min: 4.0, cap: 'self' }
```

### Promedio general

Se pondera por créditos **solo si todos los ramos con nota los tienen**. Si alguno
falta, cae a promedio simple. Mezclar daría un número engañoso.

## Temas

Un registro `THEMES` con una entrada por universidad. Agregar una es agregar una
entrada — no hay condicionales de tenant repartidos por el código.

Cada tema define acento (`primary`, `accent`, `secondary`) y superficies
(`bg`, `card`, `border`…). Las superficies solo se aplican en modo oscuro.

`oculto:true` en `TENANTS` saca una universidad del selector sin borrar nada.
Hoy UAI y UANDES están ocultas: se lanza con FEN y UC.

## Cómo trabajamos en paralelo

Dos personas sobre este repo. Para no chocar:

- **Nadie trabaja en `main`.** Rama por tarea, PR, merge.
- `git pull` antes de empezar cualquier cosa.
- Repartición: uno en contenido (presets, mallas), otro en producto (UI, motor).

## Tono

Español chileno, informal pero no forzado. Los textos de la app hablan como le
hablarías a un compañero, no como un manual.

## Pendientes conocidos

- Notas de reemplazo y examen recuperativo (aparecen en 3 de 4 programas FEN)
- Mallas FEN 1° y 2° completas — hoy hay 4 ramos de ~46
- Consumir el consenso de reportes para sugerir actualizaciones del catálogo
- Analítica (no hay ninguna) y política de privacidad (Ley 19.628)
- `app.js` sigue en 166 KB: separar los datos a `data.js` es el próximo split
