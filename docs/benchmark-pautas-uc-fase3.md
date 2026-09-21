# Parser UC — Fase 3

## Resumen

El parser `uc-catalogo-3` corrige los tres patrones medidos en Fase 2 sin ampliar el dataset ni interpretar reglas complejas como reglas calculables. Sobre los mismos 30 programas alcanza **30/30 clasificaciones**, **30/30 extracciones de pesos** y **15/15 señales complejas**, manteniendo **0 falsos `auto_importable`**.

## Cinco fallos originales

| Sigla | Gold | Parser anterior | Pesos esperados | Pesos anteriores | Señales esperadas | Señales anteriores | Causa |
|---|---|---|---|---|---|---|---|
| MED101A | not_found | insufficient_information | — | — | — | — | “Programa de curso no disponible” no estaba reconocido. |
| QIM100 | not_found | insufficient_information | — | — | — | — | Mismo mensaje oficial no reconocido. |
| GEO1002 | needs_review | insufficient_information | 30/30/40 | — | asistencia mínima 75% | — | Filas numeradas sin dos puntos cortaban la sección. |
| AGL007 | needs_review | insufficient_information | 20/40/40 | — | asistencia 100% | — | Pesos entre paréntesis con punto final y asistencia ambigua. |
| ICE1513 | needs_review | insufficient_information | 30/70 | — | agregado; mínimo seis experiencias | — | Dos porcentajes venían dentro de una misma frase. |

Los cinco se agrupan en tres patrones: ausencia oficial, filas con formatos reales no reconocidos y porcentajes múltiples en prosa.

## Patrones implementados

- Filas con porcentaje entre paréntesis, punto final o numeración inicial, solo en las formas presentes en AGL007 y GEO1002.
- Desglose parentético con varias categorías (`30% laboratorio, 70% nota de cátedra`), marcado siempre ambiguo y enviado a revisión.
- Asistencia mínima u obligatoria separada de las evaluaciones; una categoría real como `Participación/asistencia: 10%` se conserva.
- Respuesta oficial “Programa de curso no disponible” como `not_found`, separada de errores de transporte.
- Lenguaje medido de eximición, fórmula alternativa y mínimos; se conserva la línea exacta y no se genera ninguna regla calculable.

## Cambios de código

- `filaConPorcentaje` sigue resolviendo una fila simple.
- `filasEnProsaConPorcentajes` atiende únicamente el desglose parentético medido.
- `asistenciaEsRequisito` interpreta contexto después de extraer candidatos y antes de sumar pesos.
- `senalesComplejidad` detecta la prosa y entrega reasons sin convertirla al modelo GradeHub.
- `extraerEstructura` conserva separadas extracción, señales, validación y clasificación.

## Métricas antes y después

| Métrica | Antes · Fase 2 | Después · Fase 3 |
|---|---:|---:|
| Exactitud de clasificación | 25/30 (83,3%) | 30/30 (100.0%) |
| Pesos explícitos exactos | 26/30 (86,7%) | 30/30 (100.0%) |
| Señales complejas | 8/15 (53,3%) | 15/15 (100.0%) |
| Falsos auto-importable | 0 | 0 |

## Tabla de los 30 casos después de Fase 3

| Sigla | Gold | Parser | Clase | Pesos | Razones del parser | Problema |
|---|---|---|---:|---:|---|---|
| IIC1103 | auto_importable | auto_importable | sí | sí | — | — |
| FIS1514 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| QIM100F | needs_review | needs_review | sí | sí | exemption_rule_detected, minimum_or_cap_rule_detected, conditional_exam_rule_detected, alternative_final_grade_formula_detected, aggregate_category_detected | — |
| BIO143M | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MAT1610 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| EAE1110 | auto_importable | auto_importable | sí | sí | — | — |
| EAA100A | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| FIL001 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| TTF013 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ARQ2000 | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| DER002C | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MED101A | not_found | not_found | sí | sí | source_program_unavailable | — |
| ENF043A | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| PSI1101 | needs_review | needs_review | sí | sí | weights_do_not_sum_100 | — |
| LET0003 | needs_review | needs_review | sí | sí | attendance_requirement_detected | — |
| COM001 | auto_importable | auto_importable | sí | sí | — | — |
| EDU0010 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ART001 | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| GEO1002 | needs_review | needs_review | sí | sí | attendance_requirement_detected | — |
| AGL007 | needs_review | needs_review | sí | sí | attendance_requirement_detected | — |
| ICH1104 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ICE1513 | needs_review | needs_review | sí | sí | ambiguous_percentage_detected, minimum_or_cap_rule_detected, aggregate_category_detected | — |
| FIS1503 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| QIM100 | not_found | not_found | sí | sí | source_program_unavailable | — |
| BIO141C | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MAT1620 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| ICS2563 | auto_importable | auto_importable | sí | sí | — | — |
| ICS2121 | auto_importable | auto_importable | sí | sí | — | — |
| ICT2904 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| IIC2115 | auto_importable | auto_importable | sí | sí | — | — |

## Signals complejas

| Sigla | Gold signal | Detectada |
|---|---|---:|
| FIS1514 | aggregate_category | sí |
| QIM100F | exemption_rule | sí |
| QIM100F | minimum_average_required | sí |
| QIM100F | minimum_each_interrogacion | sí |
| QIM100F | conditional_exam | sí |
| QIM100F | alternative_final_grade_formula | sí |
| QIM100F | aggregate_category | sí |
| MAT1610 | aggregate_category | sí |
| PSI1101 | weights_do_not_sum_100 | sí |
| LET0003 | minimum_attendance_80 | sí |
| GEO1002 | minimum_attendance_75 | sí |
| AGL007 | minimum_attendance_100 | sí |
| ICE1513 | aggregate_category | sí |
| ICE1513 | minimum_six_lab_experiences | sí |
| MAT1620 | aggregate_category | sí |

## Falsos auto-importable

`false_auto_importable_count = 0`. Ningún caso peligroso en la muestra congelada.

## Tests

- `tests/catalogo-uc-patrones-fase3.test.js` cubre porcentaje normal, whitespace, paréntesis, numeración, prosa 30/70, asistencia requisito/categoría, ausencia oficial, mínimo, condición, fórmula y eximición.
- `tests/catalogo-uc-benchmark.test.js` fija 30/30, 30/30, 15/15 y cero falsos automáticos.
- El test nuevo contra `dc84a02` falla como corresponde: 5/13 pasan, 8 fallan, exit code 1.
- El mismo test con Fase 3 pasa 13/13, exit code 0.
- `npm test`: 139 tests, exit code 0.

## Reasons finales disponibles

- `aggregate_category_detected`: una categoría agrupa varias evaluaciones sin desglose seguro.
- `conditional_rule_detected`: la línea expresa una condición general.
- `conditional_exam_rule_detected`: el examen depende de una condición.
- `exemption_rule_detected`: el texto declara eximición.
- `minimum_or_cap_rule_detected`: hay un mínimo, máximo o tope.
- `attendance_requirement_detected`: la asistencia es requisito y no peso de nota.
- `alternative_final_grade_formula_detected`: hay una fórmula alternativa de nota final.
- `replacement_rule_detected`: una evaluación reemplaza o sustituye otra.
- `ambiguous_percentage_detected`: varios porcentajes vienen incrustados en prosa.
- `relevant_unparsed_line`: queda texto evaluativo relevante sin interpretar.
- `weights_do_not_sum_100`: los pesos explícitos no suman 100.
- `source_program_unavailable`: la fuente oficial dice que el programa no está disponible.
- `program_not_found`: la fuente oficial dice que el programa no fue encontrado.
- `evaluation_section_not_found`: el programa existe, pero no trae sección evaluativa reconocible.
- `course_code_mismatch`: la sigla declarada no coincide con la consultada.
- `duplicate_evaluation_name`: dos categorías normalizan al mismo nombre.
- `invalid_weight_or_name`: una categoría tiene nombre o peso inválido.
- `multiple_final_grade_formulas_detected`: se encontraron varias fórmulas alternativas.

## Riesgos restantes

- El benchmark sigue teniendo 30 programas: no prueba tablas partidas entre celdas ni todos los formatos históricos del catálogo.
- No apareció reemplazo ni descarte en las fuentes congeladas; no se amplió esa heurística sin evidencia.
- El desglose con varios porcentajes solo se extrae dentro de paréntesis y siempre queda en `needs_review`.
- Las reglas complejas se detectan como texto, pero todavía no se traducen a `grupos`, `gates`, eximiciones ni reemplazos calculables.

## Próxima fase recomendada

Ampliar el benchmark de forma dirigida con programas oficiales que contengan tablas partidas, reemplazo y descarte. Solo después medir si los mismos reasons generalizan; no implementar todavía la traducción automática de prosa a reglas del motor.
