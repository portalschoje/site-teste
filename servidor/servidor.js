'use strict';
// SC Hoje — servidor próprio de web push e newsletter (sem WordPress). Node 18+.
// Guarda os inscritos em arquivos na pasta "dados". O envio de e-mail passa pelo Brevo.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFile } = require('child_process');

/* ---------- configuração (arquivo .env) ---------- */
const ENV = {};
try { for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (e) {}
const C = k => process.env[k] ?? ENV[k] ?? '';
const PORTA = +C('PORTA') || 3100;
const SITE_URL = (C('SITE_URL') || 'https://schoje.online').replace(/\/$/, '');
const SITE_DIR = C('SITE_DIR') || '/var/www/teste';
const BREVO_URL = C('BREVO_URL') || 'https://api.brevo.com/v3/smtp/email';
const NOME = 'SC Hoje';
const DADOS = C('DADOS_DIR') || path.join(__dirname, 'dados');
fs.mkdirSync(DADOS, { recursive: true });

let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.log('AVISO: web-push não instalado; o push fica desligado.'); }

/* ---------- arquivos de dados ---------- */
const ler = (n, pad) => { try { return JSON.parse(fs.readFileSync(path.join(DADOS, n), 'utf8')); } catch (e) { return pad; } };
const gravar = (n, o) => { const f = path.join(DADOS, n), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
const estado = () => Object.assign({ pushAuto: true, boletimAuto: false, horaBoletim: 7, ultimoBoletim: '' }, ler('estado.json', {}));
const salvaEstado = e => gravar('estado.json', e);

let vapid = ler('vapid.json', null);
if (webpush && !vapid) { vapid = webpush.generateVAPIDKeys(); gravar('vapid.json', vapid); }
if (webpush && vapid) webpush.setVapidDetails('mailto:' + (C('REMETENTE_EMAIL') || 'contato@schoje.news'), vapid.publicKey, vapid.privateKey);

/* ---------- utilidades ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dorme = ms => new Promise(r => setTimeout(r, ms));
const emailOk = e => typeof e === 'string' && e.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const token = () => crypto.randomBytes(18).toString('hex');
const limites = new Map();
const limite = (ip, n = 12) => { const h = Math.floor(Date.now() / 3600000), k = ip + h, v = (limites.get(k) || 0) + 1; limites.set(k, v); if (limites.size > 5000) limites.clear(); return v > n; };
const lerCorpo = req => new Promise((ok, no) => { let b = ''; req.on('data', d => { b += d; if (b.length > 20000) { req.destroy(); no(new Error('grande')); } }); req.on('end', () => ok(b)); req.on('error', no); });
const json = (res, cod, o) => { res.writeHead(cod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const html = (res, cod, h) => { res.writeHead(cod, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }); res.end(h); };
const pagSimples = (titulo, msg) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} — ${NOME}</title></head><body style="margin:0;font-family:system-ui,Arial,sans-serif;background:#f4f6fb"><div style="max-width:520px;margin:12vh auto;background:#fff;border-radius:14px;padding:32px;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.08)"><div style="font:800 26px Arial;color:#0034fc">${NOME}</div><h1 style="font-size:22px">${esc(titulo)}</h1><p style="color:#444;line-height:1.5">${esc(msg)}</p><p><a href="${SITE_URL}/" style="color:#0034fc;font-weight:700">Voltar para o SC Hoje</a></p></div></body></html>`;

/* ---------- e-mail (Brevo) ---------- */
async function enviarEmail(para, assunto, corpo) {
  const chave = C('BREVO_API_KEY'), de = C('REMETENTE_EMAIL');
  if (!chave || !de) throw new Error('Falta a chave do Brevo ou o e-mail remetente (arquivo .env).');
  const r = await fetch(BREVO_URL, { method: 'POST', headers: { 'api-key': chave, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender: { name: C('REMETENTE_NOME') || NOME, email: de }, to: [{ email: para }], subject: assunto, htmlContent: corpo }) });
  if (!r.ok) throw new Error('Brevo respondeu ' + r.status + ': ' + (await r.text()).slice(0, 200));
}
const moldura = (conteudo, sair) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:18px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden"><tr><td style="background:#0034fc;padding:18px 24px"><span style="font:800 26px Arial;color:#fff">SC Hoje</span><span style="color:#cfd9ff;font-size:13px;margin-left:10px">Notícias de Balneário Camboriú</span></td></tr><tr><td style="padding:24px">${conteudo}</td></tr><tr><td style="background:#f0f2f8;padding:16px 24px;font-size:12px;line-height:1.5;color:#666">Você recebe este e-mail porque se inscreveu no Boletim SC Hoje.${sair ? ` <a href="${sair}" style="color:#0034fc">Cancelar inscrição</a>.` : ''}<br>Mauricio Freitas Comunicação Ltda · Rua Arthur Max Doose, 153, sala 1301, Pioneiros – Balneário Camboriú/SC</td></tr></table></td></tr></table></body></html>`;

/* ---------- push ---------- */
async function enviarPush(p) {
  if (!webpush) throw new Error('Push desligado: o pacote web-push não está instalado.');
  const d = ler('push.json', { subs: [] }), carga = JSON.stringify({ titulo: p.titulo, texto: p.texto || '', url: p.url || '/', imagem: p.imagem || '' });
  let ok = 0, falha = 0; const vivos = [];
  for (const s of d.subs) {
    try { await webpush.sendNotification(s, carga, { TTL: 6 * 3600 }); ok++; vivos.push(s); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { falha++; } else { falha++; vivos.push(s); } }
  }
  if (vivos.length !== d.subs.length) gravar('push.json', { subs: vivos });
  return { ok, falha };
}

/* ---------- notícias do site ---------- */
const ultimas = () => { try { return JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'ultimas.json'), 'utf8')).posts || []; } catch (e) { return []; } };
const abs = u => /^https?:/.test(u || '') ? u : (u ? SITE_URL + u : '');

async function verificarNovas() {
  const posts = ultimas(); if (!posts.length) return;
  const primeira = !fs.existsSync(path.join(DADOS, 'vistos.json'));
  const vistos = new Set(ler('vistos.json', []));
  const novas = posts.filter(p => !vistos.has(p.slug));
  if (!novas.length) return;
  for (const p of posts) vistos.add(p.slug);
  gravar('vistos.json', [...vistos].slice(-400));
  if (primeira || !estado().pushAuto) return;
  for (const p of novas.slice(0, 3).reverse()) {
    try { const r = await enviarPush({ titulo: p.titulo, texto: p.resumo, url: p.url, imagem: abs(p.imagem) }); console.log('push automático:', p.slug, r); } catch (e) { console.log('push erro:', e.message); }
    await dorme(1500);
  }
}

function corpoBoletim(posts, sair) {
  const itens = posts.map((p, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;${i ? 'border-top:1px solid #e6e9f2;padding-top:18px' : ''}"><tr><td>${p.imagem ? `<a href="${abs(p.url)}"><img src="${abs(p.imagem)}" alt="" width="552" style="width:100%;max-width:552px;border-radius:8px;display:block"></a>` : ''}<p style="margin:12px 0 4px;font-size:12px;font-weight:700;color:#0034fc;text-transform:uppercase">${esc(p.categoria || '')}</p><a href="${abs(p.url)}" style="font:700 ${i ? 19 : 23}px/1.25 Georgia,serif;color:#111;text-decoration:none">${esc(p.titulo)}</a><p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#444">${esc(p.resumo || '')}</p></td></tr></table>`).join('');
  return moldura(`<h1 style="margin:0 0 18px;font:700 20px Arial;color:#111">Boletim SC Hoje — as notícias do dia</h1>${itens}<p style="text-align:center"><a href="${SITE_URL}/" style="background:#0034fc;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:24px;display:inline-block">Ver todas as notícias</a></p>`, sair);
}
async function enviarBoletim() {
  const posts = ultimas().slice(0, 8); if (!posts.length) throw new Error('Sem notícias para montar o boletim.');
  const d = ler('news.json', { inscritos: [] }), alvo = d.inscritos.filter(i => i.confirmado);
  const assunto = 'Boletim SC Hoje: ' + posts[0].titulo.slice(0, 80);
  let ok = 0, falha = 0, ultimo = '';
  for (const i of alvo) {
    try { await enviarEmail(i.email, assunto, corpoBoletim(posts, `${SITE_URL}/api/news/sair?t=${i.token}`)); ok++; } catch (e) { falha++; ultimo = e.message; if (/ 401| 403/.test(e.message)) break; }
    await dorme(120);
  }
  return { ok, falha, erro: ultimo };
}
const agoraSP = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return { dia: `${p.year}-${p.month}-${p.day}`, hora: +p.hour }; };
async function verificarBoletim() {
  const e = estado(), a = agoraSP();
  if (!e.boletimAuto || a.hora < e.horaBoletim || e.ultimoBoletim === a.dia) return;
  e.ultimoBoletim = a.dia; salvaEstado(e);
  try { console.log('boletim automático:', await enviarBoletim()); } catch (er) { console.log('boletim erro:', er.message); }
}

/* ---------- atualização do site (gera as páginas a cada poucos minutos) ---------- */
let gerando = false;
function gerarSite() {
  if (gerando) return Promise.resolve(); gerando = true;
  return new Promise(ok => execFile(process.execPath, [path.join(__dirname, '..', 'gerar.js')], { timeout: 240000, env: Object.assign({}, process.env, { OUT: SITE_DIR }) }, (er, so, se) => { gerando = false; if (er) console.log('gerar erro:', (se || er.message).slice(0, 200)); ok(); }));
}
async function ciclo() { if (+C('GERAR_CADA_MIN') !== 0) await gerarSite(); await verificarNovas(); await verificarBoletim(); }

/* ---------- painel ---------- */
function autorizado(req) {
  const senha = C('ADMIN_SENHA'); if (!senha) return false;
  const h = req.headers.authorization || ''; if (!h.startsWith('Basic ')) return false;
  const [, p] = Buffer.from(h.slice(6), 'base64').toString().split(/:(.*)/s);
  const a = Buffer.from(p || ''), b = Buffer.from(senha); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function painel(msg) {
  const e = estado(), p = ler('push.json', { subs: [] }).subs.length, n = ler('news.json', { inscritos: [] }).inscritos;
  const conf = n.filter(i => i.confirmado).length, ult = ultimas()[0];
  const bloco = (t, c) => `<section style="background:#fff;border-radius:12px;padding:20px;margin:0 0 16px;box-shadow:0 2px 10px rgba(0,0,0,.06)"><h2 style="margin:0 0 12px;font-size:18px">${t}</h2>${c}</section>`;
  const campo = 'width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccd;border-radius:8px;font:inherit;margin:4px 0 10px';
  const btn = 'background:#0034fc;color:#fff;border:0;border-radius:22px;padding:11px 22px;font:700 15px Arial;cursor:pointer';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Painel — ${NOME}</title></head><body style="margin:0;background:#f4f6fb;font-family:system-ui,Arial,sans-serif;color:#222"><div style="max-width:720px;margin:0 auto;padding:18px"><h1 style="color:#0034fc;margin:6px 0 16px">Painel do ${NOME}</h1>${msg ? `<p style="background:#e8f5e9;border:1px solid #9ccc9f;border-radius:8px;padding:12px">${esc(msg)}</p>` : ''}
${bloco('Números', `<p style="font-size:17px;margin:0"><b>${p}</b> inscritos no push<br><b>${conf}</b> inscritos confirmados na newsletter (${n.length - conf} aguardando confirmação)</p>`)}
${bloco('Automático', `<form method="post" action="/admin/config"><label><input type="checkbox" name="pushAuto" ${e.pushAuto ? 'checked' : ''}> Mandar push sozinho quando entrar matéria nova</label><br><br><label><input type="checkbox" name="boletimAuto" ${e.boletimAuto ? 'checked' : ''}> Mandar o boletim sozinho todo dia, a partir das <input name="horaBoletim" type="number" min="0" max="23" value="${e.horaBoletim}" style="width:60px"> h (horário de Brasília)</label><br><br><button style="${btn}">Salvar</button></form>`)}
${bloco('Mandar um push agora', `<form method="post" action="/admin/push"><label>Título<input name="titulo" required maxlength="90" style="${campo}" value="${esc(ult ? ult.titulo : '')}"></label><label>Texto (opcional)<input name="texto" maxlength="140" style="${campo}"></label><label>Endereço da matéria<input name="url" style="${campo}" value="${esc(ult ? ult.url : '/')}"></label><button style="${btn}">Enviar para todos</button></form>`)}
${bloco('Mandar o boletim agora', `<form method="post" action="/admin/boletim" onsubmit="return confirm('Enviar o boletim para ${conf} inscritos agora?')"><p style="margin:0 0 10px">Usa as 8 últimas notícias do site.</p><button style="${btn}">Enviar para ${conf} inscritos</button></form>`)}
${bloco('Testar e-mail', `<form method="post" action="/admin/teste-email"><label>Seu e-mail<input name="email" type="email" required style="${campo}"></label><button style="${btn}">Mandar um boletim de teste só para mim</button></form>`)}
</div></body></html>`;
}

/* ---------- rotas ---------- */
const ipDe = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), rota = u.pathname, ip = ipDe(req);
  try {
    if (rota === '/api/push/chave' && req.method === 'GET') return json(res, webpush && vapid ? 200 : 503, { chave: vapid ? vapid.publicKey : '' });
    if (rota === '/api/push/inscrever' && req.method === 'POST') {
      if (limite(ip, 30)) return json(res, 429, { ok: false });
      const s = JSON.parse(await lerCorpo(req));
      if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) return json(res, 400, { ok: false });
      const d = ler('push.json', { subs: [] }); if (!d.subs.some(x => x.endpoint === s.endpoint)) { d.subs.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, criado: new Date().toISOString() }); gravar('push.json', d); }
      return json(res, 200, { ok: true });
    }
    if (rota === '/api/push/cancelar' && req.method === 'POST') {
      const s = JSON.parse(await lerCorpo(req)), d = ler('push.json', { subs: [] }); d.subs = d.subs.filter(x => x.endpoint !== s.endpoint); gravar('push.json', d); return json(res, 200, { ok: true });
    }
    if (rota === '/api/news/inscrever' && req.method === 'POST') {
      if (limite(ip, 8)) return json(res, 429, { ok: false, msg: 'Muitas tentativas. Tente mais tarde.' });
      const email = String((JSON.parse(await lerCorpo(req)) || {}).email || '').trim().toLowerCase();
      if (!emailOk(email)) return json(res, 400, { ok: false, msg: 'Digite um e-mail válido.' });
      const d = ler('news.json', { inscritos: [] }); let i = d.inscritos.find(x => x.email === email);
      if (i && i.confirmado) return json(res, 200, { ok: true, msg: 'Este e-mail já está inscrito. Obrigado!' });
      if (!i) { i = { email, token: token(), confirmado: false, criado: new Date().toISOString() }; d.inscritos.push(i); gravar('news.json', d); }
      await enviarEmail(email, 'Confirme sua inscrição no Boletim SC Hoje', moldura(`<h1 style="margin:0 0 12px;font:700 21px Arial">Falta só um clique</h1><p style="font-size:16px;line-height:1.5;color:#333">Confirme seu e-mail para receber o Boletim SC Hoje, com as principais notícias de Balneário Camboriú.</p><p><a href="${SITE_URL}/api/news/confirmar?t=${i.token}" style="background:#0034fc;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:24px;display:inline-block">Confirmar inscrição</a></p><p style="font-size:13px;color:#777">Se não foi você, ignore este e-mail.</p>`, ''));
      return json(res, 200, { ok: true, msg: 'Enviamos um e-mail para você. Clique no botão dele para confirmar a inscrição.' });
    }
    if (rota === '/api/news/confirmar') {
      const d = ler('news.json', { inscritos: [] }), i = d.inscritos.find(x => x.token === u.searchParams.get('t'));
      if (!i) return html(res, 404, pagSimples('Link inválido', 'Este link não é válido ou já foi usado.'));
      i.confirmado = true; i.confirmadoEm = new Date().toISOString(); gravar('news.json', d);
      return html(res, 200, pagSimples('Inscrição confirmada', 'Pronto! Você vai receber o Boletim SC Hoje.'));
    }
    if (rota === '/api/news/sair') {
      const d = ler('news.json', { inscritos: [] }), n = d.inscritos.length; d.inscritos = d.inscritos.filter(x => x.token !== u.searchParams.get('t'));
      if (d.inscritos.length !== n) gravar('news.json', d);
      return html(res, 200, pagSimples('Inscrição cancelada', 'Você não vai mais receber o Boletim SC Hoje.'));
    }
    if (rota === '/admin' || rota.startsWith('/admin/')) {
      if (!autorizado(req)) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Painel SC Hoje"' }); return res.end('Acesso restrito'); }
      if (req.method === 'GET') return html(res, 200, painel(''));
      const f = Object.fromEntries(new URLSearchParams(await lerCorpo(req)));
      if (rota === '/admin/config') { const e = estado(); e.pushAuto = !!f.pushAuto; e.boletimAuto = !!f.boletimAuto; e.horaBoletim = Math.min(23, Math.max(0, +f.horaBoletim || 7)); salvaEstado(e); return html(res, 200, painel('Salvo.')); }
      if (rota === '/admin/push') { try { const r = await enviarPush({ titulo: f.titulo, texto: f.texto, url: f.url }); return html(res, 200, painel(`Push enviado: ${r.ok} entregues, ${r.falha} falhas.`)); } catch (e) { return html(res, 200, painel('Erro: ' + e.message)); } }
      if (rota === '/admin/boletim') { try { const r = await enviarBoletim(); return html(res, 200, painel(`Boletim enviado: ${r.ok} e-mails, ${r.falha} falhas.${r.erro ? ' Último erro: ' + r.erro : ''}`)); } catch (e) { return html(res, 200, painel('Erro: ' + e.message)); } }
      if (rota === '/admin/teste-email') { try { if (!emailOk(f.email)) throw new Error('E-mail inválido.'); await enviarEmail(f.email, '[Teste] Boletim SC Hoje', corpoBoletim(ultimas().slice(0, 8), '')); return html(res, 200, painel('Teste enviado para ' + f.email + '.')); } catch (e) { return html(res, 200, painel('Erro: ' + e.message)); } }
    }
    json(res, 404, { ok: false });
  } catch (e) { console.log('erro', rota, e.message); json(res, 500, { ok: false, msg: 'Não foi possível agora. Tente de novo em instantes.' }); }
}).listen(PORTA, '127.0.0.1', () => console.log('Servidor SC Hoje na porta', PORTA));

setTimeout(ciclo, 8000);
setInterval(ciclo, Math.max(1, +C('GERAR_CADA_MIN') || 5) * 60000);
