'use strict';
// SC Hoje — importador das matérias e fotos do WordPress antigo para o sistema próprio.
// Lê pela API pública do WordPress (a mesma que o site já usa), copia as fotos para a nossa mídia
// e salva cada matéria igual às do editor novo. Pode parar e continuar: o que já veio é pulado.
const fs = require('fs'), path = require('path');

module.exports = function (ctx, api) {
  const { DADOS, ler, gravar, esc, html } = ctx;
  const ACENTOS = 'aacute:á eacute:é iacute:í oacute:ó uacute:ú Aacute:Á Eacute:É Iacute:Í Oacute:Ó Uacute:Ú acirc:â ecirc:ê ocirc:ô Acirc:Â Ecirc:Ê Ocirc:Ô atilde:ã otilde:õ Atilde:Ã Otilde:Õ ccedil:ç Ccedil:Ç agrave:à Agrave:À uuml:ü ordm:º ordf:ª laquo:« raquo:» bull:• deg:°'.split(' ').map(x => x.split(':'));
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ...Object.fromEntries(ACENTOS) };
  const dec = s => String(s || '').replace(/&#8217;/g, '’').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => (ENT[n] ?? ENT[n.toLowerCase()] ?? m));
  const texto = s => dec(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const est = { rodando: false, total: 0, feitos: 0, pulados: 0, erros: 0, fotos: 0, msg: '', ultimo: '' };
  const salvaEst = () => gravar('importacao.json', est);
  Object.assign(est, ler('importacao.json', {}), { rodando: false });
  const base = () => (ler('importacao-config.json', {}).wp || 'https://schoje.news').replace(/\/$/, '');
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  async function pega(url, bin) {
    for (let t = 0; t < 3; t++) {
      try { const ac = new AbortController(), k = setTimeout(() => ac.abort(), 60000); const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; SCHojeImport/1.0)' } }); clearTimeout(k); if (!r.ok) throw new Error('HTTP ' + r.status); return bin ? { buf: Buffer.from(await r.arrayBuffer()), total: +r.headers.get('x-wp-total') || 0, paginas: +r.headers.get('x-wp-totalpages') || 0 } : { json: await r.json(), total: +r.headers.get('x-wp-total') || 0, paginas: +r.headers.get('x-wp-totalpages') || 0 }; }
      catch (e) { if (t === 2) throw e; await dorme(1500 * (t + 1)); }
    }
  }
  const cacheFotos = new Map();
  async function foto(url, ref) {
    if (!url) return null;
    const abs = new URL(url, ref).href; if (cacheFotos.has(abs)) return cacheFotos.get(abs);
    let r = null;
    try { const { buf } = await pega(abs, true); r = await api.guardaFoto(buf, decodeURIComponent(abs.split('/').pop().split('?')[0])); est.fotos++; } catch (e) { r = null; }
    if (cacheFotos.size > 3000) cacheFotos.clear(); cacheFotos.set(abs, r); return r;
  }
  async function conteudo(h, ref) {
    let out = String(h || '');
    const imgs = [...new Set((out.match(/<img\b[^>]*>/gi) || []))];
    for (const tag of imgs) {
      const m = tag.match(/\ssrc=["']([^"']+)["']/i); if (!m) continue;
      const f = await foto(m[1], ref); let nova = tag.replace(/\s(srcset|sizes|data-[\w-]+|loading|decoding|width|height)=("[^"]*"|'[^']*')/gi, '');
      nova = f ? nova.replace(/\ssrc=["'][^"']+["']/i, ` src="${f.url}" width="${f.w}" height="${f.h}" loading="lazy"`) : nova.replace(/\ssrc=["']([^"']+)["']/i, (x, u) => ` src="${new URL(u, ref).href}"`);
      out = out.split(tag).join(nova);
    }
    return api.limpaHtml(out).replace(/<!--[\s\S]*?-->/g, '').replace(/\[\/?caption[^\]]*\]/g, '');
  }
  function catLocal(wpCats) {
    const cats = api.categorias();
    return wpCats;
  }
  async function roda(limite) {
    if (est.rodando) return; Object.assign(est, { rodando: true, total: 0, feitos: 0, pulados: 0, erros: 0, fotos: 0, msg: 'Começando…', ultimo: '' }); salvaEst();
    try {
      const B = base();
      const catsWP = []; for (let p = 1; p < 20; p++) { const r = await pega(`${B}/wp-json/wp/v2/categories?per_page=100&page=${p}`); catsWP.push(...r.json); if (p >= r.paginas) break; }
      let cats = api.categorias(), mudou = false; const mapa = new Map();
      for (const c of catsWP) { let l = cats.find(x => x.slug === c.slug); if (!l) { l = { id: Math.max(100000, ...cats.map(x => x.id)) + 1, name: dec(c.name), slug: c.slug, parent: 0 }; cats.push(l); mudou = true; } mapa.set(c.id, l); }
      if (mudou) gravar('categorias.json', cats);
      const F = 'id,slug,link,date_gmt,modified_gmt,title,excerpt,content,categories,_links,_embedded';
      let pg = 1;
      for (;;) {
        const r = await pega(`${B}/wp-json/wp/v2/posts?per_page=20&page=${pg}&orderby=date&order=desc&_embed=wp:featuredmedia,wp:term,author`);
        est.total = limite ? Math.min(limite, r.total) : r.total; salvaEst();
        for (const p of r.json) {
          if (limite && est.feitos + est.pulados >= limite) break;
          try {
            if (api.lerPost(p.id)) { est.pulados++; continue; }
            est.msg = 'Importando: ' + texto(p.title.rendered).slice(0, 70);
            const emb = p._embedded || {}, m = (emb['wp:featuredmedia'] || [])[0], termos = emb['wp:term'] || [];
            const tags = (termos[1] || []).map(t => dec(t.name)).filter(t => t.toLowerCase() !== 'capa');
            const idsCat = (p.categories || []).filter(id => mapa.has(id)); const cat = mapa.get(idsCat[0]) || cats[0];
            let destaque = { url: '', alt: '', legenda: '', w: 0, h: 0 };
            if (m && m.source_url) { const f = await foto(m.source_url, B); if (f) destaque = { url: f.url, w: f.w, h: f.h, alt: texto(m.alt_text || p.title.rendered).slice(0, 200), legenda: texto(m.caption && m.caption.rendered).slice(0, 300) }; }
            const post = { id: p.id, slug: p.slug, titulo: texto(p.title.rendered).slice(0, 200), fina: '', resumo: texto(p.excerpt && p.excerpt.rendered).slice(0, 400), conteudo: await conteudo(p.content.rendered, B), categoria: cat.slug, autor: texto(((emb.author || [])[0] || {}).name) || 'Redação', tags: tags.slice(0, 15), capa: false, status: 'publicado', data: new Date(p.date_gmt + 'Z').toISOString(), criado: new Date(p.date_gmt + 'Z').toISOString(), modificado: new Date((p.modified_gmt || p.date_gmt) + 'Z').toISOString(), destaque, editor: 'importado', caminho: new URL(p.link).pathname };
            api.salvaPost(post); est.feitos++; est.ultimo = post.titulo;
          } catch (e) { est.erros++; est.ultimo = 'erro: ' + e.message; }
          if ((est.feitos + est.pulados + est.erros) % 10 === 0) salvaEst();
        }
        salvaEst();
        if (pg >= r.paginas || (limite && est.feitos + est.pulados >= limite)) break; pg++;
      }
      est.msg = `Pronto. ${est.feitos} matérias importadas, ${est.pulados} já existiam, ${est.erros} com erro.`;
    } catch (e) { est.msg = 'Parou com erro: ' + e.message + ' (clique em Importar de novo para continuar de onde parou).'; }
    est.rodando = false; salvaEst();
  }
  const form = req => new Promise((ok, no) => { const p = []; req.on('data', d => p.push(d)); req.on('end', () => ok(Object.fromEntries(new URLSearchParams(Buffer.concat(p).toString())))); req.on('error', no); });
  const redir = (res, para) => { res.writeHead(302, { Location: para, 'Cache-Control': 'no-store' }); res.end(); };
  function pagina(usr, msg) {
    const sem = fs.existsSync(path.join(DADOS, 'sem-wordpress')), nLoc = [...api.indice.values()].length, nImp = [...api.indice.values()].filter(x => x.id < 900000).length;
    const corpo = `<h1 class="wp">Importar do WordPress</h1>
<div class="pb"><h2>Situação</h2><div class="in"><p><b>${est.rodando ? 'Importando agora…' : 'Parado'}</b> — ${esc(est.msg || 'Nada importado ainda.')}</p>
<p>Matérias já no sistema novo: <b>${nLoc}</b> (importadas do WordPress: <b>${nImp}</b>)<br>Nesta rodada: ${est.feitos} importadas · ${est.pulados} já existiam · ${est.erros} erros · ${est.fotos} fotos copiadas${est.total ? ' · total no WordPress: ' + est.total : ''}</p>
${est.rodando ? '<p class="cap">Esta página atualiza sozinha a cada 15 segundos.</p><script>setTimeout(function(){location.reload()},15000)</script>' : ''}</div></div>
<div class="pb"><h2>1. Importar</h2><div class="in"><form method="post" action="/redacao/importar/rodar"><label style="margin-top:0">Endereço do WordPress antigo</label><input name="wp" value="${esc(base())}">
<label>Quantas matérias</label><select name="limite"><option value="50">Só as 50 mais recentes (teste)</option><option value="0">Todas</option></select>
<p class="cap">Pode fechar a página: a importação continua no servidor. Se parar, é só clicar de novo: o que já veio é pulado.</p><p><button class="bt pri"${est.rodando ? ' disabled' : ''}>Importar</button></p></form></div></div>
<div class="pb"><h2>2. Parar de ler o WordPress</h2><div class="in"><p>Hoje o site novo ainda lê matérias do WordPress junto com as daqui. Quando a importação terminar, clique abaixo: o site passa a usar só o que está no sistema novo.</p><p class="cap">Situação: <b>${sem ? 'já usa só o sistema novo' : 'ainda lê o WordPress'}</b></p><form method="post" action="/redacao/importar/${sem ? 'religar' : 'desligar'}"><button class="bt"${est.rodando ? ' disabled' : ''}>${sem ? 'Voltar a ler o WordPress' : 'Usar só o sistema novo'}</button></form></div></div>`;
    return api.casca('Importar do WordPress', usr, corpo, msg, 'imp');
  }
  async function tratar(req, res, rota, u, usr) {
    if (req.method === 'GET') return html(res, 200, pagina(usr, ''));
    const f = await form(req);
    if (rota.endsWith('/rodar')) { if (/^https?:\/\//.test(f.wp || '')) gravar('importacao-config.json', { wp: f.wp.trim() }); roda(+f.limite || 0); return redir(res, '/redacao/importar'); }
    if (rota.endsWith('/desligar')) { fs.writeFileSync(path.join(DADOS, 'sem-wordpress'), '1'); return redir(res, '/redacao/importar'); }
    if (rota.endsWith('/religar')) { try { fs.unlinkSync(path.join(DADOS, 'sem-wordpress')); } catch (e) {} return redir(res, '/redacao/importar'); }
    return redir(res, '/redacao/importar');
  }
  return { tratar };
};
