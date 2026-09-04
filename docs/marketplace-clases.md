# Marketplace de clases particulares

Este documento define el recorrido antes de construir la interfaz. Su objetivo
es que un estudiante encuentre apoyo para un ramo sin convertir sus notas en un
dato que GradeHub entregue a profesores o anunciantes.

## Principio que no se negocia

La recomendación personalizada se decide **en el navegador**. El servidor puede
entregar el catálogo público de avisos de una universidad, pero no recibe qué
ramos tiene la persona, qué promedio lleva, si puede aprobar ni una señal de
riesgo. Un tutor tampoco ve quién recibió su aviso.

## Dos puertas distintas

1. **Explorar clases.** Siempre disponible. La persona busca por ramo o sigla y
   ve el mismo catálogo público que cualquier estudiante de su universidad.
   No necesita mirar notas ni pedir consentimiento especial.
2. **Recomendaciones de apoyo.** GradeHub puede destacar una clase que calza
   con un ramo que se está poniendo difícil. La condición se declara en los
   términos y la política, no como una preferencia de configuración.

No se usa la palabra "reprobando" en la tarjeta. La intención es ofrecer una
salida, no diagnosticar ni presionar: “Puede servirte apoyo para Cálculo II”.

## Decisión al crear la cuenta

En el registro se amplía la casilla obligatoria que ya acepta los términos; no
se agrega un segundo control:

> ☐ Acepto los términos y la política de privacidad, incluido que GradeHub use
> mis notas y ramos para mostrarme recomendaciones de clases. Se calcula dentro
> de GradeHub; los profesores no ven mis notas ni saben quién eres.

Parte desmarcada. Para crear la cuenta debe marcarla: así queda un acto visible
antes de que GradeHub use sus notas y ramos para ordenar recomendaciones. No hay
una casilla adicional, modal extra ni insistencia en cada visita.

Las cuentas que ya existen reciben el mismo trato: no aparece un selector en
Ajustes, no se crea una preferencia por cuenta y no se reinterpreta ningún dato
guardado. Antes de activar la función, los términos y la política tienen que
decir claramente que el uso local de notas y ramos para ordenar avisos forma
parte del servicio para todas las cuentas.

## Cuándo una clase puede destacarse

La regla propuesta es deliberadamente conservadora y se calcula localmente:

- el ramo tiene al menos 20% de avance ponderado;
- su promedio parcial es menor a 4,0; y
- existe un aviso publicado que declara la sigla exacta del ramo.

El 20% evita presentar como problema un primer control aislado. Es una señal de
apoyo, no una predicción de reprobación: si faltan ponderaciones, no hay sigla
verificada o el cálculo no puede decidir, no se personaliza nada.

Solo se destaca un aviso por pantalla y siempre se muestra su etiqueta de
“Clase particular”. La persona puede cerrarlo; el catálogo general sigue siendo
el camino para comparar alternativas.

## Frontera de datos y métricas

El módulo de datos del primer PR (`marketplace.js`) conserva esta separación:

```text
Supabase -> catálogo público por universidad -> navegador
S.ramos y notas -> cálculo local -> coincidencia local -> tarjeta
```

Las métricas llevan únicamente `anuncio_id`, tipo de evento y sigla del aviso.
No incluyen `user_id`, correo, carrera, semestre, promedio, nota, estado de
consentimiento ni un indicador de riesgo. Los reportes para tutores salen solo
agregados y desde cinco eventos; cuentan eventos, no personas.

## Orden de lanzamiento

1. **Modelo revisado y SQL aplicado manualmente.** El PR de datos incluye
   `supabase/clases_particulares.sql`; Martín debe aplicarlo y comprobar RLS
   antes de que cualquier interfaz lo llame. Un deploy de Cloudflare no ejecuta
   SQL.
2. **Flujo de tutor.** Crear borrador, enviar a revisión y publicar solo después
   de revisión y pago manuales. No hay pasarela de pago ni publicación
   automática en el primer lanzamiento.
3. **Catálogo general para estudiantes.** Explorar avisos por ramo o sigla, sin
   mirar notas y sin recomendaciones personalizadas. Sirve para probar que los
   avisos son útiles antes de usar cualquier señal académica.
4. **Registro y recomendación local.** La casilla de aceptación obligatoria,
desmarcada al crear cuenta, incorpora el uso local de notas; las cuentas
existentes reciben el mismo trato sin selector. Los términos y la política se
actualizan en el mismo PR antes de activar la tarjeta contextual.
5. **Medición y revisión.** Se revisan métricas agregadas, calidad de los
   avisos y el límite de datos local. Antes de escalar, hacer revisión legal de
   publicidad dirigida a estudiantes y del tratamiento de usuarios menores de
   edad.

## Fuera de alcance por ahora

- Vender notas, riesgos, listas de ramos o identidades a profesores.
- Cobros dentro de GradeHub, comisiones por nota o verificaciones falsas de
  inscritos.
- Ranking de estudiantes, perfiles académicos para anunciantes o segmentación
  por carrera, semestre o nota.
- Activar recomendaciones personalizadas sin publicar antes los términos y la
  política que describen el uso local de datos académicos.
