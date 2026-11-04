// Gera o site estático do SC Hoje a partir da API do WordPress. Sem dependências (Node 18+).
// Usa o MESMO layout/CSS do tema oficial (versão mobile first). Uso: node gerar.js
// Variáveis: API, OUT, SITE
const fs = require('fs'), path = require('path');
const VER = Date.now().toString(36);
const API = process.env.API || 'https://schoje.news/wp-json/wp/v2';
const OUT = process.env.OUT || '/var/www/teste';
const NOME = 'SC Hoje';
const SITE_URL = (process.env.SITE_URL || 'https://schoje.online').replace(/\/$/, '');
const DADOS = process.env.DADOS_DIR || path.join(__dirname, 'servidor', 'dados');
const abs = u => /^\//.test(u || '') ? SITE_URL + u : u;
const WHATS = 'https://schoje.news/grupo';
const SITE_PROD = (process.env.SITE_PRODUCAO || 'https://schoje.news').replace(/\/$/, '');
const PRODUCAO = process.env.PRODUCAO === '1' || fs.existsSync(path.join(DADOS, 'producao'));
const ROBOTS_META = PRODUCAO ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,nofollow';
const absProd = u => /^\//.test(u || '') ? SITE_PROD + u : (u || '');
const toIso = d => { if (!d) return ''; const s = String(d); const t = /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? new Date(s) : new Date(s + '-03:00'); return isNaN(t) ? '' : t.toISOString(); };
const ldTag = o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const ORG_ID = SITE_PROD + '/#organization';
const LOGO_LD = { '@type': 'ImageObject', url: SITE_PROD + '/estatico/img/logo-escuro-760.webp', width: 760, height: 188 };
const ORG_LD = { '@type': 'NewsMediaOrganization', '@id': ORG_ID, name: 'SC Hoje', alternateName: 'Portal SC Hoje', url: SITE_PROD + '/', logo: LOGO_LD, image: LOGO_LD, description: 'Portal de notícias de Balneário Camboriú (SC), no ar desde 2008: cidade, política, polícia e cotidiano.', foundingDate: '2008-07-04', inLanguage: 'pt-BR', areaServed: { '@type': 'City', name: 'Balneário Camboriú', containedInPlace: { '@type': 'AdministrativeArea', name: 'Santa Catarina' } }, address: { '@type': 'PostalAddress', streetAddress: 'Rua Arthur Max Doose, 153, sala 1301, Pioneiros', addressLocality: 'Balneário Camboriú', postalCode: '88331-085', addressRegion: 'SC', addressCountry: 'BR' }, email: 'contato@schoje.news', contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', email: 'contato@schoje.news', telephone: '+55-48-99208-8844', availableLanguage: 'pt-BR' }, { '@type': 'ContactPoint', contactType: 'editorial', email: 'pauta@schoje.news', availableLanguage: 'pt-BR' }], sameAs: ['https://www.facebook.com/schojeoficial', 'https://www.instagram.com/schoje.news', 'https://x.com/schojeoficial'], publishingPrinciples: SITE_PROD + '/politica-editorial/', correctionsPolicy: SITE_PROD + '/politica-de-correcoes/', ethicsPolicy: SITE_PROD + '/politica-editorial/', masthead: SITE_PROD + '/expediente/', actionableFeedbackPolicy: SITE_PROD + '/fale-conosco/' };
const SITE_LD = { '@type': 'WebSite', '@id': SITE_PROD + '/#website', url: SITE_PROD + '/', name: 'SC Hoje', inLanguage: 'pt-BR', publisher: { '@id': ORG_ID } };
const crumbs = lista => ({ '@type': 'BreadcrumbList', itemListElement: lista.map(([nome, u], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: u })) });
const ogBase = (titulo, desc, canon, extra) => `<meta property="og:site_name" content="SC Hoje"><meta property="og:locale" content="pt_BR">${/og:type/.test(extra) ? '' : '<meta property="og:type" content="website">'}${/og:title/.test(extra) ? '' : `<meta property="og:title" content="${esc(titulo)}">`}<meta property="og:description" content="${esc(desc)}">${canon ? `<meta property="og:url" content="${esc(canon)}">` : ''}${/og:image/.test(extra) ? '' : `<meta property="og:image" content="${SITE_URL}/estatico/img/logo-escuro-760.webp">`}<meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="SC Hoje" href="${SITE_URL}/feed/">`;
const REDES = { facebook: 'https://www.facebook.com/schojeoficial', instagram: 'https://www.instagram.com/schoje.news', x: 'https://x.com/schojeoficial' };
const INST = [['quem-somos','Quem somos'],['expediente','Expediente'],['politica-editorial','Política editorial'],['politica-de-correcoes','Política de correções'],['politica-de-privacidade','Política de privacidade'],['politica-de-cookies','Política de cookies'],['termos-de-uso','Termos de uso'],['fale-conosco','Fale conosco'],['anuncie','Anuncie']];
const ORDEM_MENU = ['balneario-camboriu', 'politica', 'policia', 'santa-catarina', 'cotidiano'];
const NOME_CURTO = { 'santa-catarina': 'SC' };

/* ---------- utilidades ---------- */
const NOMEADAS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»' };
const decode = s => String(s ?? '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => NOMEADAS[n.toLowerCase()] ?? m);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const txt = h => decode(String(h || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const palavras = (s, n) => { const w = s.split(' '); return w.length > n ? w.slice(0, n).join(' ') + '…' : s; };
const get = async u => { const r = await fetch(u, { headers: { 'user-agent': 'schoje-teste/2' } }); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const fmt = (d, o) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).formatToParts(new Date(d)).reduce((a, p) => (a[p.type] = p.value, a), {});
const dataLonga = d => { const p = fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); return `${p.day}/${p.month}/${p.year} às ${p.hour}h${p.minute}`; };
const dataAutor = d => { const p = fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); return `${p.day}/${p.month}/${p.year} | ${p.hour}h${p.minute}`; };
const limpa = h => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\son\w+="[^"]*"/gi, '').replace(/<img([^>]*?)>/gi, (m, a) => /loading=/.test(a) ? m : `<img${a} loading="lazy">`);
const wr = (f, c) => { const p = path.join(OUT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

/* ---------- ícones (iguais aos do tema) ---------- */
const IC = {
  menu: '<path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  busca: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  sino: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2"/>',
  fechar: '<path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  whatsapp: '<path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.6 1.1 2.7.1.2 1.9 2.9 4.6 4 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z"/>',
  facebook: '<path fill="currentColor" d="M14 8V6.3c0-.8.2-1.3 1.4-1.3H17V2h-2.6C11.3 2 10 3.6 10 6.2V8H8v3h2v11h4V11h2.7l.3-3h-3Z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>',
  linkedin: '<path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.5h4V21H3V9.5Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5Z"/>',
  x: '<path fill="currentColor" d="M17.7 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.7 3Zm-1.1 16.2h1.7L7.5 4.7H5.6l11 14.5Z"/>',
};
const icone = n => IC[n] ? `<svg class="icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${IC[n]}</svg>` : '';

/* ---------- peças do tema ---------- */
const logo = (fundo = 'claro') => { const b = fundo === 'escuro' ? 'logo-branco' : 'logo-escuro'; return `<a href="/" rel="home" class="logo"><img class="logo__img" src="/estatico/img/${b}.webp" srcset="/estatico/img/${b}-420.webp 420w, /estatico/img/${b}-760.webp 760w, /estatico/img/${b}.webp 1131w" sizes="(max-width: 760px) 150px, 420px" width="1131" height="280" alt="${NOME}" decoding="async"></a>`; };
const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const FOTO_AUTOR = new Map(); try { for (const u of JSON.parse(fs.readFileSync(path.join(DADOS, 'usuarios.json'), 'utf8'))) if (u.foto) FOTO_AUTOR.set(semAcento(u.nome), u.foto); } catch (e) {}
const BIO_AUTOR = new Map(); try { for (const u of JSON.parse(fs.readFileSync(path.join(DADOS, 'usuarios.json'), 'utf8'))) if (u.bio) BIO_AUTOR.set(semAcento(u.nome), u.bio); } catch (e) {}
const AUTOR_INFO = new Map(); try { for (const u of JSON.parse(fs.readFileSync(path.join(DADOS, 'usuarios.json'), 'utf8'))) AUTOR_INFO.set(semAcento(u.nome), { slug: u.slugAutor || semAcento(u.nome).toLowerCase().replace(/[^a-z0-9]/g, ''), cargo: u.cargo || '', registro: u.registro || '', linkedin: u.linkedin || '' }); } catch (e) {}
const botaoFonte = () => `<a class="btn-fonte" href="https://www.google.com/preferences/source?q=schoje.news" target="_blank" rel="noopener"><svg class="btn-fonte__g" viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6Z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1Z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48Z"/></svg><span>Adicione o SC Hoje como fonte preferencial no Google</span></a>`;
const botaoGoogle = () => `<a class="btn-google" href="https://profile.google.com/@schoje.news" target="_blank" rel="noopener"><span>Siga no</span><img class="btn-google__icone" src="/estatico/img/google-discover.png" width="24" height="24" alt="" loading="lazy"><span>Google Discover</span></a>`;
const redes = () => `<ul class="redes">${Object.entries(REDES).map(([k, u]) => `<li><a href="${u}" target="_blank" rel="noopener" aria-label="${k}">${icone(k)}</a></li>`).join('')}</ul>`;
const topoBarra = h1 => { const tag = h1 ? 'h1' : 'div'; return `<div class="container topo__barra"><div class="topo__esq"><button type="button" class="btn-icone js-abrir-gaveta" aria-controls="gaveta" aria-expanded="false" aria-label="Menu">${icone('menu')}<span>Menu</span></button><a class="tempo-topo js-tempo-topo" href="/tempo/" hidden aria-label="Previsão do tempo em Balneário Camboriú"><span class="tempo-topo__linha"><b class="tempo-topo__temp"></b><svg class="tempo-topo__ico" viewBox="0 0 32 24" width="32" height="24" aria-hidden="true" focusable="false"></svg></span><span class="tempo-topo__cidade">Balneário Camboriú</span></a></div><${tag} class="topo__logo">${logo()}</${tag}><div class="topo__dir"><img class="selo" src="/estatico/img/selo-18-anos.webp" width="126" height="120" alt="${NOME} — 18 anos" decoding="async"><button type="button" class="btn-icone js-abrir-busca" aria-controls="busca-tela" aria-expanded="false" aria-label="Busca">${icone('busca')}<span>Busca</span></button></div></div>`; };


/* ---------- previsão do tempo (Open-Meteo, grátis e sem chave) ---------- */
const WMO = c => c === 0 ? 'Céu limpo' : c <= 2 ? 'Parcialmente nublado' : c === 3 ? 'Nublado' : c <= 48 ? 'Neblina' : c <= 57 ? 'Garoa' : c <= 67 ? 'Chuva' : c <= 77 ? 'Neve' : c <= 82 ? 'Pancadas de chuva' : c >= 95 ? 'Trovoadas' : 'Instável';
async function tempoHtml() {
  try {
    let j;
    if (process.env.TEMPO_TESTE) j = { current: { temperature_2m: 24.3, weather_code: 2 }, daily: { time: ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], weather_code: [2, 63, 80, 0], temperature_2m_max: [27.1, 25.2, 24.4, 28.0], temperature_2m_min: [19.2, 18.5, 17.9, 18.8] } };
    else { const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.99&longitude=-48.635&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=4', { headers: { 'user-agent': 'schoje-teste/2' } }); if (!r.ok) throw new Error(r.status); j = await r.json(); }
    const g = n => Math.round(n) + '°';
    const dia = d => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')).replace('.', '');
    const D = j.daily;
    return `<section class="tempo" aria-label="Previsão do tempo"><h2 class="bloco-titulo">Tempo em Balneário Camboriú</h2><div class="tempo__agora"><b>${g(j.current.temperature_2m)}</b><span>${WMO(j.current.weather_code)}<small>Máx ${g(D.temperature_2m_max[0])} · Mín ${g(D.temperature_2m_min[0])}</small></span></div><ul class="tempo__dias">${[1, 2, 3].map(i => `<li><span>${dia(D.time[i])}</span><span>${WMO(D.weather_code[i])}</span><b>${g(D.temperature_2m_max[i])} / ${g(D.temperature_2m_min[i])}</b></li>`).join('')}</ul></section>`;
  } catch (e) { console.log('aviso: sem previsão do tempo (' + e.message + ')'); return ''; }
}

(async () => {
  /* ---------- dados ---------- */
  /* ---------- redação própria (matérias escritas no editor do servidor) ---------- */
  const SEM_WP = fs.existsSync(path.join(DADOS, 'sem-wordpress'));
  const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(path.join(DADOS, f), 'utf8')); } catch (e) { return pad; } };
  const locaisTodos = (() => { const dir = path.join(DADOS, 'posts'), r = []; try { for (const f of fs.readdirSync(dir)) { if (!f.endsWith('.json')) continue; try { const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (p.status === 'publicado' && p.data && new Date(p.data) <= new Date()) r.push(p); } catch (e) {} } } catch (e) {} return r.sort((a, b) => new Date(b.data) - new Date(a.data)); })();
  const catsLocais = lerJson('categorias.json', []);
  let catsWP = []; if (!SEM_WP) { try { catsWP = await get(`${API}/categories?per_page=100&hide_empty=true&_fields=id,name,slug,count,parent`); } catch (e) { console.log('aviso: WordPress fora do ar (' + e.message + '); usando só a redação própria'); } }
  const todas = catsWP.map(c => ({ ...c })); for (const c of catsLocais) { const n = locaisTodos.filter(p => p.categoria === c.slug).length; const w = todas.find(x => x.slug === c.slug); if (w) w.count += n; else if (n) todas.push({ id: c.id, name: c.name, slug: c.slug, count: n, parent: 0 }); }
  const wpForma = (p, cat) => ({ id: p.id, slug: p.slug, date: p.data, modified: p.modificado, link: `https://schoje.news/${p.slug}/`, title: { rendered: esc(p.titulo) }, excerpt: { rendered: `<p>${esc(p.resumo || p.fina)}</p>` }, _sub: p.fina, content: { rendered: p.conteudo }, categories: cat ? [cat.id] : [], _tags: p.tags || [], _capa: !!p.capa, _embedded: { 'wp:featuredmedia': p.destaque && p.destaque.url ? [{ source_url: p.destaque.url, alt_text: p.destaque.alt || '', caption: { rendered: esc(p.destaque.legenda || '') }, media_details: { width: p.destaque.w || undefined, height: p.destaque.h || undefined, sizes: {} } }] : [], author: [{ name: p.autor }] } });
  const cats = todas.filter(c => !['uncategorized', 'sem-categoria'].includes(c.slug) && c.count > 0);
  const porId = new Map(cats.map(c => [c.id, c]));
  const topo = cats.filter(c => !c.parent);
  const menuCats = ORDEM_MENU.map(s => cats.find(c => c.slug === s)).filter(Boolean);
  const gavetaCats = [...menuCats, ...topo.filter(c => !menuCats.includes(c)).sort((a, b) => b.count - a.count)];
  const F = 'id,slug,date,modified,link,title,excerpt,content,categories,_links,_embedded';
  const info = p => { const m = p._embedded?.['wp:featuredmedia']?.[0]; const alt = decode(m?.alt_text || '') || txt(p.title?.rendered);
    const cat = (p.categories || []).map(i => porId.get(i)).find(c => c && !c.parent) || (p.categories || []).map(i => porId.get(i)).find(Boolean);
    return { p, sub: p._sub !== undefined ? p._sub : txt(p.excerpt?.rendered), tags: p._tags || [], capa: !!p._capa, slug: p.slug, tit: txt(p.title?.rendered), res: txt(p.excerpt?.rendered), m, alt, cat, data: p.date, cats: p.categories || [], autor: p._embedded?.author?.[0]?.name || 'Redação SC Hoje' }; };
  const mesclar = (wp, cat, n) => { const loc = locaisTodos.filter(p => !cat || p.categoria === cat.slug).map(p => wpForma(p, cat || porSlug.get(p.categoria))); const vistos = new Set(), r = []; for (const x of [...loc, ...wp]) { if (vistos.has(x.slug)) continue; vistos.add(x.slug); r.push(x); } return r.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, n).map(info); };
  const porSlug = new Map(cats.map(c => [c.slug, c]));
  let wpL = []; if (!SEM_WP && catsWP.length) { try { wpL = await get(`${API}/posts?per_page=60&_embed=wp:featuredmedia,author&_fields=${F}`); } catch (e) { console.log('aviso: sem matérias do WordPress (' + e.message + ')'); } }
  const L = mesclar(wpL, null, 60);
  const porCat = new Map();
  const doCat = async c => { if (!porCat.has(c.id)) { let w = []; if (!SEM_WP && catsWP.length) { try { w = await get(`${API}/posts?categories=${c.id}&per_page=30&_embed=wp:featuredmedia,author&_fields=${F}`); } catch (e) { console.error('cat', c.slug, e.message); } } porCat.set(c.id, mesclar(w, c, 30)); } return porCat.get(c.id); };
  for (const c of gavetaCats) await doCat(c);

  /* ---------- PUBLICIDADE (anúncios vêm do painel "Publicidade" do WordPress) ---------- */
  const WP_BASE = process.env.WP_BASE || API.replace(/\/wp-json\/wp\/v2\/?$/, '');
  const WP_PUB = process.env.WP_PUBLICO || WP_BASE;
  const CACHE_ADS = path.join(__dirname, 'anuncios-cache.json');
  let ADS = [];
  const ARQ_ANUNCIOS = path.join(DADOS, 'anuncios.json'), ANUNCIOS_PROPRIOS = fs.existsSync(ARQ_ANUNCIOS);
  if (ANUNCIOS_PROPRIOS) {
    const hojeBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    try { ADS = JSON.parse(fs.readFileSync(ARQ_ANUNCIOS, 'utf8')).filter(a => a.ativo !== false && (!a.inicio || a.inicio <= hojeBR) && (!a.fim || a.fim >= hojeBR)); } catch (e) { console.log('aviso: anuncios.json ilegível'); }
    console.log('anúncios em vigor (painel próprio):', ADS.length);
  } else {
  try { ADS = (await get(`${WP_BASE}/wp-json/schoje/v1/anuncios`)).anuncios || []; fs.writeFileSync(CACHE_ADS, JSON.stringify(ADS)); console.log('anúncios em vigor:', ADS.length); }
  catch (e) { console.log('aviso: sem anúncios agora (' + e.message + '); usando a cópia anterior'); try { ADS = JSON.parse(fs.readFileSync(CACHE_ADS, 'utf8')); } catch (e2) { ADS = []; } }
  }
  const rotuloPub = (t = 'Publicidade') => `<span class="pub__rotulo"><span class="pub__hifen" aria-hidden="true">-</span> ${esc(t)} <span class="pub__hifen" aria-hidden="true">-</span></span>`;
  const fixaFaixa = h => !/adsbygoogle/.test(h) ? h : h.replace(/<ins\b[^>]*\badsbygoogle\b[^>]*>/gi, m => {
    if (/data-ad-(format\s*=\s*["']?fluid|layout)/i.test(m)) return m;
    const t = m.replace(/\sdata-(ad-format|full-width-responsive)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return /\sclass\s*=\s*"/i.test(t) ? t.replace(/\sclass\s*=\s*"([^"]*)"/i, ' class="$1 sc-faixa-ins"') : t.replace(/^<ins\b/i, '<ins class="adsbygoogle sc-faixa-ins"');
  });
  const fixaTam = (h, tm) => !tm || !/adsbygoogle/.test(h) ? h : h.replace(/<ins\b[^>]*\badsbygoogle\b[^>]*>/gi, m => {
    if (/data-ad-(format\s*=\s*["']?fluid|layout)/i.test(m)) return m;
    const t = m.replace(/\sdata-(ad-format|full-width-responsive)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return t.replace(/^<ins\b/i, `<ins style="display:inline-block;width:${tm[0]}px;height:${tm[1]}px"`);
  });
  const adImg = (i, alt, eager) => `<img src="${esc(i.src)}" width="${i.w}" height="${i.h}" alt="${esc(alt)}" decoding="async"${eager ? '' : ' loading="lazy"'}>`;
  const adHtml = (a, eager) => {
    if (a.tipo === 'codigo') return a.codigo || '';
    const link = h => a.link ? `<a href="${esc(a.link)}" target="_blank" rel="sponsored noopener">${h}</a>` : h;
    if (a.tipo === 'video') return a.video ? link(`<video class="js-video-preguicoso" muted loop playsinline preload="none" width="300" height="250" data-src="${esc(a.video)}"${a.poster ? ` poster="${esc(a.poster)}"` : ''} aria-label="${esc(a.nome)}"></video>`) : '';
    if (!a.img) return '';
    let im = adImg(a.img, a.nome, eager);
    if (a.img_cel) im = `<picture><source media="(max-width: 760px)" srcset="${esc(a.img_cel.src)}" width="${a.img_cel.w}" height="${a.img_cel.h}">${im}</picture>`;
    return link(im);
  };
  const serveFaixa = a => a.tipo === 'codigo' ? true : a.tipo === 'video' ? false : !!(a.img && a.img.h && a.img.w / a.img.h >= 2.5);
  const doEspaco = (ids, ctx) => { for (const id of [].concat(ids)) { const l = ADS.filter(a => a.espaco === id && (a.onde === 'todas' || a.onde === ctx || !a.onde)); if (l.length) return [id, l]; } return [null, []]; };
  // Mostra um espaço. Sem anúncio = não mostra nada. Páginas sem ctx (institucionais) nunca têm anúncio.
  const pub = (ids, ctx, classe, rotulo = 'Publicidade') => {
    if (!ctx) return '';
    const faixa = /pub--(faixa|topo)/.test(classe);
    const tm = /pub--300x250/.test(classe) ? [300, 250] : /pub--lateral-baixo/.test(classe) ? [300, 100] : /pub--lateral-2/.test(classe) ? [300, 600] : null;
    for (const id of [].concat(ids)) {
      let [, l] = doEspaco(id, ctx); if (faixa) l = l.filter(serveFaixa); if (!l.length) continue;
      const a = l[Math.floor(Math.random() * l.length)]; // revezamento: muda a cada regeneração do site
      const h = adHtml(a, faixa); if (!h) continue;
      return `<div class="pub ${classe} pub--${a.tipo}" data-anuncio="${a.id}">${rotuloPub(rotulo)}<div class="pub__peca">${faixa ? fixaFaixa(h) : fixaTam(h, tm)}</div></div>`;
    }
    return '';
  };
  const seloPub = (cat, soPatro) => { if (!cat) return ''; for (const esp of soPatro ? ['pub-patrocinio'] : ['pub-patrocinio', 'pub-selo']) { const l = ADS.filter(a => a.espaco === esp && +a.editoria === +cat.id); if (!l.length) continue; const a = l[Math.floor(Math.random() * l.length)]; const h = adHtml(a, true); if (!h) continue;
    return `<span class="selo-pub selo-pub--${esp === 'pub-patrocinio' ? 'grande' : 'pequeno'}" data-anuncio="${a.id}"><span class="selo-pub__rotulo">Oferecimento</span><span class="selo-pub__logo">${h}</span></span>`; } return ''; };
  const TOPO_CTX = { capa: 'pub-topo-home', editorias: 'pub-topo-categoria', materias: 'pub-topo-post' };
  const topoPub = ctx => ctx ? pub(['pub-topo-home', TOPO_CTX[ctx], 'pub-topo'].filter(Boolean), ctx, 'pub--topo') : '';
  const lat1 = ctx => pub(ctx === 'capa' ? ['pub-lateral-home'] : [ctx === 'materias' ? 'pub-lateral-post' : 'pub-lateral-categoria', 'pub-lateral-2'], ctx, ctx === 'capa' ? 'pub--lateral pub--lateral-baixo' : 'pub--lateral pub--lateral-2');
  const lat2 = ctx => pub([ctx === 'materias' ? 'pub-lateral-post-2' : 'pub-lateral-categoria-2', 'pub-lateral'], ctx, 'pub--lateral pub--300x250');
  const ancoraPub = ctx => { if (!ctx) return ''; const [, l] = doEspaco('pub-rodape-fixo', ctx); if (!l.length) return ''; const a = l[Math.floor(Math.random() * l.length)]; const h = adHtml(a, true); if (!h) return '';
    return `<div class="pub-ancora" id="pub-ancora" hidden data-anuncio-anc="${a.id}"><div class="pub-ancora__miolo"><button type="button" class="pub-ancora__fechar" aria-label="Fechar publicidade">&times;</button><div class="pub-ancora__corpo"></div></div><template>${h}</template></div>`; };
  // Banners dentro do texto da matéria: depois do 2º e do 6º parágrafo
  const textoComPub = (html, ctx) => { const partes = html.split('</p>'); if (partes.length < 4) return html; return partes.map((t, i) => (i < partes.length - 1 ? t + '</p>' : t) + (i === 1 ? pub('pub-materia', ctx, 'pub--materia') : '') + (i === 5 && partes.length > 8 ? pub('pub-materia-3', ctx, 'pub--materia') : '')).join(''); };

  /* ---------- helpers de página ---------- */
  const url = x => `/${x.slug}/`;
  const urlCat = c => c.tag ? `/tag/${c.slug}/` : c.autor ? `/author/${c.slug}/` : `/category/${c.slug}/`;
  const slugTag = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const nomeMenu = c => NOME_CURTO[c.slug] || c.name;
  const tam = (x, ...ks) => { const z = x.m?.media_details?.sizes || {}; for (const k of ks) { if (k === 'full') return { source_url: x.m?.source_url, width: x.m?.media_details?.width, height: x.m?.media_details?.height }; if (z[k]) return z[k]; } return null; };
  const imagem = (x, tipo, prio) => { if (!x.m) return '<span class="sem-foto" aria-hidden="true"></span>';
    const ks = { grande: ['sc-grande', 'large', 'full'], medio: ['sc-medio', 'medium_large', 'large', 'full'], mini: ['sc-mini', 'medium', 'thumbnail', 'full'], materia: ['large', 'sc-grande', 'full'] }[tipo];
    const s = tam(x, ...ks); if (!s || !s.source_url) return '<span class="sem-foto" aria-hidden="true"></span>';
    return `<img src="${esc(s.source_url)}" ${s.width ? `width="${s.width}" height="${s.height}"` : ''} alt="${esc(x.alt)}" decoding="${prio ? 'sync' : 'async'}" loading="${prio ? 'eager' : 'lazy'}"${prio ? ' fetchpriority="high"' : ''}>`; };
  const chapeu = x => x.cat ? `<span class="chapeu">${esc(x.cat.name)}</span>` : '';
  const TAM = { vertical: 'medio', lista: 'mini', 'grande-lado': 'grande', bloco: 'medio', ampla: 'medio', busca: 'medio', destaque: 'medio' };
  const card = (x, tipo = 'lista', nivel = 'h3') => { if (tipo === 'bullet') return `<li class="bullet"><a href="${url(x)}">${esc(x.tit)}</a></li>`;
    let h = `<article class="card card--${tipo}"><a class="card__img" href="${url(x)}" tabindex="-1" aria-hidden="true">${imagem(x, TAM[tipo] || 'mini')}</a><div class="card__texto">${chapeu(x)}<${nivel} class="card__titulo"><a href="${url(x)}">${esc(x.tit)}</a></${nivel}>`;
    if (['ampla', 'busca', 'destaque'].includes(tipo)) { const r = palavras(x.res, 26); if (r) h += `<p class="card__resumo">${esc(r)}</p>`; h += `<p class="card__data"><time datetime="${esc(x.data)}">${dataLonga(x.data)}</time></p>`; }
    return h + '</div></article>'; };
  const maisLidas = (itens, fotos) => `<section class="mais-lidas${fotos ? ' mais-lidas--fotos' : ''}"><h2 class="bloco-titulo">Mais lidas</h2><ol>${itens.map(x => `<li>${fotos ? `<a class="mais-lidas__img" href="${url(x)}" tabindex="-1" aria-hidden="true">${imagem(x, 'mini')}</a><div>` : ''}${chapeu(x)}<a href="${url(x)}">${esc(x.tit)}</a>${fotos ? '</div>' : ''}</li>`).join('')}</ol></section>`;
  const menuLi = cs => `<ul class="menu">${cs.map(c => `<li class="menu-item"><a href="${urlCat(c)}">${esc(nomeMenu(c))}</a></li>`).join('')}</ul>`;

  const cabeca = (titulo, desc, canon, extra = '') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="${ROBOTS_META}"><title>${esc(titulo)}</title><meta name="description" content="${esc(desc)}">${canon ? `<link rel="canonical" href="${esc(canon)}">` : ''}${ogBase(titulo, desc, canon, extra)}<link rel="icon" href="/estatico/img/sc-favicon-v2.ico"><link rel="apple-touch-icon" href="/estatico/img/sc-icone-180-v2.png"><link rel="preload" href="/estatico/fontes/merriweather-900.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/estatico/fontes/merriweather-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/estatico/tema.css?v=${VER}">${extra}</head><body>`;
  const cabecalho = home => `<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">${topoBarra(home)}<nav class="container topo__nav" aria-label="Editorias">${menuLi(menuCats)}</nav></header>
<div class="topo-fixo" inert>${topoBarra(false)}</div>
<div class="gaveta" id="gaveta" aria-label="Menu" aria-hidden="true"><div class="gaveta__topo"><button type="button" class="btn-icone js-fechar-gaveta" aria-label="Fechar menu">${icone('fechar')}</button></div><div class="gaveta__logo">${logo()}</div><div class="gaveta__discover">${botaoGoogle()}</div><nav class="gaveta__menu" aria-label="Menu completo">${menuLi(gavetaCats)}</nav><nav class="gaveta__menu gaveta__inst" aria-label="Institucional"><ul>${INST.map(([sl,t])=>`<li><a href="/${sl}/">${t}</a></li>`).join("")}</ul></nav>${redes()}</div>
<div class="gaveta-fundo js-fechar-gaveta" hidden></div>
<div class="busca-tela" id="busca-tela" role="dialog" aria-modal="true" aria-label="Buscar no site" hidden><div class="busca-tela__topo"><div class="busca-tela__logo">${logo()}</div><button type="button" class="btn-icone js-fechar-busca" aria-label="Fechar busca">${icone('fechar')}</button></div><form role="search" method="get" class="busca-tela__form" action="https://schoje.news/"><label class="busca-tela__rotulo" for="busca-tela-campo">O que você deseja encontrar?</label><div class="busca-tela__linha"><input type="search" id="busca-tela-campo" name="s" autocomplete="off"><button type="submit">Buscar</button></div></form></div>`;
  const rodape = `<footer class="rodape"><div class="rodape__faixa"><div class="container rodape__faixa-dentro"><p class="rodape__chamada">${icone('whatsapp')}<span>Receba as notícias de <strong>Balneário Camboriú</strong> no seu WhatsApp</span></p><a class="rodape__btn-whats" href="${WHATS}" target="_blank" rel="noopener">Entrar no grupo</a></div></div>
<div class="container rodape__grade"><div class="rodape__marca">${logo('escuro')}<p>Notícias de Balneário Camboriú e região</p>${redes()}${botaoGoogle()}</div>
<nav class="rodape__col" aria-label="Editorias"><h2 class="rodape__titulo">Editorias</h2>${menuLi(menuCats)}</nav>
<nav class="rodape__col" aria-label="Institucional"><h2 class="rodape__titulo">Institucional</h2><ul class="menu">${INST.map(([sl,t])=>`<li><a href="/${sl}/">${t}</a></li>`).join("")}</ul></nav>
<div class="rodape__col"><h2 class="rodape__titulo">Fale com a gente</h2><ul class="rodape__contato"><li><span>Redação e anúncios</span><a href="mailto:contato@schoje.news">contato@schoje.news</a></li><li><span>WhatsApp de atendimento</span><a href="https://wa.me/5548992088844" target="_blank" rel="noopener">(48) 99208-8844</a></li><li><span>Redação</span>24 horas, pelo WhatsApp e e-mail</li><li><span>Atendimento comercial</span>Segunda a sexta, das 9h às 17h</li><li><span>Endereço</span>Rua Arthur Max Doose, 153, sala 1301<br>Pioneiros – Balneário Camboriú/SC<br>CEP 88331-085</li></ul></div></div>
<div class="rodape__copy"><div class="container"><p>O Portal SC Hoje é uma publicação da <strong>Mauricio Freitas Comunicação Ltda</strong>.<br>© ${new Date().getFullYear()} SC Hoje. Todos os direitos reservados.<br>A reprodução de qualquer matéria, imagem ou foto é permitida somente com autorização prévia.<br>® SC Hoje é uma marca registrada no INPI.</p><p class="rodape__cookies"><button type="button" class="js-cookies-abrir">Preferências de cookies</button></p></div></div></footer><div id="sc-cookies" class="sc-cookies" role="region" aria-label="Aviso de cookies" hidden><p class="sc-cookies__txt">Usamos cookies para o site funcionar, medir a audiência e exibir anúncios. Os de audiência e de publicidade só são ativados se você aceitar. Veja a <a href="/politica-de-cookies/">Política de cookies</a>.</p><div class="sc-cookies__btns"><button type="button" data-sc-cookies="essenciais">Só os essenciais</button><button type="button" data-sc-cookies="todos">Aceitar todos</button></div></div><script>window.SC_COOKIES={modo:"consentimento",ga:"",ads:"",px:""};</script><script src="/estatico/cookies.js?v=${VER}" defer></script><script src="/estatico/tema.js?v=${VER}" defer></script></body></html>`;
  const novidades = `<section class="news" aria-labelledby="news-t"><div class="container"><div class="news__caixa"><h2 id="news-t" class="news__titulo">Receba o Boletim SC Hoje no seu e-mail</h2><p class="news__sub">Notícias de Balneário Camboriú · Frequência de envio: <strong>diário</strong> · grátis</p><form class="news__form js-news" novalidate><input type="email" name="email" placeholder="Digite seu melhor e-mail" autocomplete="email" required aria-label="Seu e-mail"><button type="submit">Quero receber</button></form><p class="news__msg js-news-msg" role="status" aria-live="polite"></p><p class="news__aviso">Ao se inscrever, você concorda em receber o Boletim SC Hoje e aceita a <a href="/politica-de-privacidade/">Política de privacidade</a>. Você cancela quando quiser.</p></div></div></section>`;
  const pagina = (titulo, desc, canon, home, corpo, extra, ctx = '') => (cabeca(titulo, desc, canon, extra) + cabecalho(home) + topoPub(ctx) + corpo + novidades + rodape).replace(/<\/body>/i, () => (ctx ? `<script>window.SCHOJE={pub:"${ANUNCIOS_PROPRIOS ? '/api/pub' : WP_PUB + '/wp-json/schoje/v1/pub'}"};</script>` + ancoraPub(ctx) : '') + '</body>');

  /* ---------- HOME ---------- */
  const usados = new Set(); const marca = xs => xs.forEach(x => usados.add(x.slug));
  const Lc = [...L.filter(x => x.capa), ...L.filter(x => !x.capa)];
  const capa = Lc.slice(0, 6); marca(capa);
  const [manchete, lado] = capa;
  const grade = capa.slice(2);
  const reserva = Lc.filter(x => !usados.has(x.slug));
  while (grade.length < 12 && reserva.length) { const x = reserva.shift(); grade.push(x); usados.add(x.slug); }
  let h = '<main id="conteudo" class="capa">';
  if (manchete) h += `<section class="container manchete" aria-label="Manchete"><a class="manchete__img" href="${url(manchete)}" tabindex="-1" aria-hidden="true">${imagem(manchete, 'grande', true)}</a><div class="manchete__texto">${chapeu(manchete)}<h2 class="manchete__titulo"><a href="${url(manchete)}">${esc(manchete.tit)}</a></h2>${manchete.res ? `<p class="manchete__fina">${esc(palavras(manchete.res, 30))}</p>` : ''}</div>${lado ? `<div class="manchete__lado">${card(lado, 'vertical')}</div>` : ''}</section>`;
  const lidas = L.filter(x => !capa.includes(x)).slice(0, 5);
  h += `<div class="container capa-grade"><section class="grade-cards" aria-label="Destaques">${grade.map(x => `<div class="grade-item">${card(x, 'lista')}</div>`).join('')}</section><aside class="lateral" aria-label="Coluna lateral">${lat1('capa')}${maisLidas(lidas, false)}</aside></div>${pub('pub-capa-meio', 'capa', 'pub--faixa')}`;
  const blocos = [menuCats[0], menuCats[2], menuCats[1], menuCats[4]].filter(Boolean);
  for (const c of blocos) {
    const bi = blocos.indexOf(c), PUBS = [['pub-capa-bloco-1', 600], ['pub-capa-bloco-2', 250], ['pub-lateral-home-2', 250], ['pub-capa-bloco-4', 600]][bi];
    const pubB = pub(PUBS[0], 'capa', PUBS[1] === 600 ? 'pub--lateral pub--lateral-2' : 'pub--lateral pub--300x250');
    const lista = (await doCat(c)).filter(x => x !== manchete && x !== lado).slice(0, pubB ? (PUBS[1] === 600 ? 12 : 6) : 9); if (lista.length < 4) continue;
    const [pr, ...resto] = lista;
    h += `<section class="container editoria" style="--cor-ed:#0034fc" aria-labelledby="ed-${c.slug}"><header class="editoria__topo"><h2 class="editoria__nome" id="ed-${c.slug}"><a href="${urlCat(c)}">${esc(c.name)}</a></h2>${seloPub(c)}<a class="editoria__ver" href="${urlCat(c)}">Ver todas<span class="sr-only"> as notícias de ${esc(c.name)}</span></a></header><div class="bloco bloco--b${pubB ? ' bloco--com-pub' : ''}${pubB && PUBS[1] === 600 ? ' bloco--pub600' : ''}"><div class="bloco__grade"><div class="bloco__principal">${card(pr, 'bloco')}</div>${resto.map((x, i) => `<div class="bloco__item bloco__item--${i + 1}">${card(x, 'lista')}</div>`).join('')}</div>${pubB ? `<div class="bloco__pub">${pubB}</div>` : ''}</div></section>`;
    if (c === menuCats[2]) h += pub('pub-capa-2', 'capa', 'pub--faixa');
  }
  const final = menuCats[0];
  if (final) { const li = (await doCat(final)).slice(0, 10);
    h += pub('pub-capa-3', 'capa', 'pub--faixa');
    h += `<section class="container lista-final" aria-labelledby="titulo-lista-final"><header class="editoria__topo editoria__topo--linha"><h2 class="editoria__nome" id="titulo-lista-final">Últimas notícias</h2>${seloPub(final)}</header><div class="arquivo lista-final__corpo"><div class="arquivo__principal"><div class="arquivo__lista js-lista">${li.map(x => card(x, 'ampla')).join('')}</div><p class="arquivo__mais"><a class="btn btn--mais" href="${urlCat(final)}">Carregar mais notícias</a></p></div><aside class="lateral" aria-label="Coluna lateral"><a class="quadro-whats" href="${WHATS}" target="_blank" rel="noopener">${icone('whatsapp')}<span class="quadro-whats__texto">Receba as notícias de <strong>Balneário Camboriú</strong> no seu WhatsApp</span><span class="quadro-whats__btn">Entrar no grupo</span></a>${pub('pub-capa-lista', 'capa', 'pub--lateral pub--lateral-2')}${botaoGoogle()}</aside></div></section>`; }
  h += '</main>';
  wr('index.html', pagina(`${NOME} — notícias de Balneário Camboriú`, 'Notícias de Balneário Camboriú e região: cidade, política, polícia e cotidiano. Portal SC Hoje, no ar desde 2008.', SITE_PROD + '/', true, h, ldTag({ '@context': 'https://schema.org', '@graph': [ORG_LD, SITE_LD] }), 'capa'));

  const metaArtigo = x => {
    const u = SITE_PROD + url(x), pub = toIso(x.p.date), mod = toIso(x.p.modified) || pub, img = x.m?.source_url ? absProd(x.m.source_url) : '';
    const w = x.m?.media_details?.width, h = x.m?.media_details?.height, leg = txt(x.m?.caption?.rendered || ''), cred = (leg.match(/^(?:foto|imagem|crédito)s?:\s*(.+)$/i) || [])[1];
    const palavrasN = txt(x.p.content?.rendered || '').split(/\s+/).filter(Boolean).length;
    const autorLd = /^reda[cç][aã]o/i.test(x.autor) ? { '@type': 'Organization', '@id': ORG_ID, name: x.autor, url: SITE_PROD + '/expediente/' } : Object.assign({ '@type': 'Person', name: x.autor, url: SITE_PROD + '/author/' + slugAutor(x.autor) + '/' }, FOTO_AUTOR.get(semAcento(x.autor)) ? { image: absProd(FOTO_AUTOR.get(semAcento(x.autor))) } : {});
    const imgLd = img ? [Object.assign({ '@type': 'ImageObject', url: img }, w && h ? { width: w, height: h } : {}, leg ? { caption: leg } : {}, cred ? { creditText: cred } : {})] : undefined;
    const noticia = { '@context': 'https://schema.org', '@type': 'NewsArticle', '@id': u + '#article', mainEntityOfPage: { '@type': 'WebPage', '@id': u }, url: u, headline: x.tit.slice(0, 110), alternativeHeadline: x.sub || undefined, description: (x.res || x.sub || x.tit).slice(0, 300), image: imgLd, thumbnailUrl: img || undefined, datePublished: pub, dateModified: mod, author: autorLd, publisher: Object.assign({}, ORG_LD, { '@context': undefined }), articleSection: x.cat ? x.cat.name : undefined, keywords: x.tags.length ? x.tags.join(', ') : undefined, inLanguage: 'pt-BR', isAccessibleForFree: true, wordCount: palavrasN, locationCreated: { '@type': 'Place', name: 'Balneário Camboriú, SC' }, copyrightHolder: { '@id': ORG_ID }, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.materia__titulo', '.linha-fina'] } };
    const trilha = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs([['Página inicial', SITE_PROD + '/']].concat(x.cat ? [[x.cat.name, SITE_PROD + urlCat(x.cat)]] : []).concat([[x.tit, u]])).itemListElement };
    return `<meta property="og:type" content="article"><meta property="og:title" content="${esc(x.tit)}">${img ? `<meta property="og:image" content="${esc(abs(x.m.source_url))}">${w && h ? `<meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">` : ''}<meta property="og:image:alt" content="${esc(x.alt)}"><meta name="twitter:image" content="${esc(abs(x.m.source_url))}">` : ''}<meta property="article:published_time" content="${pub}"><meta property="article:modified_time" content="${mod}">${x.cat ? `<meta property="article:section" content="${esc(x.cat.name)}">` : ''}${x.tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('')}<meta property="article:author" content="${esc(x.autor)}">${ldTag(noticia)}${ldTag(trilha)}`;
  };
  /* ---------- MATÉRIAS ---------- */
  // Arquivo: matérias antigas (fora das 60 mais recentes) também ganham página. Só refaz se mudou ou se o gerador foi atualizado.
  const VERSAO_GERADOR = '0.18.4', ARQ_VERSAO = path.join(OUT, '.versao');
  const refazTudo = !fs.existsSync(ARQ_VERSAO) || fs.readFileSync(ARQ_VERSAO, 'utf8') !== VERSAO_GERADOR;
  const slugsL = new Set(L.map(y => y.slug));
  const extras = locaisTodos.filter(p => !slugsL.has(p.slug)).map(p => info(wpForma(p, porSlug.get(p.categoria)))), extrasSet = new Set(extras);
  let feitasArquivo = 0;
  const slugAutor = nome => (AUTOR_INFO.get(semAcento(nome)) || {}).slug || slugTag(nome);
  const AUTORES = new Map(); for (const x of [...L, ...extras]) { const n = x.autor || 'Redação SC Hoje'; if (!AUTORES.has(n)) AUTORES.set(n, []); AUTORES.get(n).push(x); } for (const l of AUTORES.values()) l.sort((a, b) => new Date(toIso(b.p.date)) - new Date(toIso(a.p.date)));
  for (const x of [...L, ...extras]) {
    if (extrasSet.has(x) && !refazTudo) { try { if (fs.statSync(path.join(OUT, `${x.slug}/index.html`)).mtimeMs > Date.parse(x.p.modified || x.date)) continue; } catch (e) {} }
    if (extrasSet.has(x)) feitasArquivo++;
    const rel = (x.cat ? (await doCat(x.cat)) : L).filter(y => y.slug !== x.slug).slice(0, 6);
    const migalhas = `<nav class="migalhas" aria-label="Você está em"><a href="/">Página inicial</a>${x.cat ? `<span aria-hidden="true">›</span><a href="${urlCat(x.cat)}">${esc(x.cat.name)}</a>` : ''}</nav>`;
    const leg = txt(x.m?.caption?.rendered || '');
    const corpo = `<main id="conteudo" class="container materia"><article class="materia__artigo"><header class="materia__topo">${migalhas}${seloPub(x.cat, true)}${x.cat ? `<a class="chapeu" href="${urlCat(x.cat)}">${esc(x.cat.name)}</a>` : ''}<h1 class="materia__titulo">${esc(x.tit)}</h1>${x.sub ? `<p class="linha-fina">${esc(x.sub)}</p>` : ''}<div class="autor-linha"><span class="autor-linha__foto" aria-hidden="true">${FOTO_AUTOR.get(semAcento(x.autor)) ? `<img src="${esc(FOTO_AUTOR.get(semAcento(x.autor)))}" alt="" width="40" height="40">` : `<span>${esc(x.autor.charAt(0).toUpperCase())}</span>`}</span><div class="autor-linha__txt"><p class="autor-linha__nome"><a href="/author/${slugAutor(x.autor)}/">${esc(x.autor)}</a></p><p class="autor-linha__data"><time datetime="${esc(x.data)}">${dataAutor(x.data)}</time></p></div><img class="autor-linha__logo" src="/estatico/img/logo-escuro-420.webp" width="95" height="24" alt="SC Hoje"></div><div class="compartilhar" aria-label="Compartilhar"><a class="compartilhar__b compartilhar__b--whats" data-rede="whatsapp" href="${WHATS}" rel="noopener">${icone('whatsapp')}<span>Enviar no WhatsApp</span></a><a class="compartilhar__b compartilhar__b--fb" data-rede="facebook" href="${REDES.facebook}" rel="noopener">${icone('facebook')}<span>Facebook</span></a><a class="compartilhar__b compartilhar__b--x" data-rede="x" href="${REDES.x}" rel="noopener">${icone('x')}<span>X</span></a><a class="compartilhar__b compartilhar__b--in" data-rede="linkedin" href="https://www.linkedin.com" rel="noopener">${icone('linkedin')}<span>LinkedIn</span></a></div>${botaoFonte()}</header>${x.m ? `<figure class="materia__img">${imagem(x, 'materia', true)}${leg ? `<figcaption>${esc(leg)}</figcaption>` : ''}</figure>` : ''}<div class="materia__texto">${textoComPub(limpa(x.p.content?.rendered), 'materias')}</div>${x.tags.length ? `<p class="tags"><span>Tags:</span> ${x.tags.map(t => `<a href="/tag/${slugTag(t)}/">${esc(t)}</a>`).join('')}</p>` : ''}${pub('pub-materia-2', 'materias', 'pub--materia')}<footer class="materia__fim">${botaoGoogle()}</footer>${rel.length ? `<section class="leia-tambem" aria-labelledby="titulo-mais"><h2 class="bloco-titulo" id="titulo-mais">Mais notícias${x.cat ? ' de ' + esc(x.cat.name) : ''}</h2><div class="leia-tambem__lista">${rel.map(y => card(y, 'lista')).join('')}</div></section>` : ''}</article><aside class="lateral" aria-label="Coluna lateral">${lat1('materias')}${maisLidas(L.filter(y => y.slug !== x.slug).slice(0, 5), true)}${lat2('materias')}</aside></main>`;
    wr(`${x.slug}/index.html`, pagina(`${x.tit} — ${NOME}`, (x.res || x.tit).slice(0, 160), SITE_PROD + url(x), false, corpo + `<a class="whats-flutuante" href="${WHATS}" target="_blank" rel="noopener" aria-label="Receba notícias no WhatsApp">${icone('whatsapp')}<span>Receba notícias no WhatsApp</span></a>`, metaArtigo(x), 'materias'));
  }

  /* ---------- MAPAS DO SITE, FEED, ROBOTS E LLMS.TXT ---------- */
  {
    const xe = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const isoD = d => { const t = toIso(d); return t; };
    const todasMat = [...L, ...extras].sort((a, b) => new Date(toIso(b.p.date)) - new Date(toIso(a.p.date)));
    const cab = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const agora = new Date().toISOString();
    // sitemap das páginas (home, editorias, institucionais)
    const pg = [[SITE_URL + '/', agora, 'hourly']];
    for (const c of gavetaCats) pg.push([SITE_URL + urlCat(c), agora, 'hourly']);
    for (const nome of AUTORES.keys()) pg.push([SITE_URL + '/author/' + slugAutor(nome) + '/', agora, 'weekly']);
    for (const [sl] of INST) pg.push([SITE_URL + '/' + sl + '/', '', 'yearly']);
    wr('sitemap-paginas.xml', cab + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pg.map(([l, m, f]) => `<url><loc>${xe(l)}</loc>${m ? `<lastmod>${m}</lastmod>` : ''}<changefreq>${f}</changefreq></url>`).join('') + '</urlset>');
    // sitemaps das matérias (com fotos), em blocos de 5000
    const partes = []; for (let i = 0; i < todasMat.length; i += 5000) partes.push(todasMat.slice(i, i + 5000));
    partes.forEach((lote, i) => wr(`sitemap-materias-${i + 1}.xml`, cab + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + lote.map(x => `<url><loc>${xe(SITE_URL + url(x))}</loc><lastmod>${isoD(x.p.modified || x.p.date)}</lastmod>${x.m?.source_url ? `<image:image><image:loc>${xe(abs(x.m.source_url))}</image:loc>${txt(x.m?.caption?.rendered || '') ? `<image:caption>${xe(txt(x.m.caption.rendered))}</image:caption>` : ''}</image:image>` : ''}</url>`).join('') + '</urlset>'));
    // SITEMAP DE NOTÍCIAS (Google Notícias): só matérias das últimas 48 horas
    const limite48 = Date.now() - 48 * 3600000;
    const recentesN = todasMat.filter(x => new Date(toIso(x.p.date)).getTime() >= limite48).slice(0, 1000);
    const noticias = cab + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + recentesN.map(x => `<url><loc>${xe(SITE_URL + url(x))}</loc><news:news><news:publication><news:name>SC Hoje</news:name><news:language>pt</news:language></news:publication><news:publication_date>${toIso(x.p.date)}</news:publication_date><news:title>${xe(x.tit)}</news:title>${x.tags.length ? `<news:keywords>${xe(x.tags.slice(0, 8).join(', '))}</news:keywords>` : ''}</news:news>${x.m?.source_url ? `<image:image><image:loc>${xe(abs(x.m.source_url))}</image:loc></image:image>` : ''}</url>`).join('') + '</urlset>';
    wr('sitemap-news.xml', noticias); wr('news-sitemap.xml', noticias);
    // índice (mesmo nome do Yoast, para quem já cadastrou no Search Console)
    const indice = cab + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + [['sitemap-news.xml', agora], ['sitemap-paginas.xml', agora], ...partes.map((_, i) => [`sitemap-materias-${i + 1}.xml`, agora])].map(([f, m]) => `<sitemap><loc>${SITE_URL}/${f}</loc><lastmod>${m}</lastmod></sitemap>`).join('') + '</sitemapindex>';
    wr('sitemap_index.xml', indice); wr('sitemap.xml', indice);
    // feed RSS
    wr('feed/index.xml', `${cab}<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>SC Hoje</title><link>${SITE_URL}/</link><atom:link href="${SITE_URL}/feed/" rel="self" type="application/rss+xml"/><description>Notícias de Balneário Camboriú e região</description><language>pt-BR</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>` + todasMat.slice(0, 30).map(x => `<item><title>${xe(x.tit)}</title><link>${SITE_URL}${url(x)}</link><guid isPermaLink="true">${SITE_URL}${url(x)}</guid><pubDate>${new Date(toIso(x.p.date)).toUTCString()}</pubDate><dc:creator>${xe(x.autor)}</dc:creator>${x.cat ? `<category>${xe(x.cat.name)}</category>` : ''}<description>${xe(x.res || '')}</description>${x.m?.source_url ? `<media:content url="${xe(abs(x.m.source_url))}" medium="image"/>` : ''}</item>`).join('') + '</channel></rss>');
    // robots.txt (teste = bloqueia tudo; produção = libera Google, Google Notícias e robôs de IA)
    const IA = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai', 'Amazonbot'];
    wr('robots.txt', !PRODUCAO ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /redacao\nDisallow: /api/\n\n${IA.map(b => `User-agent: ${b}\nAllow: /\nDisallow: /admin\nDisallow: /redacao\nDisallow: /api/\n`).join('\n')}\nSitemap: ${SITE_URL}/sitemap_index.xml\nSitemap: ${SITE_URL}/sitemap-news.xml\n`);
    // llms.txt: guia do site para buscadores de IA
    wr('llms.txt', `# SC Hoje\n\n> Portal de notícias de Balneário Camboriú (SC), no ar desde 2008. Cobre a cidade e a região: política, polícia, cotidiano e serviços. Conteúdo jornalístico em português do Brasil, com política editorial e de correções públicas.\n\n## Seções\n${gavetaCats.slice(0, 12).map(c => `- [${c.name}](${SITE_URL}${urlCat(c)}): notícias de ${c.name}`).join('\n')}\n\n## Últimas notícias\n${todasMat.slice(0, 20).map(x => `- [${x.tit}](${SITE_URL}${url(x)}): ${palavras(x.res || '', 24)}`).join('\n')}\n\n## Sobre o portal\n- [Quem somos](${SITE_URL}/quem-somos/)\n- [Expediente](${SITE_URL}/expediente/)\n- [Política editorial](${SITE_URL}/politica-editorial/)\n- [Política de correções](${SITE_URL}/politica-de-correcoes/)\n- [Fale conosco](${SITE_URL}/fale-conosco/)\n\n## Para máquinas\n- [Sitemap de notícias](${SITE_URL}/sitemap-news.xml)\n- [Índice de sitemaps](${SITE_URL}/sitemap_index.xml)\n- [Feed RSS](${SITE_URL}/feed/)\n`);
  }
  if (feitasArquivo) console.log('matérias do arquivo geradas:', feitasArquivo);
  fs.writeFileSync(ARQ_VERSAO, VERSAO_GERADOR);

  /* ---------- EDITORIAS ---------- */
  const tagCats = []; { const nomes = new Map(); for (const p of locaisTodos) for (const t of (p.tags || [])) { const sl = slugTag(t); if (sl && !nomes.has(sl)) nomes.set(sl, t); }
    for (const [sl, nome] of nomes) { const c = { id: 't-' + sl, name: '#' + nome, slug: sl, tag: true }; tagCats.push(c); porCat.set(c.id, locaisTodos.filter(p => (p.tags || []).some(t => slugTag(t) === sl)).slice(0, 60).map(p => info(wpForma(p, porSlug.get(p.categoria))))); } }
  const autorCats = [...AUTORES].map(([nome, l]) => { const c = { id: 'a-' + slugAutor(nome), name: nome, slug: slugAutor(nome), autor: true }; porCat.set(c.id, l.slice(0, 60)); return c; });
  for (const c of [...gavetaCats, ...tagCats, ...autorCats]) {
    const its = await doCat(c);
    const [m, ...resto] = its;
    const ultimas = L.slice(0, 5).map(x => `<li>${chapeu(x)}<a href="${url(x)}">${esc(x.tit)}</a></li>`).join('');
    const itens = resto.map((x, i) => `<article class="cat-item"${i >= 12 ? ' hidden' : ''}><a class="cat-item__img" href="${url(x)}" tabindex="-1" aria-hidden="true">${imagem(x, 'medio')}</a><div class="cat-item__texto">${chapeu(x)}<h2 class="cat-item__titulo"><a href="${url(x)}">${esc(x.tit)}</a></h2>${x.res ? `<p class="cat-item__fina">${esc(palavras(x.res, 24))}</p>` : ''}</div></article>`).join('');
    const blocoAutor = c => { const k = semAcento(c.name), f = FOTO_AUTOR.get(k), bio = BIO_AUTOR.get(k), inf = AUTOR_INFO.get(k) || {}, n = (AUTORES.get(c.name) || []).length; return `<section class="autor-perfil">${f ? `<img class="autor-perfil__foto" src="${esc(f)}" alt="${esc(c.name)}" width="96" height="96">` : ''}<div><p class="autor-perfil__cargo">${esc(inf.cargo || 'Autor no SC Hoje')}</p>${bio ? `<p class="autor-perfil__bio">${esc(bio)}</p>` : ''}${inf.registro ? `<p class="autor-perfil__reg">Registro profissional — ${esc(inf.registro)}</p>` : ''}<p class="autor-perfil__n">${inf.linkedin ? `<a class="autor-perfil__in" href="${esc(inf.linkedin)}" target="_blank" rel="noopener me">${icone('linkedin')}<span>LinkedIn</span></a> ` : ''}${n} matéria${n === 1 ? '' : 's'} publicada${n === 1 ? '' : 's'}</p></div></section>`; };
    const redesCat = `<ul class="cat-redes"><li><a href="${WHATS}" target="_blank" rel="noopener">${icone('whatsapp')}WhatsApp</a></li><li><a href="${REDES.facebook}" target="_blank" rel="noopener">${icone('facebook')}Facebook</a></li><li><a href="${REDES.instagram}" target="_blank" rel="noopener">${icone('instagram')}Instagram</a></li><li><a href="${REDES.x}" target="_blank" rel="noopener">${icone('x')}X</a></li></ul>`;
    const corpo = `<main id="conteudo" class="cat"><div class="container"><nav class="migalhas arquivo__migalhas" aria-label="Você está em"><a href="/">Página inicial</a><span aria-hidden="true">›</span><a href="${urlCat(c)}">${esc(c.name)}</a></nav><div class="cat__grade"><div class="cat__esq"><header class="cat__faixa"><h1>${esc(c.name)}</h1>${seloPub(c)}</header>${c.autor ? blocoAutor(c) : ''}${m ? `<article class="cat-hero"><a class="cat-hero__img" href="${url(m)}" tabindex="-1" aria-hidden="true">${imagem(m, 'grande', true)}</a><div class="cat-hero__texto">${chapeu(m)}<h2 class="cat-hero__titulo"><a href="${url(m)}">${esc(m.tit)}</a></h2>${m.res ? `<p class="cat-hero__fina">${esc(palavras(m.res, 30))}</p>` : ''}</div></article>` : ''}<div class="cat__lista">${itens || '<p class="arquivo__vazio">Nenhuma notícia encontrada.</p>'}${resto.length > 12 ? '<a class="cat__mais js-mais-cat" href="#">Ver mais notícias</a>' : ''}</div></div><aside class="cat__lado" aria-label="Coluna lateral">${lat1('editorias')}<section class="cat__redes" aria-label="Siga nossas redes"><h2 class="cat__lat">Siga nossas redes</h2>${redesCat}</section>${lat2('editorias')}<section aria-label="Últimas notícias"><h2 class="cat__lat">Últimas notícias</h2><ul class="cat-ultimas">${ultimas}</ul></section></aside></div></div></main>`;
    wr(`${c.tag ? 'tag' : c.autor ? 'author' : 'category'}/${c.slug}/index.html`, pagina(`${c.name} — ${NOME}`, c.autor ? 'Matérias de ' + c.name + ' no SC Hoje, portal de notícias de Balneário Camboriú.' : 'Últimas notícias de ' + c.name + ' em Balneário Camboriú e região. Portal SC Hoje.', SITE_PROD + urlCat(c), false, corpo, ldTag({ '@context': 'https://schema.org', '@graph': [...(c.autor ? [{ '@type': 'ProfilePage', '@id': SITE_PROD + urlCat(c) + '#perfil', mainEntity: Object.assign({ '@type': 'Person', name: c.name, url: SITE_PROD + urlCat(c), worksFor: { '@id': ORG_ID } }, (AUTOR_INFO.get(semAcento(c.name)) || {}).linkedin ? { sameAs: [AUTOR_INFO.get(semAcento(c.name)).linkedin] } : {}, (AUTOR_INFO.get(semAcento(c.name)) || {}).cargo ? { jobTitle: AUTOR_INFO.get(semAcento(c.name)).cargo } : {}, FOTO_AUTOR.get(semAcento(c.name)) ? { image: absProd(FOTO_AUTOR.get(semAcento(c.name))) } : {}, BIO_AUTOR.get(semAcento(c.name)) ? { description: BIO_AUTOR.get(semAcento(c.name)) } : {}) }] : []), { '@type': 'CollectionPage', '@id': SITE_PROD + urlCat(c), url: SITE_PROD + urlCat(c), name: c.name + ' — SC Hoje', inLanguage: 'pt-BR', isPartOf: { '@id': SITE_PROD + '/#website' }, publisher: { '@id': ORG_ID }, mainEntity: { '@type': 'ItemList', itemListElement: its.slice(0, 20).map((y, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_PROD + url(y), name: y.tit })) } }, crumbs([['Página inicial', SITE_PROD + '/'], [c.name, SITE_PROD + urlCat(c)]])] }), 'editorias'));
  }


  /* ---------- PÁGINA DO TEMPO ---------- */
  {
    const ultT = L.slice(0, 5).map(x => `<li>${chapeu(x)}<a href="${url(x)}">${esc(x.tit)}</a></li>`).join('');
    const redesT = `<ul class="cat-redes"><li><a href="${WHATS}" target="_blank" rel="noopener">${icone('whatsapp')}WhatsApp</a></li><li><a href="${REDES.facebook}" target="_blank" rel="noopener">${icone('facebook')}Facebook</a></li><li><a href="${REDES.instagram}" target="_blank" rel="noopener">${icone('instagram')}Instagram</a></li><li><a href="${REDES.x}" target="_blank" rel="noopener">${icone('x')}X</a></li></ul>`;
    const corpoT = `<main id="conteudo" class="cat"><div class="container"><nav class="migalhas arquivo__migalhas" aria-label="Você está em"><a href="/">Página inicial</a><span aria-hidden="true">›</span><a href="/tempo/">Previsão do tempo</a></nav><div class="cat__grade"><div class="cat__esq"><header class="cat__faixa"><h1>Previsão do tempo em Balneário Camboriú</h1></header><div class="tp js-tempo-pagina"><p class="tp__carregando">Carregando a previsão…</p></div><p class="tp__fonte">Fonte: Open-Meteo (tempo e mar). Previsão para os próximos 10 dias. A altura das ondas é uma estimativa para o mar aberto em frente à cidade e pode variar na faixa de areia.</p></div><aside class="cat__lado" aria-label="Coluna lateral">${lat1('editorias')}<section class="cat__redes" aria-label="Siga nossas redes"><h2 class="cat__lat">Siga nossas redes</h2>${redesT}</section>${lat2('editorias')}<section aria-label="Últimas notícias"><h2 class="cat__lat">Últimas notícias</h2><ul class="cat-ultimas">${ultT}</ul></section></aside></div></div></main>`;
    wr('tempo/index.html', pagina(`Previsão do tempo em Balneário Camboriú — ${NOME}`, 'Previsão do tempo para os próximos 10 dias em Balneário Camboriú.', null, false, corpoT, undefined, 'editorias'));
  }

  for (const [sl, t] of INST) {
    const f = path.join(__dirname, 'institucional', sl + '.html');
    if (!fs.existsSync(f)) continue;
    const corpo = fs.readFileSync(f, 'utf8').replace(/href="\/grupo"/g, `href="${WHATS}"`);
    wr(`${sl}/index.html`, pagina(`${t} — ${NOME}`, `${t} do ${NOME}.`, SITE_PROD + '/' + sl + '/', false, corpo));
  }

  wr('ultimas.json', JSON.stringify({ gerado: new Date().toISOString(), posts: L.slice(0, 12).map(x => ({ slug: x.slug, titulo: x.tit, resumo: palavras(x.res, 28), url: url(x), imagem: x.m?.source_url || '', categoria: x.cat ? x.cat.name : '', data: x.data })) }));
  fs.cpSync(path.join(__dirname, 'estatico'), path.join(OUT, 'estatico'), { recursive: true });
  // Arquivos soltos na pasta principal do repositório valem mais que os da pasta estatico (facilita o envio pelo GitHub).
  for (const f of ['tema.css', 'tema.js', 'cookies.js']) if (fs.existsSync(path.join(__dirname, f))) fs.copyFileSync(path.join(__dirname, f), path.join(OUT, 'estatico', f));
  const swf = [path.join(__dirname, 'sw.js'), path.join(__dirname, 'estatico', 'sw.js')].find(f => fs.existsSync(f));
  if (swf) fs.copyFileSync(swf, path.join(OUT, 'sw.js'));
  console.log('ok', L.length, 'matérias,', gavetaCats.length, 'editorias');
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
