import { Link } from 'react-router-dom';
import { useState } from 'react';
import { SEO, schemas } from '../../components/ui/SEO';
import { Breadcrumbs } from '../../components/ui/Breadcrumbs';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  image: string;
  imagePath: string;
  readTime: string;
}

const blogPosts: BlogPost[] = [
  {
    slug: 'novedades-xnova-octubre-2026',
    title: 'Novedades de Xnova – Octubre 2026: Casino, Batalla de Naves, Apuestas Deportivas y Más',
    excerpt:
      'Todo lo nuevo en Xnova: Casino Galáctico, Batalla de Naves PvP, apuestas de fútbol, Fortalezas, Planeta del Tesoro, asistente IA NOVA y alertas en Telegram.',
    date: '2026-10-08',
    author: 'Carlos Mendoza',
    category: 'Novedades',
    image: '/logo-512.png',
    imagePath: '/blog/novedades-xnova-octubre-2026.webp',
    readTime: '7 min',
  },
  {
    slug: 'batalla-de-naves-online-xnova',
    title: 'Batalla de Naves en Xnova: Juega a Hundir la Flota Online y Gana TUNG',
    excerpt:
      'Hundir la flota online PvP con apuestas en TUNG, pool diario Top 5, modo práctica gratis contra la IA y consejos para ganar.',
    date: '2026-10-08',
    author: 'Ana Torres',
    category: 'Guías',
    image: '/logo-512.png',
    imagePath: '/blog/batalla-de-naves-online-xnova.webp',
    readTime: '6 min',
  },
  {
    slug: 'casino-galactico-xnova-ruleta-tragamonedas-dados',
    title: 'Casino Galáctico de Xnova: Ruleta, Tragamonedas, Dados, Lotería y Rifa con TUNG',
    excerpt:
      'Ruleta europea, tragamonedas, dados Sic Bo, lotería semanal y rifa: premios, multiplicadores, límites y consejos para jugar con cabeza.',
    date: '2026-10-08',
    author: 'María García',
    category: 'Guías',
    image: '/logo-512.png',
    imagePath: '/blog/casino-galactico-xnova.webp',
    readTime: '8 min',
  },
  {
    slug: 'apuestas-deportivas-futbol-xnova',
    title: 'Apuestas Deportivas de Fútbol en Xnova: Sistema Parimutuel con TUNG',
    excerpt:
      'Apuesta a Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 y Champions. Cómo funciona el sistema parimutuel 1X2 con ejemplos de pago.',
    date: '2026-10-08',
    author: 'Carlos Mendoza',
    category: 'Guías',
    image: '/logo-512.png',
    imagePath: '/blog/apuestas-deportivas-futbol-xnova.webp',
    readTime: '6 min',
  },
  {
    slug: 'fortalezas-alianza-planeta-tesoro-xnova',
    title: 'Fortalezas de Alianza y Planeta del Tesoro en Xnova: Guía Completa',
    excerpt:
      'Cómo atacar, capturar y defender las Fortalezas y el Planeta del Tesoro: requisitos, refuerzos, avisos de ataque y pools de premios mensuales.',
    date: '2026-10-08',
    author: 'Carlos Mendoza',
    category: 'Estrategia',
    image: '/logo-512.png',
    imagePath: '/blog/fortalezas-planeta-tesoro-xnova.webp',
    readTime: '7 min',
  },
  {
    slug: 'consejos-seguridad-crypto-gaming',
    title: 'Consejos de Seguridad para Jugar y Ganar Criptomonedas Sin Riesgos',
    excerpt:
      'Guía de seguridad esencial para jugar juegos play-to-earn. Protege tu wallet, evita estafas y mantén tus ganancias crypto seguras mientras juegas.',
    date: '2026-05-28',
    author: 'Ana Torres',
    category: 'Guías',
    image: '/logo-512.png',
    imagePath: '/blog/seguridad-crypto-gaming.webp',
    readTime: '6 min',
  },
  {
    slug: 'mejores-juegos-blockchain-espanol-2026',
    title: 'Los Mejores Juegos Blockchain en Español para Ganar Criptomonedas 2026',
    excerpt:
      'Ranking de los mejores juegos blockchain disponibles en español con soporte hispano, comunidad activa y retiros en criptomonedas.',
    date: '2026-05-25',
    author: 'Carlos Mendoza',
    category: 'Rankings',
    image: '/logo-512.png',
    imagePath: '/blog/juegos-blockchain-espanol.webp',
    readTime: '8 min',
  },
  {
    slug: 'como-ganar-criptomonedas-jugando-gratis',
    title: 'Cómo Ganar Criptomonedas Jugando Gratis en 2026 – Guía Completa',
    excerpt:
      'Descubre las mejores formas de ganar criptomonedas sin invertir un centavo. Guía completa de juegos play-to-earn gratuitos, estrategias y consejos para maximizar tus ganancias.',
    date: '2026-05-20',
    author: 'Carlos Mendoza',
    category: 'Guías',
    image: '/logo-512.png',
    imagePath: '/blog/juegos-blockchain-espanol.webp',
    readTime: '8 min',
  },
  {
    slug: 'falco-x-vs-ogame-comparativa',
    title: 'Xnova vs OGame: ¿Cuál es el Mejor Juego de Estrategia Espacial?',
    excerpt:
      'Comparamos Xnova con OGame: mecánicas, gráficos, comunidad y lo más importante, que en Xnova puedes vender tus recursos en el mercado y ganar criptomonedas reales.',
    date: '2026-05-18',
    author: 'María García',
    category: 'Comparativas',
    image: '/logo-512.png',
    imagePath: '/blog/seguridad-crypto-gaming.webp',
    readTime: '6 min',
  },
  {
    slug: 'mejores-juegos-play-to-earn-gratis-2026',
    title: 'Top 10 Mejores Juegos Play-to-Earn Gratis Sin Inversión en 2026',
    excerpt:
      'Los mejores juegos P2E que no requieren depósito inicial. Descubre cuáles pagan más, cómo empezar y qué los hace diferentes. Xnova entre los top.',
    date: '2026-05-15',
    author: 'Carlos Mendoza',
    category: 'Rankings',
    image: '/logo-512.png',
    imagePath: '/blog/mejores-p2e.webp',
    readTime: '10 min',
  },
  {
    slug: 'guia-principiantes-falco-x',
    title: 'Guía Definitiva para Principiantes en Xnova',
    excerpt:
      'Todo lo que necesitas saber para empezar en Xnova. Desde el registro hasta tu primer retiro de criptomonedas. Tutorial paso a paso con consejos de veteranos.',
    date: '2026-05-12',
    author: 'Ana Torres',
    category: 'Tutoriales',
    image: '/logo-512.png',
    readTime: '12 min',
  },
  {
    slug: 'como-retirar-ganancias-crypto-falco-x',
    title: 'Cómo Retirar Tus Ganancias en Criptomonedas de Xnova a Tu Wallet',
    excerpt:
      'Guía paso a paso para conectar MetaMask, retirar tokens TUNG y convertirlos a USDT, BNB o la criptomoneda que prefieras.',
    date: '2026-05-10',
    author: 'Ana Torres',
    category: 'Tutoriales',
    image: '/logo-512.png',
    readTime: '5 min',
  },
  {
    slug: 'estrategia-avanzada-alianzas-falco-x',
    title: 'Estrategia Avanzada: Cómo Dominar con Alianzas en Xnova',
    excerpt:
      'Aprende tácticas de alianza, coordinación de ataques masivos, comercio estratégico y diplomacia para dominar el universo de Xnova.',
    date: '2026-05-08',
    author: 'Carlos Mendoza',
    category: 'Estrategia',
    image: '/logo-512.png',
    readTime: '7 min',
  },
  {
    slug: 'blockchain-gaming-que-es-como-funciona',
    title: 'Blockchain Gaming: Qué Es, Cómo Funciona y Por Qué Es el Futuro',
    excerpt:
      'Entiende qué es el blockchain gaming, cómo los juegos usan criptomonedas y NFTs, y por qué está revolucionando la industria del videojuego.',
    date: '2026-05-05',
    author: 'María García',
    category: 'Educación',
    image: '/logo-512.png',
    readTime: '9 min',
  },
  {
    slug: 'ganar-dinero-jugando-desde-casa',
    title: 'Cómo Ganar Dinero Jugando Desde Casa Sin Invertir – Guía 2026',
    excerpt:
      'Métodos comprobados para generar ingresos jugando videojuegos. Desde juegos P2E hasta estrategias para maximizar ganancias sin inversión.',
    date: '2026-05-01',
    author: 'María García',
    category: 'Guías',
    image: '/logo-512.png',
    readTime: '11 min',
  },
];

const categories = ['Todas', 'Novedades', 'Guías', 'Tutoriales', 'Estrategia', 'Comparativas', 'Rankings', 'Educación'];

export function BlogPage() {
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const filteredPosts = selectedCategory === 'Todas'
    ? blogPosts
    : blogPosts.filter((post) => post.category === selectedCategory);

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Blog de Xnova - Guías para Generar Ingresos Gratis Jugando',
    description: 'Blog oficial con guías, tutoriales, estrategias y noticias sobre blockchain gaming y juegos play-to-earn.',
    url: 'https://falcoxnova.com/blog',
    mainEntity: blogPosts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      author: { '@type': 'Person', name: post.author },
      url: `https://falcoxnova.com/blog/${post.slug}`,
    })),
  };

  return (
    <>
      <SEO
        title="Blog de Xnova | Guías para Ganar Criptomonedas Gratis"
        description="Blog oficial de Xnova: guías para generar ingresos gratis vendiendo recursos en el mercado, ganar criptomonedas jugando y estrategias tipo OGame."
        keywords="blog Xnova, xnova guias, como generar ingresos gratis, como ganar crypto de manera gratis, vender recursos y ganar dinero, estrategia OGame, juegos play to earn gratis"
        schema={{ ...schemas.organization, ...blogSchema }}
      />

      <div className="min-h-screen bg-[#0a0e17] text-white font-['Rajdhani']">
        {/* Navbar simple */}
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
              <div className="flex items-center gap-4">
                <Link to="/" className="text-sm text-slate-300 hover:text-cyan-400 transition-colors">
                  Inicio
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
                >
                  Regístrate
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Breadcrumbs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <Breadcrumbs items={[{ label: 'Blog' }]} />
        </div>

        {/* Header */}
        <section className="relative py-16 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-cyan-500/5 rounded-full blur-[120px]" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1
              className="text-4xl sm:text-5xl font-bold mb-4"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Blog de{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Xnova
              </span>
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Guías y estrategias para generar ingresos gratis en Xnova: cómo vender tus
              recursos en el mercado, cómo ganar criptomonedas sin invertir y cómo dominar
              este juego de estrategia espacial tipo OGame.
            </p>
          </div>
        </section>

        {/* Categories */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-sm rounded-full border transition-all ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                    : 'border-white/10 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Blog Posts Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                No hay artículos en esta categoría todavía.
              </div>
            ) : (
              filteredPosts.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="group rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/20 hover:bg-white/[0.04] transition-all duration-300 overflow-hidden"
              >
                <div className="aspect-video relative overflow-hidden bg-gradient-to-br from-cyan-900/40 via-blue-900/30 to-purple-900/40 flex items-center justify-center group-hover:scale-105 transition-transform duration-700">
                  {/* Animated space dust */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute w-1 h-1 bg-cyan-400 rounded-full top-1/4 left-1/3 animate-pulse" style={{ animationDelay: '0s' }} />
                    <div className="absolute w-0.5 h-0.5 bg-white rounded-full top-1/2 left-2/3 animate-pulse" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute w-1 h-1 bg-blue-400 rounded-full bottom-1/3 left-1/4 animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute w-0.5 h-0.5 bg-purple-400 rounded-full top-2/3 right-1/3 animate-pulse" style={{ animationDelay: '1.5s' }} />
                    <div className="absolute w-1 h-1 bg-cyan-300 rounded-full bottom-1/4 right-1/4 animate-pulse" style={{ animationDelay: '0.8s' }} />
                  </div>
                  {/* Category icon */}
                  <span className="relative z-10 text-5xl opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-all duration-500">
                    {post.category === 'Guías' ? '📖' :
                     post.category === 'Tutoriales' ? '🎓' :
                     post.category === 'Estrategia' ? '⚔️' :
                     post.category === 'Comparativas' ? '⚖️' :
                     post.category === 'Rankings' ? '🏆' :
                     post.category === 'Educación' ? '📚' : '🚀'}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {post.category}
                    </span>
                    <span className="text-xs text-slate-500">{post.readTime} de lectura</span>
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors mb-2 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-sm text-slate-400 line-clamp-3 mb-4">{post.excerpt}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{post.author}</span>
                    <span>{new Date(post.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                </div>
              </Link>
            )))}
          </div>
        </div>
      </div>
    </>
  );
}

