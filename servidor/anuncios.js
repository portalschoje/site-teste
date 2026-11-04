'use strict';
// SC Hoje — painel de publicidade próprio (substitui o painel "Publicidade" do WordPress).
// Os anúncios ficam em dados/anuncios.json; o gerador do site lê esse arquivo a cada atualização.
const fs = require('fs'), path = require('path');

module.exports = function (ctx, api) {
  const { DADOS, ler, gravar, esc, html } = ctx;
  const ESPACOS = [
    ['Billboard (topo)', [['pub-topo', 'Billboard Topo — todas as páginas', '970x250'], ['pub-topo-home', 'Billboard Topo — só Home', '970x250'], ['pub-topo-categoria', 'Billboard Topo — só Categorias', '970x250'], ['pub-topo-post', 'Billboard Topo — só Matérias', '970x250']]],
    ['Entre as seções da Home', [['pub-capa-meio', 'Entre-Seções 01', '970x250'], ['pub-capa-2', 'Entre-Seções 02', '970x250'], ['pub-capa-3', 'Entre-Seções 03', '970x250']]],
    ['Coluna lateral da Home', [['pub-lateral-home', 'Home — ao lado dos destaques', '300x100'], ['pub-capa-bloco-1', 'Sidebar Balneário Camboriú', '300x600'], ['pub-capa-bloco-2', 'Sidebar Polícia', '300x250'], ['pub-lateral-home-2', 'Sidebar Política', '300x250'], ['pub-capa-bloco-4', 'Sidebar Cotidiano', '300x600'], ['pub-capa-lista', 'Sidebar Últimas', '300x600']]],
    ['Páginas de categoria', [['pub-lateral-categoria', 'Lateral Categoria 1', '300x600'], ['pub-lateral-categoria-2', 'Lateral Categoria 2', '300x250']]],
    ['Matérias', [['pub-lateral-post', 'Lateral Post 1', '300x600'], ['pub-lateral-post-2', 'Lateral Post 2', '300x250'], ['pub-materia', 'Banner no texto 1', '300x250 ou 728x90'], ['pub-materia-3', 'Banner no texto 2', '300x250 ou 728x90'], ['pub-materia-2', 'Banner fim da matéria', '300x250 ou 728x90']]],
    ['Outros', [['pub-rodape-fixo', 'Rodapé fixo (celular)', '320x50'], ['pub-selo', 'Selo de Oferecimento (por editoria)', 'logo pequena'], ['pub-patrocinio', 'Patrocínio de Editoria (por editoria)', 'logo']]]
  ];
  const NOMES = Object.fromEntries(ESPACOS.flatMap(g => g[1].map(e => [e[0], e[1]])));
  const lista = () => ler('anuncios.json', []);
  const salva = l => gravar('anuncios.json', l);
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const contagem = () => ler('pub-contagem.json', {});
  const situacao = a => a.ativo === false ? 'Pausado' : (a.inicio && a.inicio > hoje()) ? 'Agendado' : (a.fim && a.fim < hoje()) ? 'Encerrado' : 'No ar';
  const dataBr = d => d ? d.split('-').reverse().join('/') : '—';
  const form = req => new Promise((ok, no) => { const p = []; let n = 0; req.on('data', d => { n += d.length; if (n > 300000) { req.destroy(); no(new Error('grande')); } else p.push(d); }); req.on('end', () => ok(Object.fromEntries(new URLSearchParams(Buffer.concat(p).toString())))); req.on('error', no); });
  const redir = (res, para) => { res.writeHead(302, { Location: para, 'Cache-Control': 'no-store' }); res.end(); };
  const srcOk = s => /^\/midia\/[\w\/.-]+$|^https:\/\/[^\s"'<>]+$/.test(s || '') ? s : '';

  function pagina(usr, msg, ed) {
    const cats = api.categorias(), c = contagem(), a = ed || { ativo: true, tipo: 'imagem', espaco: 'pub-topo' };
    const opts = ESPACOS.map(g => `<optgroup label="${esc(g[0])}">${g[1].map(e => `<option value="${e[0]}"${a.espaco === e[0] ? ' selected' : ''}>${esc(e[1])} (${e[2]})</option>`).join('')}</optgroup>`).join('');
    const linhas = lista().slice().sort((x, y) => y.id - x.id).map(x => `<tr><td><b>${esc(x.nome)}</b><br><span class="cap">${x.tipo === 'codigo' ? 'Código' : 'Imagem'}${x.link ? ' · ' + esc(x.link.slice(0, 50)) : ''}</span></td><td>${esc(NOMES[x.espaco] || x.espaco)}${x.editoria ? '<br><span class="cap">' + esc((cats.find(k => k.id === +x.editoria) || { name: '' }).name) + '</span>' : ''}</td><td>${dataBr(x.inicio)} a ${dataBr(x.fim)}</td><td><b>${situacao(x)}</b></td><td>${(c[x.id] && c[x.id].total) || 0}</td><td style="white-space:nowrap"><a class="bt peq" href="/redacao/anuncios?editar=${x.id}">Editar</a> <form method="post" action="/redacao/anuncios/pausa" style="display:inline"><input type="hidden" name="id" value="${x.id}"><button class="bt peq">${x.ativo === false ? 'Reativar' : 'Pausar'}</button></form> <form method="post" action="/redacao/anuncios/apaga" style="display:inline" onsubmit="return confirm('Apagar este anúncio?')"><input type="hidden" name="id" value="${x.id}"><button class="bt peq">Apagar</button></form></td></tr>`).join('') || '<tr><td colspan="6">Nenhum anúncio cadastrado. Cadastre o primeiro ao lado.</td></tr>';
    const prev = (n, s) => s ? `<img src="${esc(s)}" style="max-width:100%;max-height:90px;border:1px solid #ccc;margin-top:6px;display:block">` : '';
    const corpo = `<h1 class="wp">Publicidade</h1>
<div style="display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:24px;align-items:start" class="cg">
<div class="pb"><h2>${ed ? 'Editar anúncio' : 'Inserir anúncio'}</h2><div class="in"><form method="post" action="/redacao/anuncios/salvar" id="fa">
<input type="hidden" name="id" value="${a.id || ''}">
<label style="margin-top:0">Cliente / campanha</label><input name="nome" required value="${esc(a.nome || '')}" placeholder="Ex.: ALESC — Billboard">
<label>Espaço</label><select name="espaco" id="esp">${opts}</select>
<div id="boxed" style="display:none"><label>Editoria</label><select name="editoria">${cats.map(k => `<option value="${k.id}"${+a.editoria === k.id ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div>
<label>Tipo</label><select name="tipo" id="tp"><option value="imagem"${a.tipo !== 'codigo' ? ' selected' : ''}>Imagem da minha mídia (JPG, PNG, WebP, GIF)</option><option value="codigo"${a.tipo === 'codigo' ? ' selected' : ''}>Código (AdSense ou banner de outro serviço)</option></select>
<div id="bimg"><label>Imagem</label><input type="file" id="fimg" accept="image/*"><input type="hidden" name="img_src" value="${esc(a.img ? a.img.src : '')}"><input type="hidden" name="img_w" value="${a.img ? a.img.w : ''}"><input type="hidden" name="img_h" value="${a.img ? a.img.h : ''}"><div id="pimg">${prev('', a.img && a.img.src)}</div>
<label>Imagem para celular (opcional)</label><input type="file" id="fcel" accept="image/*"><input type="hidden" name="cel_src" value="${esc(a.img_cel ? a.img_cel.src : '')}"><input type="hidden" name="cel_w" value="${a.img_cel ? a.img_cel.w : ''}"><input type="hidden" name="cel_h" value="${a.img_cel ? a.img_cel.h : ''}"><div id="pcel">${prev('', a.img_cel && a.img_cel.src)}</div>
<label>Link de destino</label><input name="link" value="${esc(a.link || '')}" placeholder="https://..."></div>
<div id="bcod" style="display:none"><label>Código do anúncio</label><textarea name="codigo" rows="7" placeholder="Cole aqui o código completo">${esc(a.codigo || '')}</textarea></div>
<label>Início</label><input type="date" name="inicio" value="${esc(a.inicio || '')}"><label>Fim</label><input type="date" name="fim" value="${esc(a.fim || '')}">
<p class="cap">Sem datas, o anúncio fica no ar até você pausar ou apagar.</p>
<label><input type="checkbox" name="ativo" style="width:auto" ${a.ativo === false ? '' : 'checked'}> Ativo</label>
<p><button class="bt pri" id="bs">${ed ? 'Atualizar' : 'Salvar anúncio'}</button> ${ed ? '<a class="bt" href="/redacao/anuncios">Cancelar</a>' : ''}</p></form></div></div>
<div><p class="sub-l">O site é atualizado sozinho a cada 5 minutos. Espaço vazio não mostra nada. Se houver mais de um anúncio no mesmo espaço, eles se revezam.</p><table class="w"><tr><th>Anúncio</th><th>Espaço</th><th>Período</th><th>Situação</th><th>Exibições</th><th></th></tr>${linhas}</table></div></div>
<style>@media(max-width:900px){.cg{grid-template-columns:1fr!important}}</style>
<script>
(function(){var f=document.getElementById('fa'),esp=document.getElementById('esp'),tp=document.getElementById('tp');
function ver(){document.getElementById('boxed').style.display=/^pub-(selo|patrocinio)$/.test(esp.value)?'block':'none';var c=tp.value==='codigo';document.getElementById('bcod').style.display=c?'block':'none';document.getElementById('bimg').style.display=c?'none':'block'}
esp.onchange=tp.onchange=ver;ver();
function envia(inp,pre,prev){inp.onchange=function(){var fl=inp.files[0];if(!fl)return;var bs=document.getElementById('bs');bs.disabled=true;prev.textContent='Enviando...';
fetch('/redacao/api/upload?nome='+encodeURIComponent(fl.name),{method:'POST',body:fl}).then(function(r){return r.json()}).then(function(j){bs.disabled=false;if(!j.ok){prev.textContent=j.msg||'Erro';return}
f[pre+'_src'].value=j.url;f[pre+'_w'].value=j.w;f[pre+'_h'].value=j.h;prev.innerHTML='<img src="'+j.url+'" style="max-width:100%;max-height:90px;border:1px solid #ccc;display:block;margin-top:6px"> '+j.w+'x'+j.h}).catch(function(){bs.disabled=false;prev.textContent='Erro ao enviar'})}}
envia(document.getElementById('fimg'),'img',document.getElementById('pimg'));envia(document.getElementById('fcel'),'cel',document.getElementById('pcel'));
})();
</script>`;
    return api.casca('Publicidade', usr, corpo, msg, 'ads');
  }

  async function tratar(req, res, rota, u, usr) {
    if (req.method === 'GET') { const id = +u.searchParams.get('editar'); return html(res, 200, pagina(usr, '', id ? lista().find(x => x.id === id) : null)); }
    const f = await form(req), l = lista();
    if (rota.endsWith('/salvar')) {
      const tipo = f.tipo === 'codigo' ? 'codigo' : 'imagem', nome = String(f.nome || '').trim().slice(0, 120);
      const dt = s => /^\d{4}-\d\d-\d\d$/.test(s || '') ? s : '';
      if (!nome || !NOMES[f.espaco]) return html(res, 200, pagina(usr, 'Erro: preencha o nome e escolha o espaço.', null));
      const img = srcOk(f.img_src) ? { src: f.img_src, w: +f.img_w || 0, h: +f.img_h || 0 } : null, cel = srcOk(f.cel_src) ? { src: f.cel_src, w: +f.cel_w || 0, h: +f.cel_h || 0 } : null;
      if (tipo === 'imagem' && !img) return html(res, 200, pagina(usr, 'Erro: envie a imagem do anúncio.', null));
      if (tipo === 'codigo' && !String(f.codigo || '').trim()) return html(res, 200, pagina(usr, 'Erro: cole o código do anúncio.', null));
      const link = /^https?:\/\//.test(f.link || '') ? f.link.trim() : '';
      const a = { id: +f.id || Math.max(0, ...l.map(x => x.id)) + 1, nome, espaco: f.espaco, onde: 'todas', tipo, img: tipo === 'imagem' ? img : null, img_cel: tipo === 'imagem' ? cel : null, link: tipo === 'imagem' ? link : '', codigo: tipo === 'codigo' ? String(f.codigo).trim() : '', editoria: /^pub-(selo|patrocinio)$/.test(f.espaco) ? +f.editoria || 0 : 0, inicio: dt(f.inicio), fim: dt(f.fim), ativo: !!f.ativo };
      const i = l.findIndex(x => x.id === a.id); if (i >= 0) l[i] = a; else l.push(a);
      salva(l); return html(res, 200, pagina(usr, 'Anúncio salvo. Ele entra no site na próxima atualização (até 5 minutos).', null));
    }
    if (rota.endsWith('/pausa')) { const x = l.find(y => y.id === +f.id); if (x) x.ativo = x.ativo === false; salva(l); return redir(res, '/redacao/anuncios'); }
    if (rota.endsWith('/apaga')) { salva(l.filter(y => y.id !== +f.id)); return redir(res, '/redacao/anuncios'); }
    return redir(res, '/redacao/anuncios');
  }

  /* contagem de exibições (o site manda os números dos anúncios que apareceram na tela) */
  let pend = {}, timer = null;
  function conta(ids) {
    const validos = new Set(lista().map(a => String(a.id)));
    for (const id of ids.split(',').slice(0, 20)) if (validos.has(id)) pend[id] = (pend[id] || 0) + 1;
    if (!timer) timer = setTimeout(() => { timer = null; const c = contagem(), d = hoje(); for (const [id, n] of Object.entries(pend)) { const o = c[id] || (c[id] = { total: 0, dias: {} }); o.total += n; o.dias[d] = (o.dias[d] || 0) + n; } pend = {}; gravar('pub-contagem.json', c); }, 20000);
  }
  return { tratar, conta };
};
