# Referencia técnica para agentes

Consulta la sección que corresponda a tu tarea. Las reglas globales y el arranque están en [AGENTS.md](../AGENTS.md); las ubicaciones actuales salen de `node bin/mapa.js`. Este documento no mantiene una cola de tareas ni cifras de cobertura.

## Modelo y cálculo

La app usa scripts clásicos con ámbito global compartido. `data.js` carga antes de `engine.js`, luego `app.js`, `app-session.js`, `marketplace.js`, `render-main.js` y `render-agenda.js`. No inviertas el orden ni introduzcas imports sin una tarea explícita de arquitectura.

El estado y sus datos guardados siguen siendo compatibles con cuentas existentes:

```js
S = { ramos, userName, careerSemestre, carrera, tenant,
      onboardingDone, historial, sortMode }
ramo = {
  id, nombre, color, creditos, seccion, origen,
  categorias: [{ id, nombre, peso, fecha, slots, directNota, notas: [] }],
  gates: []
}
```

- `creditos` representa SCT. Solo se pondera el GPA si todos los ramos **con nota** tienen créditos válidos; si alguno falta, el promedio es simple. No mezcles ambos modelos.
- `seccion` es un entero 1–999 o `null`, opcional en Editar ramo. `origen` identifica tenant/carrera del catálogo o es `null` para entrada manual.
- `slots` declara casillas esperadas. El motor deriva hojas pendientes sin escribirlas en `S`. Sin `slots` no inventa cantidad de evaluaciones.
- `ramoAvg`, eximición, ausencias y adaptación de categorías están en el bloque `calculoRamo` de `engine.js`; `app.js` expone sus adaptadores. Busca la **definición**, no todas sus llamadas.
- Las compuertas pueden topar el promedio. No uses el promedio simple como prueba de aprobación cuando una regla limita la nota.

```js
// Una evaluación bajo su mínimo topa la final.
{ type: 'min_grade_required', catId, min: 3.0, cap: 3.9 }
// Un conjunto bajo el mínimo topa la final en el promedio de ese grupo.
{ type: 'group_min', catIds: [...], min: 4.0, cap: 'self' }
```

`cap:'self'` modela la regla FEN de tomar la menor nota entre requisitos. Prueba casos concretos de compuerta, descarte, casillas, eximición e inasistencias según el camino que cambies.

## Catálogos

Contenido en `data.js`; comportamiento en `app.js`. Agregar una carrera, malla o preset no necesita una condición de tenant nueva si el modelo de datos lo representa correctamente.

- FEN: `MALLA`, `CREDITOS_FEN`, `PRESETS_FEN`; UC: `MALLA_UC`, `CREDITOS_UC`, `PRESETS_UC` y `PRESETS_UC_COM`. Consulta solo el bloque/código involucrado.
- Catálogo UC grande: `cursos-uc.js`, `supabase/catalogo_uc.csv`, `docs/catalogo-uc-*`. `.ignore` los excluye de búsquedas amplias; una ruta explícita permite consultarlos. Los inventarios son evidencia, no material de arranque.
- Para revisión/importación UC, lee la sección pertinente de los documentos de Fase 5. La clasificación automática no sustituye la revisión humana ni autoriza importaciones masivas.
- Las cifras de carreras/ramos/pautas se obtienen del catálogo actual. No copies conteos históricos de documentación o memoria.
- `oculto:true` en `TENANTS` oculta del selector sin borrar datos. Verifica `TENANTS` antes de decidir que una universidad falta.
- Una pauta que deja la mitad o más del peso en grupos sin cantidad no se carga ni anuncia: `pautaPresetSuficiente` aplica la decisión de Lucas del 2026-09-25. Se conserva el dato para completarlo con evidencia; la interfaz dice «con pauta».
- La UAI no publica siglas ni créditos de sus asignaturas; no los inventes. Sus ramos se agrupan por nombre para consenso. Los programas están en Webcursos con sesión; se obtienen de documentación aportada por estudiantes.
- `sugerenciasEvaluacion` y `plantillaPrincipalPauta` conservan el vocabulario por tenant. `plantillasPauta` devuelve vacío para FEN a propósito; no ofrece «3 solemnes + examen» como regla general. `tests/vocabulario.test.js` protege esa separación.

## Interfaz

Referencia obligatoria: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines). Lee el caso correspondiente antes de editar y cita la guía en el PR. Las restricciones globales siguen en `AGENTS.md`.

- El estilo Editorial usa tipografía del sistema, sin descargas de fuentes. Revisa los estilos inline y páginas 404, preguntas, términos y privacidad cuando el cambio las alcance.
- El color del ramo vive en su línea; su nota conserva el semáforo. El avance es un riel neutro. Neutro usa superficies blancas/casi negras; Papel y Pizarra son preferencias válidas.
- `GRADEHUB_THEME` conserva turquesa; `ACENTOS` cambia identidad, `FONDOS` cambia superficies/texto y `SEMAFORO` conserva significado académico.
- Especificidad: `input[type=text]` gana contra una clase sola. Usa `input.clase` o `.contenedor input` para padding especializado, sin añadir `!important` para resolverlo.
- Prueba móvil/escritorio, claro/oscuro, texto ampliado, teclado, cierre y movimiento reducido según el alcance. No afirmes Safari iOS/VoiceOver nativos si solo revisaste otro navegador o su árbol accesible.

## Verificación

```bash
# Test relacionado mientras se trabaja.
node tests/<archivo>.test.js
# Suite completa antes de entregar; el código de salida decide el resultado.
npm test
# Higiene del diff.
git diff --check
# Sintaxis de scripts clásicos: añade los archivos que cambiaste.
node -e 'const vm=require("vm"),fs=require("fs");["data.js","app.js"].forEach(f=>new vm.Script(fs.readFileSync(f,"utf8")));console.log("JS OK")'
# Llaves de CSS.
node -e 'const c=require("fs").readFileSync("styles.css","utf8");const o=(c.match(/\{/g)||[]).length,x=(c.match(/\}/g)||[]).length;if(o!==x)process.exit(1);console.log("CSS OK")'
```

Node.js ≥22. `npm ci` instala las dependencias del lockfile. En un worktree sin `node_modules`, puedes reutilizar dependencias del checkout con `NODE_PATH=/ruta/al/checkout/node_modules npm test`; no cambies `package.json` para resolver una dependencia local ausente.

`npm test` descubre archivos automáticamente mediante `bin/tests.js`. No registra tests nuevos en una cadena manual. Usa pautas sintéticas para comprobar mecanismos: un catálogo que cambia a propósito no es una fixture estable. En SQL, los stubs y PGlite prueban el contrato local; no demuestran qué se aplicó en Supabase.

`bash bin/estado.sh` conserva el chequeo completo del repo. `--rapido` omite la suite inicial; `--local` evita consultas de red, y ambos se pueden combinar. Una suite omitida se reporta como SKIP, nunca PASS. Ejecuta los checks necesarios antes de entregar.

## Higiene local

`.gitignore` deja fuera el paquete generado en `dist/`, cobertura, logs de npm, variables de entorno y ajustes `*.local.json` de Claude. Conserva la configuración compartida `.claude/launch.json`; `.env.example` puede versionarse con valores de ejemplo, nunca credenciales. No borres ajustes privados al limpiar el estado de Git.

`.ignore` reduce el ruido de búsqueda: además de catálogos grandes, omite los HTML oficiales en `tests/fixtures/catalogo-uc*/`, el paquete generado y `.claude/`. Estos archivos siguen disponibles nombrando su ruta: `rg -n 'patrón' tests/fixtures/catalogo-uc/BIO143M.html`. Los tests leen las mismas fixtures; no se mueven ni eliminan.

Los worktrees son carpetas con trabajo, no caché. Antes de retirarlos, consulta `git worktree list`, sus cambios locales y el PR asociado; un PR mergeado no prueba que no haya commits o archivos posteriores. Conserva todo trabajo pendiente y usa `git worktree move` para cambiar ubicaciones sin romper enlaces. No elimines ramas para ordenar carpetas.

## Ramas compartidas

Trabaja desde la referencia de main verificada y conserva cambios ajenos. Antes de actualizar una rama:

```bash
git log --oneline --merges origin/main..HEAD
```

Si hay merges de trabajo ajeno, no rebasees ni hagas force-push: actualiza con `git merge origin/main`. En una rama propia y sin esos merges, `git rebase origin/main` conserva una revisión clara. No cambies el checkout activo de otra persona.

El estado vive en git e issues: consulta PR abiertos y tareas asignadas, no una lista estática. `docs/contexto.md` conserva decisiones/antecedentes; busca el encabezado del tema y verifica fecha, código y PR antes de repetir trabajo.

## Despliegue

`main` publica automáticamente en Cloudflare Pages después de los checks. Solo mergea o despliega cuando el usuario lo autorice explícitamente. Backend Supabase; auth email/Google y RLS. Un deploy no ejecuta SQL ni configura Auth.

- Se publica `dist/`, preparado por el workflow, y no el repositorio entero. Excluye `tests/`, `supabase/`, `bin/`, Markdown y `package*.json`; conserva esa frontera al agregar herramientas o docs.
- `CACHE_NAME` queda `gradehub-dev` en el repo: el deploy lo sella con el SHA. No subas un contador manual en `sw.js`.
- Para reintentar el mismo deploy autorizado: Actions → deploy → Run workflow. No confundas una Action pendiente con producción actual.
- Si una publicación falla, Cloudflare permite volver a un despliegue anterior. También debe revertirse el commit de main para que el siguiente merge no republique el defecto.
- El deploy manual existe (`npm run deploy`) para contingencias autorizadas. Requiere credenciales locales y revisión del destino/archivos publicados; no lo uses como atajo para eludir el workflow.
- Configuración de sesiones, RLS real, recuperación por correo y SQL aplicado se verifican por separado en producción con autorización y cuentas de prueba. La documentación fechada no sustituye esa evidencia.
