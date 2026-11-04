// Gera o site estático do SC Hoje a partir da API do WordPress. Sem dependências (Node 18+).
// Usa o MESMO layout/CSS do tema oficial (versão mobile first). Uso: node gerar.js
// Variáveis: API, OUT, SITE
const fs = require('fs'), path = require('path');
const API = process.env.API || 'https://schoje.news/wp-json/wp/v2';
const OUT = process.env.OUT || '/var/www/teste';
const NOME = 'SC Hoje';
const WHATS = 'https://schoje.news/grupo';
const REDES = { facebook: 'https://www.facebook.com/schojeoficial', instagram: 'https://www.instagram.com/schoje.news', x: 'https://x.com/schojeoficial' };
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
  x: '<path fill="currentColor" d="M17.7 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.7 3Zm-1.1 16.2h1.7L7.5 4.7H5.6l11 14.5Z"/>',
};
const icone = n => IC[n] ? `<svg class="icone" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">${IC[n]}</svg>` : '';

/* ---------- peças do tema ---------- */
const logo = (fundo = 'claro') => { const b = fundo === 'escuro' ? 'logo-branco' : 'logo-escuro'; return `<a href="/" rel="home" class="logo"><img class="logo__img" src="/estatico/img/${b}.webp" srcset="/estatico/img/${b}-420.webp 420w, /estatico/img/${b}-760.webp 760w, /estatico/img/${b}.webp 1131w" sizes="(max-width: 760px) 150px, 420px" width="1131" height="280" alt="${NOME}" decoding="async"></a>`; };
const botaoGoogle = () => `<a class="btn-google" href="https://profile.google.com/@schoje.news" target="_blank" rel="noopener"><span>Siga no</span><img class="btn-google__icone" src="/estatico/img/google-discover.png" width="24" height="24" alt="" loading="lazy"><span>Google Discover</span></a>`;
const redes = () => `<ul class="redes">${Object.entries(REDES).map(([k, u]) => `<li><a href="${u}" target="_blank" rel="noopener" aria-label="${k}">${icone(k)}</a></li>`).join('')}</ul>`;
const topoBarra = h1 => { const tag = h1 ? 'h1' : 'div'; return `<div class="container topo__barra"><div class="topo__esq"><button type="button" class="btn-icone js-abrir-gaveta" aria-controls="gaveta" aria-expanded="false" aria-label="Menu">${icone('menu')}<span>Menu</span></button><button type="button" class="btn-icone btn-notif js-notificacoes" aria-label="Ative nossas notificações">${icone('sino')}<span>Ative nossas notificações</span></button></div><${tag} class="topo__logo">${logo()}</${tag}><div class="topo__dir"><img class="selo" src="/estatico/img/selo-18-anos.webp" width="126" height="120" alt="${NOME} — 18 anos" decoding="async"><button type="button" class="btn-icone js-abrir-busca" aria-controls="busca-tela" aria-expanded="false" aria-label="Busca">${icone('busca')}<span>Busca</span></button></div></div>`; };

(async () => {
  /* ---------- dados ---------- */
  const todas = await get(`${API}/categories?per_page=100&hide_empty=true&_fields=id,name,slug,count,parent`);
  const cats = todas.filter(c => !['uncategorized', 'sem-categoria'].includes(c.slug) && c.count > 0);
  const porId = new Map(cats.map(c => [c.id, c]));
  const topo = cats.filter(c => !c.parent);
  const menuCats = ORDEM_MENU.map(s => cats.find(c => c.slug === s)).filter(Boolean);
  const gavetaCats = [...menuCats, ...topo.filter(c => !menuCats.includes(c)).sort((a, b) => b.count - a.count)];
  const F = 'id,slug,date,modified,link,title,excerpt,content,categories,_links,_embedded';
  const info = p => { const m = p._embedded?.['wp:featuredmedia']?.[0]; const alt = decode(m?.alt_text || '') || txt(p.title?.rendered);
    const cat = (p.categories || []).map(i => porId.get(i)).find(c => c && !c.parent) || (p.categories || []).map(i => porId.get(i)).find(Boolean);
    return { p, slug: p.slug, tit: txt(p.title?.rendered), res: txt(p.excerpt?.rendered), m, alt, cat, data: p.date, cats: p.categories || [], autor: p._embedded?.author?.[0]?.name || 'Redação SC Hoje' }; };
  const L = (await get(`${API}/posts?per_page=60&_embed=wp:featuredmedia,author&_fields=${F}`)).map(info);
  const porCat = new Map();
  const doCat = async c => { if (!porCat.has(c.id)) { let r = []; try { r = (await get(`${API}/posts?categories=${c.id}&per_page=30&_embed=wp:featuredmedia,author&_fields=${F}`)).map(info); } catch (e) { console.error('cat', c.slug, e.message); } porCat.set(c.id, r); } return porCat.get(c.id); };
  for (const c of gavetaCats) await doCat(c);

  /* ---------- helpers de página ---------- */
  const url = x => `/materia/${x.slug}/`;
  const urlCat = c => `/editoria/${c.slug}/`;
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

  const cabeca = (titulo, desc, canon, extra = '') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title><meta name="description" content="${esc(desc)}">${canon ? `<link rel="canonical" href="${esc(canon)}">` : ''}<link rel="icon" href="/estatico/img/sc-favicon-v2.ico"><link rel="apple-touch-icon" href="/estatico/img/sc-icone-180-v2.png"><link rel="preload" href="/estatico/fontes/merriweather-900.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/estatico/fontes/merriweather-400.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/estatico/tema.css">${extra}</head><body>`;
  const cabecalho = home => `<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<header class="topo">${topoBarra(home)}<nav class="container topo__nav" aria-label="Editorias">${menuLi(menuCats)}</nav></header>
<div class="topo-fixo" inert>${topoBarra(false)}</div>
<div class="gaveta" id="gaveta" aria-label="Menu" aria-hidden="true"><div class="gaveta__topo"><button type="button" class="btn-icone js-fechar-gaveta" aria-label="Fechar menu">${icone('fechar')}</button></div><div class="gaveta__logo">${logo()}</div><div class="gaveta__discover">${botaoGoogle()}</div><nav class="gaveta__menu" aria-label="Menu completo">${menuLi(gavetaCats)}</nav>${redes()}</div>
<div class="gaveta-fundo js-fechar-gaveta" hidden></div>
<div class="busca-tela" id="busca-tela" role="dialog" aria-modal="true" aria-label="Buscar no site" hidden><div class="busca-tela__topo"><div class="busca-tela__logo">${logo()}</div><button type="button" class="btn-icone js-fechar-busca" aria-label="Fechar busca">${icone('fechar')}</button></div><form role="search" method="get" class="busca-tela__form" action="https://schoje.news/"><label class="busca-tela__rotulo" for="busca-tela-campo">O que você deseja encontrar?</label><div class="busca-tela__linha"><input type="search" id="busca-tela-campo" name="s" autocomplete="off"><button type="submit">Buscar</button></div></form></div>`;
  const rodape = `<footer class="rodape"><div class="rodape__faixa"><div class="container rodape__faixa-dentro"><p class="rodape__chamada">${icone('whatsapp')}<span>Receba as notícias de <strong>Balneário Camboriú</strong> no seu WhatsApp</span></p><a class="rodape__btn-whats" href="${WHATS}" target="_blank" rel="noopener">Entrar no grupo</a></div></div>
<div class="container rodape__grade"><div class="rodape__marca">${logo('escuro')}<p>Notícias de Balneário Camboriú e região</p>${redes()}${botaoGoogle()}</div>
<nav class="rodape__col" aria-label="Editorias"><h2 class="rodape__titulo">Editorias</h2>${menuLi(menuCats)}</nav>
<div class="rodape__col"><h2 class="rodape__titulo">Fale com a gente</h2><ul class="rodape__contato"><li><span>Redação e anúncios</span><a href="mailto:contato@schoje.news">contato@schoje.news</a></li><li><span>WhatsApp de atendimento</span><a href="https://wa.me/5548992088844" target="_blank" rel="noopener">(48) 99208-8844</a></li></ul></div></div>
<div class="rodape__copy"><div class="container"><p>© ${new Date().getFullYear()} ${NOME}. Todos os direitos reservados. — Versão de teste (mobile first)</p></div></div></footer><script src="/estatico/tema.js" defer></script></body></html>`;
  const pagina = (titulo, desc, canon, home, corpo, extra) => cabeca(titulo, desc, canon, extra) + cabecalho(home) + corpo + rodape;

  /* ---------- HOME ---------- */
  const usados = new Set(); const marca = xs => xs.forEach(x => usados.add(x.slug));
  const capa = L.slice(0, 6); marca(capa);
  const [manchete, lado] = capa; const grade = capa.slice(2);
  const reserva = L.filter(x => !usados.has(x.slug));
  while (grade.length < 12 && reserva.length) { const x = reserva.shift(); grade.push(x); usados.add(x.slug); }
  let h = '<main id="conteudo" class="capa">';
  if (manchete) h += `<section class="container manchete" aria-label="Manchete"><a class="manchete__img" href="${url(manchete)}" tabindex="-1" aria-hidden="true">${imagem(manchete, 'grande', true)}</a><div class="manchete__texto">${chapeu(manchete)}<h2 class="manchete__titulo"><a href="${url(manchete)}">${esc(manchete.tit)}</a></h2>${manchete.res ? `<p class="manchete__fina">${esc(palavras(manchete.res, 30))}</p>` : ''}</div>${lado ? `<div class="manchete__lado">${card(lado, 'vertical')}</div>` : ''}</section>`;
  const lidas = L.filter(x => !capa.includes(x)).slice(0, 5);
  h += `<div class="container capa-grade"><section class="grade-cards" aria-label="Destaques">${grade.map(x => `<div class="grade-item">${card(x, 'lista')}</div>`).join('')}</section><aside class="lateral" aria-label="Coluna lateral">${maisLidas(lidas, false)}</aside></div>`;
  const blocos = [menuCats[0], menuCats[2], menuCats[1], menuCats[4]].filter(Boolean);
  for (const c of blocos) {
    const lista = (await doCat(c)).filter(x => x !== manchete && x !== lado).slice(0, 9); if (lista.length < 4) continue;
    const [pr, ...resto] = lista;
    h += `<section class="container editoria" style="--cor-ed:#0034fc" aria-labelledby="ed-${c.slug}"><header class="editoria__topo"><h2 class="editoria__nome" id="ed-${c.slug}"><a href="${urlCat(c)}">${esc(c.name)}</a></h2><a class="editoria__ver" href="${urlCat(c)}">Ver todas<span class="sr-only"> as notícias de ${esc(c.name)}</span></a></header><div class="bloco bloco--b"><div class="bloco__grade"><div class="bloco__principal">${card(pr, 'bloco')}</div>${resto.map((x, i) => `<div class="bloco__item bloco__item--${i + 1}">${card(x, 'lista')}</div>`).join('')}</div></div></section>`;
  }
  const final = menuCats[0];
  if (final) { const li = (await doCat(final)).slice(0, 10);
    h += `<section class="container lista-final" aria-labelledby="titulo-lista-final"><header class="editoria__topo editoria__topo--linha"><h2 class="editoria__nome" id="titulo-lista-final">Últimas notícias</h2></header><div class="arquivo lista-final__corpo"><div class="arquivo__principal"><div class="arquivo__lista js-lista">${li.map(x => card(x, 'ampla')).join('')}</div><p class="arquivo__mais"><a class="btn btn--mais" href="${urlCat(final)}">Carregar mais notícias</a></p></div><aside class="lateral" aria-label="Coluna lateral"><a class="quadro-whats" href="${WHATS}" target="_blank" rel="noopener">${icone('whatsapp')}<span class="quadro-whats__texto">Receba as notícias de <strong>Balneário Camboriú</strong> no seu WhatsApp</span><span class="quadro-whats__btn">Entrar no grupo</span></a>${botaoGoogle()}</aside></div></section>`; }
  h += '</main>';
  wr('index.html', pagina(`${NOME} — notícias de Balneário Camboriú (teste)`, 'Notícias de Balneário Camboriú', null, true, h));

  /* ---------- MATÉRIAS ---------- */
  for (const x of L) {
    const rel = (x.cat ? (await doCat(x.cat)) : L).filter(y => y.slug !== x.slug).slice(0, 6);
    const migalhas = `<nav class="migalhas" aria-label="Você está em"><a href="/">Página inicial</a>${x.cat ? `<span aria-hidden="true">›</span><a href="${urlCat(x.cat)}">${esc(x.cat.name)}</a>` : ''}</nav>`;
    const leg = txt(x.m?.caption?.rendered || '');
    const corpo = `<main id="conteudo" class="container materia"><article class="materia__artigo"><header class="materia__topo">${migalhas}${x.cat ? `<a class="chapeu" href="${urlCat(x.cat)}">${esc(x.cat.name)}</a>` : ''}<h1 class="materia__titulo">${esc(x.tit)}</h1>${x.res ? `<p class="linha-fina">${esc(x.res)}</p>` : ''}<div class="autor-linha"><span class="autor-linha__foto" aria-hidden="true"><span>${esc(x.autor.charAt(0).toUpperCase())}</span></span><div><p class="autor-linha__nome">Por ${esc(x.autor)}</p><p class="autor-linha__data"><time datetime="${esc(x.data)}">${dataAutor(x.data)}</time></p></div></div>${botaoGoogle()}</header>${x.m ? `<figure class="materia__img">${imagem(x, 'materia', true)}${leg ? `<figcaption>${esc(leg)}</figcaption>` : ''}</figure>` : ''}<div class="materia__texto">${limpa(x.p.content?.rendered)}</div><footer class="materia__fim">${botaoGoogle()}</footer>${rel.length ? `<section class="leia-tambem" aria-labelledby="titulo-mais"><h2 class="bloco-titulo" id="titulo-mais">Mais notícias${x.cat ? ' de ' + esc(x.cat.name) : ''}</h2><div class="leia-tambem__lista">${rel.map(y => card(y, 'lista')).join('')}</div></section>` : ''}</article><aside class="lateral" aria-label="Coluna lateral">${maisLidas(L.filter(y => y.slug !== x.slug).slice(0, 5), true)}</aside></main>`;
    wr(`materia/${x.slug}/index.html`, pagina(`${x.tit} — ${NOME}`, x.res.slice(0, 160), x.p.link, false, corpo, `<meta property="og:title" content="${esc(x.tit)}">${x.m?.source_url ? `<meta property="og:image" content="${esc(x.m.source_url)}">` : ''}`));
  }

  /* ---------- EDITORIAS ---------- */
  for (const c of gavetaCats) {
    const its = await doCat(c); let corpo = `<main id="conteudo" class="arquivo-pagina"><div class="container"><nav class="migalhas arquivo__migalhas" aria-label="Você está em"><a href="/">Página inicial</a><span aria-hidden="true">›</span><a href="${urlCat(c)}">${esc(c.name)}</a></nav><header class="editoria__topo arquivo__topo"><h1 class="editoria__nome">${esc(c.name)}</h1></header></div>`;
    let resto = its; if (its.length >= 4) { const [m, ld] = its; resto = its.slice(2);
      corpo += `<section class="container manchete arquivo__manchete" aria-label="Destaques"><a class="manchete__img" href="${url(m)}" tabindex="-1" aria-hidden="true">${imagem(m, 'grande', true)}</a><div class="manchete__texto">${chapeu(m)}<h2 class="manchete__titulo"><a href="${url(m)}">${esc(m.tit)}</a></h2>${m.res ? `<p class="manchete__fina">${esc(palavras(m.res, 30))}</p>` : ''}</div><div class="manchete__lado">${card(ld, 'vertical')}</div></section>`; }
    corpo += `<div class="container arquivo"><div class="arquivo__principal">${its.length >= 4 ? '<h2 class="bloco-titulo">Últimas notícias</h2>' : ''}<div class="arquivo__lista js-lista">${resto.map(x => card(x, 'ampla', 'h2')).join('') || '<p class="arquivo__vazio">Nenhuma notícia encontrada.</p>'}</div></div><aside class="lateral" aria-label="Coluna lateral">${botaoGoogle()}</aside></div></main>`;
    wr(`editoria/${c.slug}/index.html`, pagina(`${c.name} — ${NOME}`, 'Notícias de ' + c.name, null, false, corpo));
  }

  wr('robots.txt', 'User-agent: *\nDisallow: /\n');
  fs.cpSync(path.join(__dirname, 'estatico'), path.join(OUT, 'estatico'), { recursive: true });
  console.log('ok', L.length, 'matérias,', gavetaCats.length, 'editorias');
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
