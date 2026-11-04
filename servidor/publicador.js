'use strict';
// SC Hoje — Publicador próprio (sem WordPress).
// Busca notícias (feeds RSS e grupos de WhatsApp pela Evolution API), manda a IA reescrever,
// cria a matéria no editor (rascunho ou publicada) e envia a matéria publicada aos grupos de WhatsApp.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function (ctx, api) {
  const { DADOS, ler, gravar, esc, C, NOME, json, html, SITE_URL, ultimas } = ctx;
  const PASTA_TMP = path.join(DADOS, 'publicador-tmp'); fs.mkdirSync(PASTA_TMP, { recursive: true });

  /* ---------- configuração e chaves ---------- */
  const REGRAS_PADRAO = `Você é redator do portal SC Hoje (Balneário Camboriú, Santa Catarina). Reescreva a notícia com as suas palavras, em português do Brasil, linguagem simples e direta, estilo jornalístico. O primeiro parágrafo traz o fato principal.
- Não invente nada: use só o que está no material. Mantenha corretos nomes, cargos, números, datas, horários e locais.
- Título com no máximo 60 caracteres. Escreva "Balneário Camboriú" por extenso quando couber; use "BC" só se o título passar de 60.
- Nunca use a palavra "sinistro" (diga acidente, colisão, batida, incêndio etc.). Não elogie agentes, órgãos ou autoridades: o fato é a notícia (ex.: "Acidente na avenida"), não "Agentes atendem...".
- Sem emojis, sem hashtags, sem "clique aqui", sem pedir para seguir o portal. Não copie frases inteiras do original.
- Se o material for boletim ou resumo diário, propaganda, convite genérico ou promoção pessoal de político, responda ignorar=true.
- Se for a mesma ocorrência de uma matéria recente da lista (mesmo fato, só atualização do desfecho), responda repetida=true.`;
  const REGRAS_POLITICA = `Você é redator de política do portal SC Hoje. Reescreva a matéria com atribuição: cite o repórter e o veículo que fez a apuração original (não quem apenas repercutiu). Mantenha "segundo fontes" quando o original usar. Não repita a opinião do veículo de origem. No máximo uma citação curta entre aspas. Não invente nada. Título com no máximo 60 caracteres. Sem emojis.`;
  const PADRAO = { ativo: false, modo: 'rascunho', maxDia: 8, intervaloMin: 15, ia: 'gemini', modeloGemini: 'gemini-2.5-flash', modeloOpenai: 'gpt-4o-mini', autor: 'Redação SC Hoje', regras: REGRAS_PADRAO, regrasPolitica: REGRAS_POLITICA, capaAuto: true, fontes: [], wa: { ativo: false, grupos: [], desde: '' } };
  const cfg = () => { const c = Object.assign({}, PADRAO, ler('publicador.json', {})); c.wa = Object.assign({}, PADRAO.wa, c.wa || {}); return c; };
  const salvaCfg = c => gravar('publicador.json', c);
  const segs = () => ler('segredos.json', {});
  const seg = k => segs()[k] || C(k) || '';
  const salvaSeg = o => { const s = Object.assign(segs(), o); const f = path.join(DADOS, 'segredos.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(s), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); };
  if (!segs().WEBHOOK_TOKEN) salvaSeg({ WEBHOOK_TOKEN: crypto.randomBytes(16).toString('hex') });
  const est = () => Object.assign({ vistos: {}, dias: {}, log: [], enviados: {}, buscas: {}, iniciadas: {} }, ler('publicador-estado.json', {}));
  const salvaEst = e => { const lim = Date.now() - 10 * 86400000; for (const k of Object.keys(e.vistos)) if (e.vistos[k] < lim) delete e.vistos[k]; e.log = e.log.slice(0, 80); gravar('publicador-estado.json', e); };
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const registra = (fonte, titulo, resultado, id) => { const e = est(); e.log.unshift({ t: new Date().toISOString(), fonte, titulo: String(titulo || '').slice(0, 120), resultado, id: id || 0 }); salvaEst(e); console.log('publicador:', fonte, '|', resultado, '|', String(titulo || '').slice(0, 60)); };

  /* ---------- rede ---------- */
  async function buscar(url, op = {}, ms = 30000) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, Object.assign({ signal: ac.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; SCHojeBot/1.0; +https://schoje.news)', accept: '*/*' } }, op)); }
    finally { clearTimeout(t); }
  }
  const baixa = async (url, max = 12 * 1024 * 1024) => { const r = await buscar(url, {}, 40000); if (!r.ok) throw new Error('HTTP ' + r.status); const b = Buffer.from(await r.arrayBuffer()); if (b.length > max) throw new Error('arquivo grande'); return b; };

  /* ---------- leitura de feeds e páginas ---------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const dec = s => String(s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
  const semTags = s => dec(String(s || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const tagDe = (x, t) => { const m = x.match(new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>', 'i')); return m ? dec(m[1]) : ''; };
  function itensFeed(xml) {
    const out = [];
    for (const x of xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || []) {
      let link = tagDe(x, 'link').trim(); if (!link) { const m = x.match(/<link[^>]+href=["']([^"']+)["']/i); link = m ? dec(m[1]) : ''; }
      const corpo = tagDe(x, 'content:encoded') || tagDe(x, 'content') || tagDe(x, 'description') || tagDe(x, 'summary');
      let img = ''; let m = x.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) || x.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i) || corpo.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) img = dec(m[1]);
      const d = new Date(tagDe(x, 'pubDate') || tagDe(x, 'published') || tagDe(x, 'updated') || tagDe(x, 'dc:date'));
      out.push({ titulo: semTags(tagDe(x, 'title')), link, texto: semTags(corpo), img, data: isNaN(d) ? null : d });
    }
    return out;
  }
  function paginaParaTexto(h) {
    const og = (h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) || [])[1];
    const titulo = dec((h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    let corpo = (h.match(/<article[\s\S]*?<\/article>/i) || [h])[0].replace(/<(nav|header|footer|aside|form|script|style|noscript)[\s\S]*?<\/\1>/gi, '');
    const ps = (corpo.match(/<(p|h2|h3|li)[\s>][\s\S]*?<\/\1>/gi) || []).map(semTags).filter(t => t.length > 40);
    return { titulo: titulo.trim(), img: og ? dec(og) : '', texto: ps.join('\n') };
  }
  const absUrl = (u, base) => { try { return new URL(u, base).href; } catch (e) { return ''; } };

  /* ---------- IA ---------- */
  async function ia(prompt, imagens) {
    const c = cfg(), imgs = (imagens || []).slice(0, 4);
    let txt;
    if (c.ia === 'openai') {
      const chave = seg('OPENAI_API_KEY'); if (!chave) throw new Error('Falta a chave da OpenAI (aba Chaves).');
      const cont = [{ type: 'text', text: prompt }].concat(imgs.map(b => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b.toString('base64') } })));
      const r = await buscar('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' }, body: JSON.stringify({ model: c.modeloOpenai, temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: cont }] }) }, 120000);
      const j = await r.json(); if (!r.ok) throw new Error('OpenAI: ' + ((j.error && j.error.message) || r.status)); txt = j.choices[0].message.content;
    } else {
      const chave = seg('GEMINI_API_KEY'); if (!chave) throw new Error('Falta a chave do Gemini (aba Chaves).');
      const partes = [{ text: prompt }].concat(imgs.map(b => ({ inline_data: { mime_type: 'image/jpeg', data: b.toString('base64') } })));
      const r = await buscar(`${C('GEMINI_BASE') || 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(c.modeloGemini)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': chave, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: partes }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }) }, 120000);
      const j = await r.json(); if (!r.ok) throw new Error('Gemini: ' + ((j.error && j.error.message) || r.status)); txt = (((j.candidates || [])[0] || {}).content || {}).parts; txt = txt && txt.map(p => p.text || '').join('');
      if (!txt) throw new Error('Gemini não devolveu texto.');
    }
    return JSON.parse(String(txt).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  }

  /* ---------- criar a matéria no editor ---------- */
  async function criaMateria(f, r, fotoBuf, opc) {
    const c = cfg(), cats = api.categorias();
    let cat = f.categoria && f.categoria !== 'auto' && cats.some(x => x.slug === f.categoria) ? f.categoria : (cats.some(x => x.slug === r.categoria) ? r.categoria : 'cotidiano');
    if (!cats.some(x => x.slug === cat)) cat = cats[0].slug;
    let destaque = { url: '', alt: '', legenda: '', w: 0, h: 0 };
    if (fotoBuf) { try { const g = await api.guardaFoto(fotoBuf, r.titulo); destaque = { url: g.url, w: g.w, h: g.h, alt: String(r.titulo).slice(0, 120), legenda: opc.credito || '' }; } catch (e) { console.log('foto inválida:', e.message); } }
    const manual = !!opc.manual, comFoto = !!destaque.url && (destaque.w || 0) >= 1200;
    const status = !manual && c.modo === 'publicar' && comFoto ? 'publicado' : 'rascunho';
    const agora = new Date().toISOString(), id = api.proximoId(), titulo = String(r.titulo).trim().slice(0, 200);
    const par = (Array.isArray(r.paragrafos) ? r.paragrafos : String(r.paragrafos || '').split(/\n+/)).map(s => String(s).trim()).filter(Boolean);
    if (!par.length) throw new Error('A IA não devolveu o texto da matéria.');
    const rodape = opc.fonteNome ? `<p>Com informações de ${esc(opc.fonteNome)}.</p>` : '';
    const p = { id, slug: api.slugLivre(api.slugar(titulo), id), titulo, fina: String(r.fina || '').trim().slice(0, 400), resumo: String(r.resumo || '').trim().slice(0, 400), conteudo: par.map(s => `<p>${esc(s)}</p>`).join('\n') + rodape, categoria: cat, autor: c.autor, tags: [...new Set((r.tags || []).map(t => String(t).trim().replace(/^#/, '').slice(0, 40)).filter(Boolean))].slice(0, 8), capa: !!(c.capaAuto && status === 'publicado' && cat !== 'politica' && +r.nota >= 8), status, data: status === 'publicado' ? agora : '', criado: agora, modificado: agora, destaque, editor: 'publicador', origem: opc.link || '' };
    api.salvaPost(p); return p;
  }

  /* ---------- processar um material (uma notícia) ---------- */
  async function processa(f, mat, opc = {}) {
    const c = cfg(), e = est();
    if (!opc.manual && (e.dias[hoje()] || 0) >= c.maxDia) { registra(f.nome, mat.titulo, 'limite do dia atingido'); return null; }
    const recentes = e.log.filter(l => l.id && Date.now() - new Date(l.t) < 36 * 3600000).slice(0, 40).map(l => '- ' + l.titulo).join('\n') || '(nenhuma)';
    const cats = api.categorias().map(x => x.slug).join(', ');
    const regras = opc.politica ? c.regrasPolitica : c.regras;
    const prompt = `${regras}\n${f.extra ? '\nInstrução extra para esta fonte:\n' + f.extra + '\n' : ''}\nMatérias recentes já publicadas (para detectar repetição):\n${recentes}\n\nMATERIAL ORIGINAL (fonte: ${f.nome}${mat.link ? ', ' + mat.link : ''}):\nTítulo: ${mat.titulo || '(sem título)'}\n${String(mat.texto || '').slice(0, 9000)}\n${mat.imagens && mat.imagens.length ? `\nAnexei ${mat.imagens.length} foto(s), numeradas de 0 a ${mat.imagens.length - 1} na ordem. Escolha em "foto" o número da melhor foto para ilustrar a matéria (a que mostra a cena, sem texto escrito, cartaz, mapa, card ou logomarca). Se todas tiverem texto ou forem cartazes/mapas/cards, use -1.\n` : ''}\nResponda SOMENTE um JSON com estes campos: {"ignorar":false,"repetida":false,"titulo":"até 60 caracteres","fina":"subtítulo com uma frase","resumo":"2 frases para o Google e redes sociais","paragrafos":["parágrafo 1","parágrafo 2"],"tags":["até 6 palavras-chave"],"categoria":"uma destas: ${cats}","nota":0 a 10 (importância para os moradores de Balneário Camboriú),"foto":-1}`;
    const r = await ia(prompt, mat.imagens);
    if (r.ignorar) { registra(f.nome, mat.titulo, 'ignorada pela IA (boletim/propaganda)'); return null; }
    if (r.repetida && !opc.manual) { registra(f.nome, r.titulo || mat.titulo, 'ignorada: repete matéria recente'); return null; }
    let foto = null;
    if (mat.imagens && mat.imagens.length) { const i = Number.isInteger(+r.foto) ? +r.foto : 0; foto = i >= 0 && mat.imagens[i] ? mat.imagens[i] : (r.foto === undefined ? mat.imagens[0] : null); }
    if (!foto && mat.fotoUnica) foto = mat.fotoUnica;
    const p = await criaMateria(f, r, foto, { manual: opc.manual, fonteNome: f.nome, link: mat.link, credito: f.credito || '' });
    const e2 = est(); e2.dias[hoje()] = (e2.dias[hoje()] || 0) + 1; salvaEst(e2);
    registra(f.nome, p.titulo, p.status === 'publicado' ? 'publicada' : (foto ? 'rascunho criado' : 'rascunho criado (sem foto)'), p.id);
    return p;
  }

  /* ---------- fonte RSS ---------- */
  async function imagemDe(urls) {
    for (const u of urls.filter(Boolean)) { try { const b = await baixa(u); const sh = api.dimensoes(b); if (sh && sh.w >= 500) return b; } catch (e) {} }
    return null;
  }
  async function materialDoLink(link, itemFeed) {
    let pg = { titulo: '', img: '', texto: '' };
    try { const r = await buscar(link, {}, 30000); if (r.ok) pg = paginaParaTexto(await r.text()); } catch (e) {}
    const texto = pg.texto.length > ((itemFeed && itemFeed.texto) || '').length ? pg.texto : (itemFeed && itemFeed.texto) || pg.texto;
    const fotoUnica = await imagemDe([pg.img && absUrl(pg.img, link), itemFeed && itemFeed.img && absUrl(itemFeed.img, link)]);
    return { titulo: (itemFeed && itemFeed.titulo) || pg.titulo, texto, link, fotoUnica };
  }
  async function rodaFeed(f) {
    const r = await buscar(f.url, {}, 30000); if (!r.ok) throw new Error('feed respondeu ' + r.status);
    const itens = itensFeed(await r.text()).filter(i => i.link).sort((a, b) => (b.data || 0) - (a.data || 0));
    const primeira = !est().iniciadas[f.id]; let feitos = 0;
    for (const it of itens) {
      const k = 'u:' + it.link.replace(/[?#].*$/, '').replace(/\/$/, ''), e = est();
      if (e.vistos[k]) continue;
      if ((e.dias[hoje()] || 0) >= cfg().maxDia) { registra(f.nome, '', 'limite do dia atingido; o resto fica para amanhã'); break; }
      e.vistos[k] = Date.now(); salvaEst(e);
      const idade = it.data ? Date.now() - it.data : 0;
      if (idade > 48 * 3600000 || (primeira && feitos >= 2) || feitos >= 5) continue;
      try { await processa(f, await materialDoLink(it.link, it)); } catch (er) { registra(f.nome, it.titulo, 'erro: ' + er.message); }
      feitos++;
    }
    const e = est(); e.iniciadas[f.id] = 1; e.buscas[f.id] = Date.now(); salvaEst(e);
    return feitos;
  }

  /* ---------- WhatsApp: entrada (webhook da Evolution) ---------- */
  const filaWa = () => ler('publicador-fila-wa.json', []);
  const salvaFila = f => gravar('publicador-fila-wa.json', f);
  const evo = async (rota, op) => {
    const url = seg('EVOLUTION_URL').replace(/\/$/, ''), inst = seg('EVOLUTION_INSTANCE'), chave = seg('EVOLUTION_KEY');
    if (!url || !inst || !chave) throw new Error('Faltam os dados da Evolution (aba Chaves).');
    const r = await buscar(`${url}${rota.replace('{i}', encodeURIComponent(inst))}`, Object.assign({ headers: { apikey: chave, 'content-type': 'application/json' } }, op), 45000);
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    if (!r.ok) throw new Error('Evolution respondeu ' + r.status + ': ' + String(t).slice(0, 160));
    return j;
  };
  const lerCorpo = (req, max) => new Promise((ok, no) => { const p = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { req.destroy(); no(new Error('grande')); } else p.push(d); }); req.on('end', () => ok(Buffer.concat(p).toString())); req.on('error', no); });
  async function webhook(req, res, rota) {
    const tk = rota.split('/').pop();
    if (tk !== seg('WEBHOOK_TOKEN')) return json(res, 403, { ok: false });
    let d; try { d = JSON.parse(await lerCorpo(req, 25 * 1024 * 1024)); } catch (e) { return json(res, 400, { ok: false }); }
    json(res, 200, { ok: true });
    try {
      const dado = Array.isArray(d.data) ? d.data[0] : d.data; if (!dado || !dado.key || dado.key.fromMe) return;
      const jid = dado.key.remoteJid || ''; if (!jid.endsWith('@g.us')) return;
      const c = cfg(); const f = c.fontes.find(x => x.ativo && x.tipo === 'whatsapp' && x.url === jid); if (!f) return;
      const m = dado.message || {}, texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption) || (m.videoMessage && m.videoMessage.caption) || '';
      let arq = '';
      if (m.imageMessage) {
        let b64 = m.base64 || dado.base64;
        if (!b64) { try { const j = await evo('/chat/getBase64FromMediaMessage/{i}', { method: 'POST', body: JSON.stringify({ message: { key: dado.key }, convertToMp4: false }) }); b64 = j && j.base64; } catch (er) { console.log('publicador: foto do WhatsApp falhou:', er.message); } }
        if (b64) { arq = crypto.randomBytes(6).toString('hex') + '.bin'; fs.writeFileSync(path.join(PASTA_TMP, arq), Buffer.from(String(b64).replace(/^data:[^,]+,/, ''), 'base64')); }
      }
      if (!texto && !arq) return;
      const fila = filaWa(); fila.push({ jid, id: dado.key.id, t: Date.now(), texto: String(texto).slice(0, 6000), arq }); salvaFila(fila);
    } catch (e) { console.log('webhook erro:', e.message); }
  }
  async function processaFilaWa() {
    const c = cfg(); if (!c.ativo) return;
    let fila = filaWa(); if (!fila.length) return;
    const agora = Date.now(), porGrupo = {};
    for (const m of fila) (porGrupo[m.jid] = porGrupo[m.jid] || []).push(m);
    const prontos = [];
    for (const [jid, ms] of Object.entries(porGrupo)) {
      ms.sort((a, b) => a.t - b.t); let atual = [];
      const fecha = () => { if (atual.length && agora - atual[atual.length - 1].t > 3 * 60000) prontos.push({ jid, ms: atual }); atual = []; };
      for (const m of ms) { if (atual.length && m.t - atual[atual.length - 1].t > 4 * 60000) fecha(); atual.push(m); }
      fecha();
    }
    if (!prontos.length) return;
    const usados = new Set(prontos.flatMap(p => p.ms.map(m => m.id)));
    salvaFila(fila.filter(m => !usados.has(m.id)));
    for (const g of prontos) {
      const f = c.fontes.find(x => x.tipo === 'whatsapp' && x.url === g.jid); if (!f) continue;
      const imagens = []; for (const m of g.ms) if (m.arq) { try { imagens.push(fs.readFileSync(path.join(PASTA_TMP, m.arq))); } catch (e) {} }
      const texto = g.ms.map(m => m.texto).filter(Boolean).join('\n');
      try { if (texto.length < 25 && !imagens.length) continue; await processa(f, { titulo: texto.split('\n')[0].slice(0, 100), texto, imagens }); }
      catch (er) { registra(f.nome, texto.slice(0, 80), 'erro: ' + er.message); }
      for (const m of g.ms) if (m.arq) try { fs.unlinkSync(path.join(PASTA_TMP, m.arq)); } catch (e) {}
    }
  }

  /* ---------- WhatsApp: saída (envio das matérias publicadas) ---------- */
  let enviando = false;
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  function textoWa(p, url) {
    return `*${p.titulo}*\n\n${p.resumo || p.fina || ''}\n\n👉 *LEIA NO SC HOJE*\n${url}\n\n> publicada primeiro no portal SC Hoje`.replace(/\n\n\n+/g, '\n\n');
  }
  async function enviaPost(p, url) {
    const c = cfg(); let ok = 0, falha = 0;
    for (const g of c.wa.grupos) {
      try { await evo('/message/sendText/{i}', { method: 'POST', body: JSON.stringify({ number: g, text: textoWa(p, url), linkPreview: true, delay: 1500 }) }); ok++; } catch (e) { falha++; console.log('whatsapp erro:', e.message); }
      await dorme(8000 + Math.random() * 12000);
    }
    return { ok, falha };
  }
  const urlDoPost = slug => { const u = (ultimas() || []).find(x => x.slug === slug); return u ? (/^https?:/.test(u.url) ? u.url : SITE_URL + u.url) : ''; };
  async function enviosWhatsApp() {
    const c = cfg(); if (!c.wa.ativo || !c.wa.grupos.length || enviando) return;
    if (!c.wa.desde) { c.wa.desde = new Date().toISOString(); salvaCfg(c); }
    enviando = true;
    try {
      const e = est(), agora = Date.now(), desde = c.wa.desde ? new Date(c.wa.desde).getTime() : agora;
      for (const r of [...api.indice.values()].filter(x => x.status === 'publicado' && x.data && !e.enviados[x.id])) {
        const t = new Date(r.data).getTime(); if (t > agora) continue;
        if (t < desde || agora - t > 6 * 3600000) { e.enviados[r.id] = -1; continue; }
        const url = urlDoPost(r.slug); if (!url) continue;
        const p = api.lerPost(r.id); if (!p) continue;
        e.enviados[r.id] = agora; salvaEst(e);
        const res = await enviaPost(p, url); registra('WhatsApp', p.titulo, `enviada a ${res.ok} grupo(s)${res.falha ? ', ' + res.falha + ' falha(s)' : ''}`);
      }
      salvaEst(Object.assign(est(), { enviados: e.enviados }));
    } finally { enviando = false; }
  }

  /* ---------- ciclo (chamado a cada minuto pelo servidor) ---------- */
  let rodando = false;
  async function tick() {
    if (rodando) return; rodando = true;
    try {
      const c = cfg();
      if (c.ativo) {
        await processaFilaWa();
        for (const f of c.fontes.filter(x => x.ativo && x.tipo === 'rss')) {
          if (Date.now() - (est().buscas[f.id] || 0) < c.intervaloMin * 60000) continue;
          try { await rodaFeed(f); } catch (er) { registra(f.nome, '', 'erro no feed: ' + er.message); const e = est(); e.buscas[f.id] = Date.now(); salvaEst(e); }
        }
      }
      await enviosWhatsApp();
    } catch (er) { console.log('publicador erro:', er.message); } finally { rodando = false; }
  }

  /* ---------- painel ---------- */
  const campo = (n, v, ph, tipo) => `<input name="${n}" type="${tipo || 'text'}" value="${esc(v || '')}" ${ph ? `placeholder="${esc(ph)}"` : ''} ${tipo === 'password' ? 'autocomplete="new-password"' : ''}>`;
  const form = async req => Object.fromEntries(new URLSearchParams(await lerCorpo(req, 200000)));
  function pagina(usr, msg) {
    const c = cfg(), e = est(), cats = api.categorias(), tk = seg('WEBHOOK_TOKEN');
    const tem = k => seg(k) ? '✔ salva (deixe em branco para manter)' : 'ainda não salva';
    const optCat = (sel) => `<option value="auto"${sel === 'auto' ? ' selected' : ''}>A IA escolhe</option>` + cats.map(x => `<option value="${esc(x.slug)}"${sel === x.slug ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const fontes = c.fontes.map(f => `<tr><td><b>${esc(f.nome)}</b><br><span class="cap">${f.tipo === 'rss' ? 'Feed' : 'Grupo de WhatsApp'}</span></td><td style="word-break:break-all">${esc(f.url)}${f.extra ? `<br><span class="cap">Instrução: ${esc(f.extra.slice(0, 90))}</span>` : ''}</td><td>${esc((cats.find(x => x.slug === f.categoria) || { name: 'A IA escolhe' }).name)}</td><td>${f.ativo ? 'Ligada' : 'Desligada'}</td><td style="white-space:nowrap">${f.tipo === 'rss' ? `<form method="post" action="/redacao/publicador/buscar" style="display:inline"><input type="hidden" name="id" value="${esc(f.id)}"><button class="bt peq">Buscar agora</button></form> ` : ''}<form method="post" action="/redacao/publicador/fonte-liga" style="display:inline"><input type="hidden" name="id" value="${esc(f.id)}"><button class="bt peq">${f.ativo ? 'Desligar' : 'Ligar'}</button></form> <form method="post" action="/redacao/publicador/fonte-apaga" style="display:inline" onsubmit="return confirm('Apagar esta fonte?')"><input type="hidden" name="id" value="${esc(f.id)}"><button class="bt peq">Apagar</button></form></td></tr>`).join('') || '<tr><td colspan="5">Nenhuma fonte ainda. Adicione abaixo.</td></tr>';
    const log = e.log.slice(0, 30).map(l => `<tr><td style="white-space:nowrap">${esc(new Date(l.t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td><td>${esc(l.fonte)}</td><td>${l.id ? `<a href="/redacao/editar/${l.id}">${esc(l.titulo)}</a>` : esc(l.titulo)}</td><td>${esc(l.resultado)}</td></tr>`).join('') || '<tr><td colspan="4">Nada ainda.</td></tr>';
    const corpo = `<h1 class="wp">Publicador</h1>
<p class="sub-l">Hoje: <b>${e.dias[hoje()] || 0}</b> de ${c.maxDia} matérias criadas · Fila do WhatsApp: ${filaWa().length}</p>
<div class="pb"><h2>1. Ligar e escolher como publica</h2><div class="in"><form method="post" action="/redacao/publicador/config">
<label style="margin-top:0"><input type="checkbox" name="ativo" style="width:auto" ${c.ativo ? 'checked' : ''}> Publicador ligado (busca as fontes sozinho)</label>
<label>O que fazer com a matéria pronta</label><select name="modo"><option value="rascunho"${c.modo === 'rascunho' ? ' selected' : ''}>Salvar como rascunho (eu confiro e publico)</option><option value="publicar"${c.modo === 'publicar' ? ' selected' : ''}>Publicar sozinho (só se tiver foto boa)</option></select>
<label>Máximo de matérias por dia</label>${campo('maxDia', c.maxDia, '', 'number')}
<label>Buscar os feeds a cada (minutos)</label>${campo('intervaloMin', c.intervaloMin, '', 'number')}
<label>Nome do autor nas matérias</label>${campo('autor', c.autor)}
<label><input type="checkbox" name="capaAuto" style="width:auto" ${c.capaAuto ? 'checked' : ''}> Colocar nos destaques da capa as matérias que a IA avaliar com nota 8 ou mais (Política nunca vai sozinha)</label>
<label>Qual IA usar</label><select name="ia"><option value="gemini"${c.ia === 'gemini' ? ' selected' : ''}>Gemini (Google)</option><option value="openai"${c.ia === 'openai' ? ' selected' : ''}>OpenAI (GPT)</option></select>
<label>Modelo do Gemini</label>${campo('modeloGemini', c.modeloGemini)}<label>Modelo da OpenAI</label>${campo('modeloOpenai', c.modeloOpenai)}
<label>Regras da redação (a IA segue isto em todas as matérias)</label><textarea name="regras" rows="11">${esc(c.regras)}</textarea>
<label>Regras da "Política na hora"</label><textarea name="regrasPolitica" rows="4">${esc(c.regrasPolitica)}</textarea>
<p><button class="bt pri">Salvar</button></p></form></div></div>
<div class="pb"><h2>2. Chaves (ficam só no servidor)</h2><div class="in"><form method="post" action="/redacao/publicador/chaves" autocomplete="off">
<label style="margin-top:0">Chave do Gemini — ${tem('GEMINI_API_KEY')}</label>${campo('GEMINI_API_KEY', '', 'cole aqui só se quiser trocar', 'password')}
<label>Chave da OpenAI — ${tem('OPENAI_API_KEY')}</label>${campo('OPENAI_API_KEY', '', 'cole aqui só se quiser trocar', 'password')}
<label>Endereço da Evolution (ex.: https://evolution.seusite.com) — ${seg('EVOLUTION_URL') ? 'salvo: ' + esc(seg('EVOLUTION_URL')) : 'ainda não salvo'}</label>${campo('EVOLUTION_URL', '', 'https://...')}
<label>Nome da instância na Evolution — ${seg('EVOLUTION_INSTANCE') ? 'salvo: ' + esc(seg('EVOLUTION_INSTANCE')) : 'ainda não salvo'}</label>${campo('EVOLUTION_INSTANCE', '')}
<label>Chave (apikey) da Evolution — ${tem('EVOLUTION_KEY')}</label>${campo('EVOLUTION_KEY', '', 'cole aqui só se quiser trocar', 'password')}
<p class="cap">Endereço que a Evolution deve chamar (webhook, evento MESSAGES_UPSERT):<br><b style="word-break:break-all">${esc(SITE_URL)}/api/publicador/whatsapp/${esc(tk)}</b></p>
<p><button class="bt pri">Salvar chaves</button></p></form></div></div>
<div class="pb"><h2>3. Fontes de notícia</h2><div class="in"><table class="w"><tr><th>Nome</th><th>Endereço / grupo</th><th>Editoria</th><th>Situação</th><th></th></tr>${fontes}</table>
<h3 style="margin:18px 0 0">Adicionar fonte</h3><form method="post" action="/redacao/publicador/fonte-nova">
<label>Nome (aparece em "Com informações de ...")</label>${campo('nome', '', 'Prefeitura de Balneário Camboriú')}
<label>Tipo</label><select name="tipo"><option value="rss">Feed (RSS)</option><option value="whatsapp">Grupo de WhatsApp</option></select>
<label>Endereço do feed (ou, se for WhatsApp, o código do grupo terminado em @g.us)</label>${campo('url', '', 'https://...')}
<label>Editoria</label><select name="categoria">${optCat('auto')}</select>
<label>Instrução extra só para esta fonte (opcional)</label><textarea name="extra" rows="3" placeholder="Ex.: ignore cartazes e mapas; nunca misture ocorrências diferentes."></textarea>
<label>Crédito da foto (opcional)</label>${campo('credito', '', 'Foto: Divulgação/Prefeitura de BC')}
<p><button class="bt pri">Adicionar fonte</button></p></form></div></div>
<div class="pb"><h2>4. Matéria na hora</h2><div class="in"><form method="post" action="/redacao/publicador/hora"><p class="cap" style="margin-top:0">Cole o endereço de UMA matéria. A IA reescreve e salva como rascunho para você conferir.</p>
<label>Endereço da matéria</label>${campo('link', '', 'https://...')}
<label>Editoria</label><select name="categoria">${optCat('politica')}</select>
<label>Tipo</label><select name="tipo"><option value="comum">Notícia comum</option><option value="politica">Política (com atribuição ao veículo de origem)</option></select>
<p><button class="bt pri">Gerar rascunho</button></p></form></div></div>
<div class="pb"><h2>5. Enviar as matérias ao WhatsApp</h2><div class="in"><form method="post" action="/redacao/publicador/wa-config">
<label style="margin-top:0"><input type="checkbox" name="ativo" style="width:auto" ${c.wa.ativo ? 'checked' : ''}> Enviar sozinho cada matéria publicada para os grupos abaixo</label>
<label>Grupos que recebem (um código por linha)</label><textarea name="grupos" rows="6">${esc(c.wa.grupos.join('\n'))}</textarea>
<p class="cap">Só são enviadas as matérias publicadas depois que você ligar. Entre um grupo e outro o sistema espera alguns segundos, para o WhatsApp não bloquear o número.</p>
<p><button class="bt pri">Salvar</button></p></form>
<form method="post" action="/redacao/publicador/wa-grupos"><p><button class="bt">Listar os grupos do meu WhatsApp</button></p></form>${GRUPOS_CACHE.length ? `<table class="w"><tr><th>Grupo</th><th></th></tr>${GRUPOS_CACHE.map(g => `<tr><td><b>${esc(g.subject || g.id)}</b><br><span class="cap">${esc(g.id)}</span></td><td style="white-space:nowrap"><form method="post" action="/redacao/publicador/wa-usar" style="display:inline"><input type="hidden" name="id" value="${esc(g.id)}"><input type="hidden" name="nome" value="${esc(g.subject || '')}"><button class="bt peq" name="como" value="fonte">Usar como fonte</button> <button class="bt peq" name="como" value="destino">Enviar matérias para este grupo</button></form></td></tr>`).join('')}</table>` : ''}</div></div>
<div class="pb"><h2>6. O que o Publicador fez</h2><div class="in"><table class="w"><tr><th>Quando</th><th>Fonte</th><th>Matéria</th><th>Resultado</th></tr>${log}</table></div></div>`;
    return api.casca('Publicador', usr, corpo, msg, 'pub');
  }
  let GRUPOS_CACHE = [];

  async function tratar(req, res, rota, u, usr) {
    const resp = msg => html(res, 200, pagina(usr, msg));
    if (rota === '/redacao/publicador' && req.method === 'GET') return resp('');
    if (req.method !== 'POST') return resp('');
    const f = await form(req), c = cfg();
    try {
      if (rota.endsWith('/config')) {
        Object.assign(c, { ativo: !!f.ativo, modo: f.modo === 'publicar' ? 'publicar' : 'rascunho', maxDia: Math.max(1, Math.min(50, +f.maxDia || 8)), intervaloMin: Math.max(5, Math.min(240, +f.intervaloMin || 15)), autor: String(f.autor || 'Redação SC Hoje').slice(0, 80), capaAuto: !!f.capaAuto, ia: f.ia === 'openai' ? 'openai' : 'gemini', modeloGemini: String(f.modeloGemini || PADRAO.modeloGemini).trim(), modeloOpenai: String(f.modeloOpenai || PADRAO.modeloOpenai).trim(), regras: String(f.regras || REGRAS_PADRAO).slice(0, 8000), regrasPolitica: String(f.regrasPolitica || REGRAS_POLITICA).slice(0, 4000) });
        salvaCfg(c); return resp('Salvo.');
      }
      if (rota.endsWith('/chaves')) { const o = {}; for (const k of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'EVOLUTION_URL', 'EVOLUTION_INSTANCE', 'EVOLUTION_KEY']) if (String(f[k] || '').trim()) o[k] = String(f[k]).trim(); salvaSeg(o); return resp('Chaves salvas.'); }
      if (rota.endsWith('/fonte-nova')) {
        const url = String(f.url || '').trim(); if (!f.nome || !url) return resp('Erro: preencha o nome e o endereço.');
        if (f.tipo === 'whatsapp' ? !url.endsWith('@g.us') : !/^https?:\/\//.test(url)) return resp('Erro: endereço inválido.');
        c.fontes.push({ id: crypto.randomBytes(4).toString('hex'), nome: String(f.nome).trim().slice(0, 80), tipo: f.tipo === 'whatsapp' ? 'whatsapp' : 'rss', url, categoria: f.categoria || 'auto', extra: String(f.extra || '').slice(0, 1500), credito: String(f.credito || '').slice(0, 120), ativo: true });
        salvaCfg(c); return resp('Fonte adicionada.');
      }
      if (rota.endsWith('/fonte-liga')) { const x = c.fontes.find(y => y.id === f.id); if (x) x.ativo = !x.ativo; salvaCfg(c); return resp('Pronto.'); }
      if (rota.endsWith('/fonte-apaga')) { c.fontes = c.fontes.filter(y => y.id !== f.id); salvaCfg(c); return resp('Fonte apagada.'); }
      if (rota.endsWith('/buscar')) {
        const x = c.fontes.find(y => y.id === f.id); if (!x) return resp('Erro: fonte não encontrada.');
        rodaFeed(x).then(n => registra(x.nome, '', `busca manual: ${n} matéria(s)`)).catch(er => registra(x.nome, '', 'erro: ' + er.message));
        return resp('Buscando agora. Espere 1 ou 2 minutos e atualize a página para ver o resultado na lista de baixo.');
      }
      if (rota.endsWith('/hora')) {
        const link = String(f.link || '').trim(); if (!/^https?:\/\//.test(link)) return resp('Erro: cole o endereço completo da matéria.');
        const fonte = { id: 'hora', nome: '', tipo: 'rss', categoria: f.categoria || 'auto', extra: '' };
        (async () => { try { const mat = await materialDoLink(link, null); try { fonte.nome = new URL(link).hostname.replace(/^www\./, ''); } catch (e) {} const p = await processa(fonte, mat, { manual: true, politica: f.tipo === 'politica' }); if (!p) registra('Matéria na hora', link, 'a IA não gerou matéria'); } catch (er) { registra('Matéria na hora', link, 'erro: ' + er.message); } })();
        return resp('Gerando o rascunho. Espere 1 minuto e atualize: ele aparece na lista de baixo com um link para abrir no editor.');
      }
      if (rota.endsWith('/wa-config')) {
        const novo = String(f.grupos || '').split(/[\s,]+/).map(s => s.trim()).filter(s => s.endsWith('@g.us'));
        if (f.ativo && !c.wa.ativo) c.wa.desde = new Date().toISOString();
        c.wa.ativo = !!f.ativo; c.wa.grupos = [...new Set(novo)]; salvaCfg(c); return resp('Salvo. ' + (c.wa.ativo ? `Enviando para ${c.wa.grupos.length} grupo(s) as matérias publicadas a partir de agora.` : 'Envio desligado.'));
      }
      if (rota.endsWith('/wa-grupos')) {
        const j = await evo('/group/fetchAllGroups/{i}?getParticipants=false', { method: 'GET' });
        GRUPOS_CACHE = (Array.isArray(j) ? j : []).filter(g => g && g.id).map(g => ({ id: g.id, subject: g.subject })).sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
        return resp(GRUPOS_CACHE.length + ' grupo(s) encontrados.');
      }
      if (rota.endsWith('/wa-usar')) {
        if (f.como === 'destino') { c.wa.grupos = [...new Set([...c.wa.grupos, f.id])]; salvaCfg(c); return resp('Grupo adicionado à lista de envio (lá em cima, na seção 5, confira e ligue o envio).'); }
        if (!c.fontes.some(x => x.tipo === 'whatsapp' && x.url === f.id)) c.fontes.push({ id: crypto.randomBytes(4).toString('hex'), nome: String(f.nome || 'Grupo de WhatsApp').slice(0, 80), tipo: 'whatsapp', url: f.id, categoria: 'auto', extra: '', credito: '', ativo: true });
        salvaCfg(c); return resp('Grupo adicionado como fonte (seção 3). Lembre de configurar na Evolution o endereço do webhook mostrado na seção 2.');
      }
    } catch (er) { return resp('Erro: ' + er.message); }
    return resp('');
  }

  return { tratar, webhook, tick };
};
