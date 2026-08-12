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
// y ninguno cae cerca del semáforo (verde #2ecc40, ámbar #ffc94d, rojo #ff5f7a)
// para que nadie confunda "este ramo es rojo" con "este ramo va reprobado".
// Por eso no hay rojo ni amarillo acá: esos matices ya significan otra cosa.
// Al agregar uno nuevo, respeta la separación — el test la verifica.
const COLORS=[
  '#ea580c', // naranjo
  '#a3e635', // lima
  '#22c55e', // verde
  '#0ea5e9', // cian
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
  [/finanzas|inversion|financier|presupuesto/,   '#0ea5e9'], // cian — finanzas
  [/control de gestion|estrategia|gestion y empresas|gestion de procesos/, '#3b82f6'], // azul — gestión
  [/marketing|negocios|comercial|competencia y mercado|mercados/, '#d946ef'], // fucsia — negocios
  [/programacion|machine learning|datos|sistemas|tecnologia|informatica|transformacion digital|ingenieria/, '#6366f1'], // índigo — tecnología
  [/derecho|legal|legisla|etica|filosof|pensamiento|historia/, '#ea580c'], // naranjo — humanidades y derecho
  // La física de Ingeniería UC no se llama "física": los ramos son Dinámica,
  // Termodinámica y Electricidad y Magnetismo, y sus laboratorios heredan el
  // matiz porque el nombre los contiene ("Laboratorio de Dinámica").
  [/quimica|fisica|biolog|dinamica|electricidad|magnetismo|estatica|mecanica|ondas|optica/, '#0ea5e9'], // cian — ciencias
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
// Cian profundo: da energía sin apropiarse del verde del semáforo. El cian de
// los ramos sigue siendo más luminoso y funciona solo como identificador.
const THEME_BASE={
  // Semáforo de notas. Se deja IGUAL en todos los temas a propósito: verde/ámbar/
  // rojo son semánticos (aprobado / al borde / reprobado), no decorativos. Teñirlos
  // por universidad haría ilegible lo único que la app tiene que comunicar sin error.
  // El verde de aprobado se corrió de #2ee6c8 (170°, menta) a #2ecc40 (127°,
  // verde). El menta era prácticamente el turquesa de la marca —2° de matiz— y
  // con la identidad puesta en el turquesa de og.png, cada botón se habría leído
  // como un estado "aprobado". Se mueve el semáforo porque el color de la marca
  // lo eligió una persona; el del semáforo solo tiene que ser inconfundible.
  success:'#2ecc40', warning:'#ffc94d', danger:'#ff5f7a',
};

// La identidad es la de og.png, la tarjeta social del producto, con sus colores
// exactos: el turquesa del kicker GRADEHUB (#2dd4bf) y el de la palabra "Excel"
// (#56e2e8), sobre el fondo casi negro de la misma tarjeta (#05070a).
//
// LO QUE COSTÓ USAR EL COLOR EXACTO. El turquesa está a 2° de matiz del verde de
// aprobado que había (#2ee6c8) y a 17° del color de ramo cian (#06b6d4). Con la
// marca ahí, un botón se leía como "aprobado" y un ramo se veía como la marca.
//
// Se movieron los otros dos, no la marca: el color de la identidad lo eligió una
// persona mirando una imagen, y el del semáforo solo tiene que ser inconfundible.
// El verde de aprobado pasó a #2ecc40 (127°) y el ramo cian a #0ea5e9 (199°),
// dejando la marca en 172° con 45° y 27° de separación.
//
// Antes de esto la identidad fue verde mineral, después cian (#22d3ee) y después
// índigo. El cian quedaba a 1° del ramo cian; el índigo se leía morado y no era
// el color de la tarjeta. Este es el color de la tarjeta.
//
// primary es la versión profunda para modo claro: mismo matiz, 5,23:1 con blanco.
const GRADEHUB_THEME={
  primary:'#0d7a6b', primaryFg:'#ffffff', primaryLight:'#dff7f2',
  darkPrimary:'#2dd4bf', darkPrimaryFg:'#04231e', darkPrimaryLight:'#0a2b26',
  accent:'#56e2e8', secondary:'#0d7a6b', darkSecondary:'#2dd4bf',
  // bg es literalmente el fondo de og.png.
  dark:{bg:'#05070a',bg2:'#0a0f13',card:'#111820',border:'#20303a',border2:'#324755',muted:'#151d26'},
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
    // "Laboratorio de Dinámica" NO va acá: es el 30% de la nota de Dinámica,
    // no un ramo aparte (ver el preset de Dinámica). Ofrecerlo por separado
    // hacía que el estudiante lo agregara dos veces sin darse cuenta: una como
    // ramo suelto y otra dentro de Dinámica.
    2:['Cálculo II','Dinámica','Introducción a la Programación'],
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

// ─── PRESETS UC (ponderaciones oficiales 2026-2) → auto-carga de secciones ───
// El formato antiguo puede ser directamente `evals`; los programas con fechas,
// compuertas o reglas usan {evals, grupos, noCalcula, reglasDelCurso}. Un 3er
// elemento {min,cap} marca un PISO de aprobación en esa sección (regla
// min_grade_required): si su nota < min, la final se topa en cap.
// Caso real: el Podcast de FIL2001. El piso lo aplica ramoAvg vía r.gates.
// ING1004 NO está aquí: su compuerta es entre GRUPOS anidados (Individual/Grupal)
// y no cabe en el modelo plano de secciones — necesita el árbol completo (próximo brick).
const PRESETS_UC={
  'Cálculo I':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  'Álgebra Lineal':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  'Química para Ingeniería':[['Pruebas',44.1],['Ev. de Taller',4.9],['Examen',21],['Informes',18],['Controles',12]],
  'Filosofía: ¿para qué?':[['Prueba 1',30],['Ejercicio de análisis',20],['Prueba 2',30],['Podcast',20,{min:4.0,cap:3.9}]],
  'Introducción a la Programación':{
    evals:[
      ['Interrogación 1',15,{fecha:'2026-09-24'}],['Interrogación 2',20,{fecha:'2026-10-22'}],['Examen',30,{fecha:'2026-12-10'}],
      ['Tarea 1',5],['Tarea 2',5],['Tarea 3',5],['Nota de participación',16],['Talleres de Inteligencia Artificial',4],
    ],
    grupos:[{nombre:'Evaluaciones principales',evals:['Interrogación 1','Interrogación 2','Examen'],min:4.0,cap:3.9}],
    noCalcula:['Si faltas justificadamente a una interrogación, esa nota se reemplaza por la nota del Examen; solo puedes justificar la inasistencia a una interrogación'],
    reglasDelCurso:['Si rindes una evaluación presencial pero no registras correctamente tu asistencia, te califican con nota 1,0'],
  },
  'Principios de Ecología y Medio Ambiente':{
    evals:[['Prueba 1',25],['Prueba 2',40],['Prueba 3',35]],
    noCalcula:[
      'Si faltas a una Prueba, puedes rendirla en la única fecha destinada a pruebas pendientes al final del curso solo si tu caso es calificado y presentas la justificación médica exigida dentro del plazo',
      'Si cumples el requisito de tener nota ponderada de las Pruebas superior a 4,0, puedes sumar las décimas obtenidas en talleres a tu nota final, con un máximo de 5 décimas',
    ],
    reglasDelCurso:[
      'No puedes ausentarte a más de dos Pruebas; el programa no indica qué nota final te corresponde si superas ese límite',
      'Si cometes copia, usas torpedos u otro acto ilícito durante una Prueba, esa Prueba se sanciona con nota 1',
    ],
  },
  // El programa documenta recuperativas e inasistencias, pero no sus pesos.
  // No se crea una pauta de 0%: el estudiante sigue ingresando la real cuando la
  // tenga, y estas reglas se muestran porque el ramo sí viene del catálogo.
  'Cálculo II':{
    evals:[],
    noCalcula:[
      'Si faltas justificadamente a una sola Interrogación, esa nota se reemplaza por la nota del Examen',
      'Si faltas justificadamente a dos Interrogaciones, la nota del Examen reemplaza la primera que justificaste y debes rendir una evaluación equivalente para reemplazar la segunda',
      'Si faltas justificadamente a tres Interrogaciones, la nota del Examen reemplaza la primera que justificaste y debes rendir evaluaciones equivalentes para reemplazar las demás',
      'Si faltas justificadamente al Examen, debes rendir el Examen recuperativo',
    ],
    reglasDelCurso:[
      'Si faltas a una evaluación sin una justificación aceptada por tu unidad académica, obtienes nota 1,0 en esa evaluación',
      'Si respondes una evaluación sin lápiz pasta, esa evaluación no será corregida; la normativa no indica qué nota se te asigna en ese caso',
      'Si eres sorprendido durante una evaluación con un dispositivo o apunte no permitido, aunque no lo estés usando, te retiran la evaluación y obtienes nota 1,0',
      'Si tu situación de inasistencia no está contemplada expresamente en la normativa, la Facultad de Matemáticas revisará tu caso',
    ],
  },
  // ── Dinámica: un solo ramo, laboratorio incluido ──────────────────────────
  // El laboratorio (FIS0154, 0 SCT) no es un ramo aparte: es el 30% de la nota
  // de Dinámica. Los dos programas lo dicen — FIS1514 con la fórmula, el del
  // lab con "el laboratorio corresponde a un 30% de la nota final del curso de
  // cátedra". Tenerlos separados obligaba al estudiante a calcular a mano cómo
  // se juntan, que es justo lo que la app existe para no hacer.
  //
  //   NF  = 0,7·NFC + 0,3·NL
  //   NFC = 0,25·I1 + 0,25·I2 + 0,20·NC + 0,30·NE
  //   NL  = 0,10·NClab + 0,70·NI + 0,20·NP
  //
  // Los pesos de acá son esos multiplicados: 0,7·25 = 17,5 para cada
  // interrogación, 0,3·70 = 21 para los informes, etc. Suman 100.
  //
  // El modelo de secciones es plano, sin anidar, y aun así alcanza: los dos
  // promedios que la fórmula necesita (NFC y NL) se recuperan con group_min,
  // que pondera por el peso de cada sección y divide por la suma del grupo.
  'Dinámica':{
    evals:[
      ['Interrogación 1',17.5,{fecha:'2026-09-29'}],
      ['Interrogación 2',17.5,{fecha:'2026-11-13'}],
      ['Controles',14,{slots:3}],
      ['Examen',21,{fecha:'2026-12-01'}],
      // El lab evalúa 5 experimentos presenciales con control, informe y
      // evaluación de pares, más un Lab 0 online con informe y pares: 5
      // controles, 6 informes y 6 evaluaciones de pares.
      ['Laboratorio · Controles',3,{slots:5}],
      ['Laboratorio · Informes',21,{slots:6}],
      ['Laboratorio · Evaluación de pares',6,{slots:6,min:4.0,cap:3.9}],
    ],
    // "Si NL ≥ 4,0 y NFC ≥ 4,0 → NF = 0,7·NFC + 0,3·NL; si no → NF =
    // min(NFC, NL)". Es la misma forma que la regla FEN de dos requisitos: con
    // cap:'self' el tope es el promedio del propio grupo, así que si un lado
    // baja de 4,0 la final cae a ese lado, y si bajan los dos, al menor.
    grupos:[
      {nombre:'Cátedra',evals:['Interrogación 1','Interrogación 2','Controles','Examen'],min:4.0,cap:'self'},
      {nombre:'Laboratorio',evals:['Laboratorio · Controles','Laboratorio · Informes','Laboratorio · Evaluación de pares'],min:4.0,cap:'self'},
    ],
    noCalcula:[
      'Si faltas justificadamente a una interrogación, esa nota se reemplaza por la nota del Examen; si faltas justificadamente a las dos, tu situación se evalúa caso a caso',
      'Si faltas justificadamente a un control, lo recuperas en un control recuperativo que se rinde en el último taller del semestre',
      'Si asistes a 8 o más talleres, sumas 5 décimas al promedio de los Controles; para optar a ellas puedes faltar como máximo a 2 talleres, con o sin justificación',
      'Si no realizas un Control del laboratorio, tu nota máxima en el Informe de ese experimento queda en 4,0',
      'Tu nota de evaluación de pares se calcula promediando la nota que te asignan tus compañeros y tu autoevaluación; si no respondes la autoevaluación, esa parte queda con nota 1',
      'Si faltas sin justificación a un experimento del laboratorio, obtienes nota 1 en el Informe correspondiente',
      'Si justificas a tiempo una inasistencia al laboratorio, puedes optar a rendir un laboratorio recuperativo',
    ],
    reglasDelCurso:[
      'No hay eximición del examen final: evalúa los contenidos de todo el semestre',
      'No se justifican las inasistencias a talleres',
      'Todas las evaluaciones son de desarrollo: lo que no esté escrito de manera ordenada y legible no se corrige',
      'Si respondes una misma pregunta dos o más veces sin indicar cuál es la definitiva, solo se corrige la primera hoja con el desarrollo de esa pregunta',
      'Si tienes una segunda inasistencia al laboratorio, repruebas el laboratorio; el programa no indica qué nota final numérica te queda y señala que los casos especiales los evalúa coordinación',
      'Si después de la revisión de Turnitin tu porcentaje de copia sigue siendo superior a 35%, tu grupo obtiene nota 1 en la experiencia completa',
      'Si obtienes un porcentaje de copia superior a 35% por segunda vez, repruebas el laboratorio',
      'Si no aportas al trabajo de pares y tu grupo informa tu ausencia de participación, puedes quedar sujeto a cambio de grupo o reprobación del curso',
    ],
  },
  'Revelación y Fe':{
    evals:[['Evaluación 1',20,{fecha:'2026-09-07'}],['Evaluación 2',20,{fecha:'2026-10-14'}],['Evaluación 3',30,{fecha:'2026-11-16'}],['Examen final',30]],
    noCalcula:[
      'Si tienes más de 75% de asistencia y una nota de presentación igual o superior a 6,00, te eximes del Examen final; tu nota de presentación se calcula como el promedio simple de Evaluación 1, Evaluación 2 y Evaluación 3, sin usar sus ponderaciones',
      'Si te eximes del Examen final, la nota del Examen final se reemplaza por la nota más alta que obtuviste entre Evaluación 1, Evaluación 2 y Evaluación 3',
      'Si debes dar el Examen final, la nota de esa evaluación es la que obtengas en el examen escrito',
      'Si faltas a una evaluación, solo puedes rendir una recuperativa si presentas un justificativo aprobado por tu unidad académica dentro de las 48 horas posteriores; si no lo presentas dentro de ese plazo, obtienes nota 1,0',
      'Si obtienes décimas en los talleres, se agregan al finalizar el semestre a tu nota más baja',
      'Si presentas voluntariamente uno de los textos del curso cumpliendo las condiciones indicadas, obtienes un 7,0 que se promedia con tu nota más baja entre Evaluación 1, Evaluación 2 y Evaluación 3',
    ],
  },
};
// IMPORTANTE: los prospectos verificados son del plan común de INGENIERÍA.
// "Cálculo I" de Comercial es OTRO curso (otra facultad/programa): no hereda estos pesos.

// ─── CRÉDITOS SCT DE INGENIERÍA UC ───────────────────────────────────────────
// nombre del ramo → [créditos, sigla]
//
// POR QUÉ EXISTE ESTA TABLA APARTE. Los créditos son el dato más estable del
// currículum: un ramo cambia de ponderaciones todos los semestres y de SCT casi
// nunca. Atarlos a los presets sería desperdiciarlos — hay 10 presets UC y 146
// ramos acá. Un estudiante que carga su malla obtiene su PPA ponderado sin que
// exista una sola pauta oficial de sus ramos.
//
// DE DÓNDE SALEN. Del catálogo oficial C2022 vía la API de mallas.ing.uc.cl, la
// herramienta de la propia Escuela. Se recorrieron los 34 majors generando su
// plan completo y se pidió el detalle de cada sigla. Ninguno se escribió a mano.
//
// La sigla va al lado del crédito y no se usa para calcular: sirve para
// verificar el dato contra catalogo.uc.cl sin tener que adivinar de qué ramo se
// está hablando cuando dos se llaman parecido.
//
// LOS DE 0 CRÉDITOS SON REALES, no un dato faltante. Los tres laboratorios de
// Física y Práctica I valen 0 SCT en el plan y aun así llevan nota. Hoy
// `gpaMode` exige créditos > 0 en TODOS los ramos con nota, así que uno de estos
// tumba la ponderación de todo el semestre. Está pendiente decidir cómo tratarlos
// —Lucas está consiguiendo el programa del laboratorio— y por eso acá se
// registran tal cual: el dato oficial es 0 y falsearlo para que el promedio
// funcione sería exactamente lo que este proyecto no hace.
const CREDITOS_UC={
  'Introducción a la Arquitectura':[10,'AQH0000'],
  'Taller de Formación y Representación I':[20,'AQT0000'],
  'Ciudad y Paisaje I: Introducción a la Forma Urbana y Territorial':[10,'AQU0000'],
  'Fisiología':[10,'BIO135C'],
  'Biología de Microorganismos':[10,'BIO151E'],
  'Bases Fisicas de los Procesos Biologicos':[10,'BIO152C'],
  'Bioquímica y Genética Molecular':[10,'BIO228C'],
  'Probabilidades y Estadística':[10,'EYP1113'],
  'Inferencia Estadística':[10,'EYP2114'],
  'Metodos Bayesianos':[10,'EYP280I'],
  'Filosofía: ¿Para Qué?':[10,'FIL2001'],
  'Laboratorio de Termodinámica':[0,'FIS0152'],
  'Laboratorio de Electricidad y Magnetismo':[0,'FIS0153'],
  'Laboratorio de Dinámica':[0,'FIS0154'],
  'Dinámica':[10,'FIS1514'],
  'Termodinámica':[10,'FIS1523'],
  'Electricidad y Magnetismo':[10,'FIS1533'],
  'Diseño en Ingeniería Biomédica I (Capstone)':[10,'IBM2122'],
  'Diseño en Ingeniería Biomédica II (Capstone)':[10,'IBM2123'],
  'Diseño en Ingeniería Biológica (Capstone)':[10,'IBM2222'],
  'Materiales de Ingeniería Civil':[10,'ICC2105'],
  'Planificación y Control de Proyectos':[10,'ICC2204'],
  'Ingeniería de Construcción':[10,'ICC2304'],
  'Instalaciones en Edificios':[10,'ICC2312'],
  'Topografía y Geoinformación Aplicada':[10,'ICC2414'],
  'Construcción de Obras Civiles':[10,'ICC2424'],
  'Ingeniería Vial':[10,'ICC2514'],
  'Taller de Mejoramiento en Ingeniería de Construcción':[10,'ICC2904'],
  'Tecnologias de Informacion en Construccion':[10,'ICC2913'],
  'Estática':[10,'ICE2006'],
  'Estratigrafía y Procesos Sedimentarios y Volcánicos':[10,'ICE2022'],
  'Geología y Geodinámica Andina':[10,'ICE2024'],
  'Geoquímica y Petrogénesis':[10,'ICE2025'],
  'Geología de Campo I (Capstone)':[5,'ICE2026'],
  'Geologia de Campo II (Capstone)':[5,'ICE2027'],
  'Mineralogía y Petrología':[10,'ICE2028'],
  'Procesos Superficiales y Peligros Geológicos':[10,'ICE2029'],
  'Análisis Estructural I':[10,'ICE2114'],
  'Mecánica de Sólidos':[10,'ICE2313'],
  'Diseño Estructural':[10,'ICE2403'],
  'Hormigón Armado':[10,'ICE2413'],
  'Estructuras de Acero':[10,'ICE2533'],
  'Fundamentos de Geotecnia':[10,'ICE2604'],
  'Mecánica de Suelos':[10,'ICE2614'],
  'Introducción a la Geología Física':[10,'ICE2623'],
  'Geofisica General':[10,'ICE2630'],
  'Geología Estructural y Tectónica':[10,'ICE2633'],
  'Recursos y Exploración Geológica':[10,'ICE2640'],
  'Métodos Geofísicos para Ingeniería':[10,'ICE2643'],
  'Ingeniería Antisísmica':[10,'ICE2703'],
  'Proyecto de Diseño Estructural y Geotécnico':[10,'ICE2880'],
  'Mecánica de Fluidos':[10,'ICH1104'],
  'Evaluación Ambiental de Proyectos (Capstone)':[10,'ICH2103'],
  'Ingeniería Hidráulica':[10,'ICH2114'],
  'Análisis y Diseño Hidráulico':[10,'ICH2124'],
  'Hidrología':[10,'ICH2204'],
  'Ingeniería Ambiental':[10,'ICH2304'],
  'Calidad del Agua':[10,'ICH2314'],
  'Taller de Obras Hidráulicas':[10,'ICH2574'],
  'Principios de Tratamiento de Agua':[10,'ICH2604'],
  'Diseño Mecánico':[10,'ICM2022'],
  'Proyecto de Diseño Mecánico (Capstone)':[10,'ICM2026'],
  'Conversión de Energía':[10,'ICM2213'],
  'Transferencia de Calor':[10,'ICM2223'],
  'Ciencia de los Materiales':[10,'ICM2403'],
  'Procesos de Manufactura':[10,'ICM2503'],
  'Dinámica de Sistemas Mecánicos':[10,'ICM2803'],
  'Control de Sistemas Mecánicos':[10,'ICM2813'],
  'Optimización':[10,'ICS1113'],
  'Optimización-Honors':[10,'ICS113H'],
  'Introducción a la Economía':[10,'ICS1513'],
  'Métodos de Optimización':[10,'ICS2121'],
  'Taller de Investigación Operativa (Capstone)':[10,'ICS2122'],
  'Modelos Estocásticos':[10,'ICS2123'],
  'Microeconomía':[10,'ICS2523'],
  'Contabilidad y Control de Gestión':[10,'ICS2613'],
  'Organización y Comportamiento en la Empresa':[10,'ICS2813'],
  'Taller de Ingeniería de Transporte (Capstone)':[10,'ICT2154'],
  'Modelos de Demanda de Transporte':[10,'ICT2213'],
  'Modelos de Tráfico':[10,'ICT2223'],
  'Flujo en Redes':[10,'ICT2233'],
  'Ingeniería de Sistemas de Transporte':[10,'ICT2904'],
  'Señales y Sistemas':[10,'IEE2103'],
  'Teoría Electromagnética':[10,'IEE2113'],
  'Circuitos Eléctricos':[10,'IEE2123'],
  'Laboratorio de Mediciones Eléctricas':[5,'IEE2183'],
  'Máquinas Eléctricas':[10,'IEE2213'],
  'Electrónica':[10,'IEE2413'],
  'Laboratorio de Electrónica Analógica y Digital':[5,'IEE2473'],
  'Comunicaciones':[10,'IEE2513'],
  'Control Automático':[10,'IEE2613'],
  'Sistemas Digitales':[10,'IEE2713'],
  'Diseño Eléctrico (Capstone)':[10,'IEE2913'],
  'Introducción a la Programación':[10,'IIC1103'],
  'Matemáticas Discretas':[10,'IIC1253'],
  'Diseño Detallado de Software':[10,'IIC2113'],
  'Estructuras de Datos y Algoritmos':[10,'IIC2133'],
  'Ingeniería de Software':[10,'IIC2143'],
  'Proyecto de Especialidad':[10,'IIC2154'],
  'Arquitectura de Sistemas de Software':[10,'IIC2173'],
  'Programación Avanzada':[10,'IIC2233'],
  'Sistemas Operativos y Redes':[10,'IIC2333'],
  'Arquitectura de Computadores':[10,'IIC2343'],
  'Bases de Datos':[10,'IIC2413'],
  'Tecnologías y Aplicaciones Web':[10,'IIC2513'],
  'Inteligencia Artificial':[10,'IIC2613'],
  'Sistemas de Información':[10,'IIC2713'],
  'Modelos de Procesos':[10,'IIC2733'],
  'Conocimiento, Cultura y Tecnología':[10,'IIC2764'],
  'Fenómenos de Transporte':[10,'IIQ2003'],
  'Operaciones Unitarias I':[10,'IIQ2013'],
  'Operaciones Unitarias II':[10,'IIQ2023'],
  'Fisicoquímica':[10,'IIQ2043'],
  'Diseño de Reactores':[10,'IIQ2113'],
  'Procesos Químicos':[10,'IIQ2133'],
  'Diseño de Procesos Químicos (Capstone)':[10,'IIQ2243'],
  'Dinámica y Control de Procesos':[10,'IIQ2313'],
  'Residuos Sólidos y Peligrosos':[10,'IIQ2363'],
  'Bioseparaciones':[10,'IIQ2673'],
  'Minería a Cielo Abierto':[10,'IMM2013'],
  'Procesos Mineralúrgicos':[10,'IMM2023'],
  'Geoestadística':[10,'IMM2033'],
  'Minería Subterránea':[10,'IMM2043'],
  'Procesos Metalúrgicos':[10,'IMM2053'],
  'Minería Sustentable':[10,'IMM2073'],
  'Mecánica de Rocas para Minería':[10,'IMM2083'],
  'Taller de Planificación Minera (Capstone)':[10,'IMM2583'],
  'Álgebra Lineal Numérica':[10,'IMT2111'],
  'Taller de Matemáticas Aplicadas (Capstone)':[10,'IMT2116'],
  'Práctica I':[0,'ING1001'],
  'Desafíos de la Ingeniería':[10,'ING1004'],
  'Investigación, Innovación y Emprendimiento':[10,'ING2030'],
  'Diseño Colaborativo en Aic (Arquitectura, Ingeniería y Construcción) (Capstone)':[10,'ING2983'],
  'Fundamentos de Robótica':[10,'IRB2001'],
  'Diseño de Sistemas Robóticos (Capstone)':[10,'IRB2002'],
  'Álgebra Lineal':[10,'MAT1203'],
  'Cálculo I':[10,'MAT1610'],
  'Cálculo II':[10,'MAT1620'],
  'Cálculo III':[10,'MAT1630'],
  'Ecuaciones Diferenciales':[10,'MAT1640'],
  'Análisis Real':[10,'MAT251I'],
  'Teoría de Integración':[10,'MAT253I'],
  'Cálculo Científico I':[10,'MAT2605'],
  'Química para Ingeniería':[10,'QIM100E'],
  'Bioquímica':[10,'QIM117B'],
  'Química Orgánica Fundamental':[10,'QIM200'],
};

// Siglas de TODOS los ramos UC que hoy se pueden cargar desde una malla.
//
// La sigla es la identidad académica de un ramo: los nombres pueden repetirse
// entre facultades ("Probabilidad y Estadística" es EYP1113 en Ingeniería y
// EAA1510 en Comercial), pero las siglas no. Por eso el consenso de cambios de
// pauta usa esta tabla y no junta por accidente dos ramos que solo se llaman
// parecido.
//
// Ingeniería · Plan Común: catálogo C2022 de la Escuela de Ingeniería.
// Comercial: Resolución VRA N°262/2024, Anexo III, plan vigente 2025
// (registrosacademicos.uc.cl/m_050014_2025.pdf). No son ponderaciones ni
// créditos nuevos: solo el identificador oficial del curso.
const SIGLAS_UC={
  'ING-PC':{
    'Cálculo I':'MAT1610', 'Álgebra Lineal':'MAT1203', 'Química para Ingeniería':'QIM100E',
    'Desafíos de la Ingeniería':'ING1004', 'Filosofía: ¿Para Qué?':'FIL2001',
    'Cálculo II':'MAT1620', 'Dinámica':'FIS1514', 'Laboratorio de Dinámica':'FIS0154',
    'Introducción a la Programación':'IIC1103', 'Cálculo III':'MAT1630',
    'Ecuaciones Diferenciales':'MAT1640', 'Termodinámica':'FIS1523',
    'Laboratorio de Termodinámica':'FIS0152', 'Introducción a la Economía':'ICS1513',
    'Práctica I':'ING1001', 'Probabilidades y Estadística':'EYP1113',
    'Electricidad y Magnetismo':'FIS1533', 'Laboratorio de Electricidad y Magnetismo':'FIS0153',
  },
  'COM':{
    'Cálculo I':'MAT1610', 'Introducción a la Microeconomía':'EAE1110',
    'Contabilidad':'EAA1210', 'Comportamiento Organizacional':'EAA1110',
    'Probabilidad y Estadística':'EAA1510', 'Introducción al Álgebra Lineal':'MAT1279',
    'Cálculo II':'MAT1620', 'Introducción a la Macroeconomía':'EAE1210',
    'Filosofía: ¿Para Qué?':'FIL2001', 'Inferencia Estadística':'EAA1520',
    'Aplicaciones Matemáticas para Economía y Negocios':'EAF2010',
    'Análisis Económico: La Experiencia Chilena':'EAE1220', 'Fundamentos de Finanzas':'EAA1220',
    'Econometría':'EAE2510', 'Microeconomía I':'EAE2110',
    'Estrategia de la Organización':'EAA2410', 'Fundamentos de Marketing':'EAA2310',
    'Introducción a la Programación':'IIC1103', 'Microeconomía II':'EAE2120',
    'Macroeconomía I':'EAE2210', 'Teoría Financiera':'EAA2210',
    'Estrategia Competitiva':'EAA2420', 'Competencia y Mercado':'EAE2130',
    'Contabilidad de Costos':'EAA2220', 'Ética, Economía y Empresa':'ETI209',
    'Marketing Analytics':'EAA2320', 'Empresas y Legislación':'EAA2240',
    'Macroeconomía II':'EAE2220', 'Contabilidad Gerencial':'EAA2230',
    'Dirección de Personas':'EAA2110', 'Práctica Social':'EAF2500',
  },
};

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
  // Programa oficial ENCOM1005, Primavera 2026. El programa se titula
  // "Comunicación I"; la clave es 'Comunicación' porque así se llama en la malla.
  'Comunicación':{
    creditos:2,
    // El programa dice que sin 4,0 en lo individual las notas grupales "no son
    // válidas" Y que el estudiante reprueba, pero nunca dice con qué nota queda.
    // No es la regla "la final es la más baja entre los dos requisitos": esa sí
    // se modela; esta cambia QUÉ evaluaciones entran en el promedio, y el motor
    // no sabe expresarlo. Se declara en vez de forzarla.
    noCalcula:['Si tu promedio en las evaluaciones individuales queda bajo 4,0, las notas grupales dejan de contar y repruebas el curso. El programa no dice con qué nota, así que este promedio no lo refleja'],
    reglasDelCurso:[
      'Necesitas al menos 6 de las 11 actividades hechas en clases para aprobar',
      'Las notas grupales se ajustan según cómo te evalúan tus compañeros, y pueden moverse hasta un 100%',
      'Faltar sin justificar al pitch inicial, a las clases de expertos, a la solemne o al examen se evalúa con 1,0',
      'Cada profesor puede agregar evaluaciones propias de su sección que dan décimas adicionales',
    ],
    // El examen final son dos productos con peso propio sobre la nota final
    // —presentación grupal 20% y video storytelling individual 10%—, no dos
    // partes de un bloque de 30%. Van en filas propias.
    evals:[
      ['Pitch inicial individual',15],
      ['Columna de opinión',15],
      ['Solemne: elevator pitch',20],
      // El único requisito que el programa sí cuantifica: bajo 4,0 acá la final
      // es "el mínimo entre su promedio final ponderado y 3,8". El tope es 3,8
      // explícito en el programa, no el 3,9 que usamos cuando no lo dicen.
      ['Participación y trabajo en clases',20,{min:4.0,cap:3.8}],
      ['Examen: presentación grupal',20],
      ['Examen: video storytelling',10],
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
      // Los controles de lectura y los de ejercicios tienen fecha propia cada uno
      // y evalúan lecturas distintas, así que van en filas separadas. Los tres de
      // lectura: 7 de agosto, 28 de agosto y 6 de noviembre. Los cuatro de
      // ejercicios: 21 de agosto, 11 de septiembre, 16 de octubre y 30 de octubre.
      //
      // El 10% de los de lectura no se divide exacto en tres. El tercero lleva
      // 3,34 en vez de 3,33 para que la suma dé 100 justo: es un centésimo de
      // punto porcentual, invisible en cualquier nota, y la alternativa era
      // dejarlos agrupados y perder las tres fechas.
      ['Control de Lectura 1',3.33,{min:1.5,cap:3.9}],
      ['Control de Lectura 2',3.33,{min:1.5,cap:3.9}],
      ['Control de Lectura 3',3.34,{min:1.5,cap:3.9}],
      ['Control de Ejercicios 1',10,{min:1.5,cap:3.9}],
      ['Control de Ejercicios 2',10,{min:1.5,cap:3.9}],
      ['Control de Ejercicios 3',10,{min:1.5,cap:3.9}],
      ['Control de Ejercicios 4',10,{min:1.5,cap:3.9}],
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
  // Los controles de lectura van sin `slots`, y NO es que falte confirmar el
  // número: cambia de una sección a otra. Es lo único que varía entre secciones
  // — el resto de la pauta es igual para todas. Aunque aparezca el cronograma
  // completo de una sección, ese número no sirve para las demás, así que esta
  // fila se queda sin `slots` para siempre y el estudiante agrega los que le
  // tomaron. `dropLowest` funciona igual con los que agregue.
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
