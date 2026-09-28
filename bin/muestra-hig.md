# Muestra de marketplace y administración

Generar un HTML autocontenido, fuera del repositorio:

```sh
node bin/preview-hig.js /tmp/gradehub-muestra.html
```

La muestra incluye catálogo, filtros, detalle, formulario original de anuncios,
bandeja de revisión, estados y cobros históricos. Personas y datos son ficticios;
los cambios solo viven en memoria y se reinician al recargar. No tiene conexiones
a Supabase: la política de contenido bloquea todas las conexiones de red.

El filtro de precio admite mínimo y máximo opcionales, ambos en pesos enteros,
y «Solo gratis». El rango se conserva al abrir y cerrar detalles. Los buscadores
usan un único contorno de foco en el contenedor; las filas mantienen separadores
rectos con un fondo redondeado al pasar el cursor o recibir foco de teclado.

## Reutilización

- `bin/marketplace-vistas.js`: renderizadores y proyección de estados sin IO. Usa
  `tarjetaCatalogoClase`, `filaAdminAnuncio`, `costoCampanaClase` y formatters reales.
- `bin/marketplace-vistas.css`: estilos de la propuesta con los tokens de GradeHub.
- `bin/muestra-hig.html`: entorno de muestra, fixtures y adaptadores simulados.
- `bin/preview-hig.js`: empaquetador; no genera una segunda implementación.

Las vistas aún no se cargan desde `index.html`. Para integrarlas después de
revisar el diseño, conectar las acciones a las RPC verificadas, conservar MFA,
permisos, foco y manejo de errores; la aprobación necesita implementación en el
servidor. Los handlers simulados de `bin/` no deben usarse en producción.

## Comprobado

- Navegación entre los tres espacios, filtros y modo oscuro.
- Envío del formulario real con datos ficticios.
- Aprobación: sube el contador visible y baja la cola de revisión.
- Saldar deuda histórica actualiza deuda y cobrado sin cambiar la publicación.
- Sin desborde horizontal en anchos de 390 y 1280 px.
- Compilación de todos los scripts incrustados y seis verificaciones locales
  de estados y resumen. No se modificó código cargado por la app existente.

## Cuentas existentes y despliegue (#522)

Esta PR sigue apilada sobre #515. `bin/marketplace-vistas.js`,
`bin/marketplace-vistas.css`, los fixtures y los handlers simulados quedan
excluidos del deploy por `bin/`. No se toca `index.html` ni se carga una vista
nueva en la app. No añade cambios a anuncios, campañas o cobros existentes,
antes ni después de aplicar el SQL de #515. `tests/deploy-lista.test.js`
comprueba que los archivos publicados sean exactamente `archivos_app`.

## Revisión visual completada · 2026-09-28

Comprobación en navegador a 1280 px y 390 px, en claro y oscuro:

- Buscador: contorno único en el contenedor, input sin sombra ni contorno doble.
- Mis anuncios y Campañas con cobros registrados: fondo de interacción de
  radio 12 px, separadores conservados y foco visible. El mismo pseudoelemento
  sirve a hover y focus-visible.
- Precio: $10.000–$13.000 deja la clase de $12.000; $10.000–$16.000 deja dos
  clases. Abrir/cerrar el detalle conserva los valores. Un rango invertido
  muestra el error. Solo gratis deja la clase gratuita e inhabilita el rango;
  limpiar restaura los cuatro resultados. Ningún máximo de $15.000 implícito.
- Sin desborde horizontal. Controles revisados de al menos 44×44; el checkbox
  pertenece a una etiqueta clicable de altura 44. Reiniciar muestra también
  tiene área de 44×44. Áreas seguras respetadas.
- Contraste de pares efectivos texto/fondo: mínimo 4,66:1 en claro y 5,57:1
  en oscuro, incluyendo texto secundario sobre hover, estados y botones.
- `prefers-reduced-motion` desactiva la transición del fondo de fila, además
  de las reglas de movimiento reducido de styles.css. Verificado en CSS.

Referencias HIG: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields),
[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
y [Motion](https://developer.apple.com/design/human-interface-guidelines/motion).

Verificación: los 204 tests completos y la comprobación de deploy pasan.
