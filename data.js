// GradeHub · datos
//
// Catálogo (mallas, carreras, presets), temas y portales. Solo literales: acá no
// hay DOM, no hay estado y no se llama a nada. Las funciones que leen estos datos
// (mallaFor, presetRamo…) viven en app.js.
//
// Se carga como <script> normal ANTES de app.js — los const quedan en el ámbito
// léxico global compartido, así que app.js los ve sin imports.

// ─── COLORES DE RAMO ─────────────────────────────────────────────────────────
// El color de un ramo es un IDENTIFICADOR, no decoración. Su único trabajo es
// que el estudiante distinga un ramo de otro de un vistazo. Por eso es UNA sola
// paleta para los cuatro temas, con el mismo criterio que el semáforo: si el
// color comunica algo, no se tiñe por universidad.
//
// Antes había una paleta por tema, teñida para armonizar con su acento: FEN
// tenía cuatro azules y tres dorados, UC ocho variaciones del mismo azul. Se
// veía elegante y era inservible — con seis ramos en pantalla, ninguno se
// distinguía del de al lado.
//
// Los matices están repartidos por la rueda de color, a 21° o más uno de otro,
// y ninguno cae cerca del semáforo (verde #2ee6c8, ámbar #ffc94d, rojo #ff5f7a)
// para que nadie confunda "este ramo es rojo" con "este ramo va reprobado".
// Por eso no hay rojo ni amarillo acá: esos matices ya significan otra cosa.
// Al agregar uno nuevo, respeta la separación — el test la verifica.
const COLORS=[
  '#ea580c', // naranjo
  '#a3e635', // lima
  '#22c55e', // verde
  '#06b6d4', // cian
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#a855f7', // violeta
  '#d946ef', // fucsia
  '#ec4899', // rosa
];

// ─── COLOR POR FAMILIA DE RAMO ───────────────────────────────────────────────
// Un ramo nuevo no arranca con "el siguiente color libre" sino con el de su
// familia: todos los Métodos Matemáticos comparten matiz, todos los Inglés
// comparten otro. Así el estudiante ve su carga de matemáticas o de idiomas de
// un vistazo, sin leer los nombres.
//
// Las asociaciones base salen de cómo Anto ordenaba sus propias carpetas:
// microeconomía violeta, inglés rosa, comunicación naranjo, contabilidad verde,
// gestión de personas azul, métodos matemáticos amarillo. Ese último es lima
// acá: el amarillo puro está reservado al semáforo (ámbar = "al borde") y un
// ramo teñido de amarillo se leería como un estado.
//
// El orden importa: gana la PRIMERA que calce. Por eso lo específico va antes
// que lo general ('Métodos Cuantitativos' antes que 'Métodos').
// Un ramo que no calce con ninguna toma un color estable derivado de su nombre,
// así que dos compañeros ven el mismo ramo del mismo color.
const FAMILIAS_COLOR=[
  // Lo específico va antes que lo general: 'Métodos Cuantitativos' tiene que
  // resolverse antes de que 'Métodos Matemáticos' se lo lleve.
  [/metodos cuantitativos|estadistica|probabil|investigacion operativa|juegos y estrategias|toma de decisiones|optimizacion/, '#a3e635'], // lima — cuantitativo
  [/metodos matematicos|calculo|algebra|ecuaciones diferenciales/, '#a3e635'], // lima — matemáticas
  [/contabilidad|costos|contable|tributa|impuesto/, '#22c55e'], // verde — contable
  [/auditoria|control interno|riesgos/,          '#ea580c'], // naranjo — auditoría
  [/ingles|idioma/,                              '#ec4899'], // rosa — idiomas
  [/comunicacion/,                               '#ea580c'], // naranjo — comunicación
  [/microeconomia|macroeconomia|economia|econom/,'#a855f7'], // violeta — economía
  [/gestion de personas|personas|organizacional/,'#3b82f6'], // azul — personas
  [/finanzas|inversion|financier|presupuesto/,   '#06b6d4'], // cian — finanzas
  [/control de gestion|estrategia|gestion y empresas|gestion de procesos/, '#3b82f6'], // azul — gestión
  [/marketing|negocios|comercial|competencia y mercado|mercados/, '#d946ef'], // fucsia — negocios
  [/programacion|machine learning|datos|sistemas|tecnologia|informatica|transformacion digital|ingenieria/, '#6366f1'], // índigo — tecnología
  [/derecho|legal|legisla|etica|filosof|pensamiento|historia/, '#ea580c'], // naranjo — humanidades y derecho
  // La física de Ingeniería UC no se llama "física": los ramos son Dinámica,
  // Termodinámica y Electricidad y Magnetismo, y sus laboratorios heredan el
  // matiz porque el nombre los contiene ("Laboratorio de Dinámica").
  [/quimica|fisica|biolog|dinamica|electricidad|magnetismo|estatica|mecanica|ondas|optica/, '#06b6d4'], // cian — ciencias
  [/practica|taller|integracion|afe/,            '#d946ef'], // fucsia — práctica
];

// ─── MALLAS FEN 2026 ─────────────────────────────────────────────────────────
// Lo que se OFRECE al elegir carrera. Es más chico que MALLA a propósito: una
// malla que sale de acá no se borra, solo deja de ofrecerse, y sus ramos siguen
// apareciendo en la búsqueda. Volver a ofrecerla es agregar su línea.
const CARRERAS={
  'IC':'Ing. Comercial',
  'IICG':'Ing. en Información y Control de Gestión',
};
// Ramos obligatorios por carrera y semestre. Electivos/Libres se agregan a mano.
const _COMUN={
  1:['Introducción a la Economía','Gestión y Empresas','Comunicación','Programación para Analítica de Datos','Métodos Matemáticos I'],
  2:['Introducción a la Microeconomía','Gestión de Personas','Contabilidad','Tecnología y Sistemas de Información','Métodos Matemáticos II','Inglés I'],
  3:['Introducción a la Macroeconomía','Marketing','Introducción al Pensamiento Económico y Político','Estadística I','Métodos Matemáticos III','Inglés II'],
  4:['Economía Aplicada','Finanzas','Razonamiento Basado en Datos','Estadística II','Métodos Matemáticos IV','Inglés III'],
};
const MALLA={
  // Ing. Comercial. La mención (Ciencias Económicas o Administración) se elige
  // más adelante en la carrera, así que del 1º al 4º es una sola malla. Del 5º
  // en adelante va la UNIÓN de ambas menciones: son ramos POSIBLES, no todos
  // los que cursa una persona. El historial de git conserva la separación
  // original por si algún día se vuelven a ofrecer aparte.
  'IC':{..._COMUN,
    5:['Microeconomía I','Macroeconomía I','Métodos Cuantitativos I','Historia Económica','Inglés IV','Comunicación II','Gestión de Personas I','Economía para los Negocios','Contabilidad Empresarial I'],
    6:['Microeconomía II','Macroeconomía II','Métodos Cuantitativos II','Taller de Política Pública','Marketing I','Taller de Negocios','Negocios I','Finanzas I','Contabilidad Empresarial II'],
    7:['Microeconomía III','Macroeconomía III','Taller Práctico Profesional/Social I','Taller Práctico Profesional/Social II','Negocios II'],
    8:['Microeconomía IV','Macroeconomía IV','Gestión de Personas II','Marketing II','Negocios III','Finanzas II'],
    9:['Práctica Profesional'],10:['Taller de Práctica Profesional'],
  },
  'CA':{
    1:['Gestión y Empresas','Programación para Analítica de Datos','Contabilidad','Métodos Matemáticos I','Comunicación'],
    2:['Introducción a la Economía','Tecnología y Sistemas de Información','Fundamentos de Costos','Métodos Matemáticos II','Ética y Negocios','Inglés I'],
    3:['Introducción a la Microeconomía','Gestión de Riesgos y Control Interno','Métodos Matemáticos III','Estadística I','Introducción al Pensamiento Económico y Político','Inglés II'],
    4:['Introducción a la Macroeconomía','Finanzas','Razonamiento Basado en Datos','Contabilidad Financiera','Estadística II','Inglés III'],
    5:['Sistemas Tributación en la Renta','Métodos Cuantitativos','Análisis Contable','Fundamentos de Auditoría','Inglés IV'],
    6:['Sistemas de Tributación Tipo Consumo','Análisis Financiero e Inversiones','Sistemas de Aplicaciones','Estrategia y Presupuesto','Desarrollo de Auditoría','Inglés V'],
    7:['Economía de los Impuestos','Gestión Financiera Corporativa','Investigación Operativa','Auditoría de Tecnología de la Información','Derecho y Empresa'],
    8:['Gestión Legal Tributaria','Machine Learning','Gestión de Procesos de Negocios','Contabilidad Avanzada','Control Financiero'],
    9:['Taller de Integración Profesional'],10:['Práctica Profesional'],11:['AFE (Trabajo de Cierre)'],
  },
  'IICG':{..._COMUN,
    5:['Métodos Cuantitativos','Contabilidad Financiera','Estrategia y Presupuestos','Sistemas de Administración de Bases de Datos','Inglés IV'],
    6:['Investigación Operativa','Análisis Contable','Planificación y Diseño Organizacional','Sistemas de Aplicaciones','Inglés V','Derecho y Empresa'],
    7:['Machine Learning','Análisis Financiero e Inversiones','Control de Gestión I','Transformación Digital'],
    8:['Toma de Decisiones Bajo Incertidumbre','Juegos y Estrategias','Gestión Financiera Corporativa','Control de Gestión II','Gestión de Procesos de Negocios'],
    9:['Taller de Integración Profesional'],10:['Práctica Profesional'],11:['AFE (Trabajo de Cierre)'],
  },
};

// ─── MULTI-TENANT (universidad → identidad visual) ───────────────────────────
// `mono` es la sigla que se dibuja en el monograma (ver tenantBadge). No es el
// logo ni el escudo de la universidad: es una etiqueta con iniciales en la
// tipografía de GradeHub. Nunca reproducir marcas registradas acá.
const TENANTS={
  fen:{name:'U. de Chile · FEN', short:'FEN', mono:'FEN', sub:'Economía y Negocios'},
  uc :{name:'U. Católica · Ingeniería', short:'UC', mono:'UC', sub:'Ingeniería'},
  // oculto:true → no se ofrece al elegir universidad, pero sigue funcionando
  // completo (tema, carreras, presets) para quien ya lo tenga seleccionado.
  // Quitar la marca cuando se quiera lanzar.
  uai:{name:'U. Adolfo Ibáñez', short:'UAI', mono:'UAI', sub:'Todas las carreras', oculto:true},
  uandes:{name:'U. de los Andes', short:'UANDES', mono:'UA', sub:'Todas las carreras', oculto:true},
};

// ─── GLIFOS DE UNIVERSIDAD ───────────────────────────────────────────────────
// Marcas de línea, sin texto, en el mismo lenguaje de trazo que el resto de los
// íconos de la app. Cada escudo se reduce a su elemento dominante: a 26px un
// escudo de 4 cuadrantes es una mancha, el motivo principal sí se reconoce.
//
// Para reemplazar uno: cambia su entrada acá por el <path> del SVG nuevo.
// Requisitos: viewBox 0 0 48 48, sin fill, trazo heredado (stroke:currentColor).
// Vacío a propósito. Mientras no haya un SVG real de la marca se usa la sigla,
// que el estudiante reconoce al instante. Un símbolo genérico inventado —una
// estrella, una cruz— no identifica a ninguna universidad.
//
// Para activar el logo de una: registra su SVG acá.
//   viewBox="0 0 48 48" · solo trazos · sin fill ni color propio (heredan el tema)
//   máximo ~5 trazos, o no se lee a 20px.
const TENANT_GLYPHS={
  // fen: '<path d="…"/>',
  // uc:  '<path d="…"/>',
};

// ─── IDENTIDAD VISUAL ÚNICA ──────────────────────────────────────────────────
// GradeHub tiene una sola voz visual, independiente de la universidad. TENANTS
// sigue decidiendo mallas, carreras, presets y portales; acá solo viven los
// tokens que debe compartir toda la app. Agregar una universidad es puro dato,
// no la creación de otra paleta.
//
// Verde mineral: cercano a una libreta y a una herramienta de estudio, pero
// separado del verde brillante del semáforo y de los colores identificadores de
// ramo. El acento secundario es casi neutro para que no compita con ellos.
const THEME_BASE={
  // Semáforo de notas. Se deja IGUAL en todos los temas a propósito: verde/ámbar/
  // rojo son semánticos (aprobado / al borde / reprobado), no decorativos. Teñirlos
  // por universidad haría ilegible lo único que la app tiene que comunicar sin error.
  success:'#2ee6c8', warning:'#ffc94d', danger:'#ff5f7a',
};

const GRADEHUB_THEME={
  primary:'#3f7a30', primaryFg:'#ffffff', primaryLight:'#e9f2e5',
  darkPrimaryLight:'#172313', accent:'#aab4a5', secondary:'#3f7a30',
  dark:{bg:'#090b08',bg2:'#10130e',card:'#171b15',border:'#272d23',border2:'#3b4435',muted:'#1d221a'},
};
const SURFACE_KEYS=['bg','bg2','card','border','border2','muted'];

// Carreras y mallas por universidad. Presets verificados solo en ING-PC (1er sem).
const CARRERAS_UC={'ING-PC':'Ingeniería · Plan Común','COM':'Ingeniería Comercial','OTRA':'Otra carrera'};
// Plan común de Ingeniería UC, currículum C2022. Los nombres y los créditos
// salen del catálogo oficial vía la API de mallas.ing.uc.cl (la herramienta de
// la propia Escuela), no de una imagen ni de memoria.
//
// QUÉ ENTRA Y QUÉ NO. Son los ramos que TODO estudiante de Ingeniería cursa,
// sin importar su major. Se obtuvieron intersectando los planes generados para
// seis majors distintos (Estructural, Computación, Construcción, Ambiental,
// Transporte y Geotécnica): lo que aparece en los seis es plan común, lo que
// difiere ya es del major.
//
// Del 4° semestre en adelante los majors divergen: EYP1113 y las tres Físicas
// con su laboratorio son lo único que sigue siendo de todos. Por eso la malla
// llega hasta ahí y no más — poner ramos de un major como si fueran de todos
// sería exactamente el tipo de dato plausible e inventado que no va.
//
// Los optativos (de ciencias, de exploración de majors) y los minors tampoco
// entran: son una elección, no un ramo. Mismo criterio que en FEN, donde los
// electivos se agregan a mano.
//
// Los laboratorios van con nombre propio aunque valgan 0 créditos: llevan nota
// y el estudiante los necesita en la app.
const MALLA_UC={
  'ING-PC':{
    1:['Cálculo I','Álgebra Lineal','Química para Ingeniería','Desafíos de la Ingeniería','Filosofía: ¿Para Qué?'],
    2:['Cálculo II','Dinámica','Laboratorio de Dinámica','Introducción a la Programación'],
    3:['Cálculo III','Ecuaciones Diferenciales','Termodinámica','Laboratorio de Termodinámica','Introducción a la Economía','Práctica I'],
    4:['Probabilidades y Estadística','Electricidad y Magnetismo','Laboratorio de Electricidad y Magnetismo'],
  },
  // Ing. Comercial UC, malla 2025 oficial (economiayadministracion.uc.cl,
  // assets/uploads/2025/07/malla-2025-1.pdf). Los ocho primeros semestres son
  // comunes: la mención —Economía o Administración— recién separa la malla en
  // IX y X, así que hasta 8° todos cursan lo mismo.
  //
  // La entrada anterior tenía un solo semestre y con errores: ponía Empresas y
  // Legislación y el curso Filosófico en 1°, cuando el oficial los tiene en 7° y
  // en 2°.
  //
  // Fuera quedan los que son una ELECCIÓN, no un ramo: los OPR (optativos de
  // profundización), los electivos en otra disciplina y el curso Teológico, que
  // es un área con muchos cursos posibles. El Filosófico sí entra con nombre
  // propio porque el plan fija FIL2001, no deja elegir.
  'COM':{
    1:['Cálculo I','Introducción a la Microeconomía','Contabilidad','Comportamiento Organizacional'],
    2:['Probabilidad y Estadística','Introducción al Álgebra Lineal','Cálculo II','Introducción a la Macroeconomía','Filosofía: ¿Para Qué?'],
    3:['Inferencia Estadística','Aplicaciones Matemáticas para Economía y Negocios','Análisis Económico: La Experiencia Chilena','Fundamentos de Finanzas'],
    4:['Econometría','Microeconomía I','Estrategia de la Organización','Fundamentos de Marketing'],
    5:['Introducción a la Programación','Microeconomía II','Macroeconomía I','Teoría Financiera'],
    6:['Estrategia Competitiva','Competencia y Mercado','Contabilidad de Costos','Ética, Economía y Empresa','Marketing Analytics'],
    7:['Empresas y Legislación','Macroeconomía II','Contabilidad Gerencial','Dirección de Personas'],
    8:['Práctica Social'],
  },
};
// Carreras UAI — sin mallas verificadas todavía, el estudiante arma sus ramos
const CARRERAS_UAI={'ING':'Ingeniería Civil','COM-UAI':'Ingeniería Comercial','DER-UAI':'Derecho','PSI':'Psicología','OTRA':'Otra carrera'};
const CARRERAS_UANDES={'ING-UA':'Ingeniería Civil','COM-UA':'Ingeniería Comercial','DER-UA':'Derecho','MED-UA':'Medicina','PSI-UA':'Psicología','OTRA':'Otra carrera'};

// Portal por universidad: recursos oficiales según el tenant del estudiante.
const PORTAL_UC=[
  {title:'Académico',links:[
    {label:'Canvas UC',desc:'Cursos, materiales y entregas',url:'https://cursos.canvas.uc.cl',color:'#e84646'},
    {label:'SIDING',desc:'Portal del estudiante de Ingeniería',url:'https://siding.uc.cl',color:'#16387e'},
    {label:'Buscacursos',desc:'Horarios, secciones y vacantes',url:'https://buscacursos.uc.cl',color:'#16a34a'},
  ]},
  {title:'Universidad',links:[
    {label:'Portal UC',desc:'Sitio oficial de la universidad',url:'https://www.uc.cl',color:'#16387e'},
    {label:'Mi Portal UC',desc:'Trámites y servicios estudiantiles',url:'https://portal.uc.cl',color:'#7c3aed'},
  ]},
  {title:'Recursos',links:[
    {label:'Bibliotecas UC',desc:'Libros, papers y bases de datos',url:'https://bibliotecas.uc.cl',color:'#d97706'},
    {label:'Correo UC',desc:'Casilla institucional',url:'https://correo.uc.cl',color:'#ea580c'},
    {label:'Bienestar Estudiantil',desc:'Apoyo, salud y acompañamiento',url:'https://desarrolloestudiantil.uc.cl',color:'#475569'},
  ]},
];

// PORTAL quedó sin uso al reemplazar la pestaña por la Agenda; se conserva por si
// se reintroduce como sección de recursos.
const PORTAL=[
  {title:'Académico',links:[
    {label:'Canvas',desc:'Plataforma de cursos y tareas',url:'https://uchile.instructure.com',color:'#e84646'},
    {label:'Docencia Web FEN',desc:'Portal académico de la facultad',url:'https://docencia.fen.uchile.cl',color:'#2563eb'},
    {label:'U-Campus',desc:'Inscripción de ramos, horarios y más',url:'https://ucampus.uchile.cl',color:'#16a34a'},
  ]},
  {title:'Facultad',links:[
    {label:'FEN UChile',desc:'Sitio oficial de la facultad',url:'https://fen.uchile.cl',color:'#0891b2'},
    {label:'Universidad de Chile',desc:'Portal oficial UChile',url:'https://uchile.cl',color:'#7c3aed'},
  ]},
  {title:'Recursos',links:[
    {label:'Biblioteca UChile',desc:'Acceso a libros, papers y recursos',url:'https://buscador.uchile.cl',color:'#d97706'},
    {label:'Correo UChile',desc:'Gmail institucional',url:'https://mail.uchile.cl',color:'#ea580c'},
    {label:'Mi Portal UChile',desc:'Servicios estudiantiles',url:'https://mi.uchile.cl',color:'#475569'},
  ]},
];

// ─── PRESETS UC (ponderaciones oficiales 2026-1) → auto-carga de secciones ───
// cats: [nombre, peso%]. Un 3er elemento {min,cap} marca un PISO de aprobación en
// esa sección (regla min_grade_required): si su nota < min, la final se topa en cap.
// Caso real: el Podcast de FIL2001. El piso lo aplica ramoAvg vía r.gates.
// ING1004 NO está aquí: su compuerta es entre GRUPOS anidados (Individual/Grupal)
// y no cabe en el modelo plano de secciones — necesita el árbol completo (próximo brick).
const PRESETS_UC={
  'Cálculo I':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  'Álgebra Lineal':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  'Química para Ingeniería':[['Pruebas',44.1],['Ev. de Taller',4.9],['Examen',21],['Informes',18],['Controles',12]],
  'Filosofía: ¿para qué?':[['Prueba 1',30],['Ejercicio de análisis',20],['Prueba 2',30],['Podcast',20,{min:4.0,cap:3.9}]],
};
// IMPORTANTE: los prospectos verificados son del plan común de INGENIERÍA.
// "Cálculo I" de Comercial es OTRO curso (otra facultad/programa): no hereda estos pesos.

// ─── PRESETS FEN ─────────────────────────────────────────────────────────────
// Tronco común de 2° semestre (Ing. Comercial, Contador Auditor e Ing. en
// Información y Control de Gestión). Transcritos de los programas oficiales
// Primavera 2026. `grupo` define una compuerta sobre un CONJUNTO de
// evaluaciones: con cap 'self' el tope es el promedio del propio grupo.
//
// Dos listas para dos cosas distintas, y la diferencia le importa al estudiante:
//
// `noCalcula` — reglas que el motor TODAVÍA no sabe representar y que sí va a
// saber. Es una deuda nuestra con fecha de vencimiento. Cuando se implementan,
// salen de acá (así salió "se elimina el 25% de los controles", que hoy calcula
// `dropLowest`).
//
// `reglasDelCurso` — reglas del programa que el promedio NUNCA va a incluir,
// porque dependen de información que la app no puede tener: un dato que el
// programa no da (¿cuántos controles sorpresa son?), algo que decide el profesor
// caso a caso (una recuperativa autorizada), o una aproximación deliberada del
// motor. No son una deuda: son cómo funciona el curso.
//
// Ninguna de las dos es documentación interna: las dos se le muestran al
// estudiante, porque su promedio real puede diferir del que ve y tiene derecho a
// saber por qué. Callarlo es peor que no tener el preset.
//
// Al transcribir un programa, la pregunta para decidir dónde va una regla es:
// ¿con la información que el estudiante puede darnos, esto se podría calcular
// algún día? Si sí, `noCalcula`. Si no, `reglasDelCurso`.
const PRESETS_FEN={
  'Métodos Matemáticos II':{
    creditos:6,
    noCalcula:['Examen de Segunda Fecha para quien saque bajo 3,0 en el examen pero tenga promedio ≥ 3,95'],
    // El programa lista los tres solemnes por separado: van como filas propias,
    // y así cada uno lleva su fecha a la agenda.
    //
    // OJO, esto NO es solo cosmético. Antes eran una casilla al 60% con slots:3.
    // Con los tres rendidos da lo mismo, pero si falta alguno Y el examen ya está
    // puesto, el número cambia: la casilla agrupada asumía que los solemnes que
    // faltan van a salir como los rendidos, y en filas separadas el que falta se
    // descarta y se repondera sobre lo evaluado — que es lo que hace el motor con
    // cualquier otra categoría vacía. Con un solo solemne rendido la diferencia
    // llega a más de un punto. Se eligió la forma consistente con el resto.
    evals:[['Solemne 1',20],['Solemne 2',20],['Solemne 3',20],['Examen Final',40,{min:3.0,cap:3.9}]],
  },
  // Introducción a la Microeconomía · ENMIC155 · programa oficial actualizado
  // julio 2026. Los tres controles van en filas propias porque el programa los
  // enumera uno por uno, con fecha cada uno (21 de agosto, 16 de octubre y 6 de
  // noviembre) y con reglas de reemplazo DISTINTAS: si faltas al 1 te ponen la
  // Solemne, si faltas al 2 o al 3 te ponen el Examen. No son intercambiables.
  // Las pruebas sorpresa sí se quedan agrupadas: el programa dice que son cinco
  // pero no las identifica ni las fecha — son sorpresa, no hay agenda que poner.
  'Introducción a la Microeconomía':{
    creditos:6,
    noCalcula:[
      'Si tu promedio final queda entre 3,6 y 3,9 tienes derecho al examen recuperativo: si lo apruebas, el ramo queda en 4,0; si no, repruebas con el promedio que traías',
      'Si faltas al Control 1 con justificativo aprobado, esa nota se reemplaza por la de la Solemne',
      'Si faltas a la Solemne, al Control 2 o al Control 3 con justificativo aprobado, esa nota se reemplaza por la del Examen',
      'Si faltas a una prueba sorpresa con justificativo, ese 5% se suma al Examen',
    ],
    // Las dos que nunca van a ser cálculo: la primera es procedimiento del curso
    // —te dice qué hacer, no cómo sale tu número— y la segunda es disciplinaria.
    reglasDelCurso:[
      'Si faltas al Examen tienes que dar el recuperativo',
      'Copiar o plagiar reprueba el ramo de inmediato con 1,0',
    ],
    evals:[
      ['Solemne',30],
      ['Control 1',10],
      ['Control 2',10],
      ['Control 3',10],
      ['Pruebas sorpresa',5,{slots:5}],
      ['Examen',35],
    ],
  },
  'Gestión de Personas':{
    creditos:6,
    noCalcula:['Eximición del examen con promedio ≥ 5,5 en Casos: la nota del examen pasa a ser el promedio individual'],
    // El ajuste sale de cómo te evalúan tus compañeros: es un dato que solo
    // existe cuando el curso lo entrega. La app no puede anticiparlo.
    reglasDelCurso:['La nota del trabajo grupal se ajusta ±10 décimas según la evaluación entre compañeros'],
    evals:[['Casos y ensayos',40,{slots:5}],['Trabajo en grupo',30],['Participación',20],['Examen Integrativo',10]],
    // "Si alguno de los requisitos no se cumple, la nota final será la más baja
    //  entre los dos" → dos compuertas de grupo con tope en su propio promedio.
    grupos:[
      {nombre:'Trabajo individual',evals:['Casos y ensayos','Participación','Examen Integrativo'],min:4.0,cap:'self'},
      {nombre:'Trabajo de grupo',evals:['Trabajo en grupo'],min:4.0,cap:'self'},
    ],
  },
  'Contabilidad':{
    creditos:6,
    // "Se elimina el 25% de los controles sorpresa rendidos" salió de noCalcula:
    // el motor ya lo aplica vía `dropLowest`. El 75% de asistencia NO se puede
    // calcular y se queda: el programa dice "entre 4 y 6 controles", así que no
    // existe el denominador contra el cual medir el 75%.
    // Sin noCalcula: no queda ninguna regla pendiente de implementar.
    reglasDelCurso:['Rendir menos del 75% de los controles sorpresa reprueba el curso con 3,9'],
    evals:[
      ['Controles de Lectura',10,{slots:3,min:1.5,cap:3.9}],
      ['Controles Ejercicios',40,{slots:4,min:1.5,cap:3.9}],
      // El programa dice "entre 4 y 6 durante el semestre": el número exacto NO
      // está. Sin slots, el estudiante agrega los que realmente le tomaron.
      // Antes decía slots:4 — un dato plausible pero inventado.
      ['Controles Sorpresa',5,{min:1.5,cap:3.9,dropLowest:{fraction:0.25}}],
      ['Solemne',20,{min:1.5,cap:3.9}],
      ['Examen',25,{min:3.0,cap:3.4}],
    ],
  },
  // Marketing · ENMKT205 · programa oficial Primavera 2026 (Ing. Comercial).
  // Cuatro evaluaciones de 25% parejo, sin sorpresas en las ponderaciones.
  //
  // Dos cosas quedaron sin `slots` a propósito:
  //   Controles — "al terminar cada unidad del curso", y nunca dice cuántas
  //     unidades son. La agenda del programa lista 9 sesiones pero se declara
  //     "tentativa", así que 9 sería un número plausible e inventado.
  //   Trabajo Práctico — dice que son 2 entregas, pero no dice cuánto vale cada
  //     una ni si se califican por separado. Repartir 12,5 y 12,5 sería
  //     inventarlo. Sin slots el estudiante ingresa las notas que le pongan.
  'Marketing':{
    creditos:6,
    // Las tres son permanentes, cada una por su motivo. La primera el motor sí la
    // modela, con `group_min` y cap 'self': el veredicto aprobado/reprobado
    // coincide siempre (barrido de las 6561 combinaciones), y el número solo
    // difiere cuando ya estás reprobado por los dos caminos. Es una aproximación
    // deliberada y por eso se declara, no una deuda.
    reglasDelCurso:[
      'Si tu promedio en las evaluaciones individuales (Solemne, Controles y Examen) queda bajo 4,0, las notas grupales no se consideran y tu nota final pasa a ser ese promedio individual',
      'La nota del trabajo grupal se ajusta con un modificador por evaluación de pares, normalmente entre -0,9 y +0,9, aunque el rango cambia cada semestre',
      'Las evaluaciones no se repiten. Con prueba recuperativa autorizada se recupera solo una, Solemne o Examen, y nunca los controles',
    ],
    evals:[
      ['Solemne',25],
      ['Controles',25],
      ['Trabajo Práctico',25],
      ['Examen Final',25,{min:3.0,cap:3.9}],
    ],
    // "Para aprobar se requiere un promedio ponderado ≥ 4,0 en las evaluaciones
    //  individuales. Las notas grupales sólo se consideran si se cumple eso."
    //
    // No es exactamente cap:'self'. La regla dice que bajo 4,0 el trabajo grupal
    // deja de contar (final = promedio individual); cap:'self' topa la final en
    // el promedio individual, que es un pelo más abajo cuando el trabajo grupal
    // salió malo. Barrí las 6561 combinaciones: difieren en el número en 1171,
    // hasta 0,74 — pero el veredicto aprobado/reprobado coincide en TODAS, y
    // siempre estando ya reprobado. Por eso se usa igual, y la regla textual va
    // arriba en noCalcula para que el estudiante sepa de dónde sale su número.
    grupos:[
      {nombre:'Evaluaciones individuales',evals:['Solemne','Controles','Examen Final'],min:4.0,cap:'self'},
    ],
  },
  // Introducción a la Economía · ENECO105 · programa oficial Otoño 2026, común a
  // las nueve secciones. Es el mejor documentado de todos: da el peso de cada
  // control por separado, y no son iguales entre sí (8, 8, 10, 10).
  //
  // Las evaluaciones extra (pruebas online + curso de Educación Financiera) NO
  // están acá a propósito: no son parte del 100%, solo pueden subir la final y
  // con una fórmula condicional que el motor no sabe representar. Va a noCalcula.
  'Introducción a la Economía':{
    creditos:6,
    noCalcula:[
      'Las evaluaciones extra (pruebas online semanales y el curso de Educación Financiera) solo suben la nota si apruebas las obligatorias con 4,0 o más, y solo si te va mejor en ellas: ahí la final pasa a ser 90% obligatorias más 10% extra',
      'Si faltas a un control o a la Solemne con justificativo aprobado por la Escuela, ese porcentaje se acumula para el Examen',
    ],
    // Quién puede dar el recuperativo lo decide la Escuela, no un cálculo.
    reglasDelCurso:[
      'Solo puedes dar Examen Recuperativo si no pudiste rendir el Examen por causa justificada y aprobada por la Escuela de Pregrado',
    ],
    evals:[
      ['Control 1',8],
      ['Control 2',8],
      ['Solemne',22],
      ['Control 3',10],
      ['Control 4',10],
      ['Tarea Grupal',10],
      ['Examen',32],
    ],
  },
  // Métodos Matemáticos I · ENMEM1005 · programa oficial 2026, común a las nueve
  // secciones. El programa da la fórmula explícita:
  // C1*0,15 + C2*0,15 + C3*0,15 + S*0,25 + Exa*0,3.
  'Métodos Matemáticos I':{
    creditos:6,
    noCalcula:[
      'Cada evaluación que no rindas se califica con 1,0',
      'Hay Examen de Segunda Fecha en dos casos: si la Secretaría de Estudios te justificó la inasistencia a un control, la solemne o el examen, o si sacaste bajo 3,0 en el examen pero tu promedio ponderado quedó en 3,95 o más',
    ],
    evals:[
      ['Control 1',15],
      ['Control 2',15],
      ['Control 3',15],
      ['Solemne',25],
      ['Examen',30,{min:3.0,cap:3.9}],
    ],
  },
  // Programación para Analítica de Datos · ENGIN105 · programa oficial.
  // Los controles van sin `slots`: el programa dice que valen 30% pero nunca
  // dice cuántos son, así que el estudiante agrega los que le tomen.
  'Programación para Analítica de Datos':{
    creditos:6,
    noCalcula:[
      'Si la Prueba Solemne II queda bajo 4,0, tu nota final pasa a ser la más baja entre tu promedio ponderado y la nota del Examen',
      'El examen recuperativo puede reemplazar cada control o solemne que haya quedado bajo la nota que saques en él, salvo las notas puestas por medidas disciplinarias',
    ],
    // Sanción disciplinaria: no sale de las notas.
    reglasDelCurso:[
      'Copiar en una tarea, solemne o examen deja la nota final del curso en 1,0',
    ],
    evals:[
      ['Controles',30],
      ['Prueba Solemne',30],
      ['Examen',40],
    ],
  },
  // Gestión y Empresas · programa 2026 de la sección 07 (profesora Andrea Triat).
  // OJO: es el programa de UNA sección, no el común del ramo. Las otras secciones
  // pueden ponderar distinto. Si aparece el programa común, este se reemplaza.
  //
  // Los controles de lectura van sin `slots`: el programa numera hasta el Control
  // 7 pero el cronograma que tenemos salta las semanas 9 y 10, así que el total
  // no está confirmado. `dropLowest` funciona igual con los que el estudiante
  // agregue.
  'Gestión y Empresas':{
    noCalcula:[
      'Toda ausencia a una exigencia del curso se califica con 1,0',
    ],
    // El propio programa no da el número, y ese es justamente el motivo por el
    // que esta no se puede calcular nunca — no es que falte implementarla.
    reglasDelCurso:[
      'La Solemne y el Examen tienen fecha única. Avisando por escrito dentro de 24 horas por razones médicas, solo se puede recuperar una de las dos',
      'Los controles parciales y el Plan de Negocios no son recuperables por ninguna causa',
      'El aporte en clases suma décimas según tu participación',
      'Para aprobar, el promedio de las evaluaciones individuales tiene que ser 4,0 o más. El programa no dice en cuánto queda tu nota final si no se cumple, así que la app no lo aplica',
    ],
    evals:[
      ['Solemne',25],
      ['Controles de Lectura',20,{dropLowest:{count:1}}],
      ['Proyecto Empresa',25,{min:3.0,cap:3.9}],
      ['Examen Final',30,{min:3.0,cap:3.9}],
    ],
  },
  // Inglés IV · sección IC 3506 · calendario oficial 2026. Los nombres quedan en
  // inglés porque así aparecen en el calendario que recibe el estudiante.
  //
  // Quizzes (15%) y Labs (15%) vienen como bloque, pero cada uno tiene fecha
  // propia en el calendario y el Quiz 1 es oral mientras el 2 es escrito, así que
  // van en filas separadas. El reparto en partes iguales dentro de cada bloque
  // es supuesto nuestro: el calendario no da el peso individual.
  // El Entrepreneurship Project sí trae su reparto explícito, 40% Business Plan
  // y 60% Business Pitch sobre su 15%, o sea 6 y 9 puntos.
  'Inglés IV':{
    noCalcula:[
      'El Busuu es reprobatorio: hay que completar las 169 actividades del Complete English Intermediate B2, con un mínimo de 117, y su nota se arma con 70% actividades y 30% certificado',
    ],
    evals:[
      ['Busuu',10],
      ['Quiz 1',7.5],
      ['Quiz 2',7.5],
      ['Lab 1',5],
      ['Lab 2',5],
      ['Lab 3',5],
      ['Business Plan',6],
      ['Business Pitch',9],
      ['Midterm',15],
      ['Final Exam',30],
    ],
  },
};
