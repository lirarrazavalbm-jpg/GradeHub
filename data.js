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
// Gestión de Personas y Marketing van en 2º Y 3º a propósito: se cursa uno en
// cada semestre, pero el orden lo elige el estudiante. Aparecen en los dos para
// que ninguno tenga que buscar a mano el que le tocó; en el selector se desmarca
// el que no va.
const _COMUN={
  1:['Introducción a la Economía','Gestión y Empresas','Comunicación','Programación para Analítica de Datos','Métodos Matemáticos I'],
  2:['Introducción a la Microeconomía','Gestión de Personas','Marketing','Contabilidad','Tecnología y Sistemas de Información','Métodos Matemáticos II','Inglés I'],
  3:['Introducción a la Macroeconomía','Gestión de Personas','Marketing','Introducción al Pensamiento Económico y Político','Estadística I','Métodos Matemáticos III','Inglés II'],
  4:['Economía Aplicada','Finanzas','Razonamiento Basado en Datos','Estadística II','Métodos Matemáticos IV','Inglés III'],
};
// Dos nombres, un ramo. Pasa cuando una carrera cursa dos de una serie y otra
// cursa solo el primero: IC tiene 'Métodos Cuantitativos I' y 'II', mientras
// IICG y CA cursan uno solo y lo dejan sin número. Es el mismo MEC3005.
//
// Acá NO se deduce nada por regla. La regla de "quítale el romano" está en
// claveCatalogo() y se niega justamente en estos casos, porque 'Gestión de
// Personas I' sí es otro ramo que 'Gestión de Personas'. Esta tabla es para los
// pares confirmados contra el código oficial del ramo, uno por uno.
//
// La clave es el nombre alternativo; el valor, el nombre canónico —el que lleva
// el código en CREDITOS_FEN—. Las mallas no se tocan: cada carrera sigue
// nombrando el ramo como lo nombra su programa.
const SINONIMOS={
  fen:{'Métodos Cuantitativos':'Métodos Cuantitativos I'},
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
  // `name` ya está persistido en profiles.universidad. Se conserva para no
  // partir los conteos existentes; `sub` aclara que la opción no es solo para
  // Ingeniería mientras se diseña una migración al código estable `uc`.
  uc :{name:'U. Católica · Ingeniería', short:'UC', mono:'UC', sub:'Ingeniería, Comercial y más carreras'},
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
// Semáforo de notas. Vive fuera de ACENTOS y FONDOS porque verde/ámbar/rojo son
// semánticos (aprobado / al borde / reprobado), no decorativos. Cada modo tiene
// sus propios valores: los colores luminosos del modo oscuro no alcanzan
// contraste sobre las superficies claras.
// El ámbar de claro se oscureció de #a16207 a #96590a el 2026-08-26. No es
// estética: con el valor anterior quedaba en 4,56 sobre el fondo de Neutro y
// 4,57 sobre el de Papel, o sea todo el modo claro pasaba el 4,5:1 por dos
// centésimas. Cualquier fondo un punto más oscuro lo tumbaba — que es
// exactamente lo que pasó al intentar diferenciar Pizarra. Ahora hay margen en
// los tres fondos. El significado no cambia: sigue siendo el ámbar de "al
// borde", y sigue sin teñirse por tema.
const SEMAFORO={
  claro:{
    green:'#0f766e',greenBg:'#e6f7f5',greenBorder:'#a7ebe1',
    yellow:'#96590a',yellowBg:'#fdf9e7',
    red:'#c02b3f',redBg:'#fdecef',
  },
  oscuro:{
    green:'#2ecc40',greenBg:'#08210d',greenBorder:'#155224',
    yellow:'#ffc94d',yellowBg:'#231a06',
    red:'#ff5f7a',redBg:'#280d15',
  },
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
};
// Acentos elegibles. Cambiar el acento no convierte cada opción en un tema
// distinto ni toca fondos o semáforo.
const ACENTOS={
  turquesa:{nombre:'Turquesa',...GRADEHUB_THEME},
  azul:{
    nombre:'Azul',
    primary:'#1e40af',primaryFg:'#ffffff',primaryLight:'#e8efff',
    darkPrimary:'#bfdbfe',darkPrimaryFg:'#071a33',darkPrimaryLight:'#102640',
    accent:'#93c5fd',secondary:'#1e40af',darkSecondary:'#bfdbfe',
  },
  indigo:{
    nombre:'Índigo',
    primary:'#3730a3',primaryFg:'#ffffff',primaryLight:'#ecebff',
    darkPrimary:'#c7d2fe',darkPrimaryFg:'#14143d',darkPrimaryLight:'#202044',
    accent:'#a5b4fc',secondary:'#3730a3',darkSecondary:'#c7d2fe',
  },
  violeta:{
    nombre:'Violeta',
    primary:'#5b21b6',primaryFg:'#ffffff',primaryLight:'#f1e9ff',
    darkPrimary:'#ddd6fe',darkPrimaryFg:'#24113f',darkPrimaryLight:'#291b3d',
    accent:'#d8b4fe',secondary:'#5b21b6',darkSecondary:'#ddd6fe',
  },
  // Los cálidos son terrosos a propósito. Un naranjo luminoso se confundiría
  // con el ámbar del semáforo y un coral con el rojo de reprobación.
  cobre:{
    nombre:'Cobre',
    primary:'#8a3412',primaryFg:'#ffffff',primaryLight:'#fff0e7',
    darkPrimary:'#fbb08f',darkPrimaryFg:'#2b1008',darkPrimaryLight:'#35170f',
    accent:'#ffc0a0',secondary:'#8a3412',darkSecondary:'#fbb08f',
  },
  frambuesa:{
    nombre:'Frambuesa',
    primary:'#8b1e4a',primaryFg:'#ffffff',primaryLight:'#fcebf2',
    darkPrimary:'#f0bfd1',darkPrimaryFg:'#2b0a17',darkPrimaryLight:'#35101f',
    accent:'#eab5d1',secondary:'#8b1e4a',darkSecondary:'#f0bfd1',
  },
};

// Fondos y acentos son dos decisiones independientes. Cada fondo declara sus
// superficies y texto en ambos modos: elegir Papel en claro no puede arrastrar
// los textos de Pizarra oscuro, ni viceversa. Neutro conserva exactamente la
// apariencia histórica para las cuentas que todavía no eligieron uno.
const FONDOS={
  neutro:{
    nombre:'Neutro',
    claro:{
      bg:'#f2f7f8',bg2:'#ffffff',card:'#ffffff',border:'#deebee',border2:'#bccdd2',muted:'#eaf2f4',
      fg:'#07171b',fg2:'#40565b',fg3:'#5f7479',
    },
    oscuro:{
      // bg conserva el fondo de og.png y la apariencia histórica por defecto.
      bg:'#05070a',bg2:'#0a0f13',card:'#111820',border:'#20303a',border2:'#324755',muted:'#151d26',
      fg:'#eef4f6',fg2:'#99aab2',fg3:'#71858f',
    },
  },
  pizarra:{
    nombre:'Pizarra',
    // En claro esto era casi Neutro: el fondo estaba a 1,3 de distancia y la
    // tarjeta era el mismo #ffffff exacto. Elegir Pizarra y que no cambie nada
    // es peor que no ofrecerlo, y lo reportó una estudiante el 2026-08-25.
    // Ahora la tarjeta deja de ser blanco puro —que es lo que la hacía
    // indistinguible— y el conjunto se enfría hacia el gris azulado que ya
    // tiene en oscuro. La referencia de cuánta diferencia hace falta es Papel,
    // que en claro sí se distingue.
    claro:{
      bg:'#e6edf5',bg2:'#f2f6fb',card:'#f7fafd',border:'#ccd9e7',border2:'#a3b5c8',muted:'#dde6f1',
      fg:'#0b1722',fg2:'#3c5063',fg3:'#56697a',
    },
    oscuro:{
      bg:'#0e141b',bg2:'#141c25',card:'#1b2632',border:'#2b3b4c',border2:'#3b5166',muted:'#202c38',
      fg:'#edf4f8',fg2:'#aab8c4',fg3:'#8293a2',
    },
  },
  papel:{
    nombre:'Papel',
    claro:{
      bg:'#faf6ef',bg2:'#fffdf8',card:'#fffaf1',border:'#eadfce',border2:'#d5c3ad',muted:'#f3eadf',
      fg:'#211a12',fg2:'#594b3d',fg3:'#756554',
    },
    oscuro:{
      bg:'#1b1510',bg2:'#251d15',card:'#30261d',border:'#44372a',border2:'#5c4c3c',muted:'#352a20',
      fg:'#f8f0e4',fg2:'#c6b8a7',fg3:'#9e8f7c',
    },
  },
};
const SURFACE_KEYS=['bg','bg2','card','border','border2','muted','fg','fg2','fg3'];

// Carreras y mallas por universidad. Presets verificados solo en ING-PC (1er sem).
// ─── CARRERAS QUE SE PUEDEN DECLARAR ─────────────────────────────────────────
// Distinto de CARRERAS y CARRERAS_UC, que son las que tienen MALLA verificada y
// por eso se pueden cargar solas. Acá va la oferta completa de pregrado, para
// que cualquier estudiante pueda decir qué estudia aunque no tengamos su malla.
//
// POR QUÉ IMPORTA QUE ESTÉN TODAS. Sin esto, alguien de Derecho UC no tenía
// cómo declararse: elegía una carrera que no era la suya o se quedaba fuera. Y
// nosotros no teníamos manera de saber que hay cuarenta esperando esa malla,
// que es justo el dato que decide cuál construir después.
//
// `malla` aparece SOLO en las que ya tienen una cargada, y su valor es el
// código que usan MALLA / MALLA_UC. Las demás no llevan código: se declaran y
// el estudiante arma sus ramos a mano.
//
// DE DÓNDE SALEN. UC: admision.uc.cl/carreras (71 programas de pregrado).
// FEN: fen.uchile.cl/es/pregrado (3). Ninguna se escribió de memoria — un
// nombre inventado acá no falla, se queda en la base y después manda a
// construir la malla equivocada.
const CARRERAS_DECLARABLES={
  fen:[
    {n:'Ingeniería Comercial',malla:'IC'},
    {n:'Ingeniería en Información y Control de Gestión',malla:'IICG'},
    {n:'Contador Auditor'},
  ],
  uc:[
    {n:'Ingeniería',malla:'ING-PC'},
    {n:'Actuación'},
    {n:'Administración Pública'},
    {n:'Agronomía'},
    {n:'Antropología'},
    {n:'Arqueología'},
    {n:'Arquitectura'},
    {n:'Arte'},
    {n:'Astronomía'},
    {n:'Bachillerato Inicia en Ciencias Naturales y Matemática'},
    {n:'Bachillerato Inicia en Ciencias Naturales y Matemática - Campus Villarrica'},
    {n:'Bachillerato Inicia en Ciencias Sociales'},
    {n:'Bachillerato Inicia en Ciencias Sociales - Campus Villarrica'},
    {n:'Biología'},
    {n:'Biología Marina'},
    {n:'Bioquímica'},
    {n:'Ciencia Política'},
    {n:'College Artes y Humanidades'},
    {n:'College Ciencias Naturales y Matemáticas'},
    {n:'College Ciencias Sociales'},
    {n:'Construcción Civil'},
    {n:'Derecho'},
    {n:'Dirección Audiovisual'},
    {n:'Diseño'},
    {n:'Enfermería'},
    {n:'Estadística'},
    {n:'Estética'},
    {n:'Filosofía'},
    {n:'Física'},
    {n:'Fonoaudiología'},
    {n:'Geografía'},
    {n:'Historia'},
    {n:'Ingeniería Comercial',malla:'COM'},
    {n:'Ingeniería en Recursos Naturales'},
    {n:'Ingeniería Forestal'},
    {n:'Interpretación Musical'},
    {n:'Kinesiología'},
    {n:'Letras Hispánicas'},
    {n:'Letras Inglesas'},
    {n:'Licenciatura en Ingeniería en Ciencia de Datos'},
    {n:'Licenciatura en Ingeniería en Ciencia de la Computación'},
    {n:'Matemática'},
    {n:'Medicina'},
    {n:'Medicina Veterinaria'},
    {n:'Música'},
    {n:'Nutrición y Dietética'},
    {n:'Odontología'},
    {n:'Pedagogía en Educación Especial'},
    {n:'Pedagogía en Educación Física y Salud para Educación Básica y Media'},
    {n:'Pedagogía en Educación General Básica - Santiago'},
    {n:'Pedagogía en Educación Media'},
    {n:'Pedagogía en Educación Media en Ciencias Naturales y Biología'},
    {n:'Pedagogía en Educación Media en Física'},
    {n:'Pedagogía en Educación Media en Matemática'},
    {n:'Pedagogía en Educación Media en Química'},
    {n:'Pedagogía en Educación Parvularia - Santiago'},
    {n:'Pedagogía en Educación Parvularia - Villarrica'},
    {n:'Pedagogía en Inglés para Educación Básica y Media'},
    {n:'Pedagogía en Religión Católica'},
    {n:'Pedagogía General Básica - Campus Villarrica'},
    {n:'Periodismo'},
    {n:'Planificación Urbana'},
    {n:'Programa de Pedagogía para Profesionales'},
    {n:'Psicología'},
    {n:'Publicidad'},
    {n:'Química'},
    {n:'Química y Farmacia'},
    {n:'Sociología'},
    {n:'Teología'},
    {n:'Terapia Ocupacional'},
    {n:'Trabajo Social'},
  ],
};

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

// ─── PRESETS UC (ponderaciones oficiales 2026-2) → auto-carga de secciones ───
// El formato antiguo puede ser directamente `evals`; los programas con fechas,
// compuertas o reglas usan {evals, grupos, noCalcula, reglasDelCurso}. Un 3er
// elemento {min,cap} marca un PISO de aprobación en esa sección (regla
// min_grade_required): si su nota < min, la final se topa en cap.
// Caso real: el Podcast de FIL2001. El piso lo aplica ramoAvg vía r.gates.
// ING1004 NO está aquí: su compuerta es entre GRUPOS anidados (Individual/Grupal)
// y no cabe en el modelo plano de secciones — necesita el árbol completo (próximo brick).
// QUÉ REGLA SE MUESTRA Y CUÁL NO. Transcribimos el programa completo, pero no
// se muestra completo: una tarjeta con doce reglas no se lee, y lo que importa
// queda enterrado entre normativa que es igual en toda la universidad.
//
// Se muestra una regla solo si el estudiante PUEDE HACER ALGO con ella y eso
// CAMBIA SU NÚMERO: décimas que se ganan asistiendo, una eximición que se
// alcanza, un tope que se evita entregando algo a tiempo.
//
// No se muestran:
//   · Disciplina y formato — copia, Turnitin, lápiz pasta, letra legible,
//     celulares, registrar la asistencia. Es el reglamento de la universidad,
//     no la pauta del ramo, y no cambia cómo se calcula tu promedio.
//   · Contingencias automáticas — "si faltas justificadamente a una
//     interrogación, esa nota se reemplaza por la del examen". No la eliges y
//     no puedes prepararla; a quien le pase se entera por su profesor.
//   · Lo que solo describe el curso — "no hay eximición del examen final".
//
// Lo que se saca de acá NO se pierde: sigue en el programa oficial, y el ramo
// muestra "Compáralo con la pauta del curso" justamente por eso.
// `periodo` pertenece al PRESET, no a cada evaluación: las ponderaciones
// suelen seguir sirviendo después, pero las fechas solo se precargan mientras
// ese período siga vigente. Si un programa no declara el período, se omite el
// campo y la app conserva los pesos sin presentar sus fechas como actuales.
const PRESETS_UC={
  'Cálculo I':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  'Álgebra Lineal':[['Interrogación 1',20],['Interrogación 2',20],['Interrogación 3',20],['Laboratorio',10,{slots:3}],['Examen',30]],
  // Ingeniería Comercial · 2° semestre. Transcripción de la pauta 2026-2
  // confirmada por Lucas el 17-08-2026. La regla de aprobación de Álgebra
  // aparece cortada en la fuente, así que no se modela ni se muestra.
  'Introducción al Álgebra Lineal':[
    ['Interrogación 1',20],['Interrogación 2',25],['Interrogación 3',25],['Examen',30],
  ],
  'Introducción a la Macroeconomía':[
    ['C1',16],['P1',22],['P2',22],['PP',10],['Examen',30],
  ],
  'Probabilidad y Estadística':[
    ['C1',8],['P1',20],['C2',8],['P2',20],['C3',8],['Examen',30],
    ['Control sorpresa 1',2],['Control sorpresa 2',2],['Control sorpresa 3',2],
  ],
  'Química para Ingeniería':[['Pruebas',44.1],['Ev. de Taller',4.9],['Examen',21],['Informes',18],['Controles',12]],
  'Filosofía: ¿para qué?':[['Prueba 1',30],['Ejercicio de análisis',20],['Prueba 2',30],['Podcast',20,{min:4.0,cap:3.9}]],
  'Introducción a la Programación':{
    periodo:'2026-2',
    evals:[
      ['Interrogación 1',15,{fecha:'2026-09-24'}],['Interrogación 2',20,{fecha:'2026-10-22'}],['Examen',30,{fecha:'2026-12-10'}],
      // La agenda del curso publica inicio y fin de cada tarea. La evaluación
      // es la entrega, por eso Agenda recibe el cierre y no el hito de apertura.
      ['Tarea 1',5,{fecha:'2026-10-02'}],['Tarea 2',5,{fecha:'2026-10-27'}],['Tarea 3',5,{fecha:'2026-11-27'}],
      ['Nota de participación',16],['Talleres de Inteligencia Artificial',4],
    ],
    grupos:[{nombre:'Evaluaciones principales',evals:['Interrogación 1','Interrogación 2','Examen'],min:4.0,cap:3.9}],
    // Sin reglas visibles: el programa solo trae la sustitución automática por
    // inasistencia justificada y la sanción por no registrar asistencia.
    // Ninguna de las dos es algo que el estudiante pueda usar a su favor.
  },
  'Principios Ecológicos y Medio Ambiente':{
    // El calendario 2026-2 la nombra "Biología"; sus I1, I2 e I3 calzan con
    // las tres Pruebas del programa. Se conserva el nombre oficial del curso.
    // Lucas confirmó el 2026-08-24 que son el mismo ramo: no es una inferencia
    // por parecido de nombres, así que estas fechas no se "corrigen" sin hablar
    // con él primero.
    periodo:'2026-2',
    evals:[
      ['Prueba 1',25,{fecha:'2026-09-01'}],
      ['Prueba 2',40,{fecha:'2026-11-03'}],
      ['Prueba 3',35,{fecha:'2026-12-01'}],
    ],
    noCalcula:[
      'Si tu promedio ponderado de las Pruebas supera 4,0, las décimas que ganes en los talleres se suman a tu nota final, con un máximo de 5 décimas',
    ],
  },
  // Los pesos y las fechas salen del programa clase a clase (MAT1620-2026-S2),
  // no del documento de normativa: ese es solo reglamento y no publica ninguna
  // ponderación. Las cuatro fechas caen lunes en 2026, como dice el programa.
  //
  // El Laboratorio pesa 10% y son 3, igual que en Cálculo I. Ojo: eso NO sale
  // del programa clase a clase —ahí dice "Laboratorio (10%)" y nada más—, lo
  // confirmó Lucas. Queda anotado porque si mañana alguien lo contrasta contra
  // el PDF no lo va a encontrar y va a creer que es un número inventado.
  //
  // Sin reglas visibles a propósito: las de la normativa son sustituciones
  // automáticas por inasistencia justificada y sanciones de disciplina, y
  // ninguna pasa el filtro de arriba.
  'Cálculo II':{
    periodo:'2026-2',
    evals:[
      ['Interrogación 1',20,{fecha:'2026-08-31'}],
      ['Interrogación 2',20,{fecha:'2026-10-05'}],
      ['Interrogación 3',20,{fecha:'2026-11-02'}],
      ['Examen',30,{fecha:'2026-11-30'}],
      ['Laboratorio',10,{slots:3}],
    ],
  },
  // Programas oficiales de especialidad · Ingeniería UC · 2026-2.
  //
  // Econometría publica 25% para el conjunto de tres tareas, pero no reparte
  // ese porcentaje entre T1/T2/T3. Se conserva como una sola categoría con
  // tres casillas: dividirla en 8,33% sería inventar una igualdad que el
  // programa no declara. Por la misma razón, las fechas preliminares de los
  // informes no se fuerzan como fechas de tres evaluaciones independientes.
  'Econometría Aplicada':{
    periodo:'2026-2',
    creditos:10,
    evals:[
      ['Interrogación 1',25,{fecha:'2026-08-31'}],
      ['Interrogación 2',25,{fecha:'2026-10-16'}],
      ['Examen',25,{fecha:'2026-11-30'}],
      ['Tareas',25,{slots:3}],
    ],
    grupos:[
      {nombre:'Interrogaciones y Examen',evals:['Interrogación 1','Interrogación 2','Examen'],min:3.95,cap:3.9},
      {nombre:'Tareas',evals:['Tareas'],min:3.95,cap:3.9},
    ],
    noCalcula:[
      'Los tickets de participación pueden sumar hasta 2 décimas a cada interrogación o al examen, según la cantidad completada en su período',
      'Si rindes ambas interrogaciones, cumples los tickets y tu peor interrogación es al menos 2,0, puedes reemplazarla por la nota del examen',
    ],
  },
  // NP pesa 80%: I1 25%, I2 35% y Examen 40% dentro de NP. NT pesa 20%:
  // T1 30%, T2 30% y T3 40% dentro de NT. Los pesos de abajo son el producto
  // exacto de ambos niveles, no una aproximación; así las compuertas de NP y
  // NT siguen calculándose con su proporción interna correcta.
  'Métodos de Optimización':{
    periodo:'2026-2',
    creditos:10,
    evals:[
      ['Interrogación 1',20,{fecha:'2026-09-07'}],
      ['Interrogación 2',28,{fecha:'2026-11-09'}],
      ['Examen',32,{fecha:'2026-12-02'}],
      ['Tarea 1',6],['Tarea 2',6],['Tarea 3',8],
    ],
    grupos:[
      {nombre:'Pruebas',evals:['Interrogación 1','Interrogación 2','Examen'],min:4.0,cap:3.9},
      {nombre:'Tareas',evals:['Tarea 1','Tarea 2','Tarea 3'],min:4.0,cap:3.9},
    ],
    noCalcula:[
      'El Control optativo del 9 de octubre puede mejorar la Interrogación 2: si su nota es mayor, aporta un 30% y la Interrogación 2 conserva el 70%',
    ],
    reglasDelCurso:[
      'Las actividades de taller pueden bonificar una nota final aprobada; la regla de acumulación se informa durante el semestre en Canvas',
    ],
  },
  // El programa define C4 mejores como el promedio de los cuatro mejores de
  // cinco controles. Deben seguir juntos: cinco filas de 9% impedirían que el
  // motor descarte una nota entre ellas. Por eso sus fechas quedan en el
  // programa y el Examen y los cuatro Memes sí entran individualmente a Agenda.
  'Ingeniería de Sistemas de Transporte':{
    periodo:'2026-2',
    creditos:10,
    evals:[
      ['Controles',45,{slots:5,dropLowest:{count:1}}],
      ['Meme 1',5,{fecha:'2026-08-24'}],
      ['Meme 2',5,{fecha:'2026-09-25'}],
      ['Meme 3',5,{fecha:'2026-10-23'}],
      ['Meme 4',5,{fecha:'2026-11-20'}],
      ['Examen',35,{fecha:'2026-12-02',min:3.0,cap:3.9}],
    ],
    grupos:[
      {nombre:'Cuatro mejores controles',evals:['Controles'],min:3.0,cap:'self'},
      {nombre:'Promedio de Memes',evals:['Meme 1','Meme 2','Meme 3','Meme 4'],min:4.0,cap:'self'},
      {nombre:'Evaluaciones escritas',evals:['Controles','Examen'],min:4.0,cap:'self'},
    ],
    // El derecho se mide sobre los CINCO controles antes de descartar el peor.
    // Si se cumple y el Examen sigue vacío, la app lo deja fuera de lo pendiente:
    // la fórmula ya repondera Controles y Memes correctamente sobre el 65%.
    eximicion:{evaluacion:'Examen',segun:['Controles'],min:5.5,ignoraDescartes:true},
    noCalcula:[
      'Si rindes el Examen, puedes usar su nota para reemplazar la nota de un Control',
      'Si no cumples el mínimo de Memes o de los cuatro mejores Controles, no tienes derecho a rendir el Examen',
    ],
  },
  // Fuente viva del curso: github.com/IIC2115/Syllabus, programa 2026-2.
  // Son cuatro laboratorios, uno por capítulo, y el propio programa declara
  // que L es su promedio simple: separarlos en cuatro filas de 20% conserva la
  // fórmula exacta y permite llevar las fechas publicadas a Agenda.
  'Programación como Herramienta para la Ingeniería':{
    periodo:'2026-2',
    creditos:10,
    evals:[
      ['Laboratorio 1',20,{fecha:'2026-08-24'}],
      ['Laboratorio 2',20,{fecha:'2026-09-28'}],
      ['Laboratorio 3',20,{fecha:'2026-10-26'}],
      ['Laboratorio 4',20,{fecha:'2026-11-23'}],
      ['Participación',20,{slots:10,dropLowest:{count:2}}],
    ],
    grupos:[
      {nombre:'Laboratorios',evals:['Laboratorio 1','Laboratorio 2','Laboratorio 3','Laboratorio 4'],min:3.95,cap:3.9},
      {nombre:'Participación',evals:['Participación'],min:3.95,cap:3.9},
    ],
    reglasDelCurso:[
      'Si tienes 2 o más ausencias justificadas a sesiones con ticket, el equipo docente ajustará la regla de Participación; el programa no publica la fórmula de ese ajuste',
    ],
  },
  // ── Dinámica y su laboratorio: dos ramos, una nota ────────────────────────
  // La UC los inscribe como dos cursos (FIS1514 y FIS0154) con dos actas, y así
  // se muestran. Pero la nota final de Dinámica se calcula CON la del
  // laboratorio, y eso el estudiante no lo puede hacer a mano cada vez:
  //
  //   NF  = 0,7·NFC + 0,3·NL      si NL ≥ 4,0 Y NFC ≥ 4,0
  //   NF  = min(NFC, NL)          si cualquiera de los dos baja de 4,0
  //
  // `aporta` es lo que ata los dos ramos: dice de dónde sale el 30% que no está
  // en las evaluaciones de este ramo, y con qué mínimo. Es el único caso del
  // catálogo hasta ahora, y por eso vive en el dato y no en un `if` del código.
  'Dinámica':{
    periodo:'2026-2',
    // Estas cuatro son la NFC del programa y suman 100 entre ellas: el 30% del
    // laboratorio no está acá, viene por `aporta`.
    evals:[
      ['Interrogación 1',25,{fecha:'2026-09-29'}],
      ['Interrogación 2',25,{fecha:'2026-11-13'}],
      // El calendario fija C1/C2/C3, pero el programa solo da 20% al conjunto.
      // Separarlos o repartir su peso inventaría ponderaciones; las tres fechas
      // requieren soporte de fechas por casilla, no una fecha falsa del grupo.
      ['Controles',20,{slots:3}],
      ['Examen',30,{fecha:'2026-12-01'}],
    ],
    aporta:{ramo:'Laboratorio de Dinámica',peso:30,min:4.0},
    noCalcula:[
      'Si asistes a 8 o más talleres, sumas 5 décimas al promedio de los Controles; para optar a ellas puedes faltar como máximo a 2 talleres, con o sin justificación',
    ],
  },
  // El laboratorio tiene nota propia: se aprueba o se reprueba por sí solo, y
  // la evaluación de pares bajo 4,0 lo reprueba aunque el resto vaya bien.
  // 5 experimentos presenciales con control, informe y evaluación de pares, más
  // un Lab 0 online con informe y pares: 5 controles, 6 informes, 6 pares.
  'Laboratorio de Dinámica':{
    evals:[
      ['Controles',10,{slots:5,slotLabel:'Control'}],
      // El Lab 0 online también tiene informe y pares. La categoría conserva
      // el plural porque es su nombre en el programa, pero cada casilla se
      // nombra como la entrega real: Informe 0 … Informe 5.
      ['Informes',70,{slots:6,slotLabel:'Informe',slotStart:0}],
      ['Evaluación de pares',20,{slots:6,slotStart:0,min:4.0,cap:3.9}],
    ],
    noCalcula:[
      'Si no realizas un Control, tu nota máxima en el Informe de ese experimento queda en 4,0',
      'Tu nota de evaluación de pares se calcula promediando la nota que te asignan tus compañeros y tu autoevaluación; si no respondes la autoevaluación, esa parte queda con nota 1',
    ],
  },
  'Revelación y Fe':{
    periodo:'2026-2',
    evals:[['Evaluación 1',20,{fecha:'2026-09-07'}],['Evaluación 2',20,{fecha:'2026-10-14'}],['Evaluación 3',30,{fecha:'2026-11-16'}],['Examen final',30]],
    noCalcula:[
      'Si tienes más de 75% de asistencia y una nota de presentación igual o superior a 6,00, te eximes del Examen final; tu nota de presentación se calcula como el promedio simple de Evaluación 1, Evaluación 2 y Evaluación 3, sin usar sus ponderaciones',
      'Si te eximes del Examen final, la nota del Examen final se reemplaza por la nota más alta que obtuviste entre Evaluación 1, Evaluación 2 y Evaluación 3',
      'Si obtienes décimas en los talleres, se agregan al finalizar el semestre a tu nota más baja',
      'Si presentas voluntariamente uno de los textos del curso cumpliendo las condiciones indicadas, obtienes un 7,0 que se promedia con tu nota más baja entre Evaluación 1, Evaluación 2 y Evaluación 3',
    ],
  },
};

// PRESETS_UC nació con la malla de Ingeniería. Comercial usa el mismo registro
// solo para estos ramos confirmados: compartir todo por nombre podría aplicar
// la pauta de otra facultad a un curso homónimo.
const PRESETS_UC_COM=[
  'Introducción al Álgebra Lineal',
  'Cálculo II',
  'Introducción a la Macroeconomía',
  'Probabilidad y Estadística',
  'Filosofía: ¿para qué?',
];
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
// DE DÓNDE SALEN. Ingeniería sale del catálogo oficial C2022 vía la API de
// mallas.ing.uc.cl: se recorrieron los 34 majors generando su plan completo y
// se pidió el detalle de cada sigla. Comercial sale de su malla oficial 2025
// (economiayadministracion.uc.cl/assets/uploads/2025/07/malla-2025-1.pdf), con
// las siglas contrastadas contra la Resolución VRA N°080/2019, Anexo III
// (registrosacademicos.uc.cl/wp-content/uploads/2024/06/m_050014_2025.pdf).
// Ninguno se escribió a mano.
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
  // Comercial la llama igual, pero usa EAA1520. Como ambos planes le dan 10
  // SCT, esta tabla por nombre conserva el crédito; SIGLAS_UC guarda la sigla
  // correcta según carrera para no mezclarlos en el catálogo.
  'Inferencia Estadística':[10,'EYP2114'],
  'Metodos Bayesianos':[10,'EYP280I'],
  'Filosofía: ¿Para Qué?':[10,'FIL2001'],
  'Laboratorio de Termodinámica':[0,'FIS0152'],
  'Laboratorio de Electricidad y Magnetismo':[0,'FIS0153'],
  'Laboratorio de Dinámica':[0,'FIS0154'],
  'Dinámica':[10,'FIS1514'],
  // No es un duplicado: el plan común admite FIS1514 o ICE1514. Como ambos
  // se llaman oficialmente Dinámica, el código va en la etiqueta para que el
  // estudiante pueda elegir el que aparece en su horario. No entra a la malla
  // sugerida porque es una alternativa, no un ramo adicional.
  'Dinámica (ICE1514)':[10,'ICE1514'],
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

  // Ingeniería Comercial UC · malla oficial 2025. Los cuatro nombres que
  // coincide con Ingeniería (Cálculo I y II, Programación y Filosofía) ya
  // están arriba con el mismo crédito; acá van los 26 propios de Comercial.
  'Introducción a la Microeconomía':[10,'EAE1110'],
  'Contabilidad':[10,'EAA1210'],
  'Comportamiento Organizacional':[10,'EAA1110'],
  'Probabilidad y Estadística':[10,'EAA1510'],
  'Introducción al Álgebra Lineal':[10,'MAT1279'],
  'Introducción a la Macroeconomía':[10,'EAE1210'],
  'Aplicaciones Matemáticas para Economía y Negocios':[10,'EAF2010'],
  'Análisis Económico: La Experiencia Chilena':[10,'EAE1220'],
  'Fundamentos de Finanzas':[10,'EAA1220'],
  'Econometría':[10,'EAE2510'],
  'Microeconomía I':[10,'EAE2110'],
  'Estrategia de la Organización':[10,'EAA2410'],
  'Fundamentos de Marketing':[10,'EAA2310'],
  'Microeconomía II':[10,'EAE2120'],
  'Macroeconomía I':[10,'EAE2210'],
  'Teoría Financiera':[10,'EAA2210'],
  'Estrategia Competitiva':[10,'EAA2420'],
  'Competencia y Mercado':[10,'EAE2130'],
  'Contabilidad de Costos':[10,'EAA2220'],
  'Ética, Economía y Empresa':[10,'FIL209'],
  'Marketing Analytics':[10,'EAA2320'],
  'Empresas y Legislación':[5,'EAA2240'],
  'Macroeconomía II':[10,'EAE2220'],
  'Contabilidad Gerencial':[10,'EAA2230'],
  'Dirección de Personas':[10,'EAA2110'],
  'Práctica Social':[10,'EAF2500'],
};

// Créditos SCT de la FEN. Misma forma que CREDITOS_UC: [créditos, sigla].
//
// Los 32 primeros salen de la planilla oficial de oferta de secciones de
// Primavera 2026, con su sigla. Como es la oferta y no la malla, trae varias
// filas por ramo —una por sección— y las versiones "(DICTADO EN INGLÉS)" del
// mismo curso: se deduplicaron por nombre, y en todos los casos las secciones
// de un mismo ramo declaraban los mismos créditos.
//
// Los 7 del final los aportó Martín: son ramos que ya cursó, así que no
// aparecen en la oferta de este semestre. Van sin sigla porque la planilla no
// los trae, y `creditosDe` solo lee el primer elemento.
//
// 39 de los 88 ramos de la malla. El promedio general se pondera por créditos
// SOLO si todos los ramos con nota los tienen, así que hasta completarla esto
// no cambia ningún número: prepara el terreno.
const CREDITOS_FEN={
  'Comunicación':[2,'COM1005'],
  // La planilla lo lista como "COMUNICACIÓN I" (prerrequisito COM1005) y la
  // malla lo llama "Comunicación II". Martín confirmó que son el mismo ramo.
  'Comunicación II':[2,'COM3005'],
  'Contabilidad':[6,'CON1005'],
  'Contabilidad Empresarial I':[6,'CON3005'],
  'Contabilidad Empresarial II':[6,'CON3505'],
  'Economía Aplicada':[6,'MIC2505'],
  'Economía para los Negocios':[6,'NEG3005'],
  'Estadística I':[6,'MES2005'],
  'Estadística II':[6,'MES2505'],
  'Finanzas':[6,'FIN2505'],
  'Finanzas I':[6,'FIN3505'],
  'Finanzas II':[6,'FIN4505'],
  'Gestión de Personas':[6,'GEP1505'],
  'Gestión de Personas I':[6,'GEP3005'],
  'Gestión de Personas II':[6,'GEP4505'],
  'Inglés IV':[4,'IDI3506'],
  'Introducción a la Macroeconomía':[6,'MAC2005'],
  'Introducción a la Microeconomía':[6,'MIC1505'],
  'Introducción al Pensamiento Económico y Político':[4,'CSH2005'],
  'Marketing':[6,'MKT2005'],
  'Marketing I':[6,'MKT3505'],
  'Marketing II':[6,'MKT4505'],
  'Métodos Cuantitativos I':[6,'MEC3005'],
  // IICG y CA lo cursan sin número: es el mismo MEC3005 de IC. Ver SINONIMOS.
  'Métodos Cuantitativos':[6,'MEC3005'],
  'Métodos Matemáticos II':[6,'MEM1505'],
  'Métodos Matemáticos III':[6,'MEM2005'],
  'Métodos Matemáticos IV':[6,'MEM2505'],
  'Negocios I':[6,'NEG3510'],
  'Negocios II':[6,'NEG4005'],
  'Negocios III':[6,'NEG4505'],
  'Razonamiento Basado en Datos':[6,'GIN2505'],
  'Taller de Negocios':[2,'NEG3505'],
  'Tecnología y Sistemas de Información':[6,'GIN1505'],
  // Sin sigla: no están en la oferta de este semestre.
  'Gestión y Empresas':[6,null],
  'Inglés I':[2,null],
  'Inglés II':[2,null],
  'Inglés III':[2,null],
  'Introducción a la Economía':[6,null],
  'Métodos Matemáticos I':[6,null],
  'Programación para Analítica de Datos':[6,null],
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
// ─── CURSOS UC SIN SEMESTRE ──────────────────────────────────────────────────
// Cursos que existen en la UC pero que NO pertenecen a un semestre de ninguna
// malla: los OFG y los optativos son una elección, no un ramo que curse todo
// el mundo. Van acá para que el buscador los encuentre; la malla no los carga
// sola y nadie los recibe sin pedirlos.
//
// No es una lista teórica. De los quince ramos que los estudiantes escribieron
// a mano en la primera noche, nueve eran de esta clase: tres pidieron
// "biocel" —cada uno con una grafía distinta— y tres pidieron un teológico.
// Tenían que escribirlo porque la app solo conocía ramos de malla.
//
// Fuente: BuscaCursos UC (buscacursos.uc.cl), oferta 2026-2, consultada el
// 2026-08-18. Se corrigieron tildes y mayúsculas rotas que trae el sistema
// ("Revelacion" → "Revelación", "Siglo Xxi" → "Siglo XXI"); eso no afecta la
// búsqueda, que compara sin tildes, y evita mostrarle al estudiante un nombre
// mal escrito.
//
// DOS CURSOS DE ESTA CLASE NO ESTÁN ACÁ y es a propósito: "Revelación y Fe"
// (TTF012) y "Principios Ecológicos y Medio Ambiente" (BIO143M) ya tienen su
// pauta oficial en PRESETS_UC y entran al buscador por `presetsFueraDeMalla`.
// Repetirlos acá los mostraría dos veces, una con ponderaciones y otra sin
// ellas. El segundo se llamaba "Principios de Ecología y Medio Ambiente" hasta
// que se comprobó contra BuscaCursos que su nombre oficial es este.
//
// SOLO NOMBRE Y SIGLA. Ninguno trae pauta: no tenemos sus programas, y
// rellenar ponderaciones plausibles es exactamente lo que no se hace acá. Si
// más adelante aparece el programa de uno, su pauta va a PRESETS_UC como
// cualquier otra. Si aparece el dato de a qué semestre pertenece, pasa a la
// malla y sale de esta lista.
const CURSOS_UC=[
  // Optativos biológicos — los cuatro que pidieron los estudiantes
  ['BIO110C','Biología de Organismos y Comunidades'],
  ['BIO141C','Biología de la Célula'],
  ['BIO141T','Taller de Biología de la Célula'],
  // Formación Teológica (OFG). Un estudiante cursa uno de estos, no todos.
  ['TTF010','Teología Fundamental'],
  ['TTF013','Tópicos de Ética Social Cristiana'],
  ['TTF019','Psicología y Religión Cristiana'],
  ['TTF026','Introducción a la Biblia'],
  ['TTF036','La Biblia de Jesús'],
  ['TTF047','Dios en el Siglo XXI'],
  ['TTF068','El Matrimonio Cristiano Hoy'],
  ['TTF073','Fin de los Tiempos. Mitos y Realidad'],
  ['TTF079','Experiencia Cristiana y Compromiso Social'],
  ['TTF081','Cristianismo y Disidencia: Una Mirada Histórica'],
  ['TTF083','Cristianismo y Derechos Humanos'],
  ['TTF087','¿Está Dios en el Escenario Humano?'],
  ['TTF091','Leer el Evangelio en el Siglo XXI'],
  ['TTF100','Arte y Revelación'],
  ['TTF109','La Belleza de la Fragilidad Humana'],
  ['TTF111','Ética Teológica de la Tecnología Moderna'],
  ['TTF115','Virgen María y Feminismo: ¿Diálogo o Confrontación?'],
  ['TTF116','Arquitectura Sacra'],
  ['TTF118','Esperanza Cristiana, Muerte y Más Allá'],
  ['TTF202','Búsquedas Religiosas y Cristianismo'],
  ['TTF205','¿Quién Es Jesús de Nazareth?'],
  ['TTF206','El Padrenuestro: la Oración de Jesús'],
  ['TTF207','Doctrina Social de la Iglesia'],
  ['TTF208','Fe y Razón: Una Perspectiva Histórica'],
  ['TTF210','Experiencia Creyente y Secularismo'],
  ['TTF211','Para Pensar la Muerte'],
  ['TTF213','Espiritualidad Laical y Cultura Moderna'],
  ['TTF215','Teología y Ecología'],
  ['TTF216','¿Creer o No Creer?'],
  ['TTF217','¿Es Necesaria la Iglesia?'],
  ['TTF218','Lectura Contemporánea de la Biblia'],
  ['TTF219','Existencia Humana y la Búsqueda de Sentido'],
  ['TTF220','Teología del Cuerpo Humano'],
  ['TTF222','Cristianismo y Crisis Ecológica'],
  ['TTF225','Fe y Ciencia'],
  ['TTF226','Religión y Política'],
  ['TTF232','Teología Feminista: Un Signo de los Tiempos'],
  ['TTF233','Teología y Literatura'],
];

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
    // Cursos de especialidad con programa oficial 2026-2. ICT2904 conserva la
    // sigla del catálogo y del nombre del archivo recibido: el PDF contiene un
    // rótulo interno ICT3103 que contradice ambos y no se usa para renombrarlo.
    'Econometría Aplicada':'ICS2563', 'Métodos de Optimización':'ICS2121',
    'Ingeniería de Sistemas de Transporte':'ICT2904',
    'Programación como Herramienta para la Ingeniería':'IIC2115',
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
    recuperativo:{min:3.6,max:3.9,nota:4.0},
    // El programa dice exactamente qué ocurre en cada caso. Reemplazar una
    // nota y mover un peso no son la misma regla: se declaran separadas para
    // no convertir el segundo caso en una nota ficticia.
    ausenciasJustificadas:{
      reemplazos:[
        {desde:'Control 1',hacia:'Solemne'},
        {desde:'Solemne',hacia:'Examen'},
        {desde:'Control 2',hacia:'Examen'},
        {desde:'Control 3',hacia:'Examen'},
      ],
      traspasos:[{desde:'Pruebas sorpresa',hacia:'Examen'}],
    },
    // Las dos reglas restantes no son cálculos: la primera es procedimiento del
    // curso y la segunda es disciplinaria.
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
  // Verificado contra el programa oficial ENGEP 155/0, sección 4.2.
  'Gestión de Personas':{
    creditos:6,
    noCalcula:['Te eximes del examen si promedias 5,5 o más en los Casos y no tienes ninguna nota bajo 4,0 en dos o más de ellos. En ese caso el examen se reemplaza por el promedio de Casos y ensayos con Participación'],
    // El ajuste sale de cómo te evalúan tus compañeros: es un dato que solo
    // existe cuando el curso lo entrega. La app no puede anticiparlo.
    reglasDelCurso:['La nota del trabajo grupal se ajusta ±10 décimas según la evaluación entre compañeros'],
    // El programa desglosa el 30% del trabajo en grupo y el 20% de participación
    // en partes con nombre y peso PROPIOS (10/60/30 y 25/50/25 de su bloque). Una
    // casilla agrupada las promediaría a partes iguales, que no es lo que dice el
    // programa: van en filas propias con el peso ya llevado al total del ramo.
    // Casos y ensayos NO lleva slots: el programa nunca dice cuántos son.
    evals:[
      ['Casos y ensayos',40],
      ['Trabajo en grupo: Propuesta',3],
      ['Trabajo en grupo: Experiencia de aprendizaje',18],
      ['Trabajo en grupo: Informe Final',9],
      ['Participación: Asistencia a ayudantías y reuniones',5],
      ['Participación: Contribuciones en clases',10],
      ['Participación: Asistencia a clases',5],
      ['Examen Integrativo',10],
    ],
    // "Si alguno de los requisitos no se cumple, la nota final será la más baja
    //  entre los dos" → dos compuertas de grupo con tope en su propio promedio.
    grupos:[
      {nombre:'Trabajo individual',evals:['Casos y ensayos','Participación: Asistencia a ayudantías y reuniones','Participación: Contribuciones en clases','Participación: Asistencia a clases','Examen Integrativo'],min:4.0,cap:'self'},
      {nombre:'Trabajo de grupo',evals:['Trabajo en grupo: Propuesta','Trabajo en grupo: Experiencia de aprendizaje','Trabajo en grupo: Informe Final'],min:4.0,cap:'self'},
    ],
  },
  // Programa oficial ENCOM1005, Primavera 2026. El programa se titula
  // "Comunicación I"; la clave es 'Comunicación' porque así se llama en la malla.
  'Comunicación':{
    periodo:'2026-2',
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
    // El programa identifica explícitamente Primavera 2026. Sus porcentajes
    // quedan disponibles después; estas fechas solo se ofrecen en 2026-2.
    periodo:'2026-2',
    creditos:6,
    // "Se elimina el 25% de los controles sorpresa rendidos" salió de noCalcula:
    // el motor ya lo aplica vía `dropLowest`. El 75% de asistencia NO se puede
    // calcular y se queda: el programa dice "entre 4 y 6 controles", así que no
    // existe el denominador contra el cual medir el 75%.
    // Sin noCalcula: no queda ninguna regla pendiente de implementar.
    reglasDelCurso:['Rendir menos del 75% de los controles sorpresa reprueba el curso con 3,9'],
    evals:[
      // Los controles de lectura y los de ejercicios van en filas propias, cada
      // una con su fecha, porque el programa da las dos cosas: cuántos son y
      // cuándo. Los de ejercicios traen "40 % (10% cada uno)" textual, así que el
      // reparto no lo inventamos nosotros. Y en los dos dice "No se elimina nota
      // alguna": nada de `dropLowest` acá.
      //
      // El 10% de los de lectura no se divide exacto en tres. El tercero lleva
      // 3,34 en vez de 3,33 para que la suma dé 100 justo: es un centésimo de
      // punto porcentual, invisible en cualquier nota.
      //
      // El mínimo de 1,5 es POR CONTROL, no por grupo — "nota mínima de 1,5 en
      // controles (lectura, ejercicios y sorpresa) y solemne" —, y por eso cada
      // fila lleva su compuerta. Agruparlos la movía al promedio del grupo, que
      // es una regla distinta y más blanda que la del programa.
      ['Control de Lectura 1',3.33,{fecha:'2026-08-07',min:1.5,cap:3.9}],
      ['Control de Lectura 2',3.33,{fecha:'2026-08-28',min:1.5,cap:3.9}],
      ['Control de Lectura 3',3.34,{fecha:'2026-11-06',min:1.5,cap:3.9}],
      ['Control de Ejercicios 1',10,{fecha:'2026-08-21',min:1.5,cap:3.9}],
      ['Control de Ejercicios 2',10,{fecha:'2026-09-11',min:1.5,cap:3.9}],
      ['Control de Ejercicios 3',10,{fecha:'2026-10-16',min:1.5,cap:3.9}],
      ['Control de Ejercicios 4',10,{fecha:'2026-10-30',min:1.5,cap:3.9}],
      // Los sorpresa sí quedan como lista abierta: "entre 4 y 6 durante el
      // semestre" es el único número que el programa no fija, y son los únicos
      // con descarte (se elimina el 25% de los rendidos).
      ['Controles Sorpresa',5,{lista:true,min:1.5,cap:3.9,dropLowest:{fraction:0.25}}],
      ['Solemne',20,{min:1.5,cap:3.9}],
      ['Examen',25,{min:3.0,cap:3.4}],
    ],
  },
  // Tecnologías y Sistemas de Información · ENGIN1505/05 · programa oficial
  // Primavera 2026 (sección 05, profesora Mónica Stambuk). La clave es
  // 'Tecnología y Sistemas de Información' —en singular— porque así se llama en
  // la malla; el programa lo titula "Tecnologías".
  //
  // Este reemplaza la presentación de la clase 1 que teníamos, que declaraba su
  // propia ponderación como provisoria y por eso nunca se transcribió.
  //
  // El programa da la fórmula cerrada y suma 100 exacto:
  //   NF = 20% NS1 + 20% NS2 + 5% JITT + 10% NC + 15% NTF + 30% NE
  //
  // Las dos solemnes van en filas propias porque el programa les da peso propio
  // (20% cada una, no un bloque de 40%), igual que en Métodos Matemáticos II: si
  // falta una y el examen ya está puesto, filas separadas reponderan sobre lo
  // rendido en vez de asumir que la que falta saldrá como la otra.
  //
  // Los Controles sí llevan `slots:2`: el número no se dedujo, el programa dice
  // "dos controles en el semestre" y define NC como su promedio.
  //
  // OJO con las fechas: el programa las da como rangos que fijan las Escuelas de
  // Pregrado (solemne 1 entre el 21 de septiembre y el 3 de octubre; examen entre
  // el 18 de noviembre y el 2 de diciembre) y la solemne 2 está por confirmar.
  // Un rango no es una fecha, así que no va ninguna a la agenda.
  'Tecnología y Sistemas de Información':{
    periodo:'2026-2',
    creditos:6,
    // Ninguna evaluación tiene nota mínima propia ni hay eximición: el único
    // requisito que da el programa es el 4,0 de aprobación, que la app ya sabe.
    // Sin `noCalcula`: no queda nada pendiente de implementar.
    reglasDelCurso:[
      'Las dos solemnes y el examen comparten una única recuperativa, que se rinde después del examen y a la que solo accede quien justificó su inasistencia',
      'La asistencia a las ayudantías es obligatoria, y los controles se rinden en ese horario',
    ],
    evals:[
      ['Just in Time Teaching',5],
      ['Controles',10,{slots:2}],
      ['Trabajo Final',15],
      ['Solemne 1',20],
      ['Solemne 2',20],
      ['Examen',30],
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
    periodo:'2026-2',
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
      ['Controles',25,{lista:true}],
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
    periodo:'2026-1',
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
  // Métodos Matemáticos I · ENMEM1005 · programa de OTOÑO 2026, común a las nueve
  // secciones. El programa da la fórmula explícita:
  // C1*0,15 + C2*0,15 + C3*0,15 + S*0,25 + Exa*0,3.
  //
  // El período no es un detalle acá: en primavera este ramo se dicta para quien
  // lo reprobó y su pauta es OTRA —tres evaluaciones de 20% y examen de 40%, sin
  // solemne—. Lo dijeron cinco estudiantes por separado el 2026-08-31 y lo
  // confirmó Martín. No son la misma pauta actualizada: son dos, para dos
  // cohortes, y las dos son válidas en su semestre.
  //
  // Mientras no tengamos el PDF de primavera, declarar el período es lo honesto
  // que sí podemos hacer: la ficha pasa a decir "Pauta del 2026-1" en vez de
  // ofrecerla como la pauta oficial a secas. Falta transcribir ENMEM1005 2026-2.
  'Métodos Matemáticos I':{
    creditos:6,
    periodo:'2026-1',
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
      ['Controles de Lectura',20,{lista:true,dropLowest:{count:1}}],
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
