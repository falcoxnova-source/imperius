import { SEOLandingPage } from './SEOLandingPages';

/**
 * Landings por pais.
 *
 * Cada pais tiene su propia URL y su propio contenido (moneda, metodos de pago
 * locales del mercado P2P, contexto economico y FAQs especificas). No son
 * copias con el nombre cambiado: si lo fueran Google las trataria como paginas
 * puerta y no las indexaria.
 *
 * Los metodos de pago mencionados existen realmente en el mercado P2P:
 * transferencia en moneda local (ARS, MXN, VES, COP, PEN), USDT, y en Cuba
 * ademas Transferencia CUP, Saldo Movil y Transferencia MLC.
 */

export interface CountryLanding {
  slug: string;
  country: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  subheading: string;
  sections: Array<{ title: string; content: string; icon: string }>;
  faqs: Array<{ q: string; a: string }>;
  ctaText: string;
}

const COMMON_CTA = 'Crear mi cuenta gratis';

export const COUNTRY_LANDINGS: CountryLanding[] = [
  // ─────────────────────────── ARGENTINA ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-argentina',
    country: 'Argentina',
    title: 'Ganar Criptomonedas Jugando en Argentina Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Argentina sin invertir: produce recursos, vendelos en el mercado P2P y cobra en USDT o en pesos por transferencia.',
    keywords:
      'ganar criptomonedas jugando argentina, ganar dolares jugando argentina, ganar usdt gratis argentina, ganar dinero por internet argentina sin invertir, juegos play to earn argentina, ganar plata jugando, xnova argentina',
    h1: 'Ganar Criptomonedas Jugando en Argentina, Gratis y sin Invertir',
    subheading:
      'Xnova es un juego de estrategia espacial tipo OGame donde tus minas producen recursos solas. Los vendes en el mercado entre jugadores y cobras en USDT o en pesos argentinos por transferencia.',
    sections: [
      {
        icon: '',
        title: 'Por que funciona especialmente bien en Argentina',
        content:
          'En Argentina el problema no es ganar pesos, es que los pesos pierden valor mientras estan en tu cuenta. Xnova te paga en tokens que puedes convertir a USDT, una stablecoin anclada al dolar, asi que lo que ganas conserva su valor aunque pasen meses.\n\nNo necesitas comprar nada para empezar. El juego es gratuito: te registras, subes tus minas de metal, cristal y deuterio, y esas minas producen las 24 horas aunque cierres el navegador. Lo que produces es tuyo y lo vendes cuando quieras.',
      },
      {
        icon: '',
        title: 'Como cobrar desde Argentina',
        content:
          'El mercado P2P de Xnova conecta directamente a los jugadores. Publicas una oferta indicando cuanto vendes y a que precio, eliges el metodo de pago y esperas a que otro jugador la tome.\n\nDesde Argentina tienes dos caminos. El primero es vender contra USDT dentro del propio juego y retirar la stablecoin a tu wallet. El segundo es usar el metodo "Pago / Transferencia (ARS)": otro jugador te transfiere pesos a tu cuenta bancaria o billetera virtual y tu liberas los tokens. Los fondos quedan retenidos en garantia hasta que confirmas que recibiste el pago.',
      },
      {
        icon: '',
        title: 'Cuanto tiempo hay que dedicarle',
        content:
          'Xnova no es un clicker: no hay que estar pegado a la pantalla. La produccion es pasiva y corre sola. Lo importante son las decisiones: que mina subir primero, cuando investigar, a que precio publicar en el mercado.\n\nCon quince o veinte minutos al dia para revisar la produccion, ajustar precios y lanzar alguna expedicion es suficiente para que el imperio crezca. Los jugadores que mas ganan no son los que mas horas juegan, son los que mejor administran su economia.',
      },
      {
        icon: '',
        title: 'Sin inversion inicial ni requisitos raros',
        content:
          'No hay que comprar NFTs, ni hacer staking, ni depositar un minimo para desbloquear las ganancias. Tampoco hace falta tarjeta de credito ni cuenta en el exterior.\n\nSolo necesitas un correo electronico y un navegador. Funciona igual desde la computadora que desde el celular, sin descargar ninguna aplicacion.',
      },
    ],
    faqs: [
      {
        q: 'Se puede jugar a Xnova desde Argentina sin restricciones?',
        a: 'Si. Xnova funciona desde el navegador en cualquier pais y no hay bloqueo geografico para Argentina. Solo necesitas conexion a internet.',
      },
      {
        q: 'En que moneda cobro si juego desde Argentina?',
        a: 'Ganas tokens TUNG dentro del juego. Puedes convertirlos a USDT y retirarlos a tu wallet, o venderlos en el mercado P2P a otros jugadores que te pagan en pesos argentinos por transferencia.',
      },
      {
        q: 'Cuanto se puede ganar realmente?',
        a: 'Depende del nivel de tus minas y de como manejes el mercado. Al principio son cantidades chicas porque la produccion es baja. A medida que subes las minas la produccion crece de forma exponencial y con ella lo que puedes vender.',
      },
      {
        q: 'Hay que pagar algo para retirar?',
        a: 'No hay cuota de suscripcion ni deposito minimo. El retiro tiene la comision de red correspondiente, igual que cualquier transferencia en blockchain.',
      },
      {
        q: 'Es seguro vender por transferencia a otro jugador?',
        a: 'Si, porque el mercado usa garantia: cuando publicas una venta tus tokens quedan retenidos por el sistema y solo se liberan cuando confirmas que recibiste el pago. Si hay un problema puedes abrir una disputa y un moderador la revisa.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── MEXICO ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-mexico',
    country: 'Mexico',
    title: 'Ganar Criptomonedas Jugando en Mexico Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Mexico sin invertir: tus minas producen recursos, los vendes en el mercado P2P y cobras en USDT o en pesos mexicanos.',
    keywords:
      'ganar criptomonedas jugando mexico, ganar dinero jugando mexico, ganar usdt gratis mexico, juegos que pagan dinero real mexico, ganar dinero por internet mexico sin invertir, play to earn mexico, xnova mexico',
    h1: 'Ganar Criptomonedas Jugando en Mexico, Gratis y sin Invertir',
    subheading:
      'Construye un imperio espacial tipo OGame, deja que tus minas produzcan solas y convierte esos recursos en criptomonedas que cobras en USDT o en pesos mexicanos.',
    sections: [
      {
        icon: '',
        title: 'Un ingreso extra que no depende de tu tiempo',
        content:
          'La mayoria de formas de ganar dinero por internet en Mexico te pagan por hora trabajada: encuestas, microtareas, freelance. Xnova funciona distinto. Tus minas de metal, cristal y deuterio producen las 24 horas del dia, estes o no conectado.\n\nTu trabajo es decidir en que invertir la produccion y a que precio venderla. Es un ingreso que crece con tu imperio, no con las horas que le dediques.',
      },
      {
        icon: '',
        title: 'Como se cobra desde Mexico',
        content:
          'Dentro del juego ganas tokens TUNG. A partir de ahi tienes dos salidas. Puedes cambiarlos por USDT y retirarlos a tu wallet, o puedes venderlos en el mercado P2P usando el metodo "Pago / Transferencia (MXN)", donde otro jugador te deposita pesos mexicanos y tu liberas los tokens.\n\nCada operacion pasa por garantia: el sistema retiene lo que vendes hasta que confirmas que el pago llego. Tu decides el precio, la cantidad minima y maxima por operacion y el limite de tiempo para pagar.',
      },
      {
        icon: '',
        title: 'Empieza sin gastar un peso',
        content:
          'No hay compra de personajes, ni NFTs, ni deposito inicial. El registro es gratuito y desde el primer minuto ya tienes un planeta produciendo.\n\nEl deposito existe solo si algun dia quieres acelerar tu progreso, pero nunca es un requisito para ganar ni para retirar.',
      },
      {
        icon: '',
        title: 'Funciona desde el celular',
        content:
          'Xnova se juega en el navegador, sin descargar nada. Corre igual en un telefono de gama media que en una computadora, y consume muy pocos datos porque no es un juego 3D.\n\nPuedes revisar tu produccion, publicar ofertas y cobrar desde donde estes.',
      },
    ],
    faqs: [
      {
        q: 'Necesito invertir dinero para empezar en Mexico?',
        a: 'No. El registro y el juego son gratuitos. Empiezas con un planeta que ya produce recursos y esos recursos ya se pueden vender.',
      },
      {
        q: 'Puedo cobrar en pesos mexicanos?',
        a: 'Si. En el mercado P2P existe el metodo de pago "Pago / Transferencia (MXN)": vendes tus tokens a otro jugador que te transfiere pesos a tu cuenta o billetera.',
      },
      {
        q: 'Es legal ganar criptomonedas jugando en Mexico?',
        a: 'Jugar y recibir tokens no esta prohibido en Mexico. Como con cualquier otro ingreso, la responsabilidad fiscal de declarar las ganancias es de cada jugador.',
      },
      {
        q: 'Cuanto tarda en llegar un retiro?',
        a: 'El retiro a wallet se procesa en blockchain y suele confirmarse en minutos. Las ventas P2P dependen de lo rapido que pague el comprador, con un limite de tiempo que tu defines en la oferta.',
      },
      {
        q: 'Que pasa si un comprador no paga?',
        a: 'La operacion expira y tus tokens vuelven a ti automaticamente. Si el comprador dice haber pagado y tu no lo recibiste, puedes abrir una disputa.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── VENEZUELA ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-venezuela',
    country: 'Venezuela',
    title: 'Ganar Criptomonedas Jugando en Venezuela Gratis | Xnova',
    description:
      'Gana USDT jugando desde Venezuela sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en criptomonedas o en bolivares.',
    keywords:
      'ganar criptomonedas jugando venezuela, ganar dolares jugando venezuela, ganar usdt gratis venezuela, como ganar dinero por internet venezuela, juegos que pagan en dolares venezuela, play to earn venezuela, xnova venezuela',
    h1: 'Ganar Criptomonedas Jugando en Venezuela, Gratis y sin Invertir',
    subheading:
      'Un juego de estrategia espacial donde tus minas producen solas y lo que produces se vende por USDT. Sin inversion inicial y sin necesidad de cuenta bancaria en el exterior.',
    sections: [
      {
        icon: '',
        title: 'Ganar en dolares sin salir de casa',
        content:
          'En Venezuela el USDT ya es parte del dia a dia y el problema real es conseguirlo sin una fuente de ingresos en divisas. Xnova ofrece justamente eso: una produccion que no te cuesta nada y que se vende en un mercado donde el precio se fija en dolares.\n\nNo hace falta invertir, ni tener cuenta en el exterior, ni comprar nada. El juego te da un planeta con minas y esas minas producen metal, cristal y deuterio las 24 horas.',
      },
      {
        icon: '',
        title: 'El mercado P2P y los bolivares',
        content:
          'Cuando quieres cobrar tienes dos opciones. La primera es convertir tus tokens TUNG a USDT y retirarlos a tu wallet, para guardarlos o cambiarlos donde prefieras.\n\nLa segunda es venderlos directamente a otro jugador dentro del juego usando el metodo "Pago / Transferencia (VES)": el comprador te paga en bolivares y tu liberas los tokens cuando confirmas que el dinero llego. Todo con garantia, asi que no entregas nada antes de cobrar.',
      },
      {
        icon: '',
        title: 'Pensado para conexiones lentas',
        content:
          'Xnova es un juego de navegador basado en texto e interfaz, no en graficos pesados. Eso significa que carga rapido y consume pocos datos, algo importante cuando la conexion no siempre acompana.\n\nAdemas la produccion no se detiene si te desconectas: puedes entrar dos veces al dia, revisar, publicar tus ofertas y salir.',
      },
      {
        icon: '',
        title: 'Formas de aumentar lo que ganas',
        content:
          'Vender recursos es la base, pero no lo unico. Las misiones diarias y premium dan recompensas, las expediciones pueden traer recursos y premios, las batallas permiten saquear a rivales inactivos y el sistema de referidos paga comisiones recurrentes por cada amigo que invitas.\n\nCuanto mas suben tus minas, mas produces; cuanto mas produces, mas vendes. El crecimiento es acumulativo.',
      },
    ],
    faqs: [
      {
        q: 'Puedo ganar USDT desde Venezuela sin invertir nada?',
        a: 'Si. El juego es gratuito y la produccion de tus minas no tiene coste. Vendes esa produccion en el mercado y cobras en tokens que puedes convertir a USDT.',
      },
      {
        q: 'Puedo cobrar en bolivares?',
        a: 'Si. El mercado P2P incluye el metodo "Pago / Transferencia (VES)", donde otro jugador te paga en bolivares y tu liberas los tokens al confirmar el pago.',
      },
      {
        q: 'Consume muchos datos moviles?',
        a: 'No. Es un juego de navegador ligero, sin descargas ni graficos 3D, por lo que el consumo de datos es muy bajo comparado con otros juegos online.',
      },
      {
        q: 'Necesito una wallet para empezar?',
        a: 'No para jugar. La necesitas solo cuando quieras retirar tus tokens fuera del juego. Dentro de Xnova ya tienes una wallet integrada.',
      },
      {
        q: 'Cuanto tiempo hay que jugar al dia?',
        a: 'Con quince o veinte minutos alcanza. La produccion es pasiva y sigue corriendo mientras no estas conectado.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── CUBA ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-cuba',
    country: 'Cuba',
    title: 'Ganar Criptomonedas Jugando en Cuba Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Cuba sin invertir: vende los recursos de tus minas en el mercado P2P y cobra en USDT, transferencia CUP, MLC o saldo movil.',
    keywords:
      'ganar criptomonedas jugando cuba, ganar dinero por internet cuba, ganar usdt en cuba, como ganar dinero en cuba sin invertir, juegos que pagan en cuba, saldo movil gratis cuba, xnova cuba',
    h1: 'Ganar Criptomonedas Jugando en Cuba, Gratis y sin Invertir',
    subheading:
      'Xnova es un juego de estrategia espacial ligero donde tus minas producen recursos solas. Los vendes en el mercado entre jugadores y cobras en USDT, CUP, MLC o saldo movil.',
    sections: [
      {
        icon: '',
        title: 'Los metodos de pago que mas se usan en Cuba',
        content:
          'Xnova es uno de los pocos juegos con mercado P2P donde los metodos de pago cubanos estan integrados de verdad. Ademas de USDT, el mercado incluye Transferencia CUP, Transferencia MLC y Saldo Movil.\n\nEso significa que puedes vender tus tokens a otro jugador y recibir directamente una transferencia en pesos cubanos, en MLC o incluso una recarga de saldo movil, sin depender de nadie fuera de la plataforma.',
      },
      {
        icon: '',
        title: 'Un juego que no se come los datos',
        content:
          'La conexion en Cuba es cara y limitada, asi que un juego de 2 GB no es una opcion. Xnova corre entero en el navegador, sin descargas, y su interfaz es ligera: pesa poco y consume muy pocos datos por sesion.\n\nAdemas la produccion es pasiva. Puedes conectarte, revisar minas, publicar una oferta en el mercado y desconectarte: el imperio sigue produciendo sin ti.',
      },
      {
        icon: '',
        title: 'Empezar sin poner un peso',
        content:
          'No hay deposito minimo, ni compra de NFTs, ni suscripcion obligatoria. Te registras con un correo, recibes tu primer planeta y ya estas produciendo metal, cristal y deuterio.\n\nLos recursos que generas no te costaron nada, y en el mercado tienen precio real. Ahi esta el margen: vendes algo que el juego te da gratis.',
      },
      {
        icon: '',
        title: 'Como funciona la garantia',
        content:
          'Cuando publicas una venta, el sistema retiene tus tokens. El comprador paga por el metodo acordado, tu confirmas que recibiste el dinero y recien entonces se liberan.\n\nSi el comprador no paga dentro del plazo que fijaste, la operacion se cancela y todo vuelve a tu cuenta. Si hay desacuerdo, cualquiera de las partes puede abrir una disputa con un moderador. Para operar en el mercado hace falta tener el KYC aprobado, lo que reduce mucho el fraude.',
      },
    ],
    faqs: [
      {
        q: 'Puedo cobrar en pesos cubanos o en saldo movil?',
        a: 'Si. El mercado P2P de Xnova incluye Transferencia CUP, Transferencia MLC y Saldo Movil como metodos de pago entre jugadores.',
      },
      {
        q: 'Xnova gasta muchos datos?',
        a: 'No. Es un juego de navegador sin descargas ni graficos pesados, pensado para funcionar bien con conexiones limitadas.',
      },
      {
        q: 'Hay que invertir para empezar a ganar?',
        a: 'No. El juego es gratuito y la produccion de tus minas no tiene coste. Puedes vender desde el primer dia.',
      },
      {
        q: 'Necesito verificacion para vender?',
        a: 'Para publicar ofertas en el mercado P2P necesitas el KYC aprobado. Es un requisito de seguridad que protege tanto al comprador como al vendedor.',
      },
      {
        q: 'Que gano exactamente cuando vendo?',
        a: 'Vendes recursos o tokens TUNG. Segun la oferta que publiques puedes recibir USDT dentro del juego o un pago externo en CUP, MLC o saldo movil.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── COLOMBIA ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-colombia',
    country: 'Colombia',
    title: 'Ganar Criptomonedas Jugando en Colombia Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Colombia sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en USDT o en pesos colombianos.',
    keywords:
      'ganar criptomonedas jugando colombia, ganar dinero jugando colombia, ganar usdt gratis colombia, como ganar dinero por internet colombia sin invertir, juegos que pagan dinero real colombia, play to earn colombia, xnova colombia',
    h1: 'Ganar Criptomonedas Jugando en Colombia, Gratis y sin Invertir',
    subheading:
      'Estrategia espacial tipo OGame con economia real: tus minas producen las 24 horas y esa produccion se vende por criptomonedas o por pesos colombianos.',
    sections: [
      {
        icon: '',
        title: 'Un ingreso que trabaja mientras duermes',
        content:
          'Lo que diferencia a Xnova de las apps de encuestas o de ver anuncios es que aqui no cobras por tu tiempo, cobras por lo que produces. Tus minas de metal, cristal y deuterio generan recursos de forma continua, conectado o no.\n\nCuanto mas subes de nivel las minas, mas produces. Y todo lo que produces se puede vender en el mercado a otros jugadores.',
      },
      {
        icon: '',
        title: 'Cobrar en pesos colombianos o en USDT',
        content:
          'Dentro del juego ganas tokens TUNG. Para convertirlos en dinero tienes dos vias: cambiarlos por USDT y retirarlos a tu wallet, o venderlos en el mercado P2P usando el metodo "Pago / Transferencia (COP)", donde otro jugador te transfiere pesos colombianos.\n\nTu eliges el precio, el minimo y el maximo por operacion y el plazo de pago. El sistema retiene lo que vendes hasta que confirmas que recibiste el dinero.',
      },
      {
        icon: '',
        title: 'Sin inversion, sin NFTs, sin trampas',
        content:
          'Muchos juegos play to earn exigen comprar personajes o tierras antes de ganar nada. Xnova no. El registro es gratis, el planeta inicial es gratis y la produccion es gratis.\n\nNo hay deposito minimo para retirar ni suscripcion obligatoria. Lo unico que inviertes es criterio: que construir, que investigar y a que precio vender.',
      },
      {
        icon: '',
        title: 'Estrategia de verdad, no un clicker',
        content:
          'Xnova tiene minas, laboratorio de investigacion, astillero de naves, defensas, flotas, galaxia explorable, expediciones, alianzas y combate. Es un juego completo, no una pantalla con un boton.\n\nEso importa para ganar: los jugadores que entienden la economia y el momento correcto para expandirse ganan mucho mas que los que solo acumulan.',
      },
    ],
    faqs: [
      {
        q: 'Puedo recibir el pago en pesos colombianos?',
        a: 'Si. El mercado P2P incluye el metodo "Pago / Transferencia (COP)": otro jugador te paga en pesos y tu liberas los tokens al confirmar.',
      },
      {
        q: 'Hace falta invertir para empezar?',
        a: 'No. Xnova es gratuito y desde el registro ya tienes un planeta produciendo recursos vendibles.',
      },
      {
        q: 'Se puede jugar desde el celular?',
        a: 'Si. Funciona en el navegador del telefono sin instalar nada y consume pocos datos.',
      },
      {
        q: 'Cuanto puedo ganar al mes?',
        a: 'No hay una cifra fija: depende del nivel de tus minas, del tiempo que lleves jugando y de como manejes los precios en el mercado. Al principio es poco y crece de forma exponencial con el imperio.',
      },
      {
        q: 'Que es el token TUNG?',
        a: 'Es la moneda del juego con la que se liquidan las operaciones del mercado. Se puede convertir a USDT y retirar a una wallet externa.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── PERU ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-peru',
    country: 'Peru',
    title: 'Ganar Criptomonedas Jugando en Peru Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Peru sin invertir: tus minas producen recursos, los vendes en el mercado P2P y cobras en USDT o en soles por transferencia.',
    keywords:
      'ganar criptomonedas jugando peru, ganar dinero jugando peru, ganar usdt gratis peru, como ganar dinero por internet peru sin invertir, juegos que pagan dinero real peru, play to earn peru, xnova peru',
    h1: 'Ganar Criptomonedas Jugando en Peru, Gratis y sin Invertir',
    subheading:
      'Construye tu imperio espacial, deja que las minas produzcan solas y convierte esa produccion en criptomonedas o en soles peruanos.',
    sections: [
      {
        icon: '',
        title: 'Como se gana realmente',
        content:
          'La logica de Xnova es la de un juego de estrategia clasico tipo OGame: metal, cristal y deuterio. Construyes minas, las subes de nivel y ellas producen sin parar.\n\nLa diferencia es que esos recursos no se quedan dentro del juego. Hay un mercado entre jugadores donde se compran y se venden, y las operaciones se liquidan en tokens que se pueden convertir a criptomonedas reales.',
      },
      {
        icon: '',
        title: 'Cobrar en soles o en USDT',
        content:
          'Tienes dos salidas para tus ganancias. La directa es convertir a USDT y retirar a tu wallet. La local es publicar una oferta en el mercado con el metodo "Pago / Transferencia (PEN)" y recibir soles de otro jugador por transferencia.\n\nEn ambos casos el sistema retiene lo que vendes hasta que confirmas que cobraste, y tu fijas el plazo maximo de pago.',
      },
      {
        icon: '',
        title: 'Cero inversion inicial',
        content:
          'No hay que comprar nada para empezar. Ni personajes, ni NFTs, ni paquete de inicio. El registro es gratuito y el primer planeta ya viene produciendo.\n\nTampoco hay deposito minimo para poder retirar: lo que ganas es tuyo desde el primer token.',
      },
      {
        icon: '',
        title: 'Poco tiempo, buenas decisiones',
        content:
          'La produccion corre sola, asi que no tienes que estar conectado. Entrar una o dos veces al dia para revisar las minas, ajustar precios y lanzar expediciones es suficiente.\n\nLo que marca la diferencia son las decisiones economicas: cuando reinvertir en minas, cuando vender y a que precio publicar segun como este el mercado.',
      },
    ],
    faqs: [
      {
        q: 'Puedo cobrar en soles peruanos?',
        a: 'Si. El mercado P2P incluye el metodo "Pago / Transferencia (PEN)", donde otro jugador te paga en soles y tu liberas los tokens al confirmar el pago.',
      },
      {
        q: 'Necesito invertir dinero?',
        a: 'No. El juego es gratuito y la produccion de tus minas no tiene coste alguno.',
      },
      {
        q: 'Cuanto tarda en verse el dinero?',
        a: 'Los primeros dias la produccion es baja, asi que las ventas son pequenas. El crecimiento se acelera bastante cuando las minas llegan a niveles medios.',
      },
      {
        q: 'Es un esquema piramidal?',
        a: 'No. El dinero no viene de reclutar gente sino de un mercado donde los jugadores compran y venden recursos entre si. El sistema de referidos existe pero es un extra, no la fuente principal de ingresos.',
      },
      {
        q: 'Funciona en computadoras antiguas?',
        a: 'Si. Al ser un juego de navegador sin graficos pesados corre bien en equipos modestos y en telefonos de gama media.',
      },
    ],
    ctaText: COMMON_CTA,
  },

  // ─────────────────────────── ESPANA ───────────────────────────
  {
    slug: 'ganar-criptomonedas-jugando-espana',
    country: 'Espana',
    title: 'Ganar Criptomonedas Jugando en Espana Gratis | Xnova',
    description:
      'Gana criptomonedas jugando desde Espana sin invertir: produce recursos con tus minas, vendelos en el mercado P2P y cobra en USDT o en euros.',
    keywords:
      'ganar criptomonedas jugando espana, ganar dinero jugando espana, juegos que pagan dinero real espana, ganar dinero por internet sin invertir espana, juego tipo ogame espanol, play to earn gratis espana, xnova espana',
    h1: 'Ganar Criptomonedas Jugando en Espana, Gratis y sin Invertir',
    subheading:
      'La alternativa moderna a OGame: mismas mecanicas de estrategia espacial, pero con un mercado real donde tus recursos valen dinero.',
    sections: [
      {
        icon: '',
        title: 'Para quien viene de OGame',
        content:
          'Si jugaste a OGame vas a reconocer todo: metal, cristal y deuterio, mina de metal, planta de fusion, laboratorio de investigacion, astillero, defensas, flotas, galaxia con coordenadas, expediciones y alianzas.\n\nLa diferencia es el final del ciclo. En OGame la produccion solo sirve para seguir jugando. En Xnova hay un mercado P2P donde esa produccion se vende a otros jugadores y se cobra en tokens convertibles a criptomonedas.',
      },
      {
        icon: '',
        title: 'Cobrar en euros o en USDT',
        content:
          'Los tokens TUNG que ganas se pueden convertir a USDT y retirar a cualquier wallet. Tambien puedes venderlos en el mercado a otros jugadores usando metodos de pago en euros.\n\nEl sistema funciona con garantia: cuando publicas una venta tus tokens quedan retenidos y solo se liberan cuando confirmas que recibiste el pago, con posibilidad de abrir disputa si algo falla.',
      },
      {
        icon: '',
        title: 'Gratis de verdad, sin pay to win encubierto',
        content:
          'No hay que comprar NFTs ni hacer un deposito inicial para poder ganar o retirar. El juego es free to play completo y el deposito solo sirve para acelerar progreso si alguien quiere.\n\nEso deja el juego en manos de la estrategia y no de la cartera, que es justo lo que suele fallar en la mayoria de titulos play to earn.',
      },
      {
        icon: '',
        title: 'Fiscalidad y sentido comun',
        content:
          'Las ganancias en criptomonedas son un ingreso como cualquier otro y en Espana corresponde declararlas. Xnova no retiene impuestos ni actua como intermediario fiscal: cada jugador es responsable de su propia declaracion.\n\nComo con cualquier actividad con criptoactivos, conviene llevar registro de lo que se ingresa y de las conversiones realizadas.',
      },
    ],
    faqs: [
      {
        q: 'Xnova es como OGame?',
        a: 'Comparte casi todas las mecanicas: recursos, edificios, investigacion, flotas, combate, galaxia y alianzas. La diferencia principal es que Xnova anade una economia real donde tu produccion se vende por criptomonedas.',
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
        a: 'Si. Las ganancias en criptomonedas tributan en Espana. Xnova no practica retenciones, asi que la declaracion corresponde a cada jugador.',
      },
      {
        q: 'Se juega en el navegador o hay que instalar algo?',
        a: 'Todo en el navegador, sin instalaciones. Funciona en ordenador, tablet y movil.',
      },
    ],
    ctaText: COMMON_CTA,
  },
];

/** Enlaces cruzados entre todas las landings de pais, para el enlazado interno. */
const COUNTRY_LINKS = COUNTRY_LANDINGS.map((c) => ({
  to: `/${c.slug}`,
  label: `Ganar criptomonedas en ${c.country}`,
}));

export function CountryLandingPage({ data }: { data: CountryLanding }) {
  return (
    <SEOLandingPage
      title={data.title}
      description={data.description}
      keywords={data.keywords}
      h1={data.h1}
      subheading={data.subheading}
      sections={data.sections}
      faqs={data.faqs}
      ctaText={data.ctaText}
      relatedLinks={COUNTRY_LINKS.filter((link) => link.to !== `/${data.slug}`)}
    />
  );
}
