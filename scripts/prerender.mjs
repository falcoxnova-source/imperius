/**
 * Post-build pre-rendering script
 * Generates static HTML snapshots for all public/SEO routes.
 * Googlebot and other crawlers get instant fully-rendered HTML
 * instead of waiting for JS to render the SPA.
 *
 * Run automatically after `vite build` via package.json scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes, BASE_URL, SITE_NAME, DEFAULT_IMAGE } from './prerender-routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

// ──────────────────────────────────────────────
// 1. Read the built index.html template
// ──────────────────────────────────────────────
if (!fs.existsSync(indexPath)) {
  console.error('❌ dist/index.html not found. Run "vite build" first.');
  process.exit(1);
}

const template = fs.readFileSync(indexPath, 'utf-8');

/**
 * URL canonica de una ruta.
 *
 * El servidor sirve cada ruta como directorio (`/about/index.html`) y responde
 * 301 de `/about` a `/about/`. Si el canonical y el sitemap usan la version sin
 * barra, Google indexa `/about/` pero lee un canonical que redirige, y reporta
 * "Pagina alternativa con etiqueta canonica adecuada" sin indexar la pagina.
 */
function canonicalOf(routePath) {
  if (routePath === '/') return `${BASE_URL}/`;
  return `${BASE_URL}${routePath.endsWith('/') ? routePath : `${routePath}/`}`;
}

/**
 * Datos estructurados propios de cada ruta (JSON-LD).
 *
 * El index.html ya trae los schemas globales (Organization, WebSite...), pero
 * eran identicos en las 21 paginas. Aqui anadimos lo que Google necesita para
 * mostrar resultados enriquecidos por pagina: migas de pan, FAQs desplegables
 * en el buscador y ficha de articulo en el blog.
 */
function buildRouteSchema(route) {
  const url = canonicalOf(route.path);
  const graph = [];

  // Migas de pan: Inicio > [Blog] > Pagina actual
  if (route.path !== '/') {
    const crumbs = [{ name: 'Inicio', url: `${BASE_URL}/` }];
    if (route.path.startsWith('/blog/')) {
      crumbs.push({ name: 'Blog', url: `${BASE_URL}/blog/` });
    }
    crumbs.push({ name: route.h1 || route.title, url });

    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }

  // FAQs: habilitan el resultado enriquecido de preguntas frecuentes.
  if (Array.isArray(route.faqs) && route.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: route.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
  }

  // Articulos del blog
  if (route.ogType === 'article') {
    const published = route.datePublished || new Date().toISOString();
    graph.push({
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: route.title,
      description: route.description,
      image: route.ogImage || DEFAULT_IMAGE,
      url,
      datePublished: published,
      dateModified: route.dateModified || published,
      inLanguage: 'es',
      author: { '@type': 'Organization', name: SITE_NAME },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo-512.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    });
  }

  // Ficha de videojuego en la portada
  if (route.path === '/') {
    graph.push({
      '@type': 'VideoGame',
      '@id': `${BASE_URL}/#game`,
      name: SITE_NAME,
      url: `${BASE_URL}/`,
      image: DEFAULT_IMAGE,
      description: route.description,
      genre: ['Strategy', 'MMO', 'Space Simulation'],
      gamePlatform: ['Web Browser', 'Android', 'iOS'],
      playMode: 'MultiPlayer',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      inLanguage: 'es',
      publisher: { '@type': 'Organization', name: SITE_NAME },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    });
  }

  if (graph.length === 0) return '';

  // Escapamos "<" para que ningun contenido pueda cerrar el <script>.
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c'
  );
  return `<script type="application/ld+json" data-route-schema>${json}</script>`;
}

// ──────────────────────────────────────────────
// 2. Meta tag injection helpers
// ──────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds the crawler-facing content block for a route.
 * This is injected between the SEO_BLOCK markers inside <noscript>, so every
 * pre-rendered page ends up with exactly ONE unique H1 and unique body copy
 * instead of repeating the home page block on every URL.
 */
function buildSeoBlock(route) {
  const parts = [];
  const h1 = route.h1 || route.title;
  parts.push(`<h1>${escapeHtml(h1)}</h1>`);

  for (const [tag, value] of route.body || []) {
    if (tag === 'ul') {
      const items = value.map((i) => `          <li>${escapeHtml(i)}</li>`).join('\n');
      parts.push(`<ul>\n${items}\n        </ul>`);
    } else {
      parts.push(`<${tag}>${escapeHtml(value)}</${tag}>`);
    }
  }

  parts.push(
    `<p><a href="${BASE_URL}/register">Registrate gratis en ${SITE_NAME}</a> o <a href="${BASE_URL}/blog/">lee las guias del blog</a>.</p>`
  );

  return parts.join('\n        ');
}

function buildMetaTags(route) {
  const {
    title,
    description,
    keywords,
    ogImage = DEFAULT_IMAGE,
    ogType = 'website',
    noIndex = false,
  } = route;
  const fullTitle = title;
  const url = canonicalOf(route.path);
  const lang = 'es';

  const tags = [];

  // Title
  tags.push(`<title>${escapeHtml(fullTitle)}</title>`);
  tags.push(`<meta name="title" content="${escapeHtml(fullTitle)}">`);

  // Description
  tags.push(`<meta name="description" content="${escapeHtml(description)}">`);

  // Keywords
  if (keywords) {
    tags.push(`<meta name="keywords" content="${escapeHtml(keywords)}">`);
  }

  // Robots
  if (noIndex) {
    tags.push('<meta name="robots" content="noindex, nofollow">');
    tags.push('<meta name="googlebot" content="noindex, nofollow">');
  } else {
    tags.push(
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">'
    );
    tags.push('<meta name="googlebot" content="index, follow">');
  }

  // Canonical
  tags.push(`<link rel="canonical" href="${url}">`);

  // hreflang: solo hay version en espanol.
  tags.push(`<link rel="alternate" hreflang="es" href="${url}">`);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${url}">`);

  // Open Graph
  tags.push(`<meta property="og:type" content="${ogType}">`);
  tags.push(`<meta property="og:url" content="${url}">`);
  tags.push(`<meta property="og:title" content="${escapeHtml(route.ogTitle || fullTitle)}">`);
  tags.push(`<meta property="og:description" content="${escapeHtml(route.ogDescription || description)}">`);
  tags.push(`<meta property="og:image" content="${ogImage}">`);
  tags.push(`<meta property="og:image:type" content="image/jpeg">`);
  tags.push(`<meta property="og:image:width" content="1200">`);
  tags.push(`<meta property="og:image:height" content="630">`);
  tags.push(`<meta property="og:site_name" content="${SITE_NAME}">`);
  tags.push(`<meta property="og:locale" content="${lang === 'es' ? 'es_ES' : 'en_US'}">`);

  // Twitter
  tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  tags.push(`<meta name="twitter:url" content="${url}">`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(route.ogTitle || fullTitle)}">`);
  tags.push(`<meta name="twitter:description" content="${escapeHtml(route.ogDescription || description)}">`);
  tags.push(`<meta name="twitter:image" content="${ogImage}">`);
  tags.push(`<meta name="twitter:creator" content="@FalcoXUniverso">`);

  // Article-specific
  if (ogType === 'article') {
    const today = new Date().toISOString();
    tags.push(`<meta property="article:published_time" content="${today}">`);
    tags.push(`<meta property="article:author" content="Falco-X Universo">`);
  }

  return tags.join('\n    ');
}

// ──────────────────────────────────────────────
// 3. Generate static HTML for each route
// ──────────────────────────────────────────────
let generatedCount = 0;
const sitemapUrls = [];

for (const route of routes) {
  // Build route-specific meta tags
  const metaTags = buildMetaTags(route);

  // Replace the <title> and primary meta tags in the template
  // Strategy: replace everything between <!-- Primary SEO Meta Tags --> and <!-- JSON-LD Structured Data -->
  // with the route-specific meta tags
  let html = template;

  // Replace the <title> tag
  html = html.replace(
    /<title>.*?<\/title>/,
    `<title>${escapeHtml(route.title)}</title>`
  );

  // Replace the meta title
  html = html.replace(
    /<meta name="title" content="[^"]*"/,
    `<meta name="title" content="${escapeHtml(route.title)}"`
  );

  // Replace the meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escapeHtml(route.description)}"`
  );

  // Replace the meta keywords (if route has them)
  if (route.keywords) {
    html = html.replace(
      /<meta name="keywords" content="[^"]*"/,
      `<meta name="keywords" content="${escapeHtml(route.keywords)}"`
    );
  }

  // Replace the canonical URL
  html = html.replace(
    /<link rel="canonical" href="[^"]*"/,
    `<link rel="canonical" href="${canonicalOf(route.path)}"`
  );

  // Replace Open Graph title
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/,
    `<meta property="og:title" content="${escapeHtml(route.ogTitle || route.title)}"`
  );

  // Replace Open Graph description
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/,
    `<meta property="og:description" content="${escapeHtml(route.ogDescription || route.description)}"`
  );

  // Replace Open Graph URL
  html = html.replace(
    /<meta property="og:url" content="[^"]*"/,
    `<meta property="og:url" content="${canonicalOf(route.path)}"`
  );

  // Replace Twitter title
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"/,
    `<meta name="twitter:title" content="${escapeHtml(route.ogTitle || route.title)}"`
  );

  // Replace Twitter description
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"/,
    `<meta name="twitter:description" content="${escapeHtml(route.ogDescription || route.description)}"`
  );

  // Replace hreflang alternates so they point at the current route.
  // Solo hay version en espanol: el alternate ?lang=en generaba URLs duplicadas.
  html = html.replace(
    /\s*<link rel="alternate" hreflang="en" href="[^"]*"\s*\/?>/,
    ''
  );
  html = html.replace(
    /<link rel="alternate" hreflang="es" href="[^"]*"/,
    `<link rel="alternate" hreflang="es" href="${canonicalOf(route.path)}"`
  );
  html = html.replace(
    /<link rel="alternate" hreflang="x-default" href="[^"]*"/,
    `<link rel="alternate" hreflang="x-default" href="${canonicalOf(route.path)}"`
  );

  // Replace Twitter URL
  html = html.replace(
    /<meta name="twitter:url" content="[^"]*"/,
    `<meta name="twitter:url" content="${canonicalOf(route.path)}"`
  );

  // Article routes get an og:type of article
  if (route.ogType === 'article') {
    html = html.replace(
      /<meta property="og:type" content="[^"]*"/,
      '<meta property="og:type" content="article"'
    );
  }

  // Handle noIndex
  if (route.noIndex) {
    html = html.replace(
      /<meta name="robots" content="[^"]*"/,
      '<meta name="robots" content="noindex, nofollow"'
    );
  }

  // Datos estructurados propios de la ruta, justo antes de cerrar el <head>
  const routeSchema = buildRouteSchema(route);
  if (routeSchema) {
    html = html.replace('</head>', `    ${routeSchema}\n  </head>`);
  }

  // Replace the crawler SEO block so each route has a unique H1 + body copy
  const seoBlockRegex = /<!--SEO_BLOCK_START-->[\s\S]*?<!--SEO_BLOCK_END-->/;
  if (seoBlockRegex.test(html)) {
    html = html.replace(
      seoBlockRegex,
      `<!--SEO_BLOCK_START-->\n        ${buildSeoBlock(route)}\n        <!--SEO_BLOCK_END-->`
    );
  } else {
    console.warn(`  ⚠️  SEO block markers not found for ${route.path}`);
  }

  // Determine output path
  let outputFile;
  if (route.path === '/') {
    // Home page → already exists as dist/index.html, just update it
    outputFile = indexPath;
  } else {
    // Other routes → dist/path/index.html
    const dirPath = path.join(distDir, route.path);
    fs.mkdirSync(dirPath, { recursive: true });
    outputFile = path.join(dirPath, 'index.html');
  }

  fs.writeFileSync(outputFile, html, 'utf-8');
  generatedCount++;

  // Track for sitemap update. Las rutas noindex (terms/privacy) no entran:
  // listarlas provocaba el aviso "Excluida por una etiqueta noindex".
  if (!route.noIndex) {
    sitemapUrls.push({
      path: route.path,
      priority: route.priority || 0.5,
      changefreq: route.changefreq || 'monthly',
    });
  }

  console.log(`  ✅ ${route.path} → ${path.relative(distDir, outputFile)}`);
}

// ──────────────────────────────────────────────
// 4. Generate dynamic sitemap.xml
// ──────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
`;

for (const url of sitemapUrls) {
  const loc = canonicalOf(url.path);
  sitemap += `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
    <xhtml:link rel="alternate" hreflang="es" href="${loc}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />
  </url>
`;
}

sitemap += '</urlset>\n';

fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf-8');
console.log(`  ✅ sitemap.xml generated with ${sitemapUrls.length} URLs`);

// ──────────────────────────────────────────────
// 5. Ensure robots.txt points to sitemap
// ──────────────────────────────────────────────
const robotsPath = path.join(distDir, 'robots.txt');
if (!fs.existsSync(robotsPath)) {
  const robots = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: ${BASE_URL}/sitemap.xml
`;
  fs.writeFileSync(robotsPath, robots, 'utf-8');
  console.log('  ✅ robots.txt generated');
}

console.log(`\n🎉 Pre-rendering complete! ${generatedCount} HTML files generated.`);
console.log('   Googlebot will get fully-rendered HTML instantly.\n');
