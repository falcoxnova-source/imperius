import { Link } from 'react-router-dom';
import { SEO, schemas } from '../../components/ui/SEO';

const KEYWORDS = 'roadmap Imperium, hoja de ruta Imperium, novedades juego, próximas características, actualizaciones Imperium, xnova ogame';

const roadmapItems = [
  {
    quarter: 'Q2 2026',
    status: 'completado',
    color: 'bg-green-500',
    items: [
      'Lanzamiento oficial del juego',
      'Sistema de batallas PvP',
      'Token TUNG en Binance Smart Chain',
      'Mercado P2P de recursos',
      'Sistema de alianzas',
      'Misiones diarias y premium',
    ],
  },
  {
    quarter: 'Q3 2026',
    status: 'en-progreso',
    color: 'bg-cyan-500',
    items: [
      'Nuevo universo con reglas aceleradas',
      'Sistema de expediciones mejorado',
      'Eventos semanales con recompensas extra',
      'App móvil PWA optimizada',
      'Soporte para wallets móviles (WalletConnect)',
    ],
  },
  {
    quarter: 'Q4 2026',
    status: 'planeado',
    color: 'bg-purple-500',
    items: [
      'Sistema de NFTs: naves exclusivas',
      'Torneos y ligas competitivas',
      'Sistema de gobernanza comunitaria',
      'Integración con más blockchains (Polygon, Solana)',
      'Marketplace de skins y personalización',
    ],
  },
  {
    quarter: '2027',
    status: 'vision',
    color: 'bg-slate-500',
    items: [
      'Expansión a múltiples universos',
      'Modo espectador y replay de batallas',
      'API pública para desarrolladores',
      'Traducción a más idiomas (portugués, francés)',
      'Eventos presenciales y torneos con premios en USDT',
    ],
  },
];

export function RoadmapPage() {
  return (
    <>
      <SEO
        title="Roadmap de Imperium | Hoja de Ruta y Próximas Novedades"
        description="Conoce la hoja de ruta de Imperium, el juego de estrategia espacial play-to-earn. Descubre las próximas características, actualizaciones y novedades planificadas."
        keywords={KEYWORDS}
        schema={schemas.organization}
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani']">
        <nav className="sticky top-0 z-50 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3">
                <img src="/navbar-logo.png" alt="Imperium" className="h-10 w-10 object-contain" loading="lazy" />
                <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent" style={{ fontFamily: 'Orbitron, sans-serif' }}>IMPERIUM</span>
              </Link>
              <div className="flex items-center gap-4">
                <Link to="/blog" className="text-sm text-slate-300 hover:text-cyan-400">Blog</Link>
                <Link to="/about" className="text-sm text-slate-300 hover:text-cyan-400">Sobre Nosotros</Link>
                <Link to="/register" className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all">Regístrate</Link>
              </div>
            </div>
          </div>
        </nav>

        <section className="relative py-24 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-1000" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Orbitron, sans-serif' }}>
              Hoja de{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Ruta
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
              Conoce las próximas características y actualizaciones planificadas para Imperium.
              Este roadmap es nuestra visión y puede cambiar según el feedback de la comunidad.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500 via-blue-500 to-purple-500 transform md:-translate-x-1/2" />

              {roadmapItems.map((item, i) => (
                <div key={item.quarter} className={`relative flex items-start gap-6 mb-16 ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                  {/* Dot on timeline */}
                  <div className="absolute left-4 md:left-1/2 w-4 h-4 rounded-full bg-cyan-400 border-4 border-[#0a0e17] transform -translate-x-1/2 mt-2 z-10 shadow-lg shadow-cyan-500/50" />

                  {/* Content card */}
                  <div className="ml-12 md:ml-0 md:w-1/2 md:px-8">
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${item.status === 'completado' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : item.status === 'en-progreso' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse' : item.status === 'planeado' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                          {item.status === 'completado' ? '✅ Completo' : item.status === 'en-progreso' ? '🔄 En desarrollo' : item.status === 'planeado' ? '📋 Planeado' : '🔭 Visión'}
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold mb-4 text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                        {item.quarter}
                      </h3>
                      <ul className="space-y-3">
                        {item.items.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-slate-300">
                            <span className="text-cyan-400 mt-1">✦</span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 text-center">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold mb-6" style={{ fontFamily: 'Orbitron, sans-serif' }}>
              ¿Quieres Influir en el Roadmap?
            </h2>
            <p className="text-slate-400 mb-8">
              Únete a nuestro Discord y comparte tus ideas. La comunidad decide las prioridades.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register" className="px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-xl shadow-cyan-500/25">
                Regístrate
              </Link>
              <Link to="/blog" className="px-8 py-4 text-lg font-semibold border border-white/10 rounded-xl hover:bg-white/5 transition-all">
                Leer el Blog
              </Link>
            </div>
          </div>
        </section>

        <footer className="py-8 border-t border-white/5 text-center">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 mb-4">
              <Link to="/" className="hover:text-cyan-400">Inicio</Link>
              <span>·</span>
              <Link to="/about" className="hover:text-cyan-400">Sobre Nosotros</Link>
              <span>·</span>
              <Link to="/blog" className="hover:text-cyan-400">Blog</Link>
            </div>
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} Imperium. Todos los derechos reservados.</p>
          </div>
        </footer>
      </div>
    </>
  );
}
