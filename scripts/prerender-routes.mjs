/**
 * Pre-render route configuration
 * Each route = one static HTML file generated at build time.
 * Googlebot and other crawlers get this pre-rendered HTML instantly.
 *
 * Fields:
 *  - title / description / keywords : <head> meta (unique per route)
 *  - h1 / body                      : unique crawler content injected into the
 *                                     <noscript> SEO block, so every page ends
 *                                     up with exactly ONE unique H1.
 */
export const BASE_URL = 'https://imperium.xnova.games';
export const SITE_NAME = 'Imperium';
export const DEFAULT_IMAGE = `${BASE_URL}/og-imperium.jpg`;

export const routes = [
  // ===== HOME =====
  {
    path: '/',
    title: 'Imperium | Gana Criptomonedas Gratis Jugando | Juego Tipo OGame',
    ogTitle: 'IMPERIUM | Build your empire. Conquer your destiny.',
    ogDescription:
      'Every empire begins with a single city. Rise, lead your legions and make history. Play free now!',
    description:
      'Imperium es el juego de estrategia espacial tipo OGame donde generas ingresos gratis: vende tus recursos en el mercado y gana criptomonedas sin invertir.',
    keywords:
      'Imperium, xnova juego, xnova online, xnova ogame, juego tipo OGame, OGame, alternativa a OGame, como generar ingresos gratis, como ganar crypto de manera gratis, ganar crypto gratis, vender recursos y ganar dinero, mercado P2P de recursos, play to earn gratis, token TUNG',
    h1: 'Imperium - Genera Ingresos Gratis Jugando | Juego Tipo OGame para Ganar Criptomonedas',
    body: [
      ['h2', 'Que es Imperium'],
      [
        'p',
        'Imperium es un juego de estrategia espacial gratuito, tipo OGame, donde generas ingresos gratis y ganas criptomonedas reales. Construyes minas que producen metal, cristal y deuterio las 24 horas, vendes esos recursos en el mercado P2P a otros jugadores y cobras en tokens TUNG que puedes retirar a tu wallet. Sin inversion inicial y sin descargas: se juega desde el navegador.',
      ],
      ['h2', 'Como Generar Ingresos Gratis en Imperium'],
      [
        'p',
        'La clave para generar ingresos gratis en Imperium es simple: el juego produce, tu vendes. Tus minas generan recursos de forma automatica incluso cuando no estas conectado. Publicas una oferta en el mercado, otro jugador la compra y recibes tokens TUNG al instante. No hay que invertir nada, solo gestionar bien tu produccion y tus precios.',
      ],
      ['h2', 'Como Ganar Crypto de Manera Gratis Vendiendo Recursos'],
      [
        'p',
        'El mercado P2P es el corazon economico de Imperium y la via mas directa para ganar crypto de manera gratis. Vendes metal, cristal y deuterio a cambio de tokens TUNG, compras barato y vendes caro para ampliar tu margen, y retiras tus ganancias cuando quieras. Cuanto mas mejoras tus minas, mas recursos produces y mas puedes vender.',
      ],
      ['h2', 'Imperium y OGame: la Misma Estrategia con Recompensas Reales'],
      [
        'p',
        'Si vienes de OGame o de cualquier juego de estrategia espacial clasico, Imperium te resultara familiar: metal, cristal y deuterio, minas y edificios, laboratorio de investigacion, astillero de naves, flotas, defensas, galaxia explorable, expediciones y alianzas. La diferencia es que en Imperium todo ese esfuerzo se convierte en criptomonedas retirables.',
      ],
    ],
    priority: 1.0,
    changefreq: 'daily',
  },

  // ===== ABOUT =====
  {
    path: '/about',
    title: 'Sobre Imperium | El Juego Tipo OGame que Paga en Criptomonedas',
    description:
      'Conoce Imperium: que es, como funciona su economia, el token TUNG y por que puedes generar ingresos gratis vendiendo recursos en su mercado P2P.',
    keywords:
      'Imperium, sobre Imperium, que es Imperium, juego P2E, token TUNG, economia del juego, Falco-X Universo',
    h1: 'Sobre Imperium: el Juego Tipo OGame que Convierte tus Recursos en Dinero',
    body: [
      ['h2', 'La Idea Detras de Imperium'],
      [
        'p',
        'Imperium nace de una pregunta sencilla: si los juegos de estrategia espacial como OGame llevan veinte anos haciendo que millones de jugadores dediquen horas a producir recursos, por que ese trabajo no vale nada fuera del juego. Imperium cierra ese circulo conectando la economia del juego con una blockchain real.',
      ],
      ['h2', 'Como Funciona la Economia de Imperium'],
      [
        'p',
        'Todo gira en torno a la produccion y al mercado. Tus minas generan metal, cristal y deuterio sin coste. Esos recursos se compran y se venden entre jugadores en un mercado P2P, y las operaciones se liquidan en tokens TUNG. La wallet integrada te permite retirar esos tokens y convertirlos en criptomonedas reales.',
      ],
      ['h2', 'Gratis de Verdad'],
      [
        'p',
        'Imperium es free-to-play sin asteriscos: no hay que comprar NFTs, ni hacer staking, ni depositar nada para empezar a generar ingresos. El deposito existe solo para quien quiera acelerar su progreso, nunca como requisito.',
      ],
    ],
    priority: 0.7,
  },

  // ===== BLOG INDEX =====
  {
    path: '/blog',
    title: 'Blog de Imperium | Guias para Generar Ingresos Gratis Jugando',
    description:
      'Guias y estrategias de Imperium: como ganar crypto gratis, vender recursos en el mercado, comparativas con OGame y tutoriales para principiantes.',
    keywords:
      'blog Imperium, guias Imperium, estrategias Imperium, como ganar crypto gratis, tutoriales play to earn, comparativa OGame, mercado de recursos',
    h1: 'Blog de Imperium: Guias, Estrategias y Tutoriales para Ganar Crypto Gratis',
    body: [
      ['h2', 'Aprende a Generar Ingresos Gratis en Imperium'],
      [
        'p',
        'En el blog de Imperium publicamos guias practicas para sacar el maximo partido al juego: como optimizar tus minas, cuando conviene vender en el mercado, como fijar precios, que misiones dan mas recompensa y como retirar tus ganancias paso a paso.',
      ],
      ['h2', 'Temas que Cubrimos'],
      [
        'ul',
        [
          'Como ganar crypto de manera gratis desde cero',
          'Estrategias de mercado: vender recursos y maximizar el margen',
          'Comparativas entre Imperium y OGame',
          'Guias para principiantes y primeras 48 horas de juego',
          'Como retirar tus tokens TUNG a tu wallet',
          'Alianzas, guerras y estrategia avanzada',
          'Novedades: Casino Galactico, Batalla de Naves y apuestas deportivas',
          'Fortalezas de Alianza y Planeta del Tesoro',
        ],
      ],
    ],
    priority: 0.9,
    changefreq: 'daily',
  },

  // ===== BLOG ARTICLES =====
  {
    path: '/blog/como-ganar-criptomonedas-jugando-gratis',
    title: 'Como Ganar Criptomonedas Gratis Jugando en 2026 | Guia Imperium',
    description:
      'Guia paso a paso para ganar crypto de manera gratis en Imperium: construye minas, vende recursos en el mercado y retira tus tokens TUNG sin invertir.',
    keywords:
      'como ganar crypto de manera gratis, ganar criptomonedas jugando gratis, ganar crypto sin invertir, play to earn gratis, guia Imperium, tokens TUNG',
    h1: 'Como Ganar Criptomonedas Gratis Jugando en 2026: Guia Completa de Imperium',
    body: [
      ['h2', 'El Metodo: Producir Gratis y Vender en el Mercado'],
      [
        'p',
        'La forma mas fiable de ganar crypto de manera gratis en Imperium no es esperar un premio, es montar una linea de produccion. Subes tus minas de metal, cristal y deuterio, dejas que produzcan de forma pasiva y vendes el excedente en el mercado P2P a cambio de tokens TUNG.',
      ],
      ['h2', 'Pasos Basicos'],
      [
        'ul',
        [
          'Registrate gratis: solo hacen falta un email y una contrasena',
          'Sube mina de metal y mina de cristal antes que nada',
          'Anade la planta de energia para no frenar la produccion',
          'Reserva un excedente y publicalo en el mercado P2P',
          'Completa las misiones diarias para acelerar el arranque',
          'Retira tus tokens TUNG a tu wallet cuando quieras',
        ],
      ],
      ['h2', 'Errores Comunes'],
      [
        'p',
        'Los dos fallos mas frecuentes son gastar todos los recursos en flota antes de tener produccion y vender siempre al precio mas bajo del mercado. La produccion es tu ingreso base y el precio es tu margen: cuida los dos.',
      ],
    ],
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/falco-x-vs-ogame-comparativa',
    title: 'Imperium vs OGame | Comparativa Completa: Cual es Mejor en 2026',
    description:
      'Comparamos Imperium y OGame: jugabilidad, economia, comunidad y recompensas. Descubre por que Imperium es la alternativa a OGame que si paga.',
    keywords:
      'Imperium vs OGame, comparativa OGame, alternativa a OGame, OGame con crypto, juego como OGame, mejor juego tipo OGame, OGame blockchain',
    h1: 'Imperium vs OGame: Comparativa Completa de Dos Juegos de Estrategia Espacial',
    body: [
      ['h2', 'Que Comparten Imperium y OGame'],
      [
        'p',
        'Ambos son juegos de estrategia espacial de navegador con la misma base: metal, cristal y deuterio, minas que producen con el tiempo, investigacion tecnologica, astillero, flotas, defensas, colonizacion de planetas y alianzas. Si sabes jugar a OGame, sabes jugar a Imperium.',
      ],
      ['h2', 'La Gran Diferencia: la Economia'],
      [
        'p',
        'En OGame los recursos solo sirven dentro del juego. En Imperium existe un mercado P2P donde los vendes a otros jugadores por tokens TUNG que puedes retirar. Eso convierte cada hora de produccion en un ingreso potencial en lugar de en un numero.',
      ],
      ['h2', 'Comparativa Rapida'],
      [
        'ul',
        [
          'Precio de entrada: ambos gratis, pero Imperium no exige ventajas de pago',
          'Recompensas reales: OGame no, Imperium si mediante el token TUNG',
          'Mercado entre jugadores: OGame limitado, Imperium mercado P2P completo',
          'Interfaz: OGame clasica, Imperium moderna y adaptada a movil',
          'Curva de aprendizaje: practicamente identica',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/mejores-juegos-play-to-earn-gratis-2026',
    title: 'Mejores Juegos Play to Earn Gratis 2026 | Sin Inversion',
    description:
      'Ranking de los mejores juegos play to earn gratis de 2026 sin inversion inicial. Analizamos recompensas, sostenibilidad y facilidad para retirar.',
    keywords:
      'mejores juegos play to earn, P2E gratis 2026, juegos para ganar dinero sin invertir, mejores juegos crypto gratis, free play to earn, Imperium',
    h1: 'Los Mejores Juegos Play to Earn Gratis de 2026 (Sin Inversion Inicial)',
    body: [
      ['h2', 'Que Hace Bueno a un Juego Play to Earn'],
      [
        'p',
        'Un buen P2E gratuito cumple tres cosas: no exige comprar nada para empezar, tiene una economia que no depende solo de que entren jugadores nuevos, y permite retirar de verdad. La mayoria de titulos falla en al menos uno de los tres puntos.',
      ],
      ['h2', 'Por Que Imperium Entra en el Top'],
      [
        'p',
        'Imperium es free-to-play real y su economia se apoya en un bien producido dentro del juego: los recursos. Como existe demanda entre jugadores para acelerar construcciones y flotas, el mercado tiene sentido economico propio y no depende de recompensas infladas.',
      ],
      ['h2', 'Criterios de Nuestro Ranking'],
      [
        'ul',
        [
          'Coste de entrada real, sin NFTs ni staking obligatorio',
          'Facilidad y coste de retiro',
          'Profundidad de la jugabilidad',
          'Sostenibilidad de la economia interna',
          'Comunidad activa y soporte',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/guia-principiantes-falco-x',
    title: 'Guia para Principiantes de Imperium | Tus Primeras 48 Horas',
    description:
      'Guia de inicio en Imperium: que construir primero, como no bloquear tu produccion y como conseguir tus primeros tokens TUNG vendiendo recursos.',
    keywords:
      'guia Imperium principiantes, como empezar en Imperium, tutorial Imperium, primeros pasos Imperium, guia juego tipo OGame, tutorial P2E espanol',
    h1: 'Guia para Principiantes de Imperium: Tus Primeras 48 Horas de Juego',
    body: [
      ['h2', 'Orden de Construccion Recomendado'],
      [
        'p',
        'Prioriza mina de metal y mina de cristal, y sube la planta de energia en cuanto la produccion se resienta. El deuterio puede esperar a que tengas el resto encaminado. Este orden maximiza tu produccion por hora, que es la base de todos tus ingresos.',
      ],
      ['h2', 'Tu Primera Venta en el Mercado'],
      [
        'p',
        'En cuanto tengas excedente de metal, publica una oferta en el mercado P2P. No hace falta esperar a acumular mucho: vender pronto te da tokens TUNG con los que entender como funciona el sistema y como se mueven los precios.',
      ],
      ['h2', 'Consejos Rapidos'],
      [
        'ul',
        [
          'Completa las misiones diarias, son la mejor relacion tiempo-recompensa al principio',
          'Unete a una alianza cuanto antes: las bonificaciones son grandes',
          'No dejes recursos parados en el planeta si no los vas a usar',
          'Revisa el precio medio del mercado antes de publicar una oferta',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/como-retirar-ganancias-crypto-falco-x',
    title: 'Como Retirar tus Ganancias en Imperium | Guia de Retiros TUNG',
    description:
      'Aprende a retirar tus tokens TUNG de Imperium a tu wallet: requisitos, comisiones, tiempos de confirmacion y errores frecuentes al cobrar.',
    keywords:
      'retirar ganancias Imperium, como cobrar en Imperium, retirar tokens TUNG, wallet crypto gaming, cash out P2E, retirar dinero del juego',
    h1: 'Como Retirar tus Ganancias Crypto en Imperium: Guia Completa de Retiros',
    body: [
      ['h2', 'Antes de Retirar'],
      [
        'p',
        'Necesitas una wallet compatible con la red BSC, como MetaMask o Trust Wallet, y saldo de tokens TUNG en tu cuenta. Comprueba siempre que la direccion que pegas es la tuya y que corresponde a la red correcta.',
      ],
      ['h2', 'Pasos del Retiro'],
      [
        'ul',
        [
          'Abre la seccion de wallet dentro de Imperium',
          'Selecciona retirar e introduce el importe en TUNG',
          'Pega tu direccion de wallet en red BSC',
          'Confirma la operacion y espera la confirmacion en cadena',
          'Verifica la transaccion en el explorador de bloques',
        ],
      ],
      ['h2', 'Errores Frecuentes'],
      [
        'p',
        'El error mas comun es enviar a una direccion de otra red. Tambien conviene no retirar importes minimos de forma repetida: agrupar retiros reduce el impacto de las comisiones de red sobre tus ganancias.',
      ],
    ],
    ogType: 'article',
    priority: 0.7,
  },
  {
    path: '/blog/estrategia-avanzada-alianzas-falco-x',
    title: 'Estrategia Avanzada de Alianzas en Imperium | Domina el Universo',
    description:
      'Tacticas avanzadas de alianzas en Imperium: coordinacion de ataques, comercio interno, defensa mutua y diplomacia para multiplicar tus ganancias.',
    keywords:
      'alianzas Imperium, estrategia avanzada Imperium, guerra de alianzas, diplomacia gaming, estrategia MMORTS, tacticas juego tipo OGame',
    h1: 'Estrategia Avanzada de Alianzas en Imperium: Coordinacion, Comercio y Guerra',
    body: [
      ['h2', 'Por Que la Alianza Multiplica tus Ingresos'],
      [
        'p',
        'Una alianza activa te da tres cosas que no consigues en solitario: proteccion frente a ataques, acceso a comercio interno en mejores condiciones y participacion en eventos y guerras con recompensas superiores. En la practica, un jugador en alianza produce y conserva mucho mas.',
      ],
      ['h2', 'Comercio Interno'],
      [
        'p',
        'Dentro de la alianza conviene repartir especializacion: unos miembros centrados en metal, otros en cristal y otros en deuterio. El intercambio interno reduce cuellos de botella y deja mas excedente para vender en el mercado P2P por tokens TUNG.',
      ],
      ['h2', 'Coordinacion de Ataques y Defensa'],
      [
        'ul',
        [
          'Sincroniza los tiempos de llegada de flota para golpear a la vez',
          'Comparte informes de espionaje antes de comprometer naves',
          'Manten una flota de defensa comun para responder rapido',
          'Evita guerras largas contra alianzas muy superiores',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.7,
  },
  {
    path: '/blog/blockchain-gaming-que-es-como-funciona',
    title: 'Blockchain Gaming: Que Es y Como Funciona | Guia 2026',
    description:
      'Que es el blockchain gaming y como funciona: GameFi, play to earn, tokens de juego y como distinguir un P2E sostenible de uno insostenible.',
    keywords:
      'blockchain gaming, que es blockchain gaming, como funciona GameFi, play to earn explicado, web3 gaming, crypto gaming, tokens de juego',
    h1: 'Blockchain Gaming: Que Es, Como Funciona y Como Genera Ingresos',
    body: [
      ['h2', 'La Idea Central'],
      [
        'p',
        'El blockchain gaming consiste en registrar parte de la economia de un juego en una cadena publica. Eso permite que objetos, monedas o recompensas existan fuera del servidor del juego y puedan intercambiarse por valor real.',
      ],
      ['h2', 'Play to Earn Sostenible vs Insostenible'],
      [
        'p',
        'Un P2E es sostenible cuando lo que ganas proviene de una demanda real dentro del juego, no unicamente de la entrada de jugadores nuevos. En Imperium, por ejemplo, los recursos se compran porque otros jugadores los necesitan para construir y avanzar.',
      ],
      ['h2', 'Que Mirar Antes de Empezar'],
      [
        'ul',
        [
          'Si exige inversion inicial obligatoria',
          'De donde sale realmente el valor que reparte',
          'Si los retiros funcionan y cuanto cuestan',
          'Si el juego seria divertido sin la parte crypto',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.7,
  },
  {
    path: '/blog/ganar-dinero-jugando-desde-casa',
    title: 'Generar Ingresos Gratis Jugando desde Casa | Guia Realista',
    description:
      'Guia honesta para generar ingresos gratis jugando desde casa: metodos que funcionan, expectativas realistas y como evitar estafas.',
    keywords:
      'generar ingresos gratis, ganar dinero jugando desde casa, ganar dinero online sin invertir, play to earn realista, ingresos extra jugando',
    h1: 'Generar Ingresos Gratis Jugando desde Casa: Guia Realista para 2026',
    body: [
      ['h2', 'Expectativas Realistas'],
      [
        'p',
        'Generar ingresos jugando es posible, pero no es dinero rapido. Lo que si funciona es tratarlo como una actividad con constancia: dedicar un rato al dia, optimizar la produccion y vender bien. Cualquier plataforma que prometa ganancias enormes inmediatas deberia hacerte desconfiar.',
      ],
      ['h2', 'El Modelo de Imperium'],
      [
        'p',
        'En Imperium el ingreso viene de algo concreto: tus minas producen recursos sin coste y hay jugadores dispuestos a comprarlos. Tu margen depende de cuanto produzcas y de lo bien que vendas, no de reclutar gente.',
      ],
      ['h2', 'Senales de Alarma'],
      [
        'ul',
        [
          'Te piden invertir antes de poder ganar nada',
          'Los ingresos dependen solo de invitar a otros',
          'No hay forma clara ni verificable de retirar',
          'Prometen rentabilidades fijas garantizadas',
        ],
      ],
    ],
    ogType: 'article',
    priority: 0.7,
  },
  {
    path: '/blog/novedades-xnova-octubre-2026',
    title: 'Novedades Imperium Octubre 2026 | Casino, Batalla de Naves y Apuestas',
    description:
      'Todas las novedades de Imperium: Casino Galactico, Batalla de Naves PvP, apuestas de futbol, Fortalezas, Planeta del Tesoro, asistente IA NOVA y alertas en Telegram.',
    keywords:
      'novedades Imperium, actualizacion Imperium, Imperium octubre 2026, casino crypto, batalla de naves online, apuestas deportivas crypto, juego tipo OGame novedades',
    h1: 'Novedades de Imperium Octubre 2026: Casino, Batalla de Naves, Apuestas Deportivas y Mas',
    body: [
      ['h2', 'La Nueva Zona de Juegos en el Sistema 3:250'],
      [
        'p',
        'En la vista de Galaxia, el sistema 3:250 concentra la nueva zona de juegos de Imperium: el Casino Galactico, la Batalla de Naves y el Estadio de apuestas deportivas. Todos usan el saldo TUNG que ya tienes dentro del juego.',
      ],
      ['h2', 'Que Hay de Nuevo'],
      [
        'ul',
        [
          'Casino Galactico: ruleta europea, tragamonedas, dados Sic Bo, loteria semanal y rifa',
          'Batalla de Naves: hundir la flota PvP con apuestas, pool diario Top 5 y modo practica gratis',
          'Apuestas deportivas de futbol con sistema parimutuel 1X2',
          'Fortalezas de Alianza y Planeta del Tesoro con pools mensuales',
          'NOVA, asistente de inteligencia artificial dentro del juego',
          'Alertas en Telegram de ataques, espionajes y reportes de combate',
        ],
      ],
      ['h2', 'Como Probarlo'],
      [
        'p',
        'Registrate gratis en Imperium, abre la vista de Galaxia y visita el sistema 3:250. Si ya juegas, todas las novedades estan disponibles en tu cuenta.',
      ],
    ],
    faqs: [
      {
        q: 'Que novedades tiene Imperium en octubre de 2026?',
        a: 'Casino Galactico con ruleta, tragamonedas, dados, loteria y rifa; Batalla de Naves PvP; apuestas deportivas de futbol; Fortalezas de Alianza y Planeta del Tesoro; el asistente IA NOVA y alertas en Telegram.',
      },
      {
        q: 'Donde estan los nuevos juegos de Imperium?',
        a: 'En la Galaxia 3, sistema 250: el Estadio en la posicion 4, la Batalla de Naves en la 6 y el Casino Galactico en la 10.',
      },
      {
        q: 'Hace falta pagar para probar las novedades?',
        a: 'No. Imperium es gratis y la Batalla de Naves tiene un modo practica gratuito contra la IA.',
      },
    ],
    datePublished: '2026-10-08',
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/batalla-de-naves-online-xnova',
    title: 'Hundir la Flota Online con Apuestas | Batalla de Naves Imperium',
    description:
      'Juega a hundir la flota online PvP en Imperium: apuestas en TUNG, el ganador cobra 1,8x, pool diario Top 5, modo practica gratis contra la IA y consejos para ganar.',
    keywords:
      'hundir la flota online, batalla naval online, batalla de naves crypto, battleship online apuestas, hundir la flota multijugador, juego batalla naval gana dinero, Imperium',
    h1: 'Batalla de Naves en Imperium: Juega a Hundir la Flota Online y Gana TUNG',
    body: [
      ['h2', 'Como Funciona la Apuesta'],
      [
        'p',
        'La apuesta se elige en dolares y se cobra en TUNG. Los dos jugadores apuestan lo mismo y solo paga comision el que pierde: el 20% de su apuesta. El ganador cobra 1,8 veces su apuesta, por ejemplo 18 USD en TUNG con una apuesta de 10 USD.',
      ],
      ['h2', 'Como Jugar'],
      [
        'ul',
        [
          'Crea una sala publica o privada con codigo, o unete a una del lobby',
          'Coloca 6 naves (18 casillas) en un tablero de 10x10 en 90 segundos',
          'Dispara por turnos: 30 segundos por turno',
          'Gana quien hunde primero toda la flota rival',
          'Si nadie se une, la sala caduca a los 15 minutos y se devuelve la apuesta',
        ],
      ],
      ['h2', 'Pool Diario Top 5 y Modo Practica'],
      [
        'p',
        'Cada dia a las 00:00 UTC se reparte un pool entre los 5 mejores del ranking diario: 40%, 25%, 15%, 12% y 8%. Con el boton Entrenar contra la IA puedes practicar gratis sin apostar nada.',
      ],
    ],
    faqs: [
      {
        q: 'Cuanto se gana en la Batalla de Naves de Imperium?',
        a: 'El ganador cobra 1,8 veces su apuesta. Solo el perdedor paga una comision del 20% de su apuesta.',
      },
      {
        q: 'Se puede jugar gratis a hundir la flota en Imperium?',
        a: 'Si. El modo Entrenar contra la IA es gratuito, aunque no suma ranking ni premios.',
      },
      {
        q: 'Que pasa si nadie se une a mi sala?',
        a: 'La sala caduca a los 15 minutos y se te devuelve la apuesta.',
      },
    ],
    datePublished: '2026-10-08',
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/casino-galactico-xnova-ruleta-tragamonedas-dados',
    title: 'Casino Crypto Imperium | Ruleta, Tragamonedas, Dados, Loteria y Rifa',
    description:
      'Como funciona el Casino Galactico de Imperium: ruleta europea, tragamonedas, dados Sic Bo, loteria semanal y rifa con TUNG. Premios, multiplicadores y limites.',
    keywords:
      'casino crypto, ruleta crypto, tragamonedas crypto, dados sic bo online, loteria crypto, rifa online, casino con tokens, Imperium casino',
    h1: 'Casino Galactico de Imperium: Ruleta, Tragamonedas, Dados, Loteria y Rifa con TUNG',
    body: [
      ['h2', 'Reglas Comunes'],
      [
        'p',
        'El Casino Galactico esta en el planeta 3:250:10 y esta abierto a todos los jugadores. La casa retiene un 20% de cada apuesta y el premio se calcula como apuesta x 0,8 x multiplicador. El premio maximo por tirada es el 10% del banco del juego y los numeros aleatorios se generan en el servidor.',
      ],
      ['h2', 'Juegos Disponibles'],
      [
        'ul',
        [
          'Ruleta europea del 0 al 36: pleno x36, docena x3, rojo/negro y par/impar x2',
          'Tragamonedas de 3 rodillos: tres cohetes pagan el jackpot x50',
          'Dados Sic Bo: chico/grande x2, total exacto hasta x61, triple concreto x181',
          'Loteria semanal: 4 numeros del 1 al 30 con bote acumulado',
          'Rifa Galactica: premios como naves, planos, oficiales, VIP o TUNG',
        ],
      ],
      ['h2', 'Juega con Cabeza'],
      [
        'p',
        'El casino es entretenimiento, no una fuente de ingresos. Apuesta solo el TUNG que estes dispuesto a perder. La forma constante de generar ingresos en Imperium es producir recursos y venderlos en el mercado P2P.',
      ],
    ],
    faqs: [
      {
        q: 'Cuanto paga la ruleta del Casino de Imperium?',
        a: 'El premio es apuesta x 0,8 x multiplicador. Un pleno paga x36: 10 TUNG pagan 288. Rojo o negro paga x2: 10 TUNG pagan 16.',
      },
      {
        q: 'Como funciona la loteria de Imperium?',
        a: 'Eliges 4 numeros del 1 al 30. El sorteo es semanal; con 4 aciertos ganas el bote y con 3 o 2 aciertos un premio fijo. Si nadie acierta los 4, el bote se acumula.',
      },
      {
        q: 'Hay que pagar para entrar al Casino?',
        a: 'No. El Casino esta abierto a todos los jugadores y se juega con el saldo TUNG que tengas en el juego.',
      },
    ],
    datePublished: '2026-10-08',
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/apuestas-deportivas-futbol-xnova',
    title: 'Apuestas Deportivas Crypto de Futbol | Parimutuel en Imperium',
    description:
      'Apuesta TUNG a la Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y Champions en Imperium. Como funciona el sistema parimutuel 1X2, ejemplos de pago y devoluciones.',
    keywords:
      'apuestas deportivas crypto, apuestas futbol crypto, apuestas parimutuel, apostar LaLiga crypto, apostar Champions con criptomonedas, apuestas 1X2, Imperium estadio',
    h1: 'Apuestas Deportivas de Futbol en Imperium: Sistema Parimutuel con TUNG',
    body: [
      ['h2', 'Ligas y Mercado'],
      [
        'p',
        'En el Estadio de Imperium (planeta 3:250:4) se apuesta a partidos reales de Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y Champions League con el mercado 1X2. Cuenta el resultado a los 90 minutos.',
      ],
      ['h2', 'Sistema Parimutuel'],
      [
        'p',
        'No hay cuotas fijas de la casa: quienes aciertan se reparten el dinero de quienes fallan, en proporcion a lo apostado. La comision es el 20% del bote, pero nunca mas que el dinero de los perdedores, asi que si aciertas nunca pierdes tu apuesta.',
      ],
      ['h2', 'Devoluciones'],
      [
        'ul',
        [
          'Si nadie acierta, se devuelve el 80% a todos los apostantes',
          'Si el partido se cancela o se aplaza mas de 48 horas, se devuelve el 100%',
          'Las apuestas se liquidan solas y el resultado llega al juego y a Telegram',
        ],
      ],
    ],
    faqs: [
      {
        q: 'Que ligas se pueden apostar en Imperium?',
        a: 'Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y Champions League, con el mercado 1X2 a 90 minutos.',
      },
      {
        q: 'Que es una apuesta parimutuel?',
        a: 'Todo lo apostado forma un bote y quienes aciertan se reparten el dinero de quienes fallan. Ejemplo: bote de 1000 TUNG con 300 al ganador; quien puso 30 TUNG cobra 100.',
      },
      {
        q: 'Que pasa si el partido se aplaza?',
        a: 'Si se cancela o se aplaza mas de 48 horas se devuelve el 100% de la apuesta.',
      },
    ],
    datePublished: '2026-10-08',
    ogType: 'article',
    priority: 0.8,
  },
  {
    path: '/blog/fortalezas-alianza-planeta-tesoro-xnova',
    title: 'Fortalezas de Alianza y Planeta del Tesoro | Guia Imperium',
    description:
      'Como atacar, capturar y defender las Fortalezas (250:8) y el Planeta del Tesoro (250:9) en Imperium: requisitos, refuerzos, avisos de ataque y pools mensuales.',
    keywords:
      'fortaleza alianza Imperium, planeta del tesoro Imperium, conquistar fortaleza OGame, contenido de alianza, pool de alianza, estrategia alianzas juego espacial',
    h1: 'Fortalezas de Alianza y Planeta del Tesoro en Imperium: Guia Completa',
    body: [
      ['h2', 'Donde Estan'],
      [
        'p',
        'Cada galaxia tiene una Fortaleza de Alianza en la posicion 250:8 y un Planeta del Tesoro en la posicion 250:9. Se atacan desde la pagina de Flotas con la mision Atacar, con las reglas normales de distancia, velocidad y consumo.',
      ],
      ['h2', 'Captura y Defensa'],
      [
        'ul',
        [
          'Si no tiene dueno, el atacante la captura directamente',
          'Si ya tiene dueno, hay combate contra las naves desplegadas',
          'Solo puede reclamarla un jugador que pertenezca a una alianza',
          'Los miembros pueden enviar refuerzos y retirarlos con Recoger Todo',
          'La alianza ve el aviso de ataque entrante en la Vista General',
        ],
      ],
      ['h2', 'Recompensas'],
      [
        'p',
        'Hay un Pool de Fortaleza y un Pool del Planeta del Tesoro que se reparten cada mes entre los miembros de las alianzas propietarias, segun los pesos por rango y con un minimo garantizado.',
      ],
    ],
    faqs: [
      {
        q: 'Donde esta la Fortaleza de Alianza en Imperium?',
        a: 'Hay una por galaxia en la posicion 250:8. El Planeta del Tesoro esta en la posicion 250:9.',
      },
      {
        q: 'Como se captura una Fortaleza?',
        a: 'Enviando una flota con la mision Atacar. Si no tiene dueno se captura directamente; si lo tiene hay que ganar el combate. Es necesario estar en una alianza.',
      },
      {
        q: 'Que se gana controlando una Fortaleza o el Planeta del Tesoro?',
        a: 'Acceso a pools de premios que se reparten mensualmente entre los miembros de la alianza propietaria.',
      },
    ],
    datePublished: '2026-10-08',
    ogType: 'article',
    priority: 0.8,
  },

  // ===== SEO LANDING PAGES =====
  {
    path: '/ganar-criptomonedas-jugando',
    title: 'Ganar Criptomonedas Jugando Gratis | Imperium',
    description:
      'Gana criptomonedas jugando gratis en Imperium. Produce recursos con tus minas, vendelos en el mercado P2P y retira tus tokens TUNG sin invertir nada.',
    keywords:
      'ganar criptomonedas jugando, como ganar crypto de manera gratis, ganar crypto gratis, juegos para ganar crypto, earn crypto playing, Imperium',
    h1: 'Gana Criptomonedas Jugando Gratis con Imperium',
    body: [
      ['h2', 'Como se Gana Crypto en Imperium'],
      [
        'p',
        'En Imperium las criptomonedas no aparecen de la nada: las ganas convirtiendo produccion en ventas. Tus minas generan metal, cristal y deuterio de forma continua y el mercado P2P te permite venderlos a otros jugadores a cambio de tokens TUNG retirables.',
      ],
      ['h2', 'Fuentes de Ingreso'],
      [
        'ul',
        [
          'Venta de recursos en el mercado P2P',
          'Misiones diarias y premium',
          'Expediciones y hallazgos',
          'Botin de batallas ganadas',
          'Comisiones por referidos',
          'Jackpot y pools de premios',
        ],
      ],
    ],
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    path: '/juegos-play-to-earn-gratis',
    title: 'Juegos Play to Earn Gratis Sin Inversion | Imperium',
    description:
      'Imperium es un juego play to earn gratis sin inversion: produce recursos, vendelos en el mercado y gana criptomonedas reales sin depositar dinero.',
    keywords:
      'juegos play to earn gratis, P2E sin inversion, free play to earn, juegos para ganar dinero sin pagar, mejores juegos crypto gratis, Imperium',
    h1: 'Juegos Play to Earn Gratis Sin Inversion: Empieza con Imperium',
    body: [
      ['h2', 'Gratis de Verdad, Sin Letra Pequena'],
      [
        'p',
        'Muchos juegos que se anuncian como play to earn gratuitos exigen comprar un NFT o bloquear tokens antes de ganar nada. Imperium no: te registras, construyes tus primeras minas y ya estas produciendo algo que puedes vender.',
      ],
      ['h2', 'Que lo Diferencia'],
      [
        'p',
        'Imperium no es un clicker. Es un juego de estrategia espacial tipo OGame con gestion de recursos, investigacion, flotas, combate y alianzas. La recompensa economica llega como consecuencia de jugar bien, no de pulsar un boton.',
      ],
    ],
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    path: '/alternativa-ogame-crypto',
    title: 'Alternativa a OGame con Criptomonedas | Imperium',
    description:
      'Imperium es la alternativa a OGame con criptomonedas: la misma estrategia espacial que conoces, pero tus recursos se venden por dinero real.',
    keywords:
      'alternativa a OGame, OGame con crypto, juego como OGame, juego tipo OGame, OGame blockchain, Imperium ogame, space strategy crypto',
    h1: 'La Alternativa a OGame con Criptomonedas se Llama Imperium',
    body: [
      ['h2', 'Todo lo que Ya Conoces de OGame'],
      [
        'p',
        'Metal, cristal y deuterio. Minas que suben de nivel. Laboratorio de investigacion, astillero, flotas, defensas, galaxia, expediciones y alianzas. Imperium conserva la estructura que hizo grande a OGame, con una interfaz moderna y jugable desde el movil.',
      ],
      ['h2', 'Lo que OGame No Tiene'],
      [
        'p',
        'Un mercado P2P donde tus recursos se venden por tokens TUNG y una wallet integrada desde la que retirarlos. En Imperium el tiempo que inviertes produciendo tiene una salida economica real.',
      ],
    ],
    priority: 0.85,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-dinero-jugando',
    title: 'Ganar Dinero Jugando Gratis desde Casa | Imperium',
    description:
      'Gana dinero jugando gratis desde casa con Imperium. Sin inversion y sin descargas: produce recursos, vendelos en el mercado y cobra en cripto.',
    keywords:
      'ganar dinero jugando, generar ingresos gratis, ganar dinero desde casa sin invertir, juegos que pagan, ganar dinero online gratis, Imperium',
    h1: 'Gana Dinero Jugando Gratis desde Casa con Imperium',
    body: [
      ['h2', 'De Jugar a Cobrar'],
      [
        'p',
        'El circuito es corto y transparente: tus minas producen recursos, publicas una oferta en el mercado, otro jugador compra y recibes tokens TUNG. Desde la wallet integrada retiras esos tokens y los conviertes en dinero.',
      ],
      ['h2', 'Sin Barreras de Entrada'],
      [
        'p',
        'No hace falta invertir, ni descargar nada, ni tener conocimientos previos de criptomonedas. Solo necesitas un navegador y algo de constancia para hacer crecer tu produccion.',
      ],
    ],
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    path: '/generar-ingresos-gratis',
    title: 'Como Generar Ingresos Gratis en 2026 | Imperium',
    description:
      'Como generar ingresos gratis sin invertir: produce recursos en Imperium, vendelos en el mercado P2P y convierte tu tiempo en criptomonedas reales.',
    keywords:
      'como generar ingresos gratis, generar ingresos gratis, ingresos sin invertir, ganar dinero gratis por internet, ingresos pasivos gratis, Imperium',
    h1: 'Como Generar Ingresos Gratis en 2026 sin Invertir Dinero',
    body: [
      ['h2', 'El Problema de la Mayoria de Metodos'],
      [
        'p',
        'Casi todo lo que se anuncia como forma de generar ingresos gratis acaba pidiendo dinero: un curso, una licencia, un paquete inicial. La alternativa honesta es empezar con algo que produzca valor sin coste para ti.',
      ],
      ['h2', 'Produccion Gratuita, Venta Real'],
      [
        'p',
        'En Imperium tus minas producen metal, cristal y deuterio de forma automatica y sin coste. Ese material tiene demanda: otros jugadores lo necesitan para construir y avanzar mas rapido. Al venderlo en el mercado P2P recibes tokens TUNG que puedes retirar.',
      ],
      ['h2', 'Por Que Funciona'],
      [
        'ul',
        [
          'No requiere capital inicial de ningun tipo',
          'La produccion continua incluso desconectado',
          'El valor viene de demanda real entre jugadores',
          'Puedes retirar cuando quieras a tu wallet',
          'Escala: cuanto mas subes tus minas, mas vendes',
        ],
      ],
    ],
    priority: 0.9,
    changefreq: 'weekly',
  },
  {
    path: '/vender-recursos-ganar-dinero',
    title: 'Vender Recursos y Ganar Dinero Gratis | Mercado de Imperium',
    description:
      'Aprende a vender recursos en el mercado P2P de Imperium y ganar dinero gratis: precios, margen, estrategia y retiro de tus tokens TUNG.',
    keywords:
      'vender recursos y ganar dinero, mercado P2P de recursos, ganar dinero vendiendo recursos, mercado Imperium, comerciar recursos crypto, token TUNG',
    h1: 'Vender Recursos en el Mercado y Ganar Dinero Gratis en Imperium',
    body: [
      ['h2', 'El Mercado es Donde se Gana el Dinero'],
      [
        'p',
        'Construir y combatir es divertido, pero el dinero real en Imperium se genera en el mercado P2P. Ahi conviertes metal, cristal y deuterio, que producir no te cuesta nada, en tokens TUNG que puedes retirar a tu wallet.',
      ],
      ['h2', 'Como Funciona una Venta'],
      [
        'ul',
        [
          'Acumula excedente de un recurso concreto',
          'Consulta el precio medio al que se esta vendiendo',
          'Publica tu oferta indicando cantidad y precio',
          'Otro jugador la compra y recibes los tokens al instante',
          'Retira tus tokens TUNG desde la wallet integrada',
        ],
      ],
      ['h2', 'Estrategia de Precios'],
      [
        'p',
        'Vender siempre al precio mas bajo llena rapido pero deja poco margen. Vender muy por encima puede dejar tu oferta parada. La practica habitual es situarse ligeramente por debajo del precio medio cuando quieres liquidez y por encima cuando el recurso escasea.',
      ],
      ['h2', 'Especializate para Vender Mas'],
      [
        'p',
        'Concentrar tus mejoras en un recurso concreto te convierte en proveedor de referencia de ese material. Combinado con una alianza que cubra los otros recursos, tu excedente vendible crece mucho mas rapido.',
      ],
    ],
    priority: 0.95,
    changefreq: 'weekly',
  },
  {
    path: '/5-pasos-para-ganar-criptomonedas',
    title: '5 Pasos para Ganar Criptomonedas Gratis | Guia Imperium',
    description:
      'Cinco pasos para ganar criptomonedas gratis en Imperium: registrarte, construir minas, vender recursos, expandirte y retirar tus tokens TUNG.',
    keywords:
      '5 pasos para ganar criptomonedas, como ganar crypto rapido, empezar play to earn, guia ganar criptomonedas, tutorial crypto gaming, Imperium',
    h1: '5 Pasos para Ganar Criptomonedas Gratis Jugando a Imperium',
    body: [
      ['h2', 'La Ruta Completa'],
      [
        'ul',
        [
          'Paso 1: registrate gratis en Imperium, solo con email y contrasena',
          'Paso 2: construye tus primeras minas de metal y cristal',
          'Paso 3: vende tu excedente en el mercado P2P por tokens TUNG',
          'Paso 4: expande tu imperio y unete a una alianza para producir mas',
          'Paso 5: retira tus tokens TUNG a tu wallet cuando quieras',
        ],
      ],
      ['h2', 'Cuanto Tarda'],
      [
        'p',
        'Puedes tener tu primera venta el mismo dia que empiezas. El crecimiento real llega despues, cuando tus minas suben de nivel y tu excedente vendible se multiplica.',
      ],
    ],
    priority: 0.9,
    changefreq: 'weekly',
  },

  // ===== ROADMAP =====
  {
    path: '/roadmap',
    title: 'Roadmap de Imperium | Plan de Desarrollo y Futuro del Juego',
    description:
      'Roadmap de Imperium: proximas funcionalidades, mejoras del mercado P2P, integraciones blockchain y evolucion del juego tipo OGame.',
    keywords:
      'roadmap Imperium, plan de desarrollo Imperium, futuro de Imperium, proximas actualizaciones, crypto game roadmap',
    h1: 'Roadmap de Imperium: Plan de Desarrollo y Proximas Funcionalidades',
    body: [
      ['h2', 'Hacia Donde Va Imperium'],
      [
        'p',
        'El desarrollo de Imperium se centra en tres ejes: profundizar la economia del mercado P2P, ampliar el contenido estrategico del juego y mejorar la experiencia en movil. Cada actualizacion se publica junto a sus notas de version.',
      ],
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },

  // ===== LANDINGS POR PAIS =====
  // Contenido propio por pais (moneda, metodos de pago reales del mercado P2P
  // y contexto local). No son copias con el nombre cambiado.
  {
    path: '/ganar-criptomonedas-jugando-argentina',
    title: 'Ganar Criptomonedas Jugando en Argentina Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Argentina sin invertir: produce recursos, vendelos en el mercado P2P y cobra en USDT o en pesos por transferencia.',
    keywords:
      'ganar criptomonedas jugando argentina, ganar dolares jugando argentina, ganar usdt gratis argentina, ganar dinero por internet argentina sin invertir, juegos play to earn argentina, xnova argentina',
    h1: 'Ganar Criptomonedas Jugando en Argentina, Gratis y sin Invertir',
    body: [
      ['h2', 'Por que funciona especialmente bien en Argentina'],
      [
        'p',
        'En Argentina el problema no es ganar pesos, es que los pesos pierden valor mientras estan en la cuenta. Imperium paga en tokens convertibles a USDT, una stablecoin anclada al dolar, asi que lo que ganas conserva su valor. El juego es gratuito: te registras, subes tus minas de metal, cristal y deuterio y esas minas producen las 24 horas aunque cierres el navegador.',
      ],
      ['h2', 'Como cobrar desde Argentina'],
      [
        'p',
        'Tienes dos caminos. El primero es vender contra USDT dentro del juego y retirar la stablecoin a tu wallet. El segundo es usar el metodo Pago / Transferencia (ARS) del mercado P2P: otro jugador te transfiere pesos y tu liberas los tokens. Los fondos quedan retenidos en garantia hasta que confirmas que recibiste el pago.',
      ],
      ['h2', 'Cuanto tiempo hay que dedicarle'],
      [
        'p',
        'Imperium no es un clicker. La produccion es pasiva y corre sola: con quince o veinte minutos al dia para revisar minas, ajustar precios y lanzar expediciones alcanza. Los que mas ganan no son los que mas horas juegan, sino los que mejor administran su economia.',
      ],
    ],
    faqs: [
      {
        q: 'Se puede jugar a Imperium desde Argentina sin restricciones?',
        a: 'Si. Imperium funciona desde el navegador en cualquier pais y no hay bloqueo geografico para Argentina.',
      },
      {
        q: 'En que moneda cobro si juego desde Argentina?',
        a: 'Ganas tokens TUNG dentro del juego. Puedes convertirlos a USDT y retirarlos a tu wallet, o venderlos en el mercado P2P a jugadores que pagan en pesos argentinos por transferencia.',
      },
      {
        q: 'Hay que pagar algo para retirar?',
        a: 'No hay cuota de suscripcion ni deposito minimo. El retiro solo tiene la comision de red de la blockchain.',
      },
      {
        q: 'Es seguro vender por transferencia a otro jugador?',
        a: 'Si. Los tokens quedan retenidos por el sistema y solo se liberan cuando confirmas que recibiste el pago. Si hay un problema puedes abrir una disputa.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-mexico',
    title: 'Ganar Criptomonedas Jugando en Mexico Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Mexico sin invertir: tus minas producen recursos, los vendes en el mercado P2P y cobras en USDT o en pesos mexicanos.',
    keywords:
      'ganar criptomonedas jugando mexico, ganar dinero jugando mexico, ganar usdt gratis mexico, juegos que pagan dinero real mexico, play to earn mexico, xnova mexico',
    h1: 'Ganar Criptomonedas Jugando en Mexico, Gratis y sin Invertir',
    body: [
      ['h2', 'Un ingreso extra que no depende de tu tiempo'],
      [
        'p',
        'La mayoria de formas de ganar dinero por internet en Mexico pagan por hora trabajada. Imperium funciona distinto: tus minas de metal, cristal y deuterio producen las 24 horas, estes o no conectado. Tu trabajo es decidir en que invertir la produccion y a que precio venderla.',
      ],
      ['h2', 'Como se cobra desde Mexico'],
      [
        'p',
        'Dentro del juego ganas tokens TUNG. Puedes cambiarlos por USDT y retirarlos a tu wallet, o venderlos en el mercado P2P con el metodo Pago / Transferencia (MXN), donde otro jugador te deposita pesos mexicanos y tu liberas los tokens. Cada operacion pasa por garantia.',
      ],
      ['h2', 'Empieza sin gastar un peso'],
      [
        'p',
        'No hay compra de personajes, ni NFTs, ni deposito inicial. El registro es gratuito y desde el primer minuto ya tienes un planeta produciendo. Funciona en el navegador del celular sin descargar nada y consume muy pocos datos.',
      ],
    ],
    faqs: [
      {
        q: 'Necesito invertir dinero para empezar en Mexico?',
        a: 'No. El registro y el juego son gratuitos. Empiezas con un planeta que ya produce recursos vendibles.',
      },
      {
        q: 'Puedo cobrar en pesos mexicanos?',
        a: 'Si. El mercado P2P incluye el metodo Pago / Transferencia (MXN): vendes tus tokens a otro jugador que te transfiere pesos.',
      },
      {
        q: 'Cuanto tarda en llegar un retiro?',
        a: 'El retiro a wallet se procesa en blockchain y suele confirmarse en minutos. Las ventas P2P dependen de lo rapido que pague el comprador.',
      },
      {
        q: 'Que pasa si un comprador no paga?',
        a: 'La operacion expira y tus tokens vuelven a ti automaticamente. Tambien puedes abrir una disputa.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-venezuela',
    title: 'Ganar Criptomonedas Jugando en Venezuela Gratis | Imperium',
    description:
      'Gana USDT jugando desde Venezuela sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en criptomonedas o en bolivares.',
    keywords:
      'ganar criptomonedas jugando venezuela, ganar dolares jugando venezuela, ganar usdt gratis venezuela, como ganar dinero por internet venezuela, play to earn venezuela, xnova venezuela',
    h1: 'Ganar Criptomonedas Jugando en Venezuela, Gratis y sin Invertir',
    body: [
      ['h2', 'Ganar en dolares sin salir de casa'],
      [
        'p',
        'En Venezuela el USDT ya es parte del dia a dia y el problema real es conseguirlo sin una fuente de ingresos en divisas. Imperium ofrece una produccion que no cuesta nada y que se vende en un mercado donde el precio se fija en dolares. No hace falta invertir ni tener cuenta en el exterior.',
      ],
      ['h2', 'El mercado P2P y los bolivares'],
      [
        'p',
        'Puedes convertir tus tokens TUNG a USDT y retirarlos a tu wallet, o venderlos a otro jugador con el metodo Pago / Transferencia (VES): el comprador te paga en bolivares y tu liberas los tokens cuando confirmas que el dinero llego. Todo con garantia.',
      ],
      ['h2', 'Pensado para conexiones lentas'],
      [
        'p',
        'Imperium es un juego de navegador ligero, sin graficos pesados ni descargas, asi que carga rapido y consume pocos datos. La produccion no se detiene si te desconectas: puedes entrar dos veces al dia, revisar, publicar ofertas y salir.',
      ],
    ],
    faqs: [
      {
        q: 'Puedo ganar USDT desde Venezuela sin invertir nada?',
        a: 'Si. El juego es gratuito y la produccion de tus minas no tiene coste. Vendes esa produccion y cobras en tokens convertibles a USDT.',
      },
      {
        q: 'Puedo cobrar en bolivares?',
        a: 'Si. El mercado P2P incluye el metodo Pago / Transferencia (VES) entre jugadores.',
      },
      {
        q: 'Consume muchos datos moviles?',
        a: 'No. Es un juego de navegador ligero, sin descargas ni graficos 3D, con un consumo de datos muy bajo.',
      },
      {
        q: 'Necesito una wallet para empezar?',
        a: 'No para jugar. Imperium ya incluye una wallet integrada; la externa solo hace falta para retirar.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-cuba',
    title: 'Ganar Criptomonedas Jugando en Cuba Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Cuba sin invertir: vende los recursos de tus minas en el mercado P2P y cobra en USDT, transferencia CUP, MLC o saldo movil.',
    keywords:
      'ganar criptomonedas jugando cuba, ganar dinero por internet cuba, ganar usdt en cuba, como ganar dinero en cuba sin invertir, saldo movil cuba, xnova cuba',
    h1: 'Ganar Criptomonedas Jugando en Cuba, Gratis y sin Invertir',
    body: [
      ['h2', 'Los metodos de pago que mas se usan en Cuba'],
      [
        'p',
        'Imperium es uno de los pocos juegos con mercado P2P donde los metodos de pago cubanos estan integrados de verdad. Ademas de USDT, el mercado incluye Transferencia CUP, Transferencia MLC y Saldo Movil, asi que puedes vender tus tokens y recibir directamente una transferencia en pesos cubanos, en MLC o una recarga de saldo movil.',
      ],
      ['h2', 'Un juego que no se come los datos'],
      [
        'p',
        'La conexion en Cuba es cara y limitada. Imperium corre entero en el navegador, sin descargas, con una interfaz ligera que consume muy pocos datos por sesion. Ademas la produccion es pasiva: te conectas, revisas minas, publicas una oferta y te desconectas.',
      ],
      ['h2', 'Como funciona la garantia'],
      [
        'p',
        'Cuando publicas una venta el sistema retiene tus tokens. El comprador paga por el metodo acordado, tu confirmas que recibiste el dinero y recien entonces se liberan. Si no paga dentro del plazo, la operacion se cancela y todo vuelve a tu cuenta. Para operar en el mercado hace falta tener el KYC aprobado.',
      ],
    ],
    faqs: [
      {
        q: 'Puedo cobrar en pesos cubanos o en saldo movil?',
        a: 'Si. El mercado P2P de Imperium incluye Transferencia CUP, Transferencia MLC y Saldo Movil como metodos de pago entre jugadores.',
      },
      {
        q: 'Imperium gasta muchos datos?',
        a: 'No. Es un juego de navegador sin descargas ni graficos pesados, pensado para funcionar bien con conexiones limitadas.',
      },
      {
        q: 'Hay que invertir para empezar a ganar?',
        a: 'No. El juego es gratuito y la produccion de tus minas no tiene coste. Puedes vender desde el primer dia.',
      },
      {
        q: 'Necesito verificacion para vender?',
        a: 'Para publicar ofertas en el mercado P2P necesitas el KYC aprobado. Es un requisito de seguridad para ambas partes.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-colombia',
    title: 'Ganar Criptomonedas Jugando en Colombia Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Colombia sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en USDT o en pesos colombianos.',
    keywords:
      'ganar criptomonedas jugando colombia, ganar dinero jugando colombia, ganar usdt gratis colombia, juegos que pagan dinero real colombia, play to earn colombia, xnova colombia',
    h1: 'Ganar Criptomonedas Jugando en Colombia, Gratis y sin Invertir',
    body: [
      ['h2', 'Un ingreso que trabaja mientras duermes'],
      [
        'p',
        'Lo que diferencia a Imperium de las apps de encuestas o de ver anuncios es que aqui no cobras por tu tiempo, cobras por lo que produces. Tus minas generan recursos de forma continua, conectado o no, y cuanto mas suben de nivel, mas producen.',
      ],
      ['h2', 'Cobrar en pesos colombianos o en USDT'],
      [
        'p',
        'Puedes cambiar tus tokens TUNG por USDT y retirarlos a tu wallet, o venderlos en el mercado P2P con el metodo Pago / Transferencia (COP), donde otro jugador te transfiere pesos colombianos. Tu eliges precio, minimo, maximo y plazo de pago.',
      ],
      ['h2', 'Estrategia de verdad, no un clicker'],
      [
        'p',
        'Imperium tiene minas, laboratorio de investigacion, astillero de naves, defensas, flotas, galaxia explorable, expediciones, alianzas y combate. Los jugadores que entienden la economia y el momento correcto para expandirse ganan mucho mas que los que solo acumulan.',
      ],
    ],
    faqs: [
      {
        q: 'Puedo recibir el pago en pesos colombianos?',
        a: 'Si. El mercado P2P incluye el metodo Pago / Transferencia (COP) entre jugadores.',
      },
      {
        q: 'Hace falta invertir para empezar?',
        a: 'No. Imperium es gratuito y desde el registro ya tienes un planeta produciendo recursos vendibles.',
      },
      {
        q: 'Se puede jugar desde el celular?',
        a: 'Si. Funciona en el navegador del telefono sin instalar nada y consume pocos datos.',
      },
      {
        q: 'Que es el token TUNG?',
        a: 'Es la moneda del juego con la que se liquidan las operaciones del mercado. Se puede convertir a USDT y retirar a una wallet externa.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-peru',
    title: 'Ganar Criptomonedas Jugando en Peru Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Peru sin invertir: tus minas producen recursos, los vendes en el mercado P2P y cobras en USDT o en soles por transferencia.',
    keywords:
      'ganar criptomonedas jugando peru, ganar dinero jugando peru, ganar usdt gratis peru, juegos que pagan dinero real peru, play to earn peru, xnova peru',
    h1: 'Ganar Criptomonedas Jugando en Peru, Gratis y sin Invertir',
    body: [
      ['h2', 'Como se gana realmente'],
      [
        'p',
        'La logica de Imperium es la de un juego de estrategia clasico tipo OGame: metal, cristal y deuterio. Construyes minas, las subes de nivel y producen sin parar. La diferencia es que esos recursos no se quedan dentro del juego: hay un mercado entre jugadores donde se compran y se venden.',
      ],
      ['h2', 'Cobrar en soles o en USDT'],
      [
        'p',
        'La salida directa es convertir a USDT y retirar a tu wallet. La local es publicar una oferta con el metodo Pago / Transferencia (PEN) y recibir soles de otro jugador. En ambos casos el sistema retiene lo que vendes hasta que confirmas que cobraste.',
      ],
      ['h2', 'Poco tiempo, buenas decisiones'],
      [
        'p',
        'La produccion corre sola, asi que no tienes que estar conectado. Entrar una o dos veces al dia para revisar minas, ajustar precios y lanzar expediciones es suficiente. Lo que marca la diferencia son las decisiones economicas.',
      ],
    ],
    faqs: [
      {
        q: 'Puedo cobrar en soles peruanos?',
        a: 'Si. El mercado P2P incluye el metodo Pago / Transferencia (PEN) entre jugadores.',
      },
      {
        q: 'Necesito invertir dinero?',
        a: 'No. El juego es gratuito y la produccion de tus minas no tiene coste alguno.',
      },
      {
        q: 'Es un esquema piramidal?',
        a: 'No. El dinero viene de un mercado donde los jugadores compran y venden recursos entre si. El sistema de referidos es un extra, no la fuente principal de ingresos.',
      },
      {
        q: 'Funciona en computadoras antiguas?',
        a: 'Si. Al ser un juego de navegador sin graficos pesados corre bien en equipos modestos y telefonos de gama media.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },
  {
    path: '/ganar-criptomonedas-jugando-espana',
    title: 'Ganar Criptomonedas Jugando en Espana Gratis | Imperium',
    description:
      'Gana criptomonedas jugando desde Espana sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en USDT o en euros.',
    keywords:
      'ganar criptomonedas jugando espana, ganar dinero jugando espana, juegos que pagan dinero real espana, juego tipo ogame espanol, play to earn gratis espana, xnova espana',
    h1: 'Ganar Criptomonedas Jugando en Espana, Gratis y sin Invertir',
    body: [
      ['h2', 'Para quien viene de OGame'],
      [
        'p',
        'Si jugaste a OGame vas a reconocer todo: metal, cristal y deuterio, mina de metal, planta de fusion, laboratorio de investigacion, astillero, defensas, flotas, galaxia con coordenadas, expediciones y alianzas. La diferencia es el final del ciclo: en Imperium esa produccion se vende a otros jugadores y se cobra en tokens convertibles a criptomonedas.',
      ],
      ['h2', 'Cobrar en euros o en USDT'],
      [
        'p',
        'Los tokens TUNG se pueden convertir a USDT y retirar a cualquier wallet, o vender en el mercado a otros jugadores con metodos de pago en euros. El sistema funciona con garantia y con posibilidad de abrir disputa si algo falla.',
      ],
      ['h2', 'Gratis de verdad, sin pay to win encubierto'],
      [
        'p',
        'No hay que comprar NFTs ni hacer un deposito inicial para poder ganar o retirar. El deposito solo sirve para acelerar progreso si alguien quiere, lo que deja el juego en manos de la estrategia y no de la cartera.',
      ],
    ],
    faqs: [
      {
        q: 'Imperium es como OGame?',
        a: 'Comparte casi todas las mecanicas: recursos, edificios, investigacion, flotas, combate, galaxia y alianzas. La diferencia es que Imperium anade una economia real donde tu produccion se vende por criptomonedas.',
      },
      {
        q: 'Hay que invertir para ganar?',
        a: 'No. El juego es gratuito y no exige comprar NFTs ni depositar nada para empezar a producir, vender y retirar.',
      },
      {
        q: 'Puedo cobrar en euros?',
        a: 'Si. Ademas de convertir a USDT y retirar a tu wallet, el mercado P2P permite operar con metodos de pago en euros entre jugadores.',
      },
      {
        q: 'Hay que declarar lo que se gana?',
        a: 'Si. Las ganancias en criptomonedas tributan en Espana. Imperium no practica retenciones, asi que la declaracion corresponde a cada jugador.',
      },
    ],
    priority: 0.8,
    changefreq: 'weekly',
  },

  // ===== TERMS & PRIVACY =====
  {
    path: '/terms',
    title: 'Terminos y Condiciones | Imperium',
    description:
      'Terminos y condiciones de uso de Imperium. Normas del juego, politica de recompensas, propiedad intelectual y condiciones legales del servicio.',
    h1: 'Terminos y Condiciones de Imperium',
    priority: 0.3,
    noIndex: true,
  },
  {
    path: '/privacy',
    title: 'Politica de Privacidad | Imperium',
    description:
      'Politica de privacidad de Imperium. Como recopilamos, usamos y protegemos tus datos personales. Cumplimiento GDPR y derechos del usuario.',
    h1: 'Politica de Privacidad de Imperium',
    priority: 0.3,
    noIndex: true,
  },
];
