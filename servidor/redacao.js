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
  const resumo = p => ({ id: p.id, slug: p.slug, titulo: p.titulo, categoria: p.categoria, autor: p.autor, status: p.status, data: p.data, modificado: p.modificado });
  function carregaIndice() { indice = new Map(); for (const f of fs.readdirSync(PASTA_POSTS)) { if (!f.endsWith('.json')) continue; try { const p = JSON.parse(fs.readFileSync(path.join(PASTA_POSTS, f), 'utf8')); indice.set(p.id, resumo(p)); } catch (e) {} } }
  carregaIndice();
  const lerPost = id => { try { return JSON.parse(fs.readFileSync(path.join(PASTA_POSTS, +id + '.json'), 'utf8')); } catch (e) { return null; } };
  const salvaPost = p => { const f = path.join(PASTA_POSTS, p.id + '.json'); fs.writeFileSync(f + '.tmp', JSON.stringify(p)); fs.renameSync(f + '.tmp', f); indice.set(p.id, resumo(p)); };
  const proximoId = () => Math.max(900000, ...indice.keys()) + 1;
  function slugLivre(base, id) { let s = base, n = 2; const usado = x => [...indice.values()].some(p => p.slug === x && p.id !== id); while (usado(s)) s = base + '-' + n++; return s; }
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

  /* ---------- páginas ---------- */
  const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,Arial,sans-serif;background:#f4f6fb;color:#1d1d1f}a{color:#0034fc}.topo{background:#0034fc;color:#fff;padding:12px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.topo b{font-size:19px}.topo a{color:#fff;text-decoration:none;font-weight:600}.topo .esp{flex:1}.caixa{background:#fff;border-radius:12px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.06);margin:0 0 16px}.cont{max-width:1100px;margin:0 auto;padding:18px}input,select,textarea{font:inherit;padding:10px;border:1px solid #ccd;border-radius:8px;width:100%;background:#fff}label{display:block;font-weight:600;margin:10px 0 4px}.bt{background:#0034fc;color:#fff;border:0;border-radius:22px;padding:11px 22px;font:700 15px system-ui,Arial;cursor:pointer;text-decoration:none;display:inline-block}.bt.sec{background:#fff;color:#0034fc;border:2px solid #0034fc}.bt.verm{background:#c0392b}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e6e9f2;vertical-align:top}th{font-size:13px;color:#555}.etq{display:inline-block;padding:2px 9px;border-radius:12px;font-size:12px;font-weight:700}.etq.p{background:#d9f5df;color:#14692a}.etq.r{background:#eee;color:#555}.etq.a{background:#fff2cc;color:#8a6200}.msg{background:#e8efff;border-radius:8px;padding:10px 14px;margin:0 0 14px}.err{background:#fde8e8;color:#8a1c1c}`;
  const casca = (titulo, u, corpo, msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — Redação ${NOME}</title><style>${CSS}</style></head><body><div class="topo"><b>Redação ${NOME}</b>${u ? `<a href="/redacao">Matérias</a><a href="/redacao/nova">Nova matéria</a><a href="/redacao/categorias">Editorias</a><a href="/redacao/usuarios">Usuários</a><span class="esp"></span><span>${esc(u.nome)}</span><a href="/redacao/sair">Sair</a>` : ''}</div><div class="cont">${msg ? `<p class="msg${/^Erro/.test(msg) ? ' err' : ''}">${esc(msg)}</p>` : ''}${corpo}</div></body></html>`;
  const paginaLogin = msg => casca('Entrar', null, `<div class="caixa" style="max-width:380px;margin:40px auto"><h1 style="margin:0 0 10px;font-size:22px">Entrar na redação</h1><form method="post" action="/redacao/entrar"><label>Usuário</label><input name="usuario" autocomplete="username" required autofocus><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required><p><button class="bt">Entrar</button></p></form></div>`, msg);
  const fmtData = d => { if (!d) return ''; const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)); return p.replace(',', ''); };
  const etiqueta = p => p.status === 'rascunho' ? '<span class="etq r">Rascunho</span>' : (new Date(p.data) > new Date() ? '<span class="etq a">Agendada</span>' : '<span class="etq p">Publicada</span>');

  function paginaLista(u, q, msg) {
    const cats = categorias(), nomeCat = s => (cats.find(c => c.slug === s) || {}).name || '';
    const busca = String(q.q || '').toLowerCase().trim(), st = q.status || '', pg = Math.max(1, +q.pg || 1), POR = 40;
    let l = [...indice.values()].filter(p => (!busca || p.titulo.toLowerCase().includes(busca)) && (!st || (st === 'rascunho' ? p.status === 'rascunho' : p.status !== 'rascunho'))).sort((a, b) => new Date(b.data || b.modificado) - new Date(a.data || a.modificado));
    const total = l.length; l = l.slice((pg - 1) * POR, pg * POR);
    const link = n => `/redacao?${new URLSearchParams({ q: q.q || '', status: st, pg: n })}`;
    return casca('Matérias', u, `<div class="caixa"><form method="get" action="/redacao" style="display:flex;gap:8px;flex-wrap:wrap"><input name="q" value="${esc(q.q || '')}" placeholder="Buscar pelo título" style="flex:1;min-width:200px"><select name="status" style="width:auto"><option value="">Todas</option><option value="rascunho"${st === 'rascunho' ? ' selected' : ''}>Rascunhos</option><option value="publicado"${st === 'publicado' ? ' selected' : ''}>Publicadas</option></select><button class="bt">Buscar</button><a class="bt sec" href="/redacao/nova">Nova matéria</a></form></div><div class="caixa"><table><tr><th>Título</th><th>Editoria</th><th>Autor</th><th>Situação</th><th>Data</th></tr>${l.map(p => `<tr><td><a href="/redacao/editar/${p.id}"><b>${esc(p.titulo || '(sem título)')}</b></a></td><td>${esc(nomeCat(p.categoria))}</td><td>${esc(p.autor)}</td><td>${etiqueta(p)}</td><td>${fmtData(p.data || p.modificado)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma matéria ainda.</td></tr>'}</table><p>${total} matéria(s). ${pg > 1 ? `<a href="${link(pg - 1)}">« anteriores</a> ` : ''}${total > pg * POR ? `<a href="${link(pg + 1)}">próximas »</a>` : ''}</p></div>`, msg);
  }

  function paginaEditor(u, p) {
    const cats = categorias(), novo = !p;
    p = p || { id: 0, titulo: '', fina: '', conteudo: '', categoria: 'balneario-camboriu', destaque: { url: '', alt: '', legenda: '', w: 0, h: 0 }, autor: u.nome, status: 'rascunho', data: '' };
    const dtLocal = p.data ? new Date(new Date(p.data).getTime() - 3 * 3600e3).toISOString().slice(0, 16) : '';
    const pode = true;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${novo ? 'Nova matéria' : 'Editar'} — Redação ${NOME}</title><style>${CSS}
.grade{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}@media(max-width:860px){.grade{grid-template-columns:1fr}}
.tit{font:700 26px/1.25 Georgia,serif;border:0;border-bottom:2px solid #e6e9f2;border-radius:0;padding:8px 2px}.fina{font:italic 17px Georgia,serif}
.barra{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;position:sticky;top:0;background:#fff;padding:8px 0;z-index:5;border-bottom:1px solid #e6e9f2}.barra button{border:1px solid #ccd;background:#fff;border-radius:6px;padding:7px 11px;cursor:pointer;font:600 14px system-ui}.barra button:hover{background:#e8efff}
#ed{min-height:420px;border:1px solid #dde;border-radius:8px;padding:14px;font:18px/1.7 Georgia,serif;outline:0}#ed:focus{border-color:#0034fc}#ed img{max-width:100%;height:auto}#ed figure{margin:14px 0}#ed figcaption{font:13px system-ui;color:#666}#ed blockquote{border-left:4px solid #0034fc;margin:14px 0;padding:4px 14px;color:#444}#ed h2{font-size:24px}#ed h3{font-size:20px}
.dest img{max-width:100%;border-radius:8px;display:block;margin:6px 0}#aviso{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:22px;opacity:0;transition:.3s;pointer-events:none;z-index:50}#aviso.on{opacity:1}
</style></head><body><div class="topo"><b>Redação ${NOME}</b><a href="/redacao">Matérias</a><a href="/redacao/nova">Nova matéria</a><span class="esp"></span><span>${esc(u.nome)}</span><a href="/redacao/sair">Sair</a></div>
<div class="cont"><div class="grade"><div class="caixa"><input class="tit" id="titulo" placeholder="Título da matéria" value="${esc(p.titulo)}"><label>Linha fina (resumo que aparece abaixo do título)</label><textarea class="fina" id="fina" rows="2">${esc(p.fina)}</textarea>
<div class="barra" id="barra"><button type="button" data-c="bold"><b>N</b></button><button type="button" data-c="italic"><i>I</i></button><button type="button" data-b="h2">Título</button><button type="button" data-b="h3">Subtítulo</button><button type="button" data-b="p">Parágrafo</button><button type="button" data-c="insertUnorderedList">• Lista</button><button type="button" data-c="insertOrderedList">1. Lista</button><button type="button" data-b="blockquote">Citação</button><button type="button" id="blink">Link</button><button type="button" id="bfoto">Foto</button><button type="button" id="bvideo">Vídeo YouTube</button><button type="button" id="bcodigo">Código (Instagram, X…)</button><button type="button" data-c="removeFormat">Limpar</button><button type="button" data-c="undo">↶</button><button type="button" data-c="redo">↷</button></div>
<div id="ed" contenteditable="true">${p.conteudo || '<p><br></p>'}</div><input type="file" id="arq" accept="image/*" hidden></div>
<div><div class="caixa"><b>Publicação</b><label>Situação</label><select id="status"><option value="rascunho"${p.status === 'rascunho' ? ' selected' : ''}>Rascunho</option>${pode ? `<option value="publicado"${p.status !== 'rascunho' ? ' selected' : ''}>Publicada</option>` : ''}</select><label>Data e hora (futuro = agenda)</label><input type="datetime-local" id="data" value="${dtLocal}"><label>Editoria</label><select id="categoria">${cats.map(c => `<option value="${esc(c.slug)}"${c.slug === p.categoria ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select><label>Autor</label><input id="autor" value="${esc(p.autor)}"><p style="margin-top:14px"><button class="bt" id="salvar" type="button">Salvar</button> ${p.id && p.status !== 'rascunho' ? `<a class="bt sec" id="ver" target="_blank" href="/materia/${esc(p.slug)}/">Ver no site</a>` : ''}</p>${p.id ? '<p><button class="bt verm" id="excluir" type="button">Excluir matéria</button></p>' : ''}<p id="info" style="font-size:13px;color:#666"></p></div>
<div class="caixa dest"><b>Foto de destaque</b><img id="dimg" src="${esc(p.destaque.url)}" ${p.destaque.url ? '' : 'hidden'}><p><button class="bt sec" id="bdest" type="button">Escolher foto</button> <button class="bt sec" id="bdestx" type="button">Tirar</button></p><label>Descrição da foto (para quem não enxerga e para o Google)</label><input id="dalt" value="${esc(p.destaque.alt)}"><label>Legenda / crédito</label><input id="dleg" value="${esc(p.destaque.legenda)}"><p style="font-size:13px;color:#666">Use foto real, sem texto escrito nela.</p></div></div></div></div><div id="aviso"></div>
<script>
var ID=${p.id},DEST=${JSON.stringify(p.destaque)};
var $=function(i){return document.getElementById(i)},ed=$('ed'),aviso=function(t){var a=$('aviso');a.textContent=t;a.className='on';setTimeout(function(){a.className=''},2500)};
document.querySelectorAll('#barra [data-c]').forEach(function(b){b.onmousedown=function(e){e.preventDefault();document.execCommand(b.dataset.c,false,null)}});
document.querySelectorAll('#barra [data-b]').forEach(function(b){b.onmousedown=function(e){e.preventDefault();document.execCommand('formatBlock',false,b.dataset.b)}});
$('blink').onmousedown=function(e){e.preventDefault();var u=prompt('Cole o endereço do link (https://...)');if(u)document.execCommand('createLink',false,u)};
$('bvideo').onmousedown=function(e){e.preventDefault();var u=prompt('Cole o endereço do vídeo do YouTube');if(!u)return;var m=u.match(/(?:v=|youtu\\.be\\/|embed\\/|shorts\\/)([\\w-]{11})/);if(!m){aviso('Endereço do YouTube não reconhecido');return}document.execCommand('insertHTML',false,'<p><iframe src="https://www.youtube.com/embed/'+m[1]+'" width="560" height="315" style="max-width:100%" frameborder="0" allowfullscreen loading="lazy"></iframe></p><p><br></p>')};
$('bcodigo').onmousedown=function(e){e.preventDefault();var c=prompt('Cole aqui o código de incorporação (embed) da rede social');if(c)document.execCommand('insertHTML',false,'<div>'+c+'</div><p><br></p>')};
var alvo='texto';
function escolher(a){alvo=a;$('arq').value='';$('arq').click()}
$('bfoto').onmousedown=function(e){e.preventDefault();var s=window.getSelection();window._sel=s.rangeCount?s.getRangeAt(0):null;escolher('texto')};
$('bdest').onclick=function(){escolher('destaque')};
$('bdestx').onclick=function(){DEST={url:'',alt:'',legenda:'',w:0,h:0};$('dimg').hidden=true};
$('arq').onchange=function(){var f=this.files[0];if(!f)return;aviso('Enviando foto…');fetch('/redacao/api/upload?nome='+encodeURIComponent(f.name),{method:'POST',body:f}).then(function(r){return r.json()}).then(function(j){if(!j.ok){aviso(j.msg||'Erro ao enviar');return}
 if(alvo==='destaque'){DEST.url=j.url;DEST.w=j.w;DEST.h=j.h;$('dimg').src=j.url;$('dimg').hidden=false;aviso('Foto de destaque pronta')}
 else{ed.focus();if(window._sel){var s=window.getSelection();s.removeAllRanges();s.addRange(window._sel)}var leg=prompt('Legenda da foto (opcional)')||'';document.execCommand('insertHTML',false,'<figure><img src="'+j.url+'" width="'+j.w+'" height="'+j.h+'" alt="'+leg.replace(/"/g,'')+'" loading="lazy">'+(leg?'<figcaption>'+leg.replace(/</g,'')+'</figcaption>':'')+'</figure><p><br></p>');aviso('Foto inserida')}
}).catch(function(){aviso('Erro ao enviar a foto')})};
ed.addEventListener('paste',function(e){var h=(e.clipboardData||window.clipboardData).getData('text/html');if(!h)return;e.preventDefault();var d=document.createElement('div');d.innerHTML=h;d.querySelectorAll('script,style,meta,link,iframe,object').forEach(function(n){n.remove()});
 d.querySelectorAll('*').forEach(function(n){var t=n.tagName.toLowerCase();if(!/^(p|br|strong|b|em|i|a|h2|h3|ul|ol|li|blockquote|img|figure|figcaption)$/.test(t)){if(/^(h1|h4|h5|h6)$/.test(t)){var h2=document.createElement('h2');h2.innerHTML=n.innerHTML;n.replaceWith(h2)}else if(/^(div|span|font|section|article)$/.test(t)){n.replaceWith.apply(n,[].slice.call(n.childNodes))}else{n.replaceWith.apply(n,[].slice.call(n.childNodes))}return}
 [].slice.call(n.attributes).forEach(function(a){if(!(t==='a'&&a.name==='href')&&!(t==='img'&&/^(src|alt|width|height)$/.test(a.name)))n.removeAttribute(a.name)})});
 document.execCommand('insertHTML',false,d.innerHTML)});
function dados(){return{id:ID,titulo:$('titulo').value.trim(),fina:$('fina').value.trim(),conteudo:ed.innerHTML,categoria:$('categoria').value,autor:$('autor').value.trim(),status:$('status').value,data:$('data').value,destaque:{url:DEST.url,w:DEST.w,h:DEST.h,alt:$('dalt').value.trim(),legenda:$('dleg').value.trim()}}}
var salvando=false;
function salvar(auto){if(salvando)return;var d=dados();if(!d.titulo){if(!auto)aviso('Escreva o título antes de salvar');return}salvando=true;
 fetch('/redacao/api/salvar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json()}).then(function(j){salvando=false;if(!j.ok){aviso(j.msg||'Erro ao salvar');return}
 var novo=!ID;ID=j.id;$('info').textContent=(auto?'Salvo automaticamente':'Salvo')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});if(!auto)aviso('Salvo!');if(novo)history.replaceState(null,'','/redacao/editar/'+ID)}).catch(function(){salvando=false;aviso('Sem conexão. Tente salvar de novo.')})}
$('salvar').onclick=function(){salvar(false)};
setInterval(function(){if(ID)salvar(true)},45000);
var ex=$('excluir');if(ex)ex.onclick=function(){if(confirm('Excluir esta matéria de vez?'))fetch('/redacao/api/excluir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:ID})}).then(function(){location='/redacao'})};
window.onbeforeunload=null;
</script></body></html>`;
  }

  function paginaCategorias(u, msg) {
    const cats = categorias();
    return casca('Editorias', u, `<div class="caixa"><table><tr><th>Nome</th><th>Endereço</th><th></th></tr>${cats.map(c => `<tr><td>${esc(c.name)}</td><td>/editoria/${esc(c.slug)}/</td><td><form method="post" action="/redacao/categorias/apagar" onsubmit="return confirm('Apagar esta editoria?')"><input type="hidden" name="id" value="${c.id}"><button class="bt sec">Apagar</button></form></td></tr>`).join('')}</table></div><div class="caixa"><b>Nova editoria</b><form method="post" action="/redacao/categorias/nova"><label>Nome</label><input name="nome" required><p><button class="bt">Criar editoria</button></p></form></div>`, msg);
  }
  function paginaUsuarios(u, msg) {
    const us = usuarios();
    return casca('Usuários', u, `<div class="caixa"><table><tr><th>Nome</th><th>Usuário</th><th></th></tr>${us.map(x => `<tr><td>${esc(x.nome)}</td><td>${esc(x.usuario)}</td><td><form method="post" action="/redacao/usuarios/senha" style="display:flex;gap:6px;flex-wrap:wrap"><input type="hidden" name="id" value="${x.id}"><input name="senha" type="password" placeholder="nova senha" style="width:160px"><button class="bt sec">Trocar senha</button></form>${x.id !== u.id ? `<form method="post" action="/redacao/usuarios/apagar" onsubmit="return confirm('Apagar este usuário?')" style="margin-top:6px"><input type="hidden" name="id" value="${x.id}"><button class="bt sec">Apagar</button></form>` : ''}</td></tr>`).join('')}</table></div><div class="caixa" style="max-width:480px"><b>Novo usuário</b><p style="font-size:14px;color:#555;margin:4px 0">Todos os usuários escrevem, editam e publicam.</p><form method="post" action="/redacao/usuarios/novo"><label>Nome</label><input name="nome" required><label>Usuário (para entrar)</label><input name="usuario" required><label>Senha (8 letras ou mais)</label><input name="senha" type="password" required minlength="8"><p><button class="bt">Criar usuário</button></p></form></div>`, msg);
  }

  /* ---------- rotas ---------- */
  const redir = (res, para, cookies) => { const h = { Location: para, 'Cache-Control': 'no-store' }; if (cookies) h['Set-Cookie'] = cookies; res.writeHead(302, h); res.end(); };
  const form = async req => Object.fromEntries(new URLSearchParams((await corpoBruto(req, 20000)).toString()));
  const ipDe = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  return async function tratar(req, res, rota, u) {
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
      let data = d.data ? new Date(new Date(d.data + ':00-03:00')).toISOString() : (antigo && antigo.data) || '';
      if (status === 'publicado' && !data) data = agora;
      const id = antigo ? antigo.id : proximoId(), titulo = String(d.titulo || '').trim().slice(0, 200);
      if (!titulo) return json(res, 400, { ok: false, msg: 'Escreva o título.' });
      const slug = antigo && antigo.slug ? antigo.slug : slugLivre(slugar(titulo), id);
      const dst = d.destaque || {};
      const p = { id, slug, titulo, fina: String(d.fina || '').trim().slice(0, 400), conteudo: limpaHtml(d.conteudo), categoria: d.categoria, autor: String(d.autor || usr.nome).trim().slice(0, 80), status, data, criado: antigo ? antigo.criado : agora, modificado: agora, destaque: { url: /^\/midia\/[\w\/.-]+$|^https:\/\//.test(dst.url || '') ? dst.url : '', alt: String(dst.alt || '').slice(0, 200), legenda: String(dst.legenda || '').slice(0, 300), w: +dst.w || 0, h: +dst.h || 0 }, editor: usr.usuario };
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
    if (rota === '/redacao/usuarios/apagar' && req.method === 'POST') {
      const f = await form(req); gravar('usuarios.json', usuarios().filter(x => x.id !== +f.id || x.id === usr.id)); return html(res, 200, paginaUsuarios(usr, 'Usuário apagado.'));
    }
    return json(res, 404, { ok: false });
  };
};
