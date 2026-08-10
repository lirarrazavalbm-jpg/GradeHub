// GradeHub · datos
//
// Catálogo (mallas, carreras, presets), temas y portales. Solo literales: acá no
// hay DOM, no hay estado y no se llama a nada. Las funciones que leen estos datos
// (themeFor, mallaFor, presetRamo…) viven en app.js.
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
  [/metodos matematicos|calculo|algebra/,        '#a3e635'], // lima — matemáticas
  [/contabilidad|costos|contable|tributa|impuesto/, '#22c55e'], // verde — contable
  [/auditoria|control interno|riesgos/,          '#ea580c'], // naranjo — auditoría
  [/ingles|idioma/,                              '#ec4899'], // rosa — idiomas
  [/comunicacion/,                               '#ea580c'], // naranjo — comunicación
  [/microeconomia|macroeconomia|economia|econom/,'#a855f7'], // violeta — economía
  [/gestion de personas|personas|organizacional/,'#3b82f6'], // azul — personas
  [/finanzas|inversion|financier|presupuesto/,   '#06b6d4'], // cian — finanzas
  [/control de gestion|estrategia|gestion y empresas|gestion de procesos/, '#3b82f6'], // azul — gestión
  [/marketing|negocios|comercial/,               '#d946ef'], // fucsia — negocios
  [/programacion|machine learning|datos|sistemas|tecnologia|informatica|transformacion digital|ingenieria/, '#6366f1'], // índigo — tecnología
  [/derecho|legal|legisla|etica|filosof|pensamiento|historia/, '#ea580c'], // naranjo — humanidades y derecho
  [/quimica|fisica|biolog/,                      '#06b6d4'], // cian — ciencias
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

// ─── SISTEMA DE TEMAS ────────────────────────────────────────────────────────
// Un tema = solo una familia de acento. Toda la base neutra (fondo, superficies,
// cards, bordes, tipografía, espaciados, componentes) es COMPARTIDA: esa es la
// identidad de GradeHub y no cambia nunca. Los temas no son la paleta oficial de
// ninguna universidad — son una reinterpretación cromática para modo oscuro.
//
// Agregar una universidad = agregar una entrada acá. Nada más.
//
// Tokens:
//   primary       acento principal (botones, links, activos, foco, progreso)
//   primaryFg     texto sobre el acento (contraste AA)
//   primaryLight  tinte muy suave del acento (fondos de chips/íconos)
//   accent        segundo tono para gradientes del acento
//   success/warning/danger  — ver nota abajo
const THEME_BASE={
  // Semáforo de notas. Se deja IGUAL en todos los temas a propósito: verde/ámbar/
  // rojo son semánticos (aprobado / al borde / reprobado), no decorativos. Teñirlos
  // por universidad haría ilegible lo único que la app tiene que comunicar sin error.
  success:'#2ee6c8', warning:'#ffc94d', danger:'#ff5f7a',
};

// Cada tema define, además del acento:
//   secondary  → color con rol funcional propio (pesos, %, chips analíticos)
//   dark{}     → matiz de las superficies. SOLO se aplica en modo oscuro; en claro
//                se deja la base para no romper el contraste.
// Las superficies son lo que hace que un tema se sienta distinto y no solo
// "el mismo tema pintado de otro color".
const THEMES={
  // FEN — business school. Azul dominante, dorado como color analítico constante.
  // Superficies frías neutras, tipo terminal financiero.
  fen:{
    primary:'#3b82f6', primaryFg:'#04101f', primaryLight:'#0e1e33',
    accent:'#f5c451', secondary:'#f5c451',
    dark:{bg:'#05070a',bg2:'#0a0d13',card:'#111620',border:'#1d2534',border2:'#2c3648',muted:'#161d29'},
  },
  // UC — académico. Azul limpio, desaturado; superficies con matiz frío marcado.
  uc:{
    primary:'#3f7fd4', primaryFg:'#040d1c', primaryLight:'#0d1c30',
    accent:'#8fc7f5', secondary:'#8fc7f5',
    dark:{bg:'#04060c',bg2:'#090d16',card:'#101725',border:'#1c273c',border2:'#2b3a57',muted:'#151e30'},
  },
  // UAI — premium/minimal. Casi monocromo: grises puros, bordes casi invisibles,
  // las cards se despegan por elevación y no por color.
  uai:{
    primary:'#5aa3b0', primaryFg:'#03110f', primaryLight:'#0d1e21',
    accent:'#9fc4cb', secondary:'#8a9aa5',
    dark:{bg:'#050506',bg2:'#0a0a0c',card:'#131316',border:'#1b1b1f',border2:'#292930',muted:'#161619'},
  },
  // UANDES — lujo silencioso. Burdeo como acento, grises con matiz cálido.
  // El burdeo profundo puro (~#7A1E32) da 1.98:1 sobre este fondo: invisible.
  // Se sube la luminosidad conservando el matiz vinoso.
  uandes:{
    // Único tema con texto blanco sobre el acento: el burdeo es un tono oscuro,
    // el texto oscuro encima solo llega a 4.11:1. En blanco da 4.76:1.
    primary:'#c04a63', primaryFg:'#ffffff', primaryLight:'#261015',
    accent:'#e08ea0', secondary:'#b9959c',
    dark:{bg:'#070506',bg2:'#0d0a0b',card:'#161113',border:'#241c1f',border2:'#35292d',muted:'#1a1416'},
  },
};
const SURFACE_KEYS=['bg','bg2','card','border','border2','muted'];
// Tema por defecto si el tenant no tiene uno definido
const THEME_FALLBACK=THEMES.fen;

// Carreras y mallas por universidad. Presets verificados solo en ING-PC (1er sem).
const CARRERAS_UC={'ING-PC':'Ingeniería · Plan Común','COM':'Ingeniería Comercial','OTRA':'Otra carrera'};
const MALLA_UC={
  'ING-PC':{1:['Cálculo I','Álgebra Lineal','Química para Ingeniería','Desafíos de la Ingeniería','Filosofía: ¿para qué?']},
  // Malla oficial Ing. Comercial UC (economiayadministracion.uc.cl). Sin ponderaciones aún: el usuario define sus secciones.
  'COM':{1:['Cálculo I','Introducción a la Microeconomía','Contabilidad','Empresas y Legislación','Filosófico (FG)']},
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
    evals:[['Solemnes',60,{slots:3}],['Examen Final',40,{min:3.0,cap:3.9}]],
  },
  'Introducción a la Microeconomía':{
    creditos:6,
    noCalcula:['Examen Recuperativo: con promedio entre 3,6 y 3,9 puedes aprobar con 4,0'],
    // El programa dice que el porcentaje "pasa a otra evaluación" pero no dice a
    // cuál. Sin eso no hay nada que calcular, y elegirla nosotros sería inventar.
    reglasDelCurso:['Con inasistencias justificadas, el porcentaje de esa evaluación pasa a otra que el curso define'],
    evals:[['Solemne',30],['Examen',35],['Controles parciales',30,{slots:3}],['Pruebas sorpresa',5,{slots:5}]],
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
};
