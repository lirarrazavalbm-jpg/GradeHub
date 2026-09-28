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

- `marketplace-vistas.js`: renderizadores y proyección de estados sin IO. Usa
  `tarjetaCatalogoClase`, `filaAdminAnuncio`, `costoCampanaClase` y formatters reales.
- `marketplace-vistas.css`: estilos de la propuesta con los tokens de GradeHub.
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
