# Benchmark del importador UC — Fase 2

## Resumen ejecutivo

El parser `uc-catalogo-2` clasificó correctamente **25 de 30 programas (83.3%)** y no produjo falsos `auto_importable`. Ese cero es el resultado principal: en esta muestra el importador nunca afirmó que una pauta estaba lista cuando la lectura humana exigía revisión o decía que faltaban datos.

La cobertura todavía es conservadora: 5 programas quedaron como información insuficiente aunque el texto permitía rescatar una pauta revisable o declarar que el programa no estaba disponible. Además, la detección de señales complejas cubrió 8 de 15 señales humanas (53.3%). No se modificó ninguna heurística en esta fase.

## Dataset utilizado

| Sigla | Curso | Captura | Fuente | Fidelidad |
|---|---|---|---|---|
| IIC1103 | Introducción a la Programación | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=IIC1103) | normalized_official_html |
| FIS1514 | Dinámica | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=FIS1514) | normalized_official_html |
| QIM100F | Química | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=QIM100F) | normalized_official_html |
| BIO143M | Principios Ecológicos y Medio Ambiente | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=BIO143M) | normalized_official_html |
| MAT1610 | Cálculo I | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=MAT1610) | normalized_official_html |
| EAE1110 | Introducción a la Microeconomía | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=EAE1110) | normalized_official_html |
| EAA100A | Horizontes y Desafíos en la Gestión de Empresas | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=EAA100A) | normalized_official_html |
| FIL001 | Platón | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=FIL001) | normalized_official_html |
| TTF013 | Tópicos de Ética Social Cristiana | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=TTF013) | normalized_official_html |
| ARQ2000 | Investigación en Artes y Humanidades | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ARQ2000) | normalized_official_html |
| DER002C | Personas y Bienes | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=DER002C) | normalized_official_html |
| MED101A | Anatomía y Embriología Humana I | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=MED101A) | normalized_official_html |
| ENF043A | Cuidados de la Persona Enferma | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ENF043A) | normalized_official_html |
| PSI1101 | Procesos Psicológicos Básicos | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=PSI1101) | normalized_official_html |
| LET0003 | Desarrollo de Habilidades Comunicativas para Ingenieros | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=LET0003) | normalized_official_html |
| COM001 | Comunicación y Educación | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=COM001) | normalized_official_html |
| EDU0010 | Tecnología de Información y Comunicación en Educación | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=EDU0010) | normalized_official_html |
| ART001 | Dibujo Figura Humana Básico | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ART001) | normalized_official_html |
| GEO1002 | Introducción a la Geografía | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=GEO1002) | normalized_official_html |
| AGL007 | Taller de Biohuerto | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=AGL007) | normalized_official_html |
| ICH1104 | Mecánica de Fluidos | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ICH1104) | normalized_official_html |
| ICE1513 | Estática y Dinámica | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ICE1513) | normalized_official_html |
| FIS1503 | Física General | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=FIS1503) | normalized_official_html |
| QIM100 | Química General | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=QIM100) | normalized_official_html |
| BIO141C | Biología de la Célula | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=BIO141C) | normalized_official_html |
| MAT1620 | Cálculo II | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=MAT1620) | normalized_official_html |
| ICS2563 | Econometría Aplicada | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ICS2563) | normalized_official_html |
| ICS2121 | Métodos de Optimización | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ICS2121) | normalized_official_html |
| ICT2904 | Ingeniería de Sistemas de Transporte | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=ICT2904) | normalized_official_html |
| IIC2115 | Programación como Herramienta para la Ingeniería | 2026-09-21 | [Catálogo UC](https://catalogo.uc.cl/index.php?tmpl=component&option=com_catalogo&view=programa&sigla=IIC2115) | normalized_official_html |

La muestra cubre 30 programas de facultades y escuelas distintas, con listas, párrafos, porcentajes entre paréntesis, cantidades por unidad, agregados, ausencia de ponderaciones, asistencia mínima y examen condicional. No apareció una regla oficial de reemplazo o descarte en estas 30 fuentes; esa cobertura queda explícitamente pendiente y no se simuló con texto inventado.

## Fidelidad de fixtures existentes

| Fixture anterior | Auditoría | Hallazgo | Estado actual |
|---|---|---|---|
| IIC1103 | C · sintético | Inventaba Interrogación 1/2 y Proyecto; el oficial dice Pruebas 30, Examen 30, Tareas 30 y Participación 10. | Corregido a reducción fiel del oficial. |
| FIS1514 | B · reducido fiel | Conservaba correctamente 3 Interrogaciones 60, Taller 10 y Examen 30, con redacción abreviada. | Refrescado con el texto oficial exacto. |
| QIM100F | C · paráfrasis no fiel | Omitía los umbrales de eximición e inventaba “Para aprobar”; no era una reducción semánticamente equivalente. | Corregido a reducción fiel del oficial. |
| BIO143M | C · sintético | Inventaba Pruebas, Controles y Trabajo; el oficial solo dice “3 Evaluaciones”. | Corregido a reducción fiel del oficial. |

## Métricas

- Exactitud de clasificación: **25/30 (83.3%)**.
- Pesos explícitos exactos: **26/30 (86.7%)**.
- `false_auto_importable_count`: **0**.
- `false_auto_importable_rate`: **0.0%** de las propuestas automáticas.
- Falsos `needs_review`: **0**.
- Falsos `insufficient_information`: **5**.
- Señales de regla compleja detectadas: **8/15 (53.3%)**.

## Matriz completa

| Sigla | Gold | Parser | Clase | Pesos | Razones del parser | Problema |
|---|---|---|---:|---:|---|---|
| IIC1103 | auto_importable | auto_importable | sí | sí | — | — |
| FIS1514 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| QIM100F | needs_review | needs_review | sí | sí | minimum_or_cap_rule_detected, conditional_exam_rule_detected, aggregate_category_detected | complex_rule_signal_missed |
| BIO143M | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MAT1610 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| EAE1110 | auto_importable | auto_importable | sí | sí | — | — |
| EAA100A | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| FIL001 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| TTF013 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ARQ2000 | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| DER002C | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MED101A | not_found | insufficient_information | NO | sí | evaluation_section_not_found | explicit_unavailable_message_not_recognized |
| ENF043A | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| PSI1101 | needs_review | needs_review | sí | sí | weights_do_not_sum_100 | — |
| LET0003 | needs_review | needs_review | sí | NO | weights_do_not_sum_100 | attendance_requirement_misread_as_weight |
| COM001 | auto_importable | auto_importable | sí | sí | — | — |
| EDU0010 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ART001 | insufficient_information | insufficient_information | sí | sí | evaluation_section_not_found | — |
| GEO1002 | needs_review | insufficient_information | NO | NO | — | percentage_format_not_recognized |
| AGL007 | needs_review | insufficient_information | NO | NO | relevant_unparsed_line | percentage_format_not_recognized |
| ICH1104 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| ICE1513 | needs_review | insufficient_information | NO | NO | relevant_unparsed_line | multiple_percentages_in_paragraph |
| FIS1503 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| QIM100 | not_found | insufficient_information | NO | sí | evaluation_section_not_found | explicit_unavailable_message_not_recognized |
| BIO141C | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| MAT1620 | needs_review | needs_review | sí | sí | aggregate_category_detected | — |
| ICS2563 | auto_importable | auto_importable | sí | sí | — | — |
| ICS2121 | auto_importable | auto_importable | sí | sí | — | — |
| ICT2904 | insufficient_information | insufficient_information | sí | sí | relevant_unparsed_line | — |
| IIC2115 | auto_importable | auto_importable | sí | sí | — | — |

## Falsos positivos peligrosos

Ninguno en esta muestra. `false_auto_importable_count = 0`.

## Falsos negativos y exceso de conservadurismo

- **MED101A:** el parser devolvió `insufficient_information`, pero la gold label es `not_found`. La fuente oficial responde explícitamente «Programa de curso no disponible». Patrón: `explicit_unavailable_message_not_recognized`.
- **GEO1002:** el parser devolvió `insufficient_information`, pero la gold label es `needs_review`. Publica una pauta 30/30/40 y una asistencia mínima obligatoria de 75%. Patrón: `percentage_format_not_recognized`.
- **AGL007:** el parser devolvió `insufficient_information`, pero la gold label es `needs_review`. Las notas suman 100 y además exige 100% de asistencia; ese 100% no es peso académico. Patrón: `percentage_format_not_recognized`.
- **ICE1513:** el parser devolvió `insufficient_information`, pero la gold label es `needs_review`. El párrafo fija 30/70 y al menos seis experiencias, pero no reparte el laboratorio ni la cátedra. Patrón: `multiple_percentages_in_paragraph`.
- **QIM100:** el parser devolvió `insufficient_information`, pero la gold label es `not_found`. La fuente oficial responde explícitamente «Programa de curso no disponible». Patrón: `explicit_unavailable_message_not_recognized`.

Aunque LET0003 sí quedó en `needs_review`, sus pesos no calzan: el parser sumó el 80% de asistencia como si fuera una cuarta evaluación y obtuvo 180%. El estado conservador evita la importación automática, pero el candidato mostrado a revisión es incorrecto.

## Señales complejas omitidas

- **QIM100F:** exemption_rule, alternative_final_grade_formula.
- **LET0003:** minimum_attendance_80.
- **GEO1002:** minimum_attendance_75.
- **AGL007:** minimum_attendance_100.
- **ICE1513:** aggregate_category, minimum_six_lab_experiences.

## Patrones observados

- `complex_rule_signal_missed`: QIM100F.
- `explicit_unavailable_message_not_recognized`: MED101A, QIM100.
- `attendance_requirement_misread_as_weight`: LET0003.
- `percentage_format_not_recognized`: GEO1002, AGL007.
- `multiple_percentages_in_paragraph`: ICE1513.

## Recomendaciones para Fase 3

1. **Unificar la lectura de filas con porcentaje sin relajar la seguridad.** Aceptar paréntesis, punto final y filas numeradas, pero separar vocabulario de requisitos como asistencia. Arreglaría AGL007, GEO1002 y LET0003. El riesgo es convertir porcentajes de reglas en pesos; se controla exigiendo forma de fila y validando el total.
2. **Reconocer respuestas oficiales de ausencia.** Tratar “Programa de curso no disponible” como `not_found`. Arreglaría MED101A y QIM100 sin aumentar el riesgo de una importación falsa.
3. **Ampliar señales de prosa compleja antes de extraer fórmulas.** Cubrir “eximible”, fórmulas alternativas y párrafos con varias categorías explícitas, manteniéndolos siempre en `needs_review`. Mejoraría QIM100F e ICE1513; el principal riesgo es confundir una explicación con una pauta, por lo que no debe producir `auto_importable`.

Antes de implementar reglas de reemplazo o descarte, hay que sumar fixtures oficiales que realmente las contengan. Esta muestra no autoriza una regex para esos casos.

## Archivos creados o modificados

- `bin/capturar-benchmark-uc.js`: captura acotada, secuencial y reutilizable de la lista explícita.
- `bin/benchmark-pautas-uc.js`: runner offline, métricas y reporte reproducible.
- `tests/fixtures/catalogo-uc-benchmark/`: 30 fuentes completas, manifiesto con hashes y gold labels humanas.
- `tests/catalogo-uc-benchmark.test.js`: integridad del dataset y línea base de métricas.
- `tests/fixtures/catalogo-uc/{IIC1103,FIS1514,QIM100F,BIO143M}.html`: auditoría y corrección de fidelidad.
- `tests/catalogo-uc-offline.test.js`: expectativas alineadas con el texto oficial, sin cambiar el parser.
- `docs/benchmark-pautas-uc-fase2.{md,json}`: matriz y resultados completos.

## Tests

- `node tests/catalogo-uc-offline.test.js`: 41 PASS, 0 FAIL, exit code 0.
- `node tests/catalogo-uc-benchmark.test.js`: 13 PASS, 0 FAIL, exit code 0.
- El test nuevo contra el árbol anterior `e8b56cb`: exit code 1 por ausencia del benchmark.
- `npm test`: 138 tests, exit code 0.

La captura de fuentes no corre en CI; el benchmark y la suite sí son completamente offline.
