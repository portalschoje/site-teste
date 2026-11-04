'use strict';
// SC Hoje — redação própria (editor de matérias, fotos, editorias e usuários). Sem WordPress.
// Tudo fica em arquivos na pasta "dados": posts/ (uma matéria por arquivo), midia/ (fotos), categorias.json, usuarios.json.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function (ctx) {
  const { DADOS, ler, gravar, esc, C, NOME, json, html } = ctx;
  const PASTA_POSTS = path.join(DADOS, 'posts'), PASTA_MIDIA = path.join(DADOS, 'midia');
  fs.mkdirSync(PASTA_POSTS, { recursive: true }); fs.mkdirSync(PASTA_MIDIA, { recursive: true });
  let sharp = null; try { sharp = require('sharp'); } catch (e) {}

  /* ---------- categorias ---------- */
  const CATS_PADRAO = [['Balneário Camboriú', 'balneario-camboriu'], ['Política', 'politica'], ['Polícia', 'policia'], ['Santa Catarina', 'santa-catarina'], ['Cotidiano', 'cotidiano']];
  const categorias = () => { let c = ler('categorias.json', null); if (!c) { c = CATS_PADRAO.map(([name, slug], i) => ({ id: 100001 + i, name, slug, parent: 0 })); gravar('categorias.json', c); } return c; };
  const slugar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'materia';

  /* ---------- usuários e sessões ---------- */
  const hash = (senha, sal) => crypto.scryptSync(String(senha), sal, 32).toString('hex');
  function usuarios() {
    let u = ler('usuarios.json', null);
    if (!u) { const sal = crypto.randomBytes(8).toString('hex'); u = [{ id: 1, nome: 'Administrador', usuario: 'admin', sal, hash: hash(C('ADMIN_SENHA') || crypto.randomBytes(8).toString('hex'), sal), papel: 'admin' }]; gravar('usuarios.json', u); }
    return u;
  }
  const sessoes = () => { const s = ler('sessoes.json', {}), agora = Date.now(); for (const k of Object.keys(s)) if (s[k].exp < agora) delete s[k]; return s; };
  const cookie = req => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).map(p => p.split('=')).filter(p => p[0]).map(p => [p[0], decodeURIComponent(p.slice(1).join('='))]));
  function logado(req) { const t = cookie(req).sc_red; if (!t) return null; const s = sessoes()[t]; if (!s) return null; return usuarios().find(u => u.id === s.uid) || null; }
  const tentativas = new Map();

  /* ---------- matérias ---------- */
  let indice = new Map();
  const resumo = p => ({ capa: !!p.capa, id: p.id, slug: p.slug, titulo: p.titulo, categoria: p.categoria, autor: p.autor, status: p.status, data: p.data, modificado: p.modificado });
  function carregaIndice() { indice = new Map(); for (const f of fs.readdirSync(PASTA_POSTS)) { if (!f.endsWith('.json')) continue; try { const p = JSON.parse(fs.readFileSync(path.join(PASTA_POSTS, f), 'utf8')); indice.set(p.id, resumo(p)); } catch (e) {} } }
  carregaIndice();
  const lerPost = id => { try { return JSON.parse(fs.readFileSync(path.join(PASTA_POSTS, +id + '.json'), 'utf8')); } catch (e) { return null; } };
  const salvaPost = p => { const f = path.join(PASTA_POSTS, p.id + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(p)); fs.renameSync(f + '.tmp', f); indice.set(p.id, resumo(p)); };
  const proximoId = () => Math.max(900000, ...indice.keys()) + 1;
  const RESERVADOS = new Set(['admin','redacao','api','midia','tag','category','tempo','grupo','sw','feed','wp-admin','wp-json','wp-content','page','author','search','busca','quem-somos','expediente','fale-conosco','anuncie','politica-editorial','politica-de-correcoes','politica-de-privacidade','politica-de-cookies','termos-de-uso']);
  function slugLivre(base, id) { let s = base, n = 2; if (RESERVADOS.has(s)) s = base = base + '-materia'; const usado = x => [...indice.values()].some(p => p.slug === x && p.id !== id); while (usado(s)) s = base + '-' + n++; return s; }
  function limpaHtml(h) {
    return String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<(meta|link|object|embed|form)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '');
  }

  /* ---------- fotos ---------- */
  function dimensoes(b) {
    try {
      if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ext: 'png' };
      if (b.slice(0, 3).toString() === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), ext: 'gif' };
      if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length - 9) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), ext: 'jpg' }; i += 2 + b.readUInt16BE(i + 2); } }
      if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') { const t = b.slice(12, 16).toString(); if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, ext: 'webp' }; if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1, ext: 'webp' }; } if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), ext: 'webp' }; }
    } catch (e) {}
    return null;
  }
  async function guardaFoto(buf, nomeOriginal) {
    let d = dimensoes(buf); if (!d) throw new Error('Arquivo não é uma imagem (use JPG, PNG, WebP ou GIF).');
    const agora = new Date(), pasta = path.join(PASTA_MIDIA, String(agora.getFullYear()), String(agora.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(pasta, { recursive: true });
    let ext = d.ext, saida = buf;
    if (sharp && d.ext !== 'gif') { try { const im = sharp(buf).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }); saida = await im.toBuffer(); const m = await sharp(saida).metadata(); d = { w: m.width, h: m.height }; ext = 'webp'; } catch (e) { saida = buf; } }
    const base = slugar(String(nomeOriginal || 'foto').replace(/\.[a-z0-9]+$/i, '')).slice(0, 50) + '-' + crypto.randomBytes(3).toString('hex');
    const arq = base + '.' + ext; fs.writeFileSync(path.join(pasta, arq), saida);
    return { url: `/midia/${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, '0')}/${arq}`, w: d.w, h: d.h };
  }

  /* ---------- leitura do corpo ---------- */
  const corpoBruto = (req, max) => new Promise((ok, no) => { const partes = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { req.destroy(); no(new Error('Arquivo grande demais.')); } else partes.push(d); }); req.on('end', () => ok(Buffer.concat(partes))); req.on('error', no); });

  /* ---------- páginas (visual igual ao painel do WordPress) ---------- */
  const AZUL = '#3858e9';
  const CSS = `*{box-sizing:border-box}html{background:#f0f0f1}body{margin:0;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;background:#f0f0f1;color:#1d2327;min-width:0}
a{color:${AZUL};text-decoration:none}a:hover{color:#1e3ac4}
#barra{position:fixed;top:0;left:0;right:0;height:32px;background:#1d2327;color:#f0f0f1;display:flex;align-items:center;gap:0;z-index:100;font-size:13px}#barra a{color:#f0f0f1;padding:0 10px;line-height:32px;display:block;white-space:nowrap}#barra a:hover{background:#2c3338;color:#72aee6}#barra .esp{flex:1}#barra b{padding:0 12px;font-size:14px}
#menu{position:fixed;top:32px;left:0;bottom:0;width:160px;background:#1d2327;overflow-y:auto;z-index:90}#menu a{display:block;color:#f0f0f1;padding:9px 12px;font-size:14px;line-height:1.3}#menu a:hover{background:#2c3338;color:#72aee6}#menu a.at{background:${AZUL};color:#fff}#menu .sub{background:#2c3338;padding:4px 0 8px}#menu .sub a{font-size:13px;padding:5px 12px 5px 14px;color:#c3c4c7}#menu .sub a.at{background:none;color:#fff;font-weight:600}
#conteudo{margin:32px 0 0 160px;padding:10px 20px 40px}
h1.wp{font-size:23px;font-weight:400;margin:0 0 14px;padding:9px 0 4px;line-height:1.3;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bt{display:inline-block;font:13px/2.15 inherit;font-family:inherit;min-height:30px;padding:0 12px;border:1px solid ${AZUL};border-radius:3px;background:#f6f7f7;color:${AZUL};cursor:pointer;line-height:2.3;text-decoration:none;vertical-align:middle}.bt:hover{background:#f0f0f1;color:#1e3ac4;border-color:#1e3ac4}.bt.pri{background:${AZUL};color:#fff;border-color:${AZUL}}.bt.pri:hover{background:#2145e6;border-color:#2145e6;color:#fff}.bt.peq{min-height:26px;line-height:2;font-size:12px;padding:0 8px}
.pb{background:#fff;border:1px solid #c3c4c7;box-shadow:0 1px 1px rgba(0,0,0,.04);margin:0 0 20px}.pb>h2{font-size:14px;font-weight:600;margin:0;padding:8px 12px;border-bottom:1px solid #c3c4c7;line-height:1.4}.pb .in{padding:12px}
input[type=text],input[type=password],input[type=search],input[type=datetime-local],select,textarea,input:not([type]){font:inherit;font-size:14px;padding:0 8px;min-height:30px;border:1px solid #8c8f94;border-radius:4px;background:#fff;color:#2c3338;width:100%;box-shadow:0 0 0 transparent}textarea{padding:6px 8px;line-height:1.5}input:focus,select:focus,textarea:focus{border-color:${AZUL};box-shadow:0 0 0 1px ${AZUL};outline:2px solid transparent}
label{display:block;margin:10px 0 4px;font-weight:600}
.msg{background:#fff;border-left:4px solid ${AZUL};box-shadow:0 1px 1px rgba(0,0,0,.04);padding:10px 12px;margin:0 0 14px}.msg.err{border-left-color:#d63638}
table.w{width:100%;border-collapse:collapse;background:#fff;border:1px solid #c3c4c7}table.w th,table.w td{text-align:left;padding:8px 10px;vertical-align:top}table.w th{font-weight:400;border-bottom:1px solid #c3c4c7;color:#2c3338}table.w tr:nth-child(even) td{background:#f6f7f7}table.w td a.t{font-weight:600;font-size:14px}
.sub-l{margin:0 0 10px;color:#646970}.sub-l a{margin:0 4px}
.cap{color:#646970;font-size:12px}
@media(max-width:782px){#menu{display:none}#conteudo{margin-left:0;padding:10px 12px 40px}}`;
  const MENU = [['/redacao', 'Posts'], ['/redacao/nova', 'Adicionar post'], ['/redacao/categorias', 'Categorias'], ['/redacao/usuarios', 'Usuários'], ['/admin', 'Push e newsletter']];
  const casca = (titulo, u, corpo, msg, ativo, extraHead) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} ‹ ${NOME} — Redação</title><style>${CSS}</style>${extraHead || ''}</head><body>
<div id="barra"><b>${NOME}</b><a href="/" target="_blank">Ver site</a><a href="/redacao/nova">+ Novo</a><span class="esp"></span>${u ? `<a href="/redacao/usuarios">Olá, ${esc(u.nome)}</a><a href="/redacao/sair">Sair</a>` : ''}</div>
${u ? `<div id="menu"><a href="/redacao"${ativo === 'posts' ? ' class="at"' : ''}>Posts</a><div class="sub"><a href="/redacao"${ativo === 'posts' ? ' class="at"' : ''}>Todos os posts</a><a href="/redacao/nova"${ativo === 'nova' ? ' class="at"' : ''}>Adicionar post</a><a href="/redacao/categorias"${ativo === 'cats' ? ' class="at"' : ''}>Categorias</a></div><a href="/redacao/importar"${ativo === 'imp' ? ' class="at"' : ''}>Importar do WordPress</a><a href="/redacao/anuncios"${ativo === 'ads' ? ' class="at"' : ''}>Publicidade</a><a href="/redacao/publicador"${ativo === 'pub' ? ' class="at"' : ''}>Publicador</a><a href="/redacao/usuarios"${ativo === 'usr' ? ' class="at"' : ''}>Usuários</a><a href="/admin">Push e newsletter</a></div>` : ''}
<div id="conteudo"${u ? '' : ' style="margin-left:0"'}>${msg ? `<div class="msg${/^Erro/.test(msg) ? ' err' : ''}">${esc(msg)}</div>` : ''}${corpo}</div></body></html>`;
  const paginaLogin = msg => casca('Entrar', null, `<div style="width:320px;max-width:100%;margin:60px auto 0"><h1 style="text-align:center;font-size:26px;color:${AZUL};margin:0 0 20px">${NOME}</h1><div class="pb" style="padding:24px"><form method="post" action="/redacao/entrar"><label style="margin-top:0">Nome de usuário</label><input name="usuario" autocomplete="username" required autofocus><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required><p style="margin:18px 0 0"><button class="bt pri" style="float:right">Acessar</button><span style="clear:both;display:block"></span></p></form></div></div>`, msg);
  const fmtData = d => { if (!d) return ''; return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)).replace(',', ' às'); };
  const situacao = p => p.status === 'rascunho' ? 'Rascunho' : (new Date(p.data) > new Date() ? 'Agendado' : 'Publicado');

  function paginaLista(u, q, msg) {
    const cats = categorias(), nomeCat = s => (cats.find(c => c.slug === s) || {}).name || '';
    const busca = String(q.q || '').toLowerCase().trim(), st = q.status || '', pg = Math.max(1, +q.pg || 1), POR = 40;
    const todos = [...indice.values()], nPub = todos.filter(p => p.status !== 'rascunho').length, nRas = todos.length - nPub;
    let l = todos.filter(p => (!busca || p.titulo.toLowerCase().includes(busca)) && (!st || (st === 'rascunho' ? p.status === 'rascunho' : p.status !== 'rascunho'))).sort((a, b) => new Date(b.data || b.modificado) - new Date(a.data || a.modificado));
    const total = l.length; l = l.slice((pg - 1) * POR, pg * POR);
    const link = n => `/redacao?${new URLSearchParams({ q: q.q || '', status: st, pg: n })}`;
    return casca('Posts', u, `<h1 class="wp">Posts <a class="bt peq" href="/redacao/nova">Adicionar post</a></h1>
<p class="sub-l"><a href="/redacao"${!st ? ' style="color:#1d2327;font-weight:600"' : ''}>Todos (${todos.length})</a> | <a href="/redacao?status=publicado"${st === 'publicado' ? ' style="color:#1d2327;font-weight:600"' : ''}>Publicados (${nPub})</a> | <a href="/redacao?status=rascunho"${st === 'rascunho' ? ' style="color:#1d2327;font-weight:600"' : ''}>Rascunhos (${nRas})</a></p>
<form method="get" action="/redacao" style="display:flex;gap:6px;margin:0 0 12px;max-width:420px"><input type="hidden" name="status" value="${esc(st)}"><input type="search" name="q" value="${esc(q.q || '')}" placeholder="Buscar posts"><button class="bt">Buscar posts</button></form>
<table class="w"><tr><th>Título</th><th>Autor</th><th>Categorias</th><th>Data</th></tr>${l.map(p => `<tr><td>${p.capa ? '★ ' : ''}<a class="t" href="/redacao/editar/${p.id}">${esc(p.titulo || '(sem título)')}</a>${p.status === 'rascunho' ? ' — <span class="cap">Rascunho</span>' : ''}</td><td>${esc(p.autor)}</td><td>${esc(nomeCat(p.categoria))}</td><td>${situacao(p)}<br>${fmtData(p.data || p.modificado)}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum post encontrado.</td></tr>'}</table>
<p class="cap">${total} item(ns). ${pg > 1 ? `<a href="${link(pg - 1)}">« Anteriores</a> ` : ''}${total > pg * POR ? `<a href="${link(pg + 1)}">Próximos »</a>` : ''}</p>`, msg, 'posts');
  }

  function paginaEditor(u, p) {
    const cats = categorias(), novo = !p;
    p = p || { id: 0, slug: '', titulo: '', fina: '', resumo: '', conteudo: '', categoria: cats[0] ? cats[0].slug : '', destaque: { url: '', alt: '', legenda: '', w: 0, h: 0 }, autor: u.nome, status: 'rascunho', data: '', tags: [], capa: false };
    const dtLocal = p.data ? new Date(new Date(p.data).getTime() - 3 * 3600e3).toISOString().slice(0, 16) : '';
    const EXTRA = `<style>
#grade{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;align-items:start}@media(max-width:900px){#grade{grid-template-columns:1fr}}
#titulo{font-size:1.7em;line-height:100%;height:1.7em;min-height:40px;padding:3px 8px;margin:0 0 6px;border-radius:0;border:1px solid #8c8f94}
#perm{margin:0 0 14px;color:#50575e;min-height:24px}#perm input{width:260px;min-height:24px;font-size:13px;display:none;margin:0 4px}
.ab{display:flex;justify-content:flex-end;gap:2px;margin-bottom:-1px;position:relative;z-index:2}.ab button{background:#f6f7f7;border:1px solid #dcdcde;border-bottom-color:#dcdcde;padding:5px 14px;font:13px inherit;font-family:inherit;color:#50575e;cursor:pointer}.ab button.at{background:#fff;color:#1d2327;border-bottom-color:#fff}
#ebox{border:1px solid #dcdcde;background:#fff}
#barra2{display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#f6f7f7;border-bottom:1px solid #dcdcde;position:sticky;top:32px;z-index:3}#barra2 button{background:#fff;border:1px solid #dcdcde;border-radius:3px;min-width:30px;height:28px;padding:0 8px;cursor:pointer;font:13px inherit;font-family:inherit;color:#2c3338}#barra2 button:hover{background:#f0f0f1;border-color:#8c8f94}
#ed{min-height:420px;padding:14px 16px;font:18px/1.7 Georgia,"Times New Roman",serif;outline:0;color:#1d2327}#ed img{max-width:100%;height:auto}#ed figure{margin:14px 0}#ed figcaption{font:13px sans-serif;color:#666}#ed blockquote{border-left:4px solid ${AZUL};margin:14px 0;padding:4px 14px;color:#444}#ed h2{font-size:24px}#ed h3{font-size:20px}
#cod{display:none;width:100%;min-height:420px;border:0;border-radius:0;font:14px/1.6 Consolas,Monaco,monospace;padding:14px;box-shadow:none}
#rod{display:flex;justify-content:space-between;padding:4px 10px;border-top:1px solid #dcdcde;background:#f6f7f7;color:#50575e;font-size:12px}
.cl{max-height:190px;overflow:auto;border:1px solid #dcdcde;padding:6px 8px}.cl label{font-weight:400;margin:3px 0;display:flex;gap:6px;align-items:center}
.chips{margin:8px 0 0}.chips span{display:inline-block;margin:0 10px 4px 0;font-size:13px}.chips a{color:#b32d2e;cursor:pointer;margin-right:3px;font-weight:700}
.linhas p{margin:6px 0}.linhas .vm{color:#b32d2e}
#aviso{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1d2327;color:#fff;padding:10px 18px;border-radius:4px;opacity:0;transition:.3s;pointer-events:none;z-index:200}#aviso.on{opacity:1}
#dimg{max-width:100%;display:block;margin:0 0 8px;cursor:pointer}
</style>`;
    const corpo = `<h1 class="wp">${novo ? 'Adicionar post' : 'Editar post'} ${novo ? '' : '<a class="bt peq" href="/redacao/nova">Adicionar post</a>'}</h1>
<div id="grade"><div>
<input type="text" id="titulo" placeholder="Adicionar título" value="${esc(p.titulo)}" autocomplete="off">
<input type="text" id="fina" placeholder="Adicionar subtítulo (linha fina)" value="${esc(p.fina)}" autocomplete="off" style="font-size:16px;min-height:34px;margin:0 0 8px;border-radius:0">
<div id="perm">${p.slug ? `<b>Link permanente:</b> <a href="/${esc(p.slug)}/" target="_blank" id="plink">${esc('/' + p.slug + '/')}</a> <input id="slugin" value="${esc(p.slug)}"> <button type="button" class="bt peq" id="slugbt">Editar</button>` : '<span class="cap">O link permanente aparece depois de salvar.</span>'}</div>
<div class="ab"><button type="button" class="at" id="tvis">Visual</button><button type="button" id="tcod">Código</button></div>
<div id="ebox"><div id="barra2"><button type="button" data-b="p">Parágrafo</button><button type="button" data-b="h2">Título</button><button type="button" data-b="h3">Subtítulo</button><button type="button" data-c="bold"><b>N</b></button><button type="button" data-c="italic"><i>I</i></button><button type="button" data-c="insertUnorderedList">• Lista</button><button type="button" data-c="insertOrderedList">1. Lista</button><button type="button" data-b="blockquote">❝ Citação</button><button type="button" id="blink">Link</button><button type="button" id="bfoto">Adicionar mídia</button><button type="button" id="bvideo">Vídeo YouTube</button><button type="button" id="bcodigo">Código (Instagram, X…)</button><button type="button" data-c="removeFormat">Limpar</button><button type="button" data-c="undo">↶</button><button type="button" data-c="redo">↷</button></div>
<div id="ed" contenteditable="true">${p.conteudo || '<p><br></p>'}</div><textarea id="cod" spellcheck="false"></textarea><div id="rod"><span id="palavras">Palavras: 0</span><span id="info">${p.modificado ? 'Última edição em ' + fmtData(p.modificado) : ''}</span></div></div>
<input type="file" id="arq" accept="image/*" hidden>
<div class="pb" style="margin-top:20px"><h2>Resumo</h2><div class="in"><textarea id="resumo" rows="2">${esc(p.resumo || '')}</textarea><p class="cap" style="margin:6px 0 0">Resumos são pequenas descrições da matéria, usadas nas chamadas e no Google. Em branco, vale o subtítulo.</p></div></div>
</div>
<div>
<div class="pb"><h2>Destaques da capa</h2><div class="in"><label style="font-weight:400;display:flex;gap:6px;margin:0"><input type="checkbox" id="capa" style="width:auto"${p.capa ? ' checked' : ''}> <b>Incluir nos destaques</b></label><p class="cap" style="margin:8px 0 0">Marcado: a matéria sobe para os destaques da capa. Desmarcado: fica só na editoria dela.</p></div></div>
<div class="pb"><h2>Publicar</h2><div class="in linhas">
<p style="display:flex;gap:6px"><button type="button" class="bt" id="rasc" style="display:none">Salvar rascunho</button><a class="bt" id="ver" target="_blank" href="/${esc(p.slug)}/" style="margin-left:auto;display:none">Visualizar alterações</a></p>
<p>📌 Status: <b id="stx">${p.status === 'rascunho' ? 'Rascunho' : 'Publicado'}</b></p>
<p>👁 Visibilidade: <b>Público</b></p>
<p>📅 <span id="datax"></span> <a href="#" id="dedit">Editar</a></p><p id="dwrap" style="display:none"><input type="datetime-local" id="data" value="${dtLocal}"></p>
<p style="display:flex;align-items:center;justify-content:space-between;margin-top:14px">${p.id ? '<a href="#" id="excluir" class="vm">Mover para lixeira</a>' : '<span></span>'}<button type="button" class="bt pri" id="publicar">Publicar</button></p><p id="volta" style="display:none;margin:0"><a href="#" id="bvolta">Voltar para rascunho</a></p>
</div></div>
<div class="pb"><h2>Categorias</h2><div class="in"><div class="cl">${cats.map(c => `<label><input type="radio" name="cat" value="${esc(c.slug)}"${c.slug === p.categoria ? ' checked' : ''} style="width:auto"> ${esc(c.name)}</label>`).join('')}</div><p style="margin:8px 0 0"><a href="/redacao/categorias">+ Adicionar categoria</a></p></div></div>
<div class="pb"><h2>Tags</h2><div class="in"><div style="display:flex;gap:6px"><input type="text" id="tagin" placeholder="" autocomplete="off"><button type="button" class="bt" id="tagbt">Adicionar</button></div><p class="cap" style="margin:6px 0 0">Separe as tags com vírgulas</p><div class="chips" id="chips"></div></div></div>
<div class="pb"><h2>Imagem destacada</h2><div class="in"><img id="dimg" src="${esc(p.destaque.url)}" ${p.destaque.url ? '' : 'hidden'} alt=""><p class="cap" id="dtx" style="${p.destaque.url ? '' : 'display:none'}">Clicar sobre a imagem para editar ou atualizar.</p><p style="margin:0"><a href="#" id="bdest">${p.destaque.url ? '' : 'Definir imagem destacada'}</a> <a href="#" id="bdestx" class="vm" style="color:#b32d2e;${p.destaque.url ? '' : 'display:none'}">Remover imagem destacada</a></p><label>Descrição da imagem (alt)</label><input id="dalt" value="${esc(p.destaque.alt)}"><label>Legenda / crédito</label><input id="dleg" value="${esc(p.destaque.legenda)}"><p class="cap" style="margin:6px 0 0">Use foto real, sem texto escrito nela.</p></div></div>
<div class="pb"><h2>Autor</h2><div class="in"><input id="autor" value="${esc(p.autor)}"></div></div>
</div></div><div id="aviso"></div>
<script>
var ID=${p.id},STATUS=${JSON.stringify(p.status)},DEST=${JSON.stringify(p.destaque)},TAGS=${JSON.stringify(p.tags || [])},SLUG=${JSON.stringify(p.slug)};
var $=function(i){return document.getElementById(i)},ed=$('ed'),aviso=function(t){var a=$('aviso');a.textContent=t;a.className='on';setTimeout(function(){a.className=''},2500)};
function conta(){var t=(ed.innerText||'').trim();$('palavras').textContent='Palavras: '+(t?t.split(/\\s+/).length:0)}ed.addEventListener('input',conta);conta();
function dataTxt(){var v=$('data').value;$('datax').textContent=v?(new Date(v)>new Date()?'Agendar para: ':'Publicado em: ')+v.split('T')[0].split('-').reverse().join('/')+' às '+v.split('T')[1]:'Publicar imediatamente'}dataTxt();
$('dedit').onclick=function(e){e.preventDefault();$('dwrap').style.display='block'};$('data').onchange=dataTxt;
function botoes(){var pub=STATUS!=='rascunho';$('stx').textContent=pub?'Publicado':'Rascunho';$('publicar').textContent=pub?'Atualizar':'Publicar';$('rasc').style.display=pub?'none':'inline-block';$('volta').style.display=pub?'block':'none';$('ver').style.display=(pub&&SLUG)?'inline-block':'none'}botoes();
function chips(){var h='';TAGS.forEach(function(t,i){h+='<span><a data-i="'+i+'">✕</a>'+t.replace(/</g,'&lt;')+'</span>'});$('chips').innerHTML=h;$('chips').querySelectorAll('a').forEach(function(a){a.onclick=function(){TAGS.splice(+a.dataset.i,1);chips()}})}chips();
function addTags(){$('tagin').value.split(',').forEach(function(t){t=t.trim();if(t&&TAGS.indexOf(t)<0)TAGS.push(t)});$('tagin').value='';chips()}
$('tagbt').onclick=addTags;$('tagin').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();addTags()}};
var sb=$('slugbt');if(sb)sb.onclick=function(){var i=$('slugin');if(i.style.display!=='inline-block'){i.style.display='inline-block';$('plink').style.display='none';sb.textContent='OK'}else{SLUG=i.value;$('plink').textContent='/'+SLUG+'/';i.style.display='none';$('plink').style.display='';sb.textContent='Editar'}};
$('tvis').onclick=function(){if($('cod').style.display==='block'){ed.innerHTML=$('cod').value}ed.style.display='block';$('cod').style.display='none';$('barra2').style.display='flex';$('tvis').className='at';$('tcod').className=''};
$('tcod').onclick=function(){$('cod').value=ed.innerHTML.replace(/<\\/(p|h2|h3|ul|ol|li|blockquote|figure)>/g,'</$1>\\n');ed.style.display='none';$('cod').style.display='block';$('barra2').style.display='none';$('tcod').className='at';$('tvis').className=''};
document.querySelectorAll('#barra2 [data-c]').forEach(function(b){b.onmousedown=function(e){e.preventDefault();document.execCommand(b.dataset.c,false,null)}});
document.querySelectorAll('#barra2 [data-b]').forEach(function(b){b.onmousedown=function(e){e.preventDefault();document.execCommand('formatBlock',false,b.dataset.b)}});
$('blink').onmousedown=function(e){e.preventDefault();var u=prompt('Cole o endereço do link (https://...)');if(u)document.execCommand('createLink',false,u)};
$('bvideo').onmousedown=function(e){e.preventDefault();var u=prompt('Cole o endereço do vídeo do YouTube');if(!u)return;var m=u.match(/(?:v=|youtu\\.be\\/|embed\\/|shorts\\/)([\\w-]{11})/);if(!m){aviso('Endereço do YouTube não reconhecido');return}document.execCommand('insertHTML',false,'<p><iframe src="https://www.youtube.com/embed/'+m[1]+'" width="560" height="315" style="max-width:100%" frameborder="0" allowfullscreen loading="lazy"></iframe></p><p><br></p>')};
$('bcodigo').onmousedown=function(e){e.preventDefault();var c=prompt('Cole aqui o código de incorporação (embed) da rede social');if(c)document.execCommand('insertHTML',false,'<div>'+c+'</div><p><br></p>')};
var alvo='texto';function escolher(a){alvo=a;$('arq').value='';$('arq').click()}
$('bfoto').onmousedown=function(e){e.preventDefault();var s=window.getSelection();window._sel=s.rangeCount?s.getRangeAt(0):null;escolher('texto')};
$('bdest').onclick=function(e){e.preventDefault();escolher('destaque')};$('dimg').onclick=function(){escolher('destaque')};
$('bdestx').onclick=function(e){e.preventDefault();DEST={url:'',alt:'',legenda:'',w:0,h:0};$('dimg').hidden=true;$('dtx').style.display='none';$('bdestx').style.display='none';$('bdest').textContent='Definir imagem destacada'};
$('arq').onchange=function(){var f=this.files[0];if(!f)return;aviso('Enviando foto…');fetch('/redacao/api/upload?nome='+encodeURIComponent(f.name),{method:'POST',body:f}).then(function(r){return r.json()}).then(function(j){if(!j.ok){aviso(j.msg||'Erro ao enviar');return}
 if(alvo==='destaque'){DEST.url=j.url;DEST.w=j.w;DEST.h=j.h;$('dimg').src=j.url;$('dimg').hidden=false;$('dtx').style.display='';$('bdestx').style.display='';$('bdest').textContent='';aviso('Imagem destacada pronta')}
 else{ed.focus();if(window._sel){var s=window.getSelection();s.removeAllRanges();s.addRange(window._sel)}var leg=prompt('Legenda da foto (opcional)')||'';document.execCommand('insertHTML',false,'<figure><img src="'+j.url+'" width="'+j.w+'" height="'+j.h+'" alt="'+leg.replace(/"/g,'')+'" loading="lazy">'+(leg?'<figcaption>'+leg.replace(/</g,'')+'</figcaption>':'')+'</figure><p><br></p>');aviso('Foto inserida')}
}).catch(function(){aviso('Erro ao enviar a foto')})};
ed.addEventListener('paste',function(e){var h=(e.clipboardData||window.clipboardData).getData('text/html');if(!h)return;e.preventDefault();var d=document.createElement('div');d.innerHTML=h;d.querySelectorAll('script,style,meta,link,iframe,object').forEach(function(n){n.remove()});
 d.querySelectorAll('*').forEach(function(n){var t=n.tagName.toLowerCase();if(!/^(p|br|strong|b|em|i|a|h2|h3|ul|ol|li|blockquote|img|figure|figcaption)$/.test(t)){if(/^(h1|h4|h5|h6)$/.test(t)){var h2=document.createElement('h2');h2.innerHTML=n.innerHTML;n.replaceWith(h2)}else{n.replaceWith.apply(n,[].slice.call(n.childNodes))}return}
 [].slice.call(n.attributes).forEach(function(a){if(!(t==='a'&&a.name==='href')&&!(t==='img'&&/^(src|alt|width|height)$/.test(a.name)))n.removeAttribute(a.name)})});
 document.execCommand('insertHTML',false,d.innerHTML)});
function dados(st){if($('cod').style.display==='block')ed.innerHTML=$('cod').value;var c=document.querySelector('input[name=cat]:checked');addTags();return{id:ID,slug:SLUG,titulo:$('titulo').value.trim(),fina:$('fina').value.trim(),resumo:$('resumo').value.trim(),conteudo:ed.innerHTML,categoria:c?c.value:'',autor:$('autor').value.trim(),tags:TAGS.join(','),capa:$('capa').checked,status:st,data:$('data').value,destaque:{url:DEST.url,w:DEST.w,h:DEST.h,alt:$('dalt').value.trim(),legenda:$('dleg').value.trim()}}}
var salvando=false;
function salvar(st,auto){if(salvando)return;var d=dados(st);if(!d.titulo){if(!auto)aviso('Escreva o título antes de salvar');return}salvando=true;
 fetch('/redacao/api/salvar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json()}).then(function(j){salvando=false;if(!j.ok){aviso(j.msg||'Erro ao salvar');return}
 var novo=!ID;ID=j.id;SLUG=j.slug;STATUS=st;botoes();$('ver').href='/'+SLUG+'/';$('info').textContent=(auto?'Salvo automaticamente':'Salvo')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});if(!auto)aviso(st==='rascunho'?'Rascunho salvo.':'Post publicado/atualizado!');if(novo)location.replace('/redacao/editar/'+ID)}).catch(function(){salvando=false;aviso('Sem conexão. Tente de novo.')})}
$('publicar').onclick=function(){salvar('publicado',false)};$('rasc').onclick=function(){salvar('rascunho',false)};$('bvolta').onclick=function(e){e.preventDefault();salvar('rascunho',false)};
setInterval(function(){if(ID)salvar(STATUS,true)},45000);
var ex=$('excluir');if(ex)ex.onclick=function(e){e.preventDefault();if(confirm('Mover esta matéria para a lixeira? (será apagada de vez)'))fetch('/redacao/api/excluir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:ID})}).then(function(){location='/redacao'})};
</script>`;
    return casca(novo ? 'Adicionar post' : 'Editar post', u, corpo, '', novo ? 'nova' : 'posts', EXTRA);
  }

  function paginaCategorias(u, msg) {
    const cats = categorias();
    return casca('Categorias', u, `<h1 class="wp">Categorias</h1><div style="display:grid;grid-template-columns:320px minmax(0,1fr);gap:24px;align-items:start" class="cg"><div class="pb"><h2>Adicionar categoria</h2><div class="in"><form method="post" action="/redacao/categorias/nova"><label style="margin-top:0">Nome</label><input name="nome" required><p><button class="bt pri">Adicionar categoria</button></p></form></div></div><table class="w"><tr><th>Nome</th><th>Endereço</th><th></th></tr>${cats.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>/category/${esc(c.slug)}/</td><td><form method="post" action="/redacao/categorias/apagar" onsubmit="return confirm('Apagar esta categoria?')"><input type="hidden" name="id" value="${c.id}"><button class="bt peq">Apagar</button></form></td></tr>`).join('')}</table></div><style>@media(max-width:900px){.cg{grid-template-columns:1fr!important}}</style>`, msg, 'cats');
  }
  function paginaUsuarios(u, msg) {
    const us = usuarios();
    return casca('Usuários', u, `<h1 class="wp">Usuários</h1><div style="display:grid;grid-template-columns:340px minmax(0,1fr);gap:24px;align-items:start" class="cg"><div class="pb"><h2>Adicionar novo usuário</h2><div class="in"><p class="cap" style="margin-top:0">Todos os usuários escrevem, editam e publicam.</p><form method="post" action="/redacao/usuarios/novo"><label style="margin-top:0">Nome</label><input name="nome" required><label>Nome de usuário (para entrar)</label><input name="usuario" required autocomplete="off" readonly onfocus="this.removeAttribute('readonly')"><label>Senha (8 letras ou mais)</label><input name="senha" type="password" required minlength="8" autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')"><p><button class="bt pri">Adicionar usuário</button></p></form></div></div><table class="w"><tr><th>Autor (foto e nome)</th><th>Usuário</th><th></th></tr>${us.map(x => `<tr><td><form method="post" action="/redacao/usuarios/perfil" class="perfil" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="hidden" name="id" value="${x.id}"><input type="hidden" name="foto" value="${esc(x.foto || '')}"><span class="fp" style="width:48px;height:48px;border-radius:50%;background:#e9edf3 center/cover no-repeat;${x.foto ? `background-image:url(${esc(x.foto)});` : ''}flex:none"></span><input name="nome" value="${esc(x.nome)}" style="width:180px" required><input name="cargo" value="${esc(x.cargo || '')}" placeholder="Cargo (ex.: Diretor editorial do Portal SC Hoje)" style="width:100%;flex-basis:100%"><input name="registro" value="${esc(x.registro || '')}" placeholder="Registro profissional (ex.: Jornalista: 32.673-SP)" style="width:49%"><input name="linkedin" value="${esc(x.linkedin || '')}" placeholder="Link do LinkedIn" style="width:49%"><input name="slugAutor" value="${esc(x.slugAutor || '')}" placeholder="Endereço da página (ex.: mauriciofreitas)" style="width:100%;flex-basis:100%"><textarea name="bio" rows="2" maxlength="300" placeholder="Mini biografia (aparece na página do autor)" style="width:100%;flex-basis:100%">${esc(x.bio || '')}</textarea><label class="bt peq" style="margin:0;font-weight:400">Escolher foto<input type="file" accept="image/*" class="fotoin" style="display:none"></label><button class="bt peq pri">Salvar</button></form></td><td>${esc(x.usuario)}</td><td><form method="post" action="/redacao/usuarios/senha" style="display:flex;gap:6px;flex-wrap:wrap"><input type="hidden" name="id" value="${x.id}"><input name="senha" type="password" placeholder="nova senha" style="width:150px" autocomplete="new-password"><button class="bt peq">Trocar senha</button></form>${x.id !== u.id ? `<form method="post" action="/redacao/usuarios/apagar" onsubmit="return confirm('Apagar este usuário?')" style="margin-top:6px"><input type="hidden" name="id" value="${x.id}"><button class="bt peq">Apagar</button></form>` : ''}</td></tr>`).join('')}</table></div><style>@media(max-width:900px){.cg{grid-template-columns:1fr!important}}</style><script>document.querySelectorAll('.fotoin').forEach(function(i){i.onchange=function(){var f=i.files[0],form=i.closest('form');if(!f)return;var img=new Image();img.onload=function(){var s=320,c=document.createElement('canvas');c.width=c.height=s;var l=Math.min(img.width,img.height),x=(img.width-l)/2,y=(img.height-l)/3;c.getContext('2d').drawImage(img,Math.max(0,x),Math.max(0,y),l,l,0,0,s,s);c.toBlob(function(b){fetch('/redacao/api/upload?nome=autor.jpg',{method:'POST',body:b}).then(function(r){return r.json()}).then(function(j){if(!j.ok){alert(j.msg||'Erro');return}form.foto.value=j.url;form.querySelector('.fp').style.backgroundImage='url('+j.url+')'}).catch(function(){alert('Erro ao enviar a foto')})},'image/jpeg',.9)};img.src=URL.createObjectURL(f)}})</script>`, msg, 'usr');
  }

  /* ---------- rotas ---------- */
  const redir = (res, para, cookies) => { const h = { Location: para, 'Cache-Control': 'no-store' }; if (cookies) h['Set-Cookie'] = cookies; res.writeHead(302, h); res.end(); };
  const form = async req => Object.fromEntries(new URLSearchParams((await corpoBruto(req, 20000)).toString()));
  const ipDe = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  let pub = null, ads = null, imp = null;
  async function tratar(req, res, rota, u) {
    if (rota === '/redacao/entrar' && req.method === 'POST') {
      const ip = ipDe(req), t = tentativas.get(ip) || { n: 0, ate: 0 };
      if (t.n >= 8 && Date.now() < t.ate) return html(res, 429, paginaLogin('Erro: muitas tentativas. Espere 15 minutos.'));
      const f = await form(req), us = usuarios().find(x => x.usuario === String(f.usuario || '').trim().toLowerCase());
      let ok = false; if (us) { const a = Buffer.from(hash(f.senha || '', us.sal)), b = Buffer.from(us.hash); ok = a.length === b.length && crypto.timingSafeEqual(a, b); }
      if (!ok) { tentativas.set(ip, { n: t.n + 1, ate: Date.now() + 15 * 60000 }); return html(res, 200, paginaLogin('Erro: usuário ou senha incorretos.')); }
      tentativas.delete(ip);
      const tk = crypto.randomBytes(24).toString('hex'), s = sessoes(); s[tk] = { uid: us.id, exp: Date.now() + 14 * 86400000 }; gravar('sessoes.json', s);
      return redir(res, '/redacao', `sc_red=${tk}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${14 * 86400}`);
    }
    const usr = logado(req);
    if (rota === '/redacao/sair') { const t = cookie(req).sc_red, s = sessoes(); if (t) { delete s[t]; gravar('sessoes.json', s); } return redir(res, '/redacao', 'sc_red=; Path=/; Max-Age=0'); }
    if (!usr) return rota.startsWith('/redacao/api/') ? json(res, 401, { ok: false, msg: 'Sessão expirada. Entre de novo.' }) : html(res, 200, paginaLogin(''));

    if (imp && (rota === '/redacao/importar' || rota.startsWith('/redacao/importar/'))) return imp.tratar(req, res, rota, u, usr);
    if (ads && (rota === '/redacao/anuncios' || rota.startsWith('/redacao/anuncios/'))) return ads.tratar(req, res, rota, u, usr);
    if (pub && (rota === '/redacao/publicador' || rota.startsWith('/redacao/publicador/'))) return pub.tratar(req, res, rota, u, usr);
    if (rota === '/redacao' || rota === '/redacao/') return html(res, 200, paginaLista(usr, Object.fromEntries(u.searchParams), ''));
    if (rota === '/redacao/nova') return html(res, 200, paginaEditor(usr, null));
    let m;
    if ((m = rota.match(/^\/redacao\/editar\/(\d+)$/))) { const p = lerPost(m[1]); return p ? html(res, 200, paginaEditor(usr, p)) : redir(res, '/redacao'); }

    if (rota === '/redacao/api/upload' && req.method === 'POST') {
      try { const buf = await corpoBruto(req, 15 * 1024 * 1024); const r = await guardaFoto(buf, u.searchParams.get('nome')); return json(res, 200, Object.assign({ ok: true }, r)); }
      catch (e) { return json(res, 200, { ok: false, msg: e.message }); }
    }
    if (rota === '/redacao/api/salvar' && req.method === 'POST') {
      let d; try { d = JSON.parse((await corpoBruto(req, 3 * 1024 * 1024)).toString()); } catch (e) { return json(res, 400, { ok: false, msg: 'Dados inválidos.' }); }
      const antigo = d.id ? lerPost(d.id) : null, agora = new Date().toISOString();
      if (d.id && !antigo) return json(res, 404, { ok: false, msg: 'Matéria não encontrada.' });
      const cats = categorias(); if (!cats.some(c => c.slug === d.categoria)) return json(res, 400, { ok: false, msg: 'Escolha a editoria.' });
      const pode = true;
      let status = d.status === 'publicado' && pode ? 'publicado' : (antigo && antigo.status === 'publicado' && !pode ? 'publicado' : 'rascunho');
      let data = (antigo && antigo.data) || ''; if (d.data) { const t = new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(d.data) ? d.data + ':00-03:00' : d.data); if (!isNaN(t)) data = t.toISOString(); }
      if (status === 'publicado' && !data) data = agora;
      const id = antigo ? antigo.id : proximoId(), titulo = String(d.titulo || '').trim().slice(0, 200);
      if (!titulo) return json(res, 400, { ok: false, msg: 'Escreva o título.' });
      const slug = antigo && antigo.slug ? (d.slug && slugar(d.slug) !== antigo.slug ? slugLivre(slugar(d.slug), id) : antigo.slug) : slugLivre(slugar(titulo), id);
      const dst = d.destaque || {};
      const p = { id, slug, titulo, fina: String(d.fina || '').trim().slice(0, 400), resumo: String(d.resumo || '').trim().slice(0, 400), conteudo: limpaHtml(d.conteudo), categoria: d.categoria, autor: String(d.autor || usr.nome).trim().slice(0, 80), tags: [...new Set(String(d.tags || '').split(',').map(t => t.trim().replace(/^#/, '').slice(0, 40)).filter(Boolean))].slice(0, 15), capa: !!d.capa, status, data, criado: antigo ? antigo.criado : agora, modificado: agora, destaque: { url: /^\/midia\/[\w\/.-]+$|^https:\/\//.test(dst.url || '') ? dst.url : '', alt: String(dst.alt || '').slice(0, 200), legenda: String(dst.legenda || '').slice(0, 300), w: +dst.w || 0, h: +dst.h || 0 }, editor: usr.usuario };
      salvaPost(p); return json(res, 200, { ok: true, id, slug });
    }
    if (rota === '/redacao/api/excluir' && req.method === 'POST') {
      try { const d = JSON.parse((await corpoBruto(req, 2000)).toString()); fs.unlinkSync(path.join(PASTA_POSTS, +d.id + '.json')); indice.delete(+d.id); } catch (e) {}
      return json(res, 200, { ok: true });
    }

    if (rota === '/redacao/categorias') return html(res, 200, paginaCategorias(usr, ''));
    if (rota === '/redacao/categorias/nova' && req.method === 'POST') {
      const f = await form(req), cs = categorias(), nome = String(f.nome || '').trim().slice(0, 60), slug = slugar(nome);
      if (!nome || cs.some(c => c.slug === slug)) return html(res, 200, paginaCategorias(usr, 'Erro: nome vazio ou editoria já existe.'));
      cs.push({ id: Math.max(100000, ...cs.map(c => c.id)) + 1, name: nome, slug, parent: 0 }); gravar('categorias.json', cs); return html(res, 200, paginaCategorias(usr, 'Editoria criada.'));
    }
    if (rota === '/redacao/categorias/apagar' && req.method === 'POST') {
      const f = await form(req), cs = categorias().filter(c => c.id !== +f.id); gravar('categorias.json', cs); return html(res, 200, paginaCategorias(usr, 'Editoria apagada.'));
    }
    if (rota === '/redacao/usuarios') return html(res, 200, paginaUsuarios(usr, ''));
    if (rota === '/redacao/usuarios/novo' && req.method === 'POST') {
      const f = await form(req), us = usuarios(), un = String(f.usuario || '').trim().toLowerCase();
      if (!un || !f.nome || String(f.senha || '').length < 8 || us.some(x => x.usuario === un)) return html(res, 200, paginaUsuarios(usr, 'Erro: preencha tudo (senha com 8 letras ou mais) e use um usuário que ainda não existe.'));
      const sal = crypto.randomBytes(8).toString('hex'); us.push({ id: Math.max(...us.map(x => x.id)) + 1, nome: String(f.nome).trim().slice(0, 60), usuario: un, sal, hash: hash(f.senha, sal), papel: 'admin' });
      gravar('usuarios.json', us); return html(res, 200, paginaUsuarios(usr, 'Usuário criado.'));
    }
    if (rota === '/redacao/usuarios/senha' && req.method === 'POST') {
      const f = await form(req), us = usuarios(), x = us.find(y => y.id === +f.id);
      if (!x || String(f.senha || '').length < 8) return html(res, 200, paginaUsuarios(usr, 'Erro: a senha precisa ter 8 letras ou mais.'));
      x.sal = crypto.randomBytes(8).toString('hex'); x.hash = hash(f.senha, x.sal); gravar('usuarios.json', us); return html(res, 200, paginaUsuarios(usr, 'Senha trocada.'));
    }
    if (rota === '/redacao/usuarios/perfil' && req.method === 'POST') {
      const f = await form(req), us = usuarios(), x = us.find(y => y.id === +f.id), nome = String(f.nome || '').trim().slice(0, 60);
      if (!x || !nome) return html(res, 200, paginaUsuarios(usr, 'Erro: informe o nome.'));
      x.nome = nome; x.bio = String(f.bio || '').trim().slice(0, 300); x.cargo = String(f.cargo || '').trim().slice(0, 100); x.registro = String(f.registro || '').trim().slice(0, 80); x.linkedin = /^https:\/\/[^\s"<>]+$/.test(f.linkedin || '') ? f.linkedin.trim() : ''; x.slugAutor = slugar(f.slugAutor || '').replace(/^materia$/, ''); x.foto = /^\/midia\/[\w\/.-]+$/.test(f.foto || '') ? f.foto : (x.foto || ''); gravar('usuarios.json', us);
      return html(res, 200, paginaUsuarios(usr, 'Autor salvo. A foto aparece nas matérias na próxima atualização do site (até 5 minutos).'));
    }
    if (rota === '/redacao/usuarios/apagar' && req.method === 'POST') {
      const f = await form(req); gravar('usuarios.json', usuarios().filter(x => x.id !== +f.id || x.id === usr.id)); return html(res, 200, paginaUsuarios(usr, 'Usuário apagado.'));
    }
    return json(res, 404, { ok: false });
  }
  tratar.ligar = (p, a, i) => { pub = p; ads = a; imp = i; };
  tratar.api = { categorias, guardaFoto, proximoId, slugLivre, slugar, salvaPost, lerPost, dimensoes, casca, limpaHtml, get indice() { return indice; } };
  return tratar;
};
