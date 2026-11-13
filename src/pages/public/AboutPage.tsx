import { Link } from 'react-router-dom';
import { SEO, schemas } from '../../components/ui/SEO';

const KEYWORDS =
  'Imperium, xnova juego, xnova ogame, juego play to earn español, quienes somos, sobre nosotros, token TUNG, juego de estrategia espacial gratis, generar ingresos gratis';

export function AboutPage() {
  return (
    <>
      <SEO
        title="Sobre Imperium | Nuestra Historia y Visión"
        description="Conoce la historia de Imperium, el juego de estrategia espacial tipo OGame donde generas ingresos gratis vendiendo tus recursos en el mercado y ganas criptomonedas reales."
        keywords={KEYWORDS}
        schema={schemas.organization}
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani']">
        {/* Navbar */}
        <nav className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src="/navbar-logo.png"
                  alt="Imperium Logo"
                  className="h-10 w-10 object-contain"
                />
                <span
                  className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  IMPERIUM
                </span>
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  to="/blog"
                  className="text-sm text-slate-300 hover:text-cyan-400 transition-colors"
                >
                  Blog
                </Link>
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
                >
                  Regístrate
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative py-24 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-1000" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Sobre{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Imperium
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              La plataforma que fusiona la estrategia espacial clásica de{' '}
              <span className="text-cyan-400 font-semibold">OGame</span> y{' '}
              <span className="text-cyan-400 font-semibold">Imperium</span> con la economía
              blockchain moderna. Creada por y para la comunidad hispanohablante.
            </p>
          </div>
        </section>

        {/* Nuestra Historia */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="p-8 sm:p-10 rounded-2xl bg-white/[0.02] border border-white/5">
              <h2
                className="text-2xl sm:text-3xl font-bold mb-6 flex items-center gap-3"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                <span className="text-3xl">📖</span> Nuestra Historia
              </h2>
              <div className="text-slate-300 leading-relaxed space-y-4">
                <p>
                  Imperium nació de una idea simple: <strong>¿por qué los juegos de estrategia espacial no pueden pagarte por jugar?</strong> Miles de jugadores pasan horas construyendo imperios en OGame, pero nunca reciben nada a cambio.
                </p>
                <p>
                  En 2025, un equipo de desarrolladores y gamers apasionados decidió cambiar eso. Combinamos la experiencia de juego clásica con la tecnología blockchain para crear la primera experiencia <strong>play-to-earn</strong> realmente gratuita en español, donde cada hora de juego genera valor real.
                </p>
                <p>
                  Hoy, nuestra comunidad sigue creciendo como la mejor alternativa a OGame y Imperium con recompensas en criptomonedas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Misión y Visión */}
        <section className="py-16 bg-white/[0.01]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                <div className="text-4xl mb-4">🎯</div>
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Nuestra Misión
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Democratizar el acceso a las criptomonedas a través del gaming. Queremos que cualquier persona, sin importar sus conocimientos técnicos, pueda ganar dinero real mientras se divierte jugando un juego de estrategia espacial de primer nivel.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                <div className="text-4xl mb-4">👁️</div>
                <h3
                  className="text-xl font-bold mb-4"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Nuestra Visión
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Ser el juego <strong>play-to-earn</strong> de referencia en el mundo hispanohablante, liderando la transición hacia una economía de gaming justa donde los jugadores son dueños de su tiempo y esfuerzo.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Valores */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              className="text-2xl sm:text-3xl font-bold text-center mb-12"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Nuestros Valores
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: '🆓', title: '100% Gratis', desc: 'Cero inversión inicial. Todos pueden jugar y ganar sin depositar un centavo.' },
                { icon: '🔒', title: 'Transparencia', desc: 'Blockchain pública. Cada transacción y recompensa es verificable.' },
                { icon: '🎮', title: 'Jugabilidad Real', desc: 'Estrategia profunda, no un simple juego de clics. Batallas reales, alianzas y economía.' },
                { icon: '🌎', title: 'Comunidad Hispana', desc: 'Creado para y por la comunidad de habla hispana. Soporte en español.' },
                { icon: '💰', title: 'Recompensas Reales', desc: 'Tokens TUNG convertibles a BTC, ETH, USDT y dinero real.' },
                { icon: '📈', title: 'Mejora Continua', desc: 'Actualizaciones semanales basadas en feedback de la comunidad.' },
              ].map((val, i) => (
                <div
                  key={i}
                  className="p-6 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all"
                >
                  <div className="text-3xl mb-3">{val.icon}</div>
                  <h3 className="font-bold text-white mb-2">{val.title}</h3>
                  <p className="text-sm text-slate-400">{val.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Token TUNG */}
        <section className="py-16 bg-white/[0.01]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="p-8 sm:p-10 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-blue-600/5 border border-cyan-500/10">
              <h2
                className="text-2xl sm:text-3xl font-bold mb-6 flex items-center gap-3"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                <span className="text-3xl">🪙</span> El Token{' '}
                <span className="text-yellow-400">TUNG</span>
              </h2>
              <div className="text-slate-300 leading-relaxed space-y-4">
                <p>
                  TUNG es el token nativo de Imperium, desplegado en la blockchain de <strong>Binance Smart Chain (BSC)</strong>. Es el corazón económico del juego.
                </p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li><strong className="text-white">Gana TUNG</strong> jugando: construye, lucha, comercia y participa en misiones.</li>
                  <li><strong className="text-white">Retira a tu wallet</strong> cuando quieras. Sin bloqueos ni minimums abusivos.</li>
                  <li><strong className="text-white">Intercambia</strong> por Bitcoin, Ethereum, USDT o dinero real en exchanges.</li>
                  <li><strong className="text-white">Úsalo</strong> dentro del juego para acelerar tu progreso o comprar objetos exclusivos.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ¿Por qué nos eligen? */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2
              className="text-2xl sm:text-3xl font-bold text-center mb-10"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              ¿Por qué elegir Imperium?
            </h2>
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5">
              <div className="text-slate-300 leading-relaxed space-y-4">
                <p>
                  Si buscas <strong className="text-cyan-400">juegos para ganar dinero real</strong>, probablemente te hayas topado con estafas, esquemas Ponzi o juegos que requieren inversión inicial. Imperium es diferente:
                </p>
                <ul className="list-disc list-inside space-y-2 text-slate-400">
                  <li>✅ <strong>Sin inversión</strong> — 100% free-to-play.</li>
                  <li>✅ <strong>Estrategia real</strong> — No es un tap-to-earn, es un verdadero juego MMO de estrategia.</li>
                  <li>✅ <strong>Probado</strong> — Comunidad creciente, desarrollo activo, contratos auditados.</li>
                  <li>✅ <strong>Comunidad activa</strong> — Discord, Telegram, Twitter con soporte en tiempo real.</li>
                  <li>✅ <strong>Hecho para hispanohablantes</strong> — Interfaz, soporte y contenido en español.</li>
                </ul>
                <p className="mt-4">
                  Somos la <strong className="text-cyan-400">mejor alternativa a OGame con criptomonedas</strong> y la evolución natural de Imperium hacia el play-to-earn.
                </p>
              </div>
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
              ¿Listo para Formar Parte de la Historia?
            </h2>
            <p className="text-slate-400 mb-8 text-lg">
              Únete a nuestra comunidad y empieza a ganar criptomonedas mientras conquistas la galaxia.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-flex px-10 py-5 text-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:scale-105"
              >
                🚀 Jugar Ahora — Es Gratis
              </Link>
              <Link
                to="/blog"
                className="inline-flex px-8 py-5 text-lg font-semibold border border-white/10 rounded-xl hover:bg-white/5 transition-all"
              >
                📖 Leer el Blog
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-white/5 text-center">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-6 mb-4 text-sm text-slate-500">
              <Link to="/" className="hover:text-cyan-400 transition-colors">Inicio</Link>
              <span>·</span>
              <Link to="/blog" className="hover:text-cyan-400 transition-colors">Blog</Link>
              <span>·</span>
              <Link to="/ganar-criptomonedas-jugando" className="hover:text-cyan-400 transition-colors">Ganar Criptomonedas</Link>
              <span>·</span>
              <Link to="/alternativa-ogame-crypto" className="hover:text-cyan-400 transition-colors">Alternativa OGame</Link>
              <span>·</span>
              <Link to="/juegos-play-to-earn-gratis" className="hover:text-cyan-400 transition-colors">Juegos P2E</Link>
            </div>
            <p className="text-xs text-slate-600">
              © {new Date().getFullYear()} Imperium. Todos los derechos reservados.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
