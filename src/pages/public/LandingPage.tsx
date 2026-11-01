import { Link } from 'react-router-dom';
import { SEO, schemas } from '../../components/ui/SEO';
import { useEffect, useState } from 'react';
import { usePublicGameStats, formatUsdt } from '../../lib/publicStats';
import { WHATSAPP_COMMUNITY_URL, WhatsAppIcon } from '../../components/ui/WhatsAppCommunity';

const TUNG_SWAP_URL =
  'https://falcoxswap.com/?inputCurrency=BNB&outputCurrency=0x09514EcF8270C12101D077B5e8B034B164F71C5f';

const KEYWORDS =
  'Xnova, xnova juego, xnova online, xnova ogame, juego tipo OGame, alternativa a OGame, como generar ingresos gratis, generar ingresos gratis, como ganar crypto de manera gratis, ganar crypto gratis, ganar criptomonedas jugando, vender recursos y ganar dinero, mercado P2P de recursos, juegos play to earn gratis sin inversion, ganar dinero gratis por internet, token TUNG';

const faqData = [
  {
      q: '¿Qué es Xnova?',
    a: 'Xnova es un juego de estrategia espacial gratuito tipo OGame en el que produces recursos, los vendes en el mercado entre jugadores y ganas criptomonedas reales (token TUNG) sin invertir nada.',
  },
  {
      q: '¿Cómo ganar crypto de manera gratis en Xnova?',
    a: 'Construyes minas de metal, cristal y deuterio que producen las 24 horas sin coste. Publicas el excedente en el mercado P2P y, cuando otro jugador lo compra, recibes tokens TUNG que puedes retirar a tu wallet.',
  },
  {
      q: '¿Cómo generar ingresos gratis vendiendo recursos en el mercado?',
    a: 'La materia prima te sale gratis porque la producen tus minas, así que cada venta es beneficio neto. Vende cuando un recurso escasea y compra cuando sobra para aumentar tu margen sin poner dinero.',
  },
  {
      q: '¿Es Xnova realmente gratis? ¿Puedo ganar sin invertir?',
    a: 'Sí, 100% gratis. No necesitas depositar nada ni comprar NFTs. Te registras, juegas y acumulas tokens TUNG que puedes retirar a tu wallet.',
  },
  {
      q: '¿Xnova es similar a OGame?',
    a: 'Sí. Mismas mecánicas: gestión de recursos, construcción, investigación, flotas, combate, alianzas y colonización. La diferencia es que en Xnova ganas criptomonedas reales.',
  },
  {
      q: '¿Cómo retiro mis ganancias?',
    a: 'Conecta MetaMask o cualquier wallet Web3 compatible con BSC. Los tokens TUNG se transfieren a tu wallet y puedes intercambiarlos por otras criptomonedas.',
  },
  {
      q: '¿Cuánto puedo ganar jugando a Xnova?',
    a: 'Depende de tu actividad y de lo bien que vendas en el mercado. Cuanto mayor sea el nivel de tus minas y más constante tu comercio, mayores serán tus ingresos.',
  },
  {
      q: '¿Necesito wallet para empezar?',
    a: 'No. Puedes jugar y acumular tokens sin wallet. Solo la necesitas cuando quieras retirar tus ganancias.',
  },
];

// Guías en video creadas por youtubers/creadores de contenido.
// Para añadir una nueva guía, agrega un objeto con el id del video de YouTube
// (la parte después de "watch?v=") y su título.
const videoGuides = [
  {
    id: 'bfKO1OII1VM',
    title: 'Cómo Jugar Xnova desde 0 — Tutorial Completo para Principiantes',
    author: 'Guía oficial',
  },
  {
    id: 'M_z2g6N3Z4A',
    title: 'Cómo comprar y depositar TUNG en el juego',
    author: 'Guía paso a paso',
  },
  {
    id: 'hSebzn-G2ZI',
    title: 'Vídeo del ecosistema Xnova',
    author: 'Ecosistema Xnova',
  },
  {
    id: 'OzYS9lzQ9Jw',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'aX80OPQK2dw',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'uThnvmIOTSk',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'bAutDtt4W_U',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'pOBzzmJuhcE',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'tbF5bFz5_5o',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'C8Y2tK2RnIc',
    title: 'Guía de Xnova',
    author: 'Comunidad Xnova',
  },
  {
    id: 'EUWHH8KrvU8',
    title: 'Esta JOYA Sigue Creciendo: Nueva Actualización en XNOVA (Free To Play)',
    author: 'TKSITO GAME',
  },
  {
    id: 'fIOe2Yxl3IA',
    title: 'JUEGA XNOVA Y GANA TOKENS TUNG — JUEGO ADICTIVO FREE',
    author: 'Enrique Tech',
  },
];

// Cuántas guías se muestran por página en la rejilla de videos.
const VIDEOS_PER_PAGE = 6;

export function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);
  const [videoPage, setVideoPage] = useState(0);
  const stats = usePublicGameStats();

  const secondaryVideos = videoGuides.slice(1);
  const totalVideoPages = Math.max(1, Math.ceil(secondaryVideos.length / VIDEOS_PER_PAGE));
  const pagedVideos = secondaryVideos.slice(
    videoPage * VIDEOS_PER_PAGE,
    videoPage * VIDEOS_PER_PAGE + VIDEOS_PER_PAGE
  );

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Cifras reales del juego (RPC get_game_stats). Mientras cargan se muestra
  // un placeholder neutro en lugar de valores inventados.
  const LOADING = '···';
  const heroStats = [
    {
      value: stats ? stats.total_players.toLocaleString() : LOADING,
      label: 'Jugadores registrados',
    },
    {
      value: stats ? formatUsdt(stats.total_withdrawn) : LOADING,
      label: 'Retirado por jugadores',
    },
    {
      value: stats ? formatUsdt(stats.total_jackpot_usdt) : LOADING,
      label: 'En premios acumulados',
    },
    { value: '100%', label: 'Gratis · Sin Inversión' },
  ];

  const breadcrumbSchema = schemas.breadcrumbList([
    { name: 'Inicio', url: 'https://falcoxnova.com/' },
  ]);

  const faqSchema = schemas.faqPage(faqData);

  return (
    <>
      <SEO
        title="Xnova | Gana Criptomonedas Gratis Jugando | Juego Tipo OGame"
        description="Xnova es el juego de estrategia espacial tipo OGame donde generas ingresos gratis: vende tus recursos en el mercado y gana criptomonedas reales sin invertir."
        keywords={KEYWORDS}
        schema={[schemas.webApplication, schemas.aggregateRating({ ratingValue: 4.5, bestRating: 5, ratingCount: 45 }), breadcrumbSchema, faqSchema]}
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani'] overflow-x-hidden">
        {/* ===== NAVBAR ===== */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0e17]/90 backdrop-blur-xl border-b border-white/5" role="navigation" aria-label="Navegación principal">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link to="/" className="flex items-center gap-3">
                <img
                  src="/Imagenes/Visuales/main_city.webp"
                  alt="Imperium Logo"
                  loading="lazy"
                  className="h-10 w-10 object-cover rounded-full ring-2 ring-amber-500/60"
                />
                <span
                  className="text-xl font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent"
                  style={{ fontFamily: 'Cinzel, serif' }}
                >
                  IMPERIUM
                </span>
              </Link>
              <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
                <a href="#features" className="hover:text-cyan-400 transition-colors">
                  Características
                </a>
                <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
                  Cómo Funciona
                </a>
                <a href="#earn" className="hover:text-cyan-400 transition-colors">
                  Ganancias
                </a>
                <a href="#faq" className="hover:text-cyan-400 transition-colors">
                  FAQ
                </a>
                <Link to="/blog" className="hover:text-cyan-400 transition-colors">
                  Blog
                </Link>
                <Link to="/about" className="hover:text-cyan-400 transition-colors">
                  Sobre Nosotros
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Iniciar Sesión
                </Link>
                <Link
                  to="/register"
                  className="px-5 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-lg shadow-cyan-500/20"
                >
                  Regístrate
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* ===== HERO ===== */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          {/* Animated background */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-1000" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
            {/* Grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)',
                backgroundSize: '60px 60px',
              }}
            />
            {/* Floating planets */}
            <div className="absolute top-[15%] right-[10%] w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/10 animate-bounce" style={{animationDuration: '8s'}} />
            <div className="absolute bottom-[25%] left-[8%] w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-500/10 animate-bounce" style={{animationDuration: '6s', animationDelay: '2s'}} />
            <div className="absolute top-[40%] left-[15%] w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400/10 to-blue-400/10 border border-cyan-400/10 animate-pulse" style={{animationDuration: '4s'}} />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div
              className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center transition-all duration-1000 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {/* Columna Izquierda - Texto */}
              <div>
                {/* Badge - comunidad de WhatsApp */}
                <a
                  href={WHATSAPP_COMMUNITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 mb-8 hover:bg-green-500/20 hover:border-green-400/50 transition-all duration-300"
                >
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <WhatsAppIcon className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-300 font-medium">
                    Únete a nuestra comunidad de WhatsApp
                  </span>
                  <span className="text-green-400 group-hover:translate-x-1 transition-transform">→</span>
                </a>

                <h1
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Gana{' '}
                  <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Criptomonedas
                  </span>{' '}
                  Gratis
                  <br />
                  Jugando a Xnova
                </h1>

                <p className="text-lg sm:text-xl text-slate-400 mb-10 leading-relaxed">
                  <span className="text-white font-semibold">Xnova</span> es el juego de
                  estrategia espacial multijugador tipo{' '}
                  <span className="text-cyan-400 font-semibold">OGame</span> donde{' '}
                  <span className="text-white font-semibold">generas ingresos gratis</span>:
                  tus minas producen recursos sin coste y al{' '}
                  <span className="text-cyan-400 font-semibold">venderlos en el mercado</span>{' '}
                  ganas tokens{' '}
                  <span className="text-yellow-400 font-semibold">TUNG</span> convertibles
                  a dinero real.{' '}
                  <span className="text-white font-semibold">100% gratis, sin inversión.</span>
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    to="/register"
                    className="group px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105"
                  >
                    🎮 Empezar a Ganar Ahora
                    <span className="block text-sm font-normal text-cyan-200 mt-1">
                      Sin depósito · Registro en 30 segundos
                    </span>
                  </Link>
                  <a
                    href="#how-it-works"
                    className="px-8 py-4 text-lg font-semibold border border-white/10 rounded-xl hover:bg-white/5 transition-all duration-300"
                  >
                    ▶️ Ver Cómo Funciona
                  </a>
                </div>

                {/* Comprar TUNG */}
                <a
                  href={TUNG_SWAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Comprar TUNG en Falcox Swap (abre en una pestaña nueva)"
                  className="group mt-6 flex items-center gap-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/15 hover:border-yellow-400/50 transition-all duration-300"
                >
                  <img
                    src="/Imagenes/alianzas/tung.png"
                    alt="TUNG"
                    loading="lazy"
                    className="h-12 w-12 object-contain flex-shrink-0"
                  />
                  <div className="flex-1 text-left">
                    <div className="text-base sm:text-lg font-bold text-yellow-300">
                      ¿Quieres adelantar? Compra TUNG aquí
                    </div>
                    <div className="text-sm text-slate-400">
                      Con TUNG aceleras construcciones, flotas e investigaciones y compras
                      recursos en el mercado.
                    </div>
                  </div>
                  <span className="hidden sm:inline-block px-4 py-2 text-sm font-bold text-[#0a0e17] bg-yellow-400 rounded-lg group-hover:bg-yellow-300 transition-colors whitespace-nowrap">
                    Comprar TUNG →
                  </span>
                </a>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mt-12">
                  {heroStats.map((stat) => (
                    <div
                      key={stat.label}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/5 backdrop-blur-sm"
                    >
                      <div
                        className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        {stat.value}
                      </div>
                      <div className="text-xs sm:text-sm text-slate-500 mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna Derecha - Imagen */}
              <div className="relative flex justify-center lg:justify-end">
                <div className="relative">
                  {/* Glow effect behind image */}
                  <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-3xl blur-3xl" />
                  <img
                    src="https://photos.pinksale.finance/file/pinksale-logo-upload/1780084974042-31e656c333398b759f995c601c1e102e.png"
                    alt="Xnova - Juego de estrategia espacial"
                    loading="lazy"
                    className="relative w-full max-w-md lg:max-w-lg rounded-2xl shadow-2xl shadow-cyan-500/10 border border-white/5"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== ECONOMIA EN VIVO (datos reales de la base de datos) ===== */}
        <section id="economia" className="py-16 sm:py-20 relative border-y border-white/5 bg-white/[0.015]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm text-green-300 font-medium">Datos en vivo</span>
              </div>
              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                📊{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  La Economía Real de Xnova
                </span>
              </h2>
              <p className="text-slate-400 text-lg">
                Nada de cifras infladas: estos números salen directamente del servidor y se
                actualizan cada vez que cargas esta página.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  icon: '👥',
                  value: stats ? stats.total_players.toLocaleString() : LOADING,
                  label: 'Jugadores registrados',
                  sub: stats ? `${stats.ranked_players.toLocaleString()} activos en el ranking` : '',
                  color: 'from-cyan-400 to-blue-400',
                  border: 'border-cyan-500/20',
                },
                {
                  icon: '💰',
                  value: stats ? formatUsdt(stats.total_withdrawn) : LOADING,
                  label: 'Retirado por jugadores',
                  sub: stats
                    ? `${Math.round(stats.total_withdrawn_tung).toLocaleString()} TUNG enviados a wallets`
                    : '',
                  color: 'from-green-400 to-emerald-400',
                  border: 'border-green-500/20',
                },
                {
                  icon: '🏆',
                  value: stats ? formatUsdt(stats.total_jackpot_usdt) : LOADING,
                  label: 'En premios acumulados',
                  sub: stats
                    ? `${Math.round(stats.total_jackpot_fxu).toLocaleString()} TUNG en 4 pools`
                    : '',
                  color: 'from-yellow-400 to-amber-400',
                  border: 'border-yellow-500/20',
                },
                {
                  icon: '🔄',
                  value: stats ? formatUsdt(stats.market_volume_usdt) : LOADING,
                  label: 'Volumen del mercado P2P',
                  sub: stats
                    ? `${stats.market_transactions.toLocaleString()} operaciones entre jugadores`
                    : '',
                  color: 'from-orange-400 to-amber-400',
                  border: 'border-orange-500/20',
                },
                {
                  icon: '📥',
                  value: stats ? formatUsdt(stats.total_deposited) : LOADING,
                  label: 'Depositado en el juego',
                  sub: stats
                    ? `${Math.round(stats.total_deposited_tung).toLocaleString()} TUNG confirmados`
                    : '',
                  color: 'from-purple-400 to-fuchsia-400',
                  border: 'border-purple-500/20',
                },
                {
                  icon: '🚀',
                  value: stats ? formatUsdt(stats.expedition_pool_fxu * stats.tung_price_usd) : LOADING,
                  label: 'Bote de expediciones',
                  sub: stats
                    ? `${Math.round(stats.expedition_pool_fxu).toLocaleString()} TUNG · 1% de probabilidad`
                    : '',
                  color: 'from-sky-400 to-cyan-400',
                  border: 'border-sky-500/20',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`p-4 sm:p-6 rounded-2xl bg-white/[0.02] border ${stat.border} backdrop-blur-sm hover:bg-white/[0.04] transition-colors`}
                >
                  <div className="text-2xl mb-2">{stat.icon}</div>
                  <div
                    className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-sm text-slate-300 mt-1 font-medium">{stat.label}</div>
                  {stat.sub && <div className="text-xs text-slate-500 mt-1">{stat.sub}</div>}
                </div>
              ))}
            </div>

            {stats && (
              <p className="text-center text-xs text-slate-500 mt-8">
                Conversión a USDT calculada con el precio real de TUNG:{' '}
                <span className="text-cyan-400 font-semibold">
                  1 TUNG = ${stats.tung_price_usd}
                </span>
              </p>
            )}

            <div className="text-center mt-10">
              <Link
                to="/register"
                className="inline-block px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105"
              >
                🎮 Únete y empieza a ganar
              </Link>
            </div>
          </div>
        </section>

        <section id="video-guias" className="py-16 sm:py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="text-center max-w-3xl mx-auto mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm text-red-300 font-medium">▶️ Guías en Video</span>
              </div>
              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                🎬{' '}
                <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Cómo Jugar Xnova desde 0
                </span>
              </h2>
              <p className="text-lg text-slate-400">
                Mira este tutorial completo y aprende paso a paso cómo empezar en Xnova:{' '}
                construir tu imperio, gestionar recursos, investigar tecnologías y ganar{' '}
                <span className="text-yellow-400 font-semibold">TUNG</span> desde el primer día.
              </p>
            </div>

            {/* Featured video */}
            <div className="max-w-4xl mx-auto">
              <div className="rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5 shadow-2xl shadow-cyan-500/10 hover:border-cyan-500/30 transition-all duration-300">
                <div className="relative aspect-video">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoGuides[0].id}`}
                    title={videoGuides[0].title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-1">
                    {videoGuides[0].title}
                  </h3>
                  <p className="text-sm text-cyan-400">{videoGuides[0].author}</p>
                </div>
              </div>
            </div>

            {/* More videos grid (paginado) */}
            {secondaryVideos.length > 0 && (
              <>
                <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 mt-10">
                  {pagedVideos.map((video) => (
                    <div
                      key={video.id}
                      className="group rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-cyan-500/10"
                    >
                      <div className="relative aspect-video">
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${video.id}`}
                          title={video.title}
                          loading="lazy"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                      <div className="p-5">
                        <h3 className="text-base sm:text-lg font-semibold text-white mb-1">
                          {video.title}
                        </h3>
                        <p className="text-sm text-cyan-400">{video.author}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {totalVideoPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-8">
                    <button
                      type="button"
                      onClick={() => setVideoPage((p) => (p - 1 + totalVideoPages) % totalVideoPages)}
                      aria-label="Videos anteriores"
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.03] border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all duration-200"
                    >
                      ‹
                    </button>

                    <div className="flex items-center gap-2">
                      {Array.from({ length: totalVideoPages }).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setVideoPage(i)}
                          aria-label={`Página de videos ${i + 1}`}
                          className={`h-2.5 rounded-full transition-all duration-200 ${
                            i === videoPage
                              ? 'w-6 bg-cyan-400'
                              : 'w-2.5 bg-white/20 hover:bg-white/40'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setVideoPage((p) => (p + 1) % totalVideoPages)}
                      aria-label="Videos siguientes"
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.03] border border-white/10 text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all duration-200"
                    >
                      ›
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Creator hint */}
            <div className="text-center mt-10">
              <p className="text-slate-500 text-sm">
                ¿Eres creador de contenido? Crea tu guía en video y súmate a la comunidad Xnova.
              </p>
            </div>
          </div>
        </section>

        {/* ===== TUNG CHART SECTION ===== */}
        <section className="py-10 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl overflow-hidden border border-white/5">
              <iframe
                src="https://dexscreener.com/bsc/0x09514EcF8270C12101D077B5e8B034B164F71C5f?embed=1&theme=dark&info=0&trades=0"
                className="w-full h-[450px] sm:h-[550px]"
                title="TUNG Price Chart"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section id="features" className="py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                ¿Por Qué{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Xnova
                </span>
                ?
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                La evolución de los juegos de estrategia espacial. Toda la profundidad de
                OGame con recompensas crypto reales.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: '⚔️',
                  title: 'Estrategia Profunda',
                  desc: 'Gestiona recursos, investiga tecnologías, construye naves y defiende tu imperio con mecánicas estilo OGame y Xnova.',
                },
                {
                  icon: '🌌',
                  title: 'Gana Crypto Real',
                  desc: 'Cada acción en el juego genera tokens TUNG. Retíralos a tu wallet y conviértelos en USDT, BTC o la crypto que prefieras.',
                },
                {
                  icon: '💰',
                  title: 'Alianzas y Guerras',
                  desc: 'Forma alianzas, comercia recursos, coordina ataques masivos y domina el universo junto a miles de jugadores.',
                },
                {
                  icon: '🔬',
                  title: 'Juega Donde Sea',
                  desc: 'Desde tu navegador, sin descargas. Funciona en PC, móvil y tablet. Tu imperio te sigue a todas partes.',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-cyan-500/20 transition-all duration-300"
                >
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-lg font-bold text-white mb-2" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="py-20 relative bg-white/[0.01]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Empieza en{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  3 Pasos
                </span>
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Sin descargas, sin depósitos, sin complicaciones. Solo jugar y ganar.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  step: '01',
                  title: 'Regístrate Gratis',
                  desc: 'Crea tu cuenta en 30 segundos con email o Google. Sin wallet requerida para empezar.',
                },
                {
                  step: '02',
                  title: 'Construye tu Imperio',
                  desc: 'Mejora minas, investiga tecnologías, construye tu flota espacial y coloniza planetas.',
                },
                {
                  step: '03',
                  title: 'Gana y Retira',
                  desc: 'Acumula tokens TUNG jugando. Cuando quieras, conéctate a MetaMask y retira tus ganancias.',
                },
              ].map((item) => (
                <div key={item.step} className="relative text-center">
                  <div
                    className="text-7xl font-bold bg-gradient-to-b from-cyan-500/20 to-transparent bg-clip-text text-transparent mb-4"
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    {item.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-12">
              <Link
                to="/register"
                className="inline-flex px-8 py-4 text-lg font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-xl shadow-cyan-500/25"
              >
                🚀 Crear Cuenta Gratis
              </Link>
            </div>
          </div>
        </section>

        {/* ===== EARN SECTION ===== */}
        <section id="earn" className="py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                ¿Cómo se{' '}
                <span className="bg-gradient-to-r from-yellow-400 to-amber-400 bg-clip-text text-transparent">
                  Gana Dinero
                </span>
                ?
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Múltiples formas de ganar tokens TUNG. Mientras más juegas, más ganas.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  title: '🏗️ Construcción de Imperio',
                  desc: 'Cada edificio, mina y mejora genera tokens TUNG pasivamente.',
                },
                {
                  title: '⚔️ Batallas y Conquistas',
                  desc: 'Gana batallas espaciales y recibe recompensas por cada victoria.',
                },
                {
                  title: '🚀 Expediciones',
                  desc: 'Envía flotas a explorar y descubre recursos, tecnologías y tokens.',
                },
                {
                  title: '💱 Mercado P2P',
                  desc: 'Vende recursos a otros jugadores y gana crypto en cada transacción.',
                },
                {
                  title: '👥 Sistema de Referidos',
                  desc: 'Invita amigos y gana un porcentaje de sus recompensas para siempre.',
                },
                {
                  title: '🏆 Misiones y Logros',
                  desc: 'Completa misiones diarias, premium y logros para ganar bonos extra.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-yellow-500/20 transition-all duration-300"
                >
                  <div className="text-lg font-bold text-white mb-2">{item.title}</div>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section id="faq" className="py-20 relative bg-white/[0.01]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2
                className="text-3xl sm:text-4xl font-bold mb-4"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Preguntas{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Frecuentes
                </span>
              </h2>
            </div>

            <div className="space-y-4">
              {faqData.map((faq) => (
                <details
                  key={faq.q}
                  className="group p-5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 transition-all duration-300 cursor-pointer"
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

        {/* ===== CTA FINAL ===== */}
        <section className="py-20 relative">
          <div className="absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 rounded-full blur-[150px]" />
          </div>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2
              className="text-3xl sm:text-5xl font-bold mb-6"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              ¿Listo para Construir tu
              <br />
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Imperio Galáctico
              </span>
              ?
            </h2>
            <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
              Únete a miles de jugadores que ya están ganando criptomonedas mientras dominan
              el universo. El momento es ahora.
            </p>
            <Link
              to="/register"
              className="inline-flex px-10 py-5 text-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:scale-105"
            >
              🚀 Regístrate Ahora
            </Link>
            <p className="mt-4 text-xs text-slate-600">
              Sin tarjeta de crédito · Sin descargas · Registro instantáneo
            </p>
          </div>
        </section>

        {/* ===== PARTNERS ===== */}
        <section id="partners" className="py-16 relative bg-white/[0.01]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2
                className="text-2xl sm:text-3xl font-bold mb-3"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Partners{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  y Ecosistema
                </span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
                Proyectos que forman parte del universo Xnova.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <a
                href="https://dixbase.com/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="DixBase (abre en una pestaña nueva)"
                className="group flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-cyan-500/30 transition-all duration-300"
              >
                <img
                  src="/Imagenes/alianzas/dixbase-app.png"
                  alt="DixBase"
                  loading="lazy"
                  className="h-24 w-24 object-contain transition-transform duration-300 group-hover:scale-110"
                />
                <div className="text-center">
                  <div className="text-lg font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    DixBase
                  </div>
                  <div className="text-xs text-slate-500 group-hover:text-cyan-400 transition-colors">dixbase.com</div>
                </div>
              </a>

              <a
                href={TUNG_SWAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Comprar TUNG en Falcox Swap (abre en una pestaña nueva)"
                className="group flex flex-col items-center gap-4 p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-yellow-500/30 transition-all duration-300"
              >
                <img
                  src="/Imagenes/alianzas/tung.png"
                  alt="TUNG - token de gobernanza de Xnova"
                  loading="lazy"
                  className="h-24 w-24 object-contain transition-transform duration-300 group-hover:scale-110"
                />
                <div className="text-center">
                  <div className="text-lg font-bold text-white" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                    TUNG
                  </div>
                  <div className="text-xs text-slate-500 group-hover:text-yellow-400 transition-colors">Token de gobernanza de Xnova</div>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* ===== EQUIPO ===== */}
        <section id="equipo" className="py-20 relative">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 rounded-full blur-[140px]" />
          </div>
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2
                className="text-2xl sm:text-4xl font-bold mb-3"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Nuestro{' '}
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Equipo
                </span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto">
                Las personas que construyen el universo Xnova.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {[
                {
                  name: 'Jennierfs',
                  role: 'CEO · Fundador · Dev',
                  img: '/Imagenes/Equipo/Jennierfs.jpg',
                  accent: 'from-cyan-400 via-blue-500 to-purple-500',
                  badge: 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10',
                },
                {
                  name: 'ReinelH',
                  role: 'Cofundador',
                  img: '/Imagenes/Equipo/ReinelH.jpg',
                  accent: 'from-purple-500 via-blue-500 to-cyan-400',
                  badge: 'text-purple-300 border-purple-400/30 bg-purple-500/10',
                },
              ].map((member) => (
                <div
                  key={member.name}
                  className="group relative rounded-2xl p-[1px] bg-gradient-to-b from-white/10 to-white/[0.02] hover:from-cyan-500/40 hover:to-purple-500/20 transition-all duration-500"
                >
                  <div className="relative h-full rounded-2xl bg-[#070b18]/90 backdrop-blur-sm p-8 flex flex-col items-center text-center overflow-hidden">
                    <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gradient-to-br ${member.accent} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />
                    <div className={`relative p-[3px] rounded-full bg-gradient-to-br ${member.accent} shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-500`}>
                      <img
                        src={member.img}
                        alt={`${member.name} - ${member.role} de Xnova`}
                        loading="lazy"
                        className="h-36 w-36 rounded-full object-cover border-4 border-[#070b18]"
                      />
                    </div>
                    <h3
                      className="relative mt-6 text-xl font-bold text-white tracking-wide"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      {member.name}
                    </h3>
                    <span className={`relative mt-3 inline-flex px-4 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider ${member.badge}`}>
                      {member.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="py-12 border-t border-white/5" role="contentinfo" aria-label="Información del sitio">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src="/Imagenes/Visuales/main_city.webp"
                    alt="Imperium"
                    loading="lazy"
                    className="h-10 w-10 object-cover rounded-full ring-2 ring-amber-500/60"
                  />
                  <span
                    className="text-lg font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent"
                    style={{ fontFamily: 'Cinzel, serif' }}
                  >
                    IMPERIUM
                  </span>
                </div>
                <p className="text-sm text-slate-500 max-w-md">
                  Xnova es un juego de estrategia espacial multijugador tipo OGame donde
                  generas ingresos gratis vendiendo tus recursos en el mercado y ganas
                  criptomonedas reales. Juega gratis, sin inversión.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-white mb-4" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  Juego
                </h4>
                <div className="space-y-2 text-sm text-slate-400">
                  <Link to="/register" className="block hover:text-cyan-400 transition-colors">Registrarse</Link>
                  <Link to="/login" className="block hover:text-cyan-400 transition-colors">Iniciar Sesión</Link>
                  <a href="#features" className="block hover:text-cyan-400 transition-colors">Características</a>
                  <a href="#how-it-works" className="block hover:text-cyan-400 transition-colors">Cómo Funciona</a>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-white mb-4" style={{ fontFamily: 'Orbitron, sans-serif' }}>
                  Recursos
                </h4>
                <div className="space-y-2 text-sm text-slate-400">
                  <Link to="/blog" className="block hover:text-cyan-400 transition-colors">Blog</Link>
                  <Link to="/about" className="block hover:text-cyan-400 transition-colors">Sobre Nosotros</Link>
                  <Link to="/ganar-criptomonedas-jugando" className="block hover:text-cyan-400 transition-colors">Ganar Criptomonedas</Link>
                  <Link to="/alternativa-ogame-crypto" className="block hover:text-cyan-400 transition-colors">Alternativa OGame</Link>
                  <Link to="/juegos-play-to-earn-gratis" className="block hover:text-cyan-400 transition-colors">Juegos P2E Gratis</Link>
                  <Link to="/ganar-dinero-jugando" className="block hover:text-cyan-400 transition-colors">Ganar Dinero Jugando</Link>
                  <Link to="/5-pasos-para-ganar-criptomonedas" className="block hover:text-cyan-400 transition-colors">5 Pasos para Ganar Crypto</Link>
                </div>
              </div>
            </div>
            <div className="pt-8 border-t border-white/5 text-center text-xs text-slate-600">
              © {new Date().getFullYear()} Xnova. Todos los derechos reservados.
              Las criptomonedas son volátiles. Juega responsablemente.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
