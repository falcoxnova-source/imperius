import { Link } from 'react-router-dom';
import { SEO } from '../../components/ui/SEO';

export function NotFoundPage() {
  return (
    <>
      <SEO
        title="Página No Encontrada | Xnova"
        description="La página que buscas no existe. Vuelve al inicio y descubre el mejor juego de estrategia espacial play-to-earn estilo OGame y Xnova."
        noIndex
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani'] flex items-center justify-center">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto px-4 text-center">
          {/* Large 404 */}
          <div
            className="text-[8rem] sm:text-[10rem] font-bold leading-none mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            404
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold mb-4"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            🚀 ¡Perdido en el Espacio!
          </h1>

          <p className="text-lg text-slate-400 mb-8 leading-relaxed">
            Esta coordenada galáctica no existe... aún.
            <br />
            La página que buscas fue destruida por una tormenta solar o nunca existió.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/"
              className="px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-xl shadow-cyan-500/25"
            >
              🏠 Volver al Inicio
            </Link>
            <Link
              to="/register"
              className="px-8 py-4 text-lg font-semibold border border-white/10 rounded-xl hover:bg-white/5 transition-all duration-300"
            >
              🎮 Regístrate
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-slate-500">
            <Link to="/blog" className="hover:text-cyan-400 transition-colors">📖 Blog</Link>
            <Link to="/ganar-criptomonedas-jugando" className="hover:text-cyan-400 transition-colors">💰 Ganar Criptomonedas</Link>
            <Link to="/alternativa-ogame-crypto" className="hover:text-cyan-400 transition-colors">🪐 Alternativa OGame</Link>
            <Link to="/about" className="hover:text-cyan-400 transition-colors">ℹ️ Sobre Nosotros</Link>
          </div>
        </div>
      </div>
    </>
  );
}
