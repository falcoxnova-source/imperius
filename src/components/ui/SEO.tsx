import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: 'website' | 'article';
  noIndex?: boolean;
  schema?: Record<string, unknown> | Record<string, unknown>[];
  lang?: 'es' | 'en';
  articlePublishedTime?: string;
  articleAuthor?: string;
  articleTags?: string[];
}

const BASE_URL = 'https://falcoxnova.com';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const FALLBACK_IMAGE = `${BASE_URL}/logo-512.png`;
const SITE_NAME = 'Xnova';
const TWITTER_HANDLE = '@FalcoXUniverso';

/**
 * URL canonica de la pagina actual.
 *
 * El servidor estatico sirve cada ruta pre-renderizada como un directorio
 * (`/about/index.html`) y responde 301 de `/about` a `/about/`. Por eso la
 * forma canonica del sitio SIEMPRE lleva barra final: si declaramos `/about`
 * apuntamos a una URL que redirige, y Google marca la pagina como
 * "Pagina alternativa con etiqueta canonica adecuada" y no la indexa.
 *
 * Ademas, antes se usaba `canonicalUrl || BASE_URL`: cualquier pagina que no
 * pasara `canonicalUrl` declaraba la portada como canonica, por lo que Google
 * trataba TODAS las landings como duplicados de la home.
 */
function resolveCanonical(explicit?: string): string {
  if (explicit) return withTrailingSlash(explicit);
  if (typeof window === 'undefined') return `${BASE_URL}/`;
  return withTrailingSlash(`${BASE_URL}${window.location.pathname}`);
}

function withTrailingSlash(rawUrl: string): string {
  const [base, hash] = rawUrl.split('#');
  const [pathPart, query] = base.split('?');
  const normalized = pathPart.endsWith('/') ? pathPart : `${pathPart}/`;
  return `${normalized}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
}

export function SEO({
  title,
  description,
  keywords,
  canonicalUrl,
  ogImage = DEFAULT_IMAGE,
  ogImageAlt,
  ogType = 'website',
  noIndex = false,
  schema,
  lang = 'es',
  articlePublishedTime,
  articleAuthor,
  articleTags,
}: SEOProps) {
  const fullTitle = title.includes('Xnova')
    ? title
    : `${title} | ${SITE_NAME}`;
  const url = resolveCanonical(canonicalUrl);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <html lang={lang} />
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}
      <meta name="googlebot" content={noIndex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={url} />

      {/* Article-specific meta tags */}
      {ogType === 'article' && articlePublishedTime && (
        <meta property="article:published_time" content={articlePublishedTime} />
      )}
      {ogType === 'article' && articleAuthor && (
        <meta property="article:author" content={articleAuthor} />
      )}
      {ogType === 'article' && articleTags?.map((tag) => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}

      {/* Language Alternates. Solo existe version en espanol: declarar un
          alternate ingles con ?lang=en creaba URLs duplicadas que Google
          rastreaba y descartaba. */}
      <link rel="alternate" hrefLang="es" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      {ogImageAlt && <meta property="og:image:alt" content={ogImageAlt} />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content={lang === 'es' ? 'es_ES' : 'en_US'} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:creator" content={TWITTER_HANDLE} />

      {/* JSON-LD Structured Data */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(
            Array.isArray(schema)
              ? { '@context': 'https://schema.org', '@graph': schema.map(({ '@context': _, ...rest }) => rest) }
              : schema
          )}
        </script>
      )}
    </Helmet>
  );
}

/**
 * Pre-built schemas for common page types
 */
export const schemas = {
  organization: {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Xnova',
    alternateName: ['Xnova Game', 'Xnova Online', 'Xnova OGame', 'Falco-X Universo'],
    url: BASE_URL,
    logo: `${BASE_URL}/logo-512.png`,
    sameAs: [
      'https://twitter.com/FalcoXUniverso',
      'https://t.me/TrungTungMeme',
      'https://discord.gg/falcoxuniverso',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@falcoxnova.com',
      availableLanguage: ['Spanish', 'English'],
    },
    description:
      'Xnova: juego de estrategia espacial gratuito tipo OGame donde generas ingresos gratis vendiendo tus recursos en el mercado y ganas criptomonedas reales.',
    foundingDate: '2025',
  },

  webApplication: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Xnova',
    alternateName: ['Xnova Game', 'Xnova Online', 'Xnova OGame'],
    url: BASE_URL,
    applicationCategory: 'GameApplication',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    operatingSystem: 'All',
    inLanguage: ['es', 'en'],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Generar ingresos gratis vendiendo recursos en el mercado',
      'Ganar criptomonedas gratis jugando, sin invertir',
      'Play to Earn sin inversión inicial',
      'Estrategia espacial en tiempo real tipo OGame',
      'Batallas espaciales multijugador',
      'Sistema de alianzas y guerras galácticas',
      'Mercado P2P de recursos entre jugadores',
      'Wallet integrada con retiros en crypto (token TUNG)',
      'Misiones diarias y premium',
      'Sistema de referidos con comisiones',
    ],
  },

  article: (params: {
    title: string;
    description: string;
    url: string;
    image: string;
    datePublished: string;
    dateModified: string;
    authorName: string;
  }) => ({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.title,
    description: params.description,
    image: params.image,
    url: params.url,
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    author: {
      '@type': 'Person',
      name: params.authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Xnova',
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/logo-512.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': params.url,
    },
  }),

  breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }),

  faqPage: (questions: Array<{ question?: string; answer?: string; q?: string; a?: string }>) => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions
      .filter((item) => {
        const q = item.question || item.q || '';
        const a = item.answer || item.a || '';
        return q.trim() && a.trim();
      })
      .map((item) => ({
        '@type': 'Question',
        name: item.question || item.q || '',
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer || item.a || '',
        },
      })),
  }),

  product: (params: {
    name: string;
    description: string;
    image: string;
    offers: Array<{ price: string; priceCurrency: string; availability: string }>;
  }) => ({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    description: params.description,
    image: params.image,
    offers: params.offers.map((o) => ({
      '@type': 'Offer',
      price: o.price,
      priceCurrency: o.priceCurrency,
      availability: o.availability,
    })),
  }),

  aggregateRating: (params: {
    ratingValue: number;
    bestRating: number;
    ratingCount: number;
  }) => ({
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Falco-X Universo',
    url: BASE_URL,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: params.ratingValue,
      bestRating: params.bestRating,
      ratingCount: params.ratingCount,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  }),
};
