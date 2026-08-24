# Tipografía: candidatas para GradeHub

Esta es una comparación para decidir, no un cambio de la fuente publicada.
Onest sigue intacta en la app. Las tres muestras usaron exactamente el mismo
contenido en Inicio (PPA grande), ficha de ramo (notas en columna) y Agenda.

## Condiciones que pasaron las tres

- Una sola familia variable, no combinación de display + texto.
- Disponible en Google Fonts: no exige cambiar CSP, `_headers` ni la caché del
  service worker.
- Los pesos que GradeHub ya usa siguen existiendo: Archivo 100–900, Manrope
  200–800 y Rubik 300–900.
- Las cifras son tabulares de verdad. A 32px con `tabular-nums`, `1111` y
  `8888` midieron igual: Archivo 72.77px, Manrope 79.37px, Rubik 79.20px.

## Las tres alternativas

| Familia | Cómo se lee en GradeHub | Costo de la variante latina | Veredicto |
| --- | --- | ---: | --- |
| [Archivo](https://fonts.google.com/specimen/Archivo) | Más universitaria y editorial. Hace que el PPA y los nombres de ramo se vean firmes, sin volver la Agenda solemne. | 88.0 KiB | La de más carácter académico; su costo es el problema. |
| [Manrope](https://fonts.google.com/specimen/Manrope) | Serena y precisa. Es la más limpia en notas pequeñas y deja espacio a los colores de ramo. | 24.0 KiB | La opción equilibrada: más liviana que Onest y sin sentirse genérica como Inter. |
| [Rubik](https://fonts.google.com/specimen/Rubik) | Redonda, cercana y reconocible. El PPA toma presencia rápido, pero puede sentirse demasiado juguetona para una herramienta universitaria. | 34.5 KiB | Buena si se quiere una voz más cálida; no la usaría si se busca sobriedad. |

El costo se midió el 24 de agosto de 2026 contra la hoja oficial de Google
Fonts, con un navegador Chromium actual. Es el WOFF2 latino que cargaría una
persona que lee español; Google puede servir otro subconjunto según navegador e
idioma. Referencia actual: Onest entrega 31.5 KiB en las mismas condiciones.

## Recomendación para elegir

1. **Manrope** si priorizamos velocidad y una interfaz tranquila: cuesta menos
   que lo actual y conserva legibilidad excelente en móvil.
2. **Archivo** si queremos que el producto se sienta inequívocamente
   universitario y aceptamos aproximadamente 56 KiB extra en la primera carga.
3. **Rubik** solo si la intención es hacer GradeHub deliberadamente más
   cercana; es la más expresiva, pero también la menos sobria.

Se descartaron DM Sans, Figtree, Plus Jakarta Sans, Public Sans y Red Hat
Display: aunque aceptan la declaración CSS `tabular-nums`, en la prueba visual
sus `1111` y `8888` no ocuparon el mismo ancho. Para una app que alinea notas,
eso las deja fuera.

## Si se elige una

El cambio real reemplaza Onest en los cinco HTML, `styles.css`, los estilos
generados por `app.js` y las páginas sueltas. Se reorienta
`tests/fuentes-csp.test.js` a la familia elegida, pero se mantienen sus pruebas
de CSP, una sola familia y números tabulares. Es otra PR, nunca esta.
