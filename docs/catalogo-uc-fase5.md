# Fase 5 · Validación estratificada y flujo de aprobación UC

## Resumen ejecutivo

La población es de **2001** candidatos sin preset clasificados `auto_importable` por el parser congelado. Se seleccionaron **120** para revisión humana estratificada. La revisión sigue pendiente: 0/120 fichas tienen etiqueta humana.

No se modificaron `PRESETS_UC`, el parser, cuentas, UI ni datos productivos.

## Análisis de los 2.001 candidatos

- Encabezados: evaluation_strategies: 1134; evaluation: 443; learning_assessment: 423; evaluation_system: 1.
- Número de categorías: 3: 870; 4: 572; 1-2: 366; 5+: 193.
- Formato de porcentaje: colon: 1716; plain: 116; mixed:colon+per_item: 95; parenthesized: 48; mixed:colon+plain: 21; per_item: 3; mixed:colon+per_item+plain: 1; mixed:per_item+plain: 1.
- Disposición evaluativa: bullet_list: 1914; table_like: 46; plain_lines: 30; numbered_list: 7; paragraph: 4.
- Longitud de sección: short_0-180: 1719; medium_181-360: 271; long_361+: 11.
- Versión del programa: missing: 1947; declared: 54.
- Forma singular/plural superficial: mixed: 1112; singular_like: 692; explicit_count: 100; plural_like: 97.
- Texto posterior a porcentajes: absent: 1998; present: 3.

La unidad académica no está disponible de forma fiable: `ESCUELAS_UC` está vacío deliberadamente. En su lugar se conserva únicamente `DISCIPLINA` cuando el propio programa la declara; no se deduce facultad desde la sigla.

## Compuerta automática sobre los 2.001 candidatos

La compuerta offline revisó los **2001** candidatos: **1987** pasan las cinco comprobaciones y **14** quedan marcados para revisión.

| Comprobación | Pasan | Marcados |
|---|---:|---:|
| Al menos dos evaluaciones, salvo autorización excepcional | 1990 | 11 |
| Cada ponderación tiene respaldo público en el texto | 2001 | 0 |
| Pesos suman 100 | 2001 | 0 |
| Cada nombre aparece en el texto fuente | 2001 | 0 |
| Ningún porcentaje del texto queda sin usar | 1998 | 3 |

Las dos primeras comprobaciones vienen del Reglamento del Estudiante UC, no de una heurística: una sola evaluación requiere autorización excepcional y la ponderación debe informarse públicamente desde la primera semana. Si falta un peso, la compuerta lo trata como problema de extracción o de fuente, nunca como un curso sin ponderación.

El patrón literal `N … X% c/u` conserva `slots` en **97** candidatos, **107** categorías y **242** evaluaciones declaradas. Sin número explícito no se inventan `slots`.

Informe contable completo: `docs/catalogo-uc-automatic-gate-fase5.json`. Incluye cada candidato marcado, su URL, el texto evaluativo y el detalle de la comprobación que falló.

**Límite de la compuerta:** Si el parser tomó la sección equivocada, evaluationSourceText y candidateWeights pueden concordar y pasar las cinco comprobaciones. La revisión humana debe abrir sourceUrl y confirmar que se leyó la sección correcta. Una pauta de una sola evaluación solo puede aprobarse si la fuente permite confirmar la autorización excepcional de la Facultad o Unidad Académica.

La revisión humana de la muestra sigue siendo necesaria, pero cambia de foco: la máquina verifica la transcripción interna; la persona confirma en `sourceUrl` que el parser leyó la sección correcta del programa.

## Estratos encontrados

Estrato primario: `evaluationLayout × categoryCountBucket × programVersionAvailability × additionalTextAfterPercentages`. La asignación da al menos un cupo a cada estrato y distribuye el resto según la raíz de la población, por lo que los formatos raros quedan sobrerrepresentados sin ahogar los comunes.

| Estrato | Población | Muestra | Tasa de muestreo |
|---|---:|---:|---:|
| bullet_list|1-2|declared|absent | 7 | 2 | 28.6% |
| bullet_list|1-2|missing|absent | 341 | 17 | 5% |
| bullet_list|1-2|missing|present | 1 | 1 | 100% |
| bullet_list|3|declared|absent | 23 | 4 | 17.4% |
| bullet_list|3|missing|absent | 810 | 26 | 3.2% |
| bullet_list|3|missing|present | 2 | 1 | 50% |
| bullet_list|4|declared|absent | 17 | 4 | 23.5% |
| bullet_list|4|missing|absent | 531 | 21 | 4% |
| bullet_list|5+|declared|absent | 6 | 2 | 33.3% |
| bullet_list|5+|missing|absent | 176 | 12 | 6.8% |
| numbered_list|1-2|missing|absent | 2 | 1 | 50% |
| numbered_list|3|missing|absent | 3 | 2 | 66.7% |
| numbered_list|4|missing|absent | 2 | 1 | 50% |
| paragraph|1-2|missing|absent | 2 | 1 | 50% |
| paragraph|3|missing|absent | 1 | 1 | 100% |
| paragraph|4|missing|absent | 1 | 1 | 100% |
| plain_lines|1-2|missing|absent | 4 | 2 | 50% |
| plain_lines|3|declared|absent | 1 | 1 | 100% |
| plain_lines|3|missing|absent | 15 | 4 | 26.7% |
| plain_lines|4|missing|absent | 5 | 2 | 40% |
| plain_lines|5+|missing|absent | 5 | 2 | 40% |
| table_like|1-2|missing|absent | 9 | 3 | 33.3% |
| table_like|3|missing|absent | 15 | 3 | 20% |
| table_like|4|missing|absent | 16 | 4 | 25% |
| table_like|5+|missing|absent | 6 | 2 | 33.3% |

## Muestra seleccionada

Seed reproducible: `gradehub-uc-fase5-v1`. Hash de la muestra: `08523b5c5cc4b6308650ff2aea01175af55659ecfb23641f671e0ff11c69c581`.

| Sigla | Ramo | Estrato | Disciplina |
|---|---|---|---|
| AQH2005 | Poética del Habitar, Mundo Clásico | bullet_list|1-2|missing|absent | ARQUITECTURA Y FILOSOFIA |
| IMT2100 | Aplicaciones de Análisis Funcional y Ecuaciones Diferenciales Parciales en Ingeniería | bullet_list|4|missing|absent | INGENIERIA - MATEMATICA |
| QIM517 | Celdas Solares | bullet_list|3|missing|absent | QUIMICA, CIENCIA DE MATERIALES |
| MUC950 | Interpretación Musical Historicamente Informada | bullet_list|1-2|missing|absent | MUSICA |
| AGC315 | Patología de Cultivos (AGC315) | bullet_list|3|missing|absent | AGRONOMIA PROTECCION VEGETAL, SANIDAD VEGETAL |
| EAA361A | Análisis de Big Data | bullet_list|1-2|missing|absent | ADMINISTRACION ? ESTADISTICA |
| AQU1307 | El Espacio del Transporte en la Ciudad | bullet_list|1-2|missing|absent | ARQUITECTURA |
| IMT2270 | Proyecto Final de Grado | bullet_list|5+|missing|absent | CIENCIA DE DATOS |
| VET2000 | Formulación y Evaluación de Proyectos en Medicina Veterinaria | plain_lines|1-2|missing|absent | MEDICINA VETERINARIA |
| VIL641G | Juego Educación y Naturaleza | bullet_list|5+|missing|absent | EDUCACION |
| ANT2264 | Taller Experimental de Investigación Social: Lenguajes, Materiales y Artefactos | numbered_list|4|missing|absent | ANTROPOLOGIA |
| LET321E | Imaginación Poética y Sentidos de Lugar | bullet_list|3|missing|absent | LITERATURA Y GEOGRAFIA |
| ICP0132 | Comportamiento Político y Electoral Comparado | bullet_list|5+|missing|absent | CIENCIAS POLITICAS |
| TEO297 | Taller Pastoral II: Dimensión Personal de la Actividad Pastoral | bullet_list|5+|missing|absent | TEOLOGIA |
| AST1529 | Planetas en el Universo | bullet_list|3|missing|absent | ASTRONOMIA Y ASTROFISICA |
| AAZ206 | Introducción a la Biología de la Conservación | plain_lines|3|missing|absent | no declarada |
| IMM2075 | Excelencia Operacional Aplicada a la Minería | bullet_list|1-2|missing|absent | MINERIA |
| GEO2018 | Geografía del Mar y del Litoral | table_like|5+|missing|absent | no declarada |
| TTF049 | El por Qué de la Indiferencia Religiosa | plain_lines|3|missing|absent | TEOLOGIA |
| AGF331 | Química y Microbiología del Vino | bullet_list|5+|missing|absent | AGRONOMIA, CIENCIAS DE LA AGRICULTURA |
| ENO2021 | Cuidados Básicos y Apoyo Emocional en Situación de Pandemia | bullet_list|5+|declared|absent | no declarada |
| EAE253B | Economía y Ciencia de los Datos | bullet_list|4|missing|absent | ECONOMIA, ESTADISTICA, INGENIERIA, ADMINISTRACION |
| QIM515 | Propiedad Intelectual para Innovar y Emprender | bullet_list|3|declared|absent | ECONOMIA, ADMINISTRACION, DERECHO |
| VIL604M | Intel, Educar para el Futuro | bullet_list|3|missing|absent | PEDAGOGIA GENERAL BASICA |
| IDI2996 | Fundamentos Sociales y Tecnicos de la Innovación | bullet_list|5+|missing|absent | no declarada |
| ECM2001 | Educación Sexual, Autocuidado y Afectividad | bullet_list|3|declared|absent | no declarada |
| IHI0508 | Rock Chileno y Mundo Contemporáneo. 1950-2000. | bullet_list|4|declared|absent | HISTORIA |
| VIP083 | Taller de Práctica Minor: Interculturalidad | bullet_list|4|declared|absent | no declarada |
| GEO1251 | Geografía de los Suelos | plain_lines|1-2|missing|absent | no declarada |
| IIQ2133 | Procesos Químicos | bullet_list|3|missing|absent | INGENIERIA |
| EAE372A | Teoría de Contratos | bullet_list|1-2|missing|absent | ADMINISTRACION Y ECONOMIA |
| ENO1261 | Regulación Natural de la Fertilidad | table_like|5+|missing|absent | ENFERMERIA |
| EAE231C | Seminario de Filosofía Política Moderna para Economistas | bullet_list|3|missing|absent | ECONOMIA Y FILOSOFIA |
| IDI2031 | Prototipado y Validación de Innovaciones Tecnologicas | bullet_list|3|missing|absent | INGENIERIA Y DISE?O |
| TSL587 | Innovación Social y Tecnología para el Trabajo Social | bullet_list|3|missing|present | no declarada |
| BIO352D | Técnicas de Planificación Sistemática para la Conservación | bullet_list|1-2|missing|absent | CIENCIAS BIOLOGICAS, ECOLOGIA |
| PSI2440 | Psicología del Delito | bullet_list|1-2|missing|present | no declarada |
| AGL282 | Tópicos de Investigación en Pregrado | bullet_list|4|missing|absent | CIENCIAS DE LA AGRICULTURA Y DE LOS RECURSOS NATURALES |
| AQI0200 | Cmd Lecciones de Anatomía Con Modelos Estructurales | bullet_list|3|missing|absent | BIOMECANICA |
| PSO414 | Diferencias Individuales en el Aprendizaje Escolar | bullet_list|3|missing|absent | PSICOLOGIA DEL DESARROLLO, PSICOLOGIA DEL APRENDIZAJE |
| DPT9350 | Entrenamiento de Habilidades Mentales Enfocadas al Deporte | bullet_list|4|missing|absent | DEPORTES - PSICOLOGIA |
| ENF2306 | Proceso de Ayuda Interpersonal en Enfermería | table_like|1-2|missing|absent | ENFERMERIA |
| DNO016 | Diseño y Manufactura Digital Cad/Cam | plain_lines|4|missing|absent | no declarada |
| DEC262 | Derecho Inmobiliario | numbered_list|3|missing|absent | no declarada |
| ACO216E | Dramaturgia Alemana Contemporánea (Texto y Consecuencias Escénicas) | bullet_list|3|missing|absent | ACTUACION |
| DNO082 | Diseño y Economía Circular | paragraph|4|missing|absent | no declarada |
| AST1016 | Espacio, Tiempo y Universo | bullet_list|4|missing|absent | ASTRONOMIA Y ASTROFISICA |
| IEU2064 | Análisis y Modelación de Datos Socio Territoriales | table_like|4|missing|absent | PLANIFICACION URBANA |
| ESO2422 | Cine, Literatura y Cultura de Masas | numbered_list|1-2|missing|absent | no declarada |
| MED818B | Unidad de Taller Bibliografico II | bullet_list|3|missing|absent | MEDICINA/ PUEDE TENER OTRA DISCIPLINA - DEPENDERA DEL ALUMNO |
| VET1180 | Farmacología y Toxicología | plain_lines|3|missing|absent | MEDICINA VETERINARIA |
| AQC1123 | La Observación de la Construcción. Estudio de Obras Notables en Chile | bullet_list|4|missing|absent | ARQUITECTURA - CONSTRUCCION |
| VET1000 | Economía y Administración Veterinaria | plain_lines|3|declared|absent | MEDICINA VETERINARIA |
| DEM285 | Derecho Bancario Avanzado | table_like|1-2|missing|absent | DERECHO |
| ICP0116 | Análisis de las Políticas Sociales en Chile y América Latina | bullet_list|3|declared|absent | CIENCIA POLITICA |
| DEF335 | Introducción a los Derechos Humanos | bullet_list|4|missing|absent | DERECHO |
| RII6001 | Upper-Intermediate English 2 | bullet_list|5+|missing|absent | LINGUISTICA |
| BIO010 | Biología Inicial | table_like|3|missing|absent | BIOLOGIA |
| ANT2532 | Investigación Cualitativa en Organizaciones Sociales | bullet_list|3|missing|absent | ANTROPOLOGIA / EDUCACION / PSICOLOGIA |
| SUS2250 | Taller Planificación para el Desarrollo Sustentable | bullet_list|4|missing|absent | ESTUDIOS URBANOS Y TERRITORIALES; GEOGRAFIA; ANTROPOLOGIA; PLANIFICACION; DISE?O |
| ING2983 | Diseño Colaborativo en AIC (Arquitectura, Ingeniería y Construcción) (Capstone) | bullet_list|1-2|missing|absent | INGENIERIA Y ARQUITECTURA |
| GOB2004 | Segregación y Desigualdad en la Ciudad | bullet_list|5+|missing|absent | POLITICAS PUBLICAS, ECONOMIA, ESTUDIOS URBANOS, GEOGRAFIA |
| COM403 | Comunicación y Persuasión | bullet_list|4|missing|absent | COMUNICACIONES |
| ANT240 | Antropología de la Religión | bullet_list|1-2|missing|absent | ANTROPOLOGIA - SOCIOLOGIA |
| AGR306 | Estructura, Propiedades e Industria de la Madera | bullet_list|4|missing|absent | CIENCIAS FORESTALES |
| DEF349 | La Dignidad Humana y los Derechos Humanos | bullet_list|3|missing|absent | DERECHO |
| AGE313 | Economía Ambiental | bullet_list|1-2|missing|absent | CIENCIAS FORESTALES Y CIENCIAS DE LA AGRICULTURA |
| IEU2014 | Metropolis Latinoamericanas | bullet_list|4|declared|absent | ESTUDIOS URBANOS |
| ESO012 | Premio Nobel de Literatura Latinoamericana | paragraph|3|missing|absent | ESTETICA |
| ODO302A | Fundamentos Odontologicos Integrados VI | bullet_list|1-2|missing|absent | ODONTOLOGIA |
| VET2810 | Cirugía y Anestesia Avanzada | plain_lines|5+|missing|absent | MEDICINA VETERINARIA |
| ECM208M | Taller de Matemática | bullet_list|1-2|declared|absent | MATEMATICA |
| ANT2263 | Antropología de las Zonas Fronteras | bullet_list|4|missing|absent | ANTROPOLOGIA SOCIAL |
| CCO3320 | Taller de Investigación en Construcción Civil | bullet_list|4|missing|absent | CONSTRUCCION CIVIL |
| ANT170 | Introducción a la Etnografía | bullet_list|1-2|missing|absent | ANTROPOLOGIA |
| DEM283 | La Libre Competencia en el Derecho Comparado | numbered_list|3|missing|absent | no declarada |
| FIL185P | Ética para Psicología | bullet_list|3|missing|absent | FILOSOFIA |
| ICP0209 | Teoría Constitucional | bullet_list|3|missing|absent | CIENCIA POLITICA / DERECHO |
| ARO104I | Cuerpo y Arte: Miradas en torno a la Corporalidad | bullet_list|4|declared|absent | no declarada |
| SOL501 | Sociedades Modernas Occidentales | bullet_list|1-2|missing|absent | no declarada |
| EAF010 | Economía y Sociedad | table_like|3|missing|absent | no declarada |
| TTF048 | Seguir a Cristo Hoy: ñUna Utopiañ | bullet_list|3|missing|absent | FORMACION TEOLOGICA |
| PSB400B | Teorías y Procesos Psicológicos | bullet_list|4|missing|absent | PSICOLOGIA |
| QOP3805 | Comercialización de Instrumentos e Insumos Químicos | bullet_list|3|missing|absent | QUIMICA |
| VET2850 | Internado de Caninos y Felinos | plain_lines|4|missing|absent | MEDICINA VETERINARIA |
| ENO2002 | Cuidados de Enfermería del Adulto Con Problemas Cardiovasculares | table_like|4|missing|absent | ENFERMERIA |
| PSD283 | Teoría Técnicas Educación de Padres | bullet_list|3|missing|absent | PSICOLOGIA |
| SOL210 | Cmd: Envejecimiento, Individuo y Sociedad: Aproximaciones Interdisciplinarias | bullet_list|4|missing|absent | PSICOLOGIA / SOCIOLOGIA / TRABAJO SOCIAL |
| FIZ1417 | Topología en Sistemas de Muchos Cuerpos | bullet_list|1-2|missing|absent | FISICA y ASTRONOMIA |
| ECM285A | Aprendizaje Basado en Proyectos en Contextos Universitarios y Escolares | bullet_list|3|declared|absent | BIOLOGIA, FISICA, MATEMATICAS, QUIMICA y EDUCACION. |
| QIM1017 | Inmunofarmacología | paragraph|1-2|missing|absent | QUIMICA |
| VET2800 | Cirugía y Anestesia | table_like|1-2|missing|absent | MEDICINA VETERINARIA |
| QIF112 | Internado Clínico | bullet_list|5+|missing|absent | QUIMICA |
| SUS2220 | Ecología Humana y Territorio | bullet_list|5+|missing|absent | BIOLOGIA, ANTROPOLOGIA, CIENCIAS FORESTALES, CIENCIAS DE LA AGRICULTURA |
| TSL584 | Institucionalidad, Participación y Protección de Derechos (TSL584) | bullet_list|1-2|missing|absent | TRABAJO SOCIAL. |
| CAR1500 | Entrenamiento en Presentaciones Orales Efectivas | bullet_list|4|missing|absent | APOYO AL RENDIMIENTO ACADEMICO (CARA) |
| TSL497 | Evaluación de Proyectos Sociales (A+S) | bullet_list|5+|declared|absent | TRABAJO SOCIAL |
| GEO601 | Geografía, Territorio y Derecho Ambiental | bullet_list|1-2|declared|absent | GEOGRAFIA |
| ENP2412 | Seminario Profesional (ENP2412) | table_like|4|missing|absent | no declarada |
| IBM2992 | Biología Sintética y Prototipado de Funciones Biologicas Artificiales | bullet_list|4|missing|absent | INGENIERIA |
| VIL621 | Conozcamos Nuestra Fauna Silvestre: Técnicas Practicas para su Estudio y Fomento en Escuela | bullet_list|4|missing|absent | CIENCIAS NATURALES |
| AGR317 | Evaluación Integrada de Ecosistemas | bullet_list|3|missing|absent | CIENCIAS FORESTALES Y DE LOS RECURSOS NATURALES |
| TBH041 | Historia de la Iglesia en Chile | bullet_list|1-2|missing|absent | TEOLOGIA |
| VET1400 | Ecología Veterinaria | plain_lines|5+|missing|absent | MEDICINA VETERINARIA |
| AGL070 | Taller 4 | bullet_list|5+|missing|absent | AGRONOMIA / INGENIERIA FORESTAL |
| ILO3169 | Relato Chileno: Nomadismos | table_like|3|missing|absent | no declarada |
| IEU2046 | Asesoria a la Autogestion Residencial (A+S) | bullet_list|3|missing|absent | ESTUDIOS URBANOS Y OTRAS |
| GOB2009 | Migración y Derechos Humanos | bullet_list|3|missing|absent | DERECHO, CIENCIAS POLITICAS, SOCIOLOGIA |
| ART049 | Arte y Patrimonio (ART049) | bullet_list|3|missing|absent | ARTE |
| QIM1030 | Industria Farmacéutica: Desafíos, Oportunidades y Estrategia | bullet_list|4|missing|absent | QUIMICA-FARMACIA |
| AGZ350 | Producción Acuicola-Salmones | bullet_list|4|missing|absent | CIENCIAS AGRICOLAS |
| SUS2210 | Teoría y Política del Desarrollo Sustentable | bullet_list|3|missing|absent | INTER DISCIPLINA |
| VET2820 | Imagenología Veterinaria | plain_lines|3|missing|absent | MEDICINA VETERINARIA |
| GOB2010 | Proyectos de Acción Pública | bullet_list|4|missing|absent | DISE?O, COMUNICACIONES, POLITICAS PUBLICAS |
| EST244D | Estética de la Arquitectura y Diseño | bullet_list|1-2|missing|absent | ESTETICA |
| AGC318 | Biotecnología Agropecuaria | bullet_list|4|missing|absent | CIENCIAS DE LA AGRICULTURA |
| FON402 | Trastornos de la Deglución | bullet_list|5+|missing|absent | FONOAUDILOGIA |
| BIO187C | Aspectos Biológicos y Bioeticos de la Fertilidad en Humanos | bullet_list|3|missing|absent | CIENCIAS BIOLOGICAS Y MEDICINA |
| PSB118 | Psicología de la Personalidad | table_like|4|missing|absent | PSICOLOGIA |
| AGF330 | Propagación de Plantas | bullet_list|3|missing|absent | CIENCIAS DE LA AGRONOMIA Y CIENCIAS FORESTALES |

## Archivos para revisión humana

- Paquete legible: `docs/catalogo-uc-review-packet-fase5.md`.
- Muestra estructurada: `docs/catalogo-uc-review-sample-fase5.json`.
- Etiquetas humanas separadas: `docs/catalogo-uc-manual-validation-fase5.json`.
- Métricas: `docs/catalogo-uc-validation-metrics-fase5.json`.
- Compuerta automática poblacional: `docs/catalogo-uc-automatic-gate-fase5.json`.

Ninguna etiqueta viene preseleccionada. El archivo de etiquetas está ligado al hash de cada sección evaluativa para impedir que una decisión vieja se aplique a una fuente nueva.

## Cómo ejecutar la revisión y calcular métricas

1. Abrir cada ficha del paquete y confirmar en la URL oficial que el parser tomó la sección evaluativa correcta.
2. Completar `humanLabel`, `note`, `reviewer` y `reviewedAt` en el archivo de etiquetas.
3. Ejecutar:

```bash
node bin/validar-candidatos-uc-fase5.js metrics
```

Estado actual: `pending_review`; revisión completa: no; revisados 0; correctos 0; falsos 0; tasa detectada en la muestra sesgada —.

La muestra sobrerrepresenta formatos raros y casos atípicos dentro de cada estrato a propósito. Esa tasa describe solo las fichas revisadas y no estima la tasa poblacional de los 2.001 candidatos.

Si aparece un falso positivo, las métricas guardan el curso, texto fuente, etiqueta, nota, estrato, patrones responsables y población potencial del estrato. El runner siempre mantiene `massImportAllowed:false`.

## Diseño del workflow de aprobación

```text
candidate
  → human validation label
  → approved candidate (con edición opcional y firma)
  → propuesta de cambio PRESETS_UC + provenance
  → tests del preset generado
  → PR revisable
  → merge
```

El revisor ve la fuente, la sección completa, la estructura y cualquier comparación disponible. Validar no publica. Aprobar exige identidad y fecha; editar crea una propuesta nueva conservando la fuente original y el detalle de la edición. Rechazar conserva la decisión y su motivo.

## Conversión a PRESETS_UC

`candidateToPresetProposal(candidate, approval)` es una función pura. Solo acepta una aprobación explícita, nombres no vacíos, categorías únicas y pesos que sumen 100. Devuelve:

- un objeto actual de `PRESETS_UC` con `sigla`, `evals` y `periodo` cuando la fuente declara exactamente un semestre;
- un diff textual para revisión;
- un registro de provenance separado;
- la validación realizada.

No escribe `data.js`. Tampoco divide categorías agregadas: `Pruebas 40%` sigue siendo una categoría de 40%, salvo que una persona la edite con evidencia antes de aprobar.
`evals` emite un tercer elemento con `slots` únicamente cuando el texto declara literalmente `N … X% c/u`. Sin número declarado no inventa la cantidad; `min`/`cap` y `fecha` siguen fuera del prototipo.

## Provenance propuesta

Cada aprobación conserva centralmente `sourceType`, `sourceUrl`, `courseCode`, `retrievedAt`, `programVersionText`, `evaluationHash`, `parserVersion`, `approvedAt`, `approvedBy` y `scope`. El alcance continúa siendo `institutional_program`; semestre, sección y NRC permanecen nulos.

La provenance debe vivir junto a la definición institucional o en un registro central por sigla/hash, nunca copiada a cada cuenta. El estado del estudiante solo recibe la pauta resultante.

## Riesgos

- La muestra y la compuerta reducen incertidumbre, pero no demuestran que los 2.001 casos sean correctos: ambas fallan si se extrajo la sección equivocada.
- Solo 868 candidatos declaran `DISCIPLINA`; inferir la facultad desde la sigla sería inventar metadata.
- Los programas institucionales pueden ser más genéricos que la pauta del semestre.
- Una edición humana puede introducir un error aunque el parser haya acertado; por eso el diff y los tests siguen siendo obligatorios.
- Si cambia `evaluationHash`, cualquier aprobación anterior debe quedar obsoleta.

## Archivos que habría que modificar en una futura Fase 6

- `data.js`: agregar únicamente los presets aprobados y una referencia central de provenance.
- `tests/presets.test.js` y pruebas UC específicas: fijar suma, sigla, granularidad y ausencia de período inventado.
- Un artefacto generado de aprobaciones: registrar decisiones y hashes sin datos de estudiantes.
- Opcionalmente `app.js` y `render-main.js`: distinguir en producto una pauta institucional genérica de una pauta semestral, en un PR separado.

No se implementó importación productiva, UI pública, LLM ni cambios de heurísticas.
