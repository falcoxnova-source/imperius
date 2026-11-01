import { Link } from 'react-router-dom';
import { SEO, schemas } from '../../components/ui/SEO';

interface LandingPageProps {
  title: string;
  description: string;
  keywords: string;
  h1: string;
  subheading: string;
  sections: Array<{
    title: string;
    content: string;
    icon: string;
  }>;
  faqs: Array<{ q: string; a: string }>;
  ctaText: string;
  /** Enlaces internos extra que se anaden al pie (landings por pais, etc.). */
  relatedLinks?: Array<{ to: string; label: string }>;
}

export function SEOLandingPage({
  title,
  description,
  keywords,
  h1,
  subheading,
  sections,
  faqs,
  ctaText,
  relatedLinks,
}: LandingPageProps) {
  const faqSchema = schemas.faqPage(faqs);

  return (
    <>
      <SEO
        title={title}
        description={description}
        keywords={keywords}
        schema={faqSchema}
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani']">
        {/* Navbar */}
        <nav className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3">
                <img src="/navbar-logo.png" alt="Xnova" className="h-10 w-10 object-contain" />
                <span
                  className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  XNOVA
                </span>
              </Link>
              <Link
                to="/register"
                className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
              >
                Regístrate
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              {h1}
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10">
              {subheading}
            </p>
            <Link
              to="/register"
              className="inline-flex px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-xl shadow-cyan-500/25"
            >
              {ctaText}
            </Link>
          </div>
        </section>

        {/* Content Sections */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-12">
              {sections.map((section, i) => (
                <div
                  key={i}
                  className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/5"
                >
                  <div className="flex items-start gap-4">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                    <div>
                      <h2
                        className="text-xl sm:text-2xl font-bold text-white mb-3"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        {section.title}
                      </h2>
                      <div className="text-slate-300 leading-relaxed space-y-3">
                        {section.content.split('\n\n').map((p, j) => (
                          <p key={j}>{p}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 bg-white/[0.01]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              className="text-3xl font-bold text-center mb-10"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Preguntas Frecuentes
            </h2>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <details
                  key={i}
                  className="group p-5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all cursor-pointer"
                >
                  <summary className="font-semibold text-white group-open:text-cyan-400 transition-colors list-none flex items-center justify-between">
                    {faq.q}
                    <span className="text-cyan-400 text-xl group-open:rotate-45 transition-transform duration-300">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-slate-400 text-sm leading-relaxed">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              className="text-3xl sm:text-4xl font-bold mb-6"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              ¿Listo para Empezar a Ganar?
            </h2>
            <p className="text-slate-400 mb-8">
              Sin descargas, sin depósitos, sin complicaciones. Solo estrategia y criptomonedas reales.
            </p>
            <Link
              to="/register"
              className="inline-flex px-10 py-5 text-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:scale-105"
            >
              {ctaText}
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-white/5 text-center">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="mb-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-400">
              <Link to="/" className="hover:text-cyan-400 transition-colors">Inicio</Link>
              <Link to="/generar-ingresos-gratis" className="hover:text-cyan-400 transition-colors">Generar ingresos gratis</Link>
              <Link to="/vender-recursos-ganar-dinero" className="hover:text-cyan-400 transition-colors">Vender recursos</Link>
              <Link to="/alternativa-ogame-crypto" className="hover:text-cyan-400 transition-colors">Alternativa a OGame</Link>
              <Link to="/ganar-criptomonedas-jugando" className="hover:text-cyan-400 transition-colors">Ganar criptomonedas</Link>
              <Link to="/blog" className="hover:text-cyan-400 transition-colors">Blog</Link>
            </nav>
            {relatedLinks && relatedLinks.length > 0 && (
              <nav className="mb-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
                {relatedLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="hover:text-cyan-400 transition-colors">
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}
            <p className="text-xs text-slate-600">
              © {new Date().getFullYear()} Xnova. Todos los derechos reservados.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

// ============ PÁGINAS DE ATERRIZAJE ============

export function GanarCriptomonedasPage() {
  return (
    <SEOLandingPage
      title="Ganar Criptomonedas Jugando Gratis | Xnova"
      description="Gana criptomonedas jugando gratis en Xnova: produce recursos con tus minas, véndelos en el mercado P2P y retira tus tokens TUNG sin invertir nada."
      keywords="ganar criptomonedas jugando, como ganar crypto de manera gratis, ganar crypto gratis, generar ingresos gratis, vender recursos y ganar dinero, Xnova, juego tipo OGame"
      h1="Gana Criptomonedas Jugando Gratis con Xnova"
      subheading="Tus minas producen recursos sin coste, el mercado los convierte en tokens y tu wallet los convierte en dinero. Sin inversión y sin descargas."
      sections={[
        {
          icon: 'mina',
          title: '¿Cómo se gana crypto de manera gratis en Xnova?',
          content:
            'En Xnova las criptomonedas no aparecen de la nada: las ganas convirtiendo producción en ventas. Tus minas de metal, cristal y deuterio producen las 24 horas, incluso desconectado, y ese material tiene demanda real entre los demás jugadores.\n\nCuando publicas una oferta en el mercado P2P y otro jugador la compra, recibes tokens TUNG al instante. Desde la wallet integrada puedes retirarlos y convertirlos en criptomonedas reales.',
        },
        {
          icon: 'mercado',
          title: 'Vender recursos en el mercado: tu principal fuente de ingresos gratis',
          content:
            'Muchos jugadores nuevos se centran en construir flota y olvidan lo importante: el excedente que no usas es dinero parado. Vender ese excedente de forma constante es lo que convierte a Xnova en una forma de generar ingresos gratis y no solo en un juego.\n\nCompra barato cuando un recurso sobra, vende cuando escasea y tu margen crecerá sin poner nada de tu bolsillo.',
        },
        {
          icon: 'formas',
          title: 'Todas las formas de ganar dinero gratis en Xnova',
          content:
            'Venta de recursos en el mercado P2P, misiones diarias y premium, expediciones con hallazgos aleatorios, botín de las batallas que ganas, comisiones recurrentes por referidos y participación en el jackpot y los pools de premios.\n\nDiversificar entre varias de estas fuentes es la forma más estable de aumentar tus ganancias mensuales.',
        },
        {
          icon: 'seguridad',
          title: '¿Es seguro? ¿Realmente puedo retirar el dinero?',
          content:
            'Xnova opera sobre la red BSC y los movimientos del token TUNG son verificables públicamente en el explorador de bloques.\n\nPara retirar solo necesitas una wallet compatible (MetaMask, Trust Wallet u otra Web3), indicar el importe y confirmar. Los fondos llegan tras la confirmación en cadena.',
        },
      ]}
      faqs={[
        {
          q: '¿Necesito invertir dinero para empezar a ganar criptomonedas?',
          a: 'No. Xnova es 100% gratuito. No necesitas comprar tokens ni NFTs ni hacer ningún depósito: te registras, construyes tus minas y empiezas a vender.',
        },
        {
          q: '¿Cuánto tiempo toma ganar mis primeras criptomonedas?',
          a: 'Puedes cerrar tu primera venta en el mercado el mismo día que empiezas, en cuanto tengas excedente de metal o cristal.',
        },
        {
          q: '¿Puedo jugar a Xnova desde el celular?',
          a: 'Sí. Xnova funciona en cualquier navegador: PC, móvil Android, iPhone o tablet. Sin descargas.',
        },
        {
          q: '¿De dónde sale el valor de lo que gano?',
          a: 'De la demanda real entre jugadores: los recursos se compran porque otros los necesitan para construir y avanzar más rápido.',
        },
      ]}
      ctaText="Empezar a ganar crypto gratis"
    />
  );
}

export function JuegosPlayToEarnPage() {
  return (
    <SEOLandingPage
      title="Juegos Play to Earn Gratis Sin Inversión | Xnova"
      description="Xnova es un juego play to earn gratis sin inversión: produce recursos, véndelos en el mercado y gana criptomonedas reales sin depositar dinero."
      keywords="juegos play to earn, P2E gratis, juegos para ganar crypto, play to earn sin inversión, generar ingresos gratis, Xnova, juego tipo OGame"
      h1="Juegos Play to Earn Gratis Sin Inversión"
      subheading="Los P2E que exigen comprar un NFT antes de ganar nada no son gratis. Xnova sí: te registras, produces y vendes."
      sections={[
        {
          icon: 'p2e',
          title: '¿Qué son los juegos play to earn?',
          content:
            'Los juegos Play to Earn (P2E) te recompensan con tokens o criptomonedas por jugar. A diferencia de los juegos tradicionales, aquí lo que consigues dentro del juego tiene valor fuera de él.\n\nEl problema es que gran parte del sector exige una inversión inicial, lo que deja fuera a quien solo quiere probar sin arriesgar dinero.',
        },
        {
          icon: 'gratis',
          title: 'Xnova es gratis de verdad, sin letra pequeña',
          content:
            'En Xnova no hay que comprar un NFT, ni bloquear tokens, ni hacer un depósito mínimo para poder ganar. El depósito existe solo para quien quiera acelerar su progreso, nunca como requisito.\n\nEsto significa que puedes evaluar el juego durante semanas sin arriesgar absolutamente nada y generar ingresos gratis desde el primer día vendiendo tus recursos.',
        },
        {
          icon: 'estrategia',
          title: 'No es un clicker: es estrategia espacial tipo OGame',
          content:
            'Xnova es un juego de estrategia espacial tipo OGame: gestión de recursos, investigación tecnológica, astillero, flotas, defensas, combate y alianzas.\n\nLa recompensa económica llega como consecuencia de jugar bien, no de pulsar un botón repetidamente. Eso hace que la economía sea mucho más sostenible.',
        },
        {
          icon: 'evaluar',
          title: 'Cómo evaluar un P2E antes de entrar',
          content:
            'Fíjate en tres cosas: si exige inversión obligatoria, de dónde sale realmente el valor que reparte y si los retiros funcionan y cuánto cuestan.\n\nUn cuarto criterio muy útil: pregúntate si el juego seguiría siendo divertido sin la parte crypto. Si la respuesta es no, probablemente su economía no se sostenga a largo plazo.',
        },
      ]}
      faqs={[
        {
          q: '¿Son realmente gratis los juegos play to earn?',
          a: 'Algunos sí. Xnova lo es: no exige compra inicial de ningún tipo. Muchos otros títulos del sector requieren adquirir activos antes de poder ganar.',
        },
        {
          q: '¿Qué juego P2E paga más?',
          a: 'Depende de tu dedicación y de la economía del juego. En Xnova la fuente principal es el mercado: cuanto más excedente vendes, más ganas.',
        },
        {
          q: '¿Necesito saber de criptomonedas para jugar?',
          a: 'No. Puedes jugar y acumular tokens sin conocimientos previos. Solo necesitarás una wallet cuando decidas retirar.',
        },
      ]}
      ctaText="Jugar gratis a Xnova"
    />
  );
}

export function AlternativaOGamePage() {
  return (
    <SEOLandingPage
      title="Alternativa a OGame con Criptomonedas | Xnova"
      description="Xnova es la alternativa a OGame con criptomonedas: misma estrategia espacial, pero vendes tus recursos en el mercado y ganas dinero real gratis."
      keywords="alternativa OGame, OGame con crypto, juego como OGame, xnova ogame, OGame ganar dinero, juego estrategia espacial P2E, Xnova"
      h1="Xnova: La Alternativa a OGame que te Paga por Jugar"
      subheading="Toda la estrategia y profundidad de OGame, pero con recompensas en criptomonedas reales gracias al mercado de recursos."
      sections={[
        {
          icon: 'motivo',
          title: '¿Por qué buscar una alternativa a OGame?',
          content:
            'OGame es un clásico que lleva más de 20 años en activo. Sin embargo, tiene limitaciones: no ofrece recompensas reales, su interfaz se ha quedado anticuada y la comunidad ha disminuido.\n\nXnova toma todo lo bueno de OGame y lo lleva al siguiente nivel con gráficos modernos, nuevas mecánicas y recompensas en criptomonedas.',
        },
        {
          icon: 'mecanicas',
          title: 'Mismas mecánicas, mejores recompensas',
          content:
            'Si vienes de OGame, te sentirás como en casa: gestión de metal, cristal y deuterio, construcción de minas y edificios, investigación tecnológica, astillero de naves, flotas espaciales, sistema de alianzas y combate táctico.\n\nLa diferencia: en Xnova ese metal y ese cristal se venden en un mercado P2P real y te generan tokens TUNG. Tu tiempo y tu estrategia se traducen en dinero.',
        },
        {
          icon: 'blockchain',
          title: 'Blockchain: la evolución del género',
          content:
            'La tecnología blockchain añade capas que OGame nunca podrá ofrecer: wallet integrada para guardar tus ganancias, mercado P2P entre jugadores, verificación transparente de las transacciones y una economía con valor real.',
        },
      ]}
      faqs={[
        {
          q: '¿Xnova es un clon de OGame?',
          a: 'No. Xnova está inspirado en OGame, pero tiene identidad propia: mercado P2P, misiones, token TUNG, wallet integrada y una interfaz completamente renovada.',
        },
        {
          q: '¿Puedo transferir mi cuenta de OGame a Xnova?',
          a: 'No, son juegos independientes. Pero si eres veterano de OGame, dominarás Xnova en minutos: las mecánicas son familiares.',
        },
        {
          q: '¿Qué ventajas tiene Xnova sobre OGame?',
          a: 'Puedes generar ingresos gratis vendiendo recursos, la interfaz es moderna, hay eventos regulares y soporte en español e inglés.',
        },
      ]}
      ctaText="Probar la alternativa a OGame"
    />
  );
}

export function GanarDineroJugandoPage() {
  return (
    <SEOLandingPage
      title="Ganar Dinero Jugando Desde Casa Sin Invertir | Xnova"
      description="Gana dinero jugando desde casa sin invertir: en Xnova produces recursos gratis, los vendes en el mercado y conviertes tus tokens TUNG en dinero real."
      keywords="ganar dinero jugando, generar ingresos gratis, como generar ingresos gratis, juegos que pagan dinero real, ingresos extra jugando, vender recursos y ganar dinero, Xnova"
      h1="Gana Dinero Jugando Desde Casa Sin Invertir"
      subheading="Convierte tu tiempo de juego en ingresos reales. En Xnova el excedente de tus minas se vende en el mercado y se paga en tokens."
      sections={[
        {
          icon: 'casa',
          title: 'Generar ingresos gratis desde casa es posible',
          content:
            'Ganar dinero desde casa jugando ya no exige ser profesional ni hacer streaming. Los juegos play-to-earn como Xnova permiten generar ingresos simplemente jugando bien.\n\nConstruyes tu imperio, produces recursos sin coste y los conviertes en tokens vendiéndolos a otros jugadores.',
        },
        {
          icon: 'fuentes',
          title: 'Múltiples formas de ganar en Xnova',
          content:
            'En Xnova tienes varias fuentes de ingresos: la venta de recursos en el mercado P2P (la principal), la producción pasiva de tus edificios, el botín de las batallas, las misiones diarias y el sistema de referidos con comisiones recurrentes.\n\nDiversificar entre varias fuentes es la clave para que tus ingresos sean estables mes a mes.',
        },
        {
          icon: 'mercado',
          title: 'El mercado convierte recursos en dinero',
          content:
            'La forma más directa de ganar dinero gratis en Xnova es publicar ofertas de metal, cristal o deuterio en el mercado. Otro jugador paga por ellas y tú recibes tokens TUNG al instante.\n\nNo es un esquema de enriquecimiento rápido: requiere constancia y algo de estrategia de precios. Pero la barrera de entrada es cero.',
        },
      ]}
      faqs={[
        {
          q: '¿Realmente se puede ganar dinero jugando?',
          a: 'Sí. En Xnova el dinero sale de la demanda real de recursos entre jugadores, por eso las ventas del mercado se pagan de verdad.',
        },
        {
          q: '¿Cuánto dinero puedo ganar al mes?',
          a: 'Depende de tu dedicación, del nivel de tus minas y de lo bien que vendas. Cuanto mayor sea tu producción y mejor tu precio, mayor será tu ingreso.',
        },
        {
          q: '¿Necesito pagar impuestos por lo que gano?',
          a: 'Las ganancias en criptomonedas pueden estar sujetas a impuestos según tu país. Te recomendamos consultar con un asesor fiscal local.',
        },
      ]}
      ctaText="Empezar a ganar dinero gratis"
    />
  );
}

export function CincoPasosPage() {
  return (
    <SEOLandingPage
      title="5 Pasos para Ganar Criptomonedas Gratis | Xnova"
      description="Guía de 5 pasos para ganar criptomonedas gratis en Xnova: regístrate, construye minas, vende tus recursos en el mercado y retira tus tokens TUNG."
      keywords="5 pasos para ganar criptomonedas, como ganar crypto de manera gratis, guia ganar criptomonedas, empezar play to earn, generar ingresos gratis, Xnova"
      h1="5 Pasos para Ganar Criptomonedas Gratis en Xnova"
      subheading="Una guía rápida y sencilla para empezar a ganar hoy mismo. Sin inversión, sin experiencia previa y sin complicaciones."
      sections={[
        {
          icon: 'paso1',
          title: 'Paso 1: regístrate gratis en Xnova',
          content:
            'Crear tu cuenta toma menos de un minuto. Solo necesitas un email y una contraseña. No te pedimos wallet, no necesitas depositar nada y no hay letra pequeña.\n\nXnova es 100% gratuito: sin costes ocultos, sin suscripciones y sin compras obligatorias.',
        },
        {
          icon: 'paso2',
          title: 'Paso 2: construye tus minas y produce recursos',
          content:
            'Al entrar recibes tu planeta inicial. Tu primera misión es construir las minas básicas: metal, cristal y planta de energía solar.\n\nEstos edificios producen las 24 horas, incluso desconectado. Cuanto más las mejores, más excedente tendrás para vender.',
        },
        {
          icon: 'paso3',
          title: 'Paso 3: vende tus recursos en el mercado y gana dinero gratis',
          content:
            'Este es el paso que convierte el juego en ingresos. Entra al mercado, publica una oferta de metal o cristal al precio que quieras y espera comprador.\n\nCuando otro jugador la acepta recibes tokens TUNG al instante. Repetirlo a diario es la base de todo ingreso estable en Xnova.',
        },
        {
          icon: 'paso4',
          title: 'Paso 4: expande tu imperio y únete a una alianza',
          content:
            'Coloniza nuevos planetas, investiga tecnologías, construye tu flota y entra en una alianza.\n\nMás planetas significan más producción, y más producción significa más excedente que vender. Las alianzas además facilitan el comercio y la defensa.',
        },
        {
          icon: 'paso5',
          title: 'Paso 5: retira tus ganancias a tu wallet',
          content:
            'Cuando tengas tokens acumulados, conéctate con MetaMask o cualquier wallet Web3 compatible con BSC, indica el importe y confirma.\n\nTus tokens TUNG llegan tras la confirmación en cadena y desde ahí puedes intercambiarlos por otras criptomonedas.',
        },
      ]}
      faqs={[
        {
          q: '¿En cuánto tiempo empiezo a ganar criptomonedas?',
          a: 'Tus minas producen desde el primer minuto y puedes cerrar tu primera venta en el mercado el mismo día.',
        },
        {
          q: '¿Necesito experiencia previa en criptomonedas?',
          a: 'No. Xnova está pensado para principiantes: puedes jugar y acumular tokens sin saber nada de crypto. Solo necesitas una wallet al retirar.',
        },
        {
          q: '¿Cómo se generan ingresos gratis sin invertir?',
          a: 'Vendiendo el excedente que producen tus minas. La materia prima te sale gratis, así que cada venta es beneficio puro.',
        },
        {
          q: '¿Puedo seguir estos 5 pasos desde el celular?',
          a: 'Sí. Xnova funciona 100% en navegadores móviles: Android, iPhone o tablet. Sin descargar apps.',
        },
      ]}
      ctaText="Seguir los 5 pasos y ganar crypto"
    />
  );
}

export function GenerarIngresosGratisPage() {
  return (
    <SEOLandingPage
      title="Como Generar Ingresos Gratis Desde Internet | Xnova"
      description="Aprende cómo generar ingresos gratis sin invertir: en Xnova produces recursos con tus minas, los vendes en el mercado y cobras en criptomonedas."
      keywords="como generar ingresos gratis, generar ingresos gratis, ganar dinero sin invertir, ingresos pasivos gratis, ganar crypto gratis, Xnova"
      h1="Cómo Generar Ingresos Gratis Sin Invertir Nada"
      subheading="La mayoría de métodos para generar ingresos exigen capital inicial. En Xnova la materia prima te sale gratis: la producen tus minas."
      sections={[
        {
          icon: 'problema',
          title: 'El problema de casi todos los métodos "gratis"',
          content:
            'Trading, dropshipping, staking o cualquier negocio online requieren capital, formación o ambos. Y las alternativas realmente gratuitas suelen pagar cantidades ridículas por mucho tiempo invertido.\n\nPara que un método sea sostenible necesitas que exista una demanda real de algo que tú puedas producir sin coste.',
        },
        {
          icon: 'solucion',
          title: 'Cómo generar ingresos gratis en Xnova',
          content:
            'En Xnova construyes minas de metal, cristal y deuterio. Producen las 24 horas del día, incluso desconectado, y no te cuestan nada.\n\nEse material tiene demanda real: otros jugadores lo necesitan para construir y avanzar. Cuando lo vendes en el mercado P2P recibes tokens TUNG, que puedes retirar a tu wallet.',
        },
        {
          icon: 'pasos',
          title: 'Los 4 pasos para empezar hoy',
          content:
            '1) Regístrate gratis, sin tarjeta ni wallet. 2) Sube el nivel de tus minas de metal y cristal antes que nada. 3) Publica tu excedente en el mercado a un precio competitivo. 4) Reinvierte parte de lo ganado en más minas y repite.\n\nEs un ciclo: más minas producen más excedente, más excedente son más ventas y más ventas son más tokens.',
        },
        {
          icon: 'realismo',
          title: 'Expectativas realistas',
          content:
            'Nadie se hace rico en una semana. Lo que sí ocurre es que un jugador constante genera un flujo creciente de ingresos sin haber puesto dinero.\n\nComo no arriesgas capital, el único coste es tu tiempo. Y ese tiempo también te devuelve un juego de estrategia completo.',
        },
      ]}
      faqs={[
        {
          q: '¿De verdad se pueden generar ingresos gratis sin invertir?',
          a: 'Sí, cuando produces algo que otros necesitan. En Xnova produces recursos sin coste y los vendes a otros jugadores en el mercado.',
        },
        {
          q: '¿Cuál es la forma más rápida de empezar a generar ingresos?',
          a: 'Subir las minas de metal y cristal en tus primeras horas de juego y vender el excedente en cuanto lo tengas.',
        },
        {
          q: '¿Hay que pagar algo en algún momento?',
          a: 'No. Los depósitos existen solo para quien quiera acelerar su progreso, pero nunca son necesarios para ganar.',
        },
        {
          q: '¿Puedo retirar lo que gano?',
          a: 'Sí. Desde la wallet integrada puedes retirar tus tokens TUNG a cualquier wallet Web3 compatible con la red BSC.',
        },
      ]}
      ctaText="Empezar a generar ingresos gratis"
    />
  );
}

export function VenderRecursosPage() {
  return (
    <SEOLandingPage
      title="Vender Recursos y Ganar Dinero Gratis | Mercado de Xnova"
      description="En el mercado de Xnova vendes metal, cristal y deuterio a otros jugadores y ganas dinero gratis en tokens TUNG. Tus minas producen la materia prima sin coste."
      keywords="vender recursos y ganar dinero, mercado P2P de recursos, ganar dinero gratis, comerciar recursos juego, generar ingresos gratis, Xnova"
      h1="Vende tus Recursos en el Mercado y Gana Dinero Gratis"
      subheading="El excedente que no usas es dinero parado. El mercado de Xnova lo convierte en tokens que puedes retirar."
      sections={[
        {
          icon: 'mercado',
          title: 'Qué es el mercado de Xnova',
          content:
            'El mercado es un tablón de ofertas entre jugadores. Publicas una cantidad de metal, cristal o deuterio al precio que decidas y cualquier jugador puede comprarla.\n\nEn cuanto alguien acepta tu oferta, los tokens TUNG entran en tu balance. No hay intermediarios ni esperas largas.',
        },
        {
          icon: 'porque',
          title: 'Por qué vender recursos es dinero gratis',
          content:
            'La materia prima no te cuesta nada: la producen tus minas de forma automática, estés o no conectado. Por eso cada venta es beneficio neto.\n\nEs la diferencia entre acumular recursos que no usas y convertirlos en ingresos reales de forma continua.',
        },
        {
          icon: 'estrategia',
          title: 'Estrategia de precios para ganar más',
          content:
            'Revisa las ofertas activas antes de publicar. Si hay mucha oferta de metal, baja ligeramente el precio para vender rápido; si escasea el deuterio, sube el tuyo.\n\nComprar barato lo que sobra y vender caro lo que falta es la forma más rentable de operar en el mercado, y no requiere ninguna inversión previa.',
        },
        {
          icon: 'escalar',
          title: 'Cómo escalar tus ingresos',
          content:
            'Reinvierte parte de lo que ganas en subir minas y colonizar nuevos planetas. Cada nivel aumenta tu producción por hora y por tanto tu excedente vendible.\n\nCon varios planetas produciendo, tus ventas diarias crecen sin que tengas que dedicar más tiempo.',
        },
      ]}
      faqs={[
        {
          q: '¿Cómo vendo mis recursos en Xnova?',
          a: 'Entra a la sección Mercado, crea una oferta indicando el recurso, la cantidad y el precio, y publícala. Cobras cuando otro jugador la compra.',
        },
        {
          q: '¿Qué recurso deja más beneficio?',
          a: 'Depende de la demanda del momento. El deuterio suele ser el más escaso y el mejor pagado, pero el metal se vende con más frecuencia.',
        },
        {
          q: '¿Se puede ganar dinero gratis solo vendiendo recursos?',
          a: 'Sí. Es la fuente de ingresos principal para la mayoría de jugadores, y no requiere invertir nada porque los recursos los producen tus minas.',
        },
        {
          q: '¿Puedo retirar lo que gano vendiendo?',
          a: 'Sí. Los tokens TUNG que recibes se acumulan en tu wallet integrada y puedes retirarlos a cualquier wallet Web3 compatible con BSC.',
        },
      ]}
      ctaText="Empezar a vender recursos"
    />
  );
}
