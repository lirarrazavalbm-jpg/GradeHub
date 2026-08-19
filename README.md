# GradeHub

GradeHub es una aplicación web para que estudiantes universitarios organicen sus evaluaciones, entiendan cómo va su semestre y sepan qué nota necesitan antes de la próxima prueba.

[Abrir GradeHub](https://gradehub.cl)

## Qué puedes hacer

- Guardar ramos, evaluaciones, ponderaciones, fechas y notas.
- Calcular promedios ponderados y la nota necesaria para alcanzar una meta.
- Priorizar evaluaciones próximas desde la Agenda.
- Simular escenarios sin alterar las notas reales.
- Revisar estadísticas e historial de semestres.
- Usar la app desde el navegador o instalarla como PWA.
- Mantener los datos en el dispositivo y, con una cuenta, sincronizarlos entre sesiones.

GradeHub está pensado para estudiantes en Chile. Actualmente ofrece catálogos y pautas para cursos de la Universidad de Chile (FEN) y la Pontificia Universidad Católica de Chile; también permite crear y configurar ramos manualmente.

> La fuente de verdad siempre es el programa oficial del curso. GradeHub calcula a partir de la pauta que tenga cargada cada estudiante.

## Ejecutar el proyecto localmente

La aplicación usa HTML, CSS y JavaScript sin framework ni paso de compilación.

```bash
git clone https://github.com/lirarrazavalbm-jpg/GradeHub.git
cd GradeHub
python3 -m http.server 8080
```

Luego abre [http://localhost:8080](http://localhost:8080).

Para ejecutar las comprobaciones del proyecto necesitas Node.js 22 o superior:

```bash
npm ci
npm test
```

La interfaz básica puede probarse localmente sin configurar Supabase. No uses datos personales, correos reales ni notas reales durante el desarrollo. Si el navegador muestra una versión anterior, abre el proyecto en otro puerto para evitar la caché del service worker.

## Cómo está organizado

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Estructura principal, carga de scripts y metadatos de la PWA. |
| `data.js` | Catálogos académicos, pautas, temas y configuración compartida. |
| `engine.js` | Cálculos académicos puros y reglas de aprobación. |
| `app.js` | Estado, navegación, autenticación y render principal. |
| `render-agenda.js` | Presentación y priorización de la Agenda. |
| `styles.css` | Sistema visual y adaptación para móvil y escritorio. |
| `sw.js` | Funcionamiento offline y estrategia de caché. |
| `tests/` | Pruebas de cálculos, datos, seguridad e interfaz. |
| `supabase/` | SQL versionado para funciones, políticas y servicios de datos. |
| `.github/workflows/` | Comprobaciones automáticas y publicación en Cloudflare Pages. |

El orden de carga de los scripts clásicos importa: `data.js` → `engine.js` → `app.js` → `render-agenda.js`.

## Contribuir

GradeHub está en producción y `main` se publica automáticamente. Antes de cambiar código:

1. Lee [`AGENTS.md`](AGENTS.md), que contiene las reglas vigentes del proyecto.
2. Ejecuta `bash bin/estado.sh` para revisar rama, estado del repositorio y pruebas.
3. Crea una rama dedicada y limita cada pull request a un solo problema.
4. No inventes ramos, créditos, fechas ni ponderaciones. Los datos académicos deben venir de una fuente oficial verificable.
5. Usa datos sintéticos en pruebas y no incluyas secretos ni información de estudiantes.
6. Ejecuta `npm test` y comprueba su código de salida antes de abrir el pull request.

Los cambios en cálculos, persistencia o estructura de datos existentes necesitan especial cuidado para no alterar semestres ya guardados. Describe en el pull request el problema que resuelve el cambio, el riesgo para datos existentes y cómo lo verificaste.

## Privacidad y seguridad

No publiques credenciales, tokens, correos, notas ni exportaciones reales. Los reportes de vulnerabilidades no deben abrirse como issues públicos: usa el correo indicado en la [política de privacidad](https://gradehub.cl/privacidad.html).

## Licencia

Todavía no se ha elegido una licencia para GradeHub. Mientras no exista un archivo `LICENSE`, el código puede consultarse y bifurcarse mediante las funciones de GitHub, pero no se concede un permiso general para usarlo, modificarlo o redistribuirlo.

La licencia se incorporará cuando los responsables del proyecto definan el equilibrio deseado entre reutilización, contribuciones y protección frente a copias comerciales.
