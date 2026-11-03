// Gera o site estático a partir da API do WordPress do SC Hoje. Sem dependências (Node 18+).
// Uso: node gerar.js   (variáveis: API, OUT, SITE)
const fs=require('fs'),path=require('path');
const API=process.env.API||'https://schoje.news/wp-json/wp/v2';
const OUT=process.env.OUT||'/var/www/teste';
const SITE=process.env.SITE||'https://schoje.online';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const txt=h=>String(h||'').replace(/<[^>]*>/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/&#8217;|&rsquo;/g,'’').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g,'"').replace(/&#038;|&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&hellip;|&#8230;/g,'…').replace(/\s+/g,' ').trim();
const get=async u=>{const r=await fetch(u,{headers:{'user-agent':'schoje-teste/1'}});if(!r.ok)throw new Error(r.status+' '+u);return r.json()};
const dataBR=d=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d)).replace(',',' às');
const F='id,slug,date,link,title,excerpt,content,categories,_links,_embedded';
const img=p=>{const m=p._embedded?.['wp:featuredmedia']?.[0];if(!m||!m.source_url)return null;const z=m.media_details?.sizes||{};return{url:(z.large||z.medium_large||{}).source_url||m.source_url,alt:m.alt_text||txt(p.title?.rendered)}};
const limpa=h=>String(h||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/\son\w+="[^"]*"/gi,'').replace(/<img([^>]*?)>/gi,(m,a)=>/loading=/.test(a)?m:`<img${a} loading="lazy">`);
const wr=(f,c)=>{const p=path.join(OUT,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,c)};

(async()=>{
 const cats=(await get(`${API}/categories?per_page=100&hide_empty=true&_fields=id,name,slug,count,parent`)).filter(c=>c.slug!=='uncategorized'&&c.slug!=='sem-categoria'&&c.count>0).sort((a,b)=>b.count-a.count);
 const porId=new Map(cats.map(c=>[c.id,c]));
 const posts=await get(`${API}/posts?per_page=60&_embed=wp:featuredmedia,wp:term,author&_fields=${F}`);
 const info=p=>({p,slug:p.slug,tit:txt(p.title?.rendered),res:txt(p.excerpt?.rendered),im:img(p),cat:(p.categories||[]).map(i=>porId.get(i)).find(Boolean),data:p.date});
 const L=posts.map(info);
 const menuCats=cats.filter(c=>!c.parent).slice(0,8);
 const url=x=>`/materia/${x.slug}/`;
 const foto=(x,eager)=>x.im?`<div class="foto"><img src="${esc(x.im.url)}" alt="${esc(x.im.alt)}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async"></div>`:'<div class="foto"></div>';
 const cartao=(x,cls='')=>`<article class="cartao ${cls}"><a href="${url(x)}" class="foto-l">${foto(x)}</a><div><span class="chapeu">${esc(x.cat?.name||'')}</span><h3 class="titulo"><a href="${url(x)}">${esc(x.tit)}</a></h3><span class="data">${dataBR(x.data)}</span></div></article>`;
 const cabeca=(titulo,desc,canon,extra='')=>`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(titulo)}</title><meta name="description" content="${esc(desc)}">${canon?`<link rel="canonical" href="${esc(canon)}">`:''}<link rel="icon" href="/estatico/img/sc-favicon-v2.ico"><link rel="apple-touch-icon" href="/estatico/img/sc-icone-180-v2.png"><link rel="preload" href="/estatico/fontes/merriweather-900.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/estatico/estilo.css">${extra}</head><body>`;
 const topo=`<div class="faixa-teste">SITE DE TESTE — não indexado</div><header class="topo"><div class="c"><a href="/"><img src="/estatico/img/logo-escuro-420.webp" width="150" height="40" alt="SC Hoje"></a></div></header><nav class="menu" aria-label="Editorias"><ul>${menuCats.map(c=>`<li><a href="/editoria/${esc(c.slug)}/">${esc(c.name)}</a></li>`).join('')}</ul></nav>`;
 const rodape=`<footer class="rodape"><img src="/estatico/img/logo-branco-420.webp" width="130" height="35" alt="SC Hoje"><p>SC Hoje — notícias de Balneário Camboriú</p><p>Versão de teste mobile first</p></footer></body></html>`;

 // HOME
 const usados=new Set();const pega=n=>{const r=L.filter(x=>!usados.has(x.slug)).slice(0,n);r.forEach(x=>usados.add(x.slug));return r};
 const [m]=pega(1);const lat=pega(3);
 let h=cabeca('SC Hoje — teste','Notícias de Balneário Camboriú',null)+topo+'<main class="c">';
 if(m)h+=`<section class="capa"><a class="manchete" href="${url(m)}">${foto(m,true)}<div class="txt"><span class="chapeu">${esc(m.cat?.name||'')}</span><h1 class="titulo">${esc(m.tit)}</h1><p>${esc(m.res)}</p></div></a><div class="lateral">${lat.map(x=>cartao(x)).join('')}</div></section>`;
 for(const c of menuCats.slice(0,4)){const its=L.filter(x=>x.cat&&(x.cat.id===c.id||x.cat.parent===c.id)&&!usados.has(x.slug)).slice(0,4);if(its.length<2)continue;its.forEach(x=>usados.add(x.slug));
  h+=`<section class="editoria"><div class="editoria__barra"><h2>${esc(c.name)}</h2><a href="/editoria/${esc(c.slug)}/">Ver todas</a></div><div class="grade">${its.map(x=>cartao(x,'vert')).join('')}</div></section>`}
 const resto=L.filter(x=>!usados.has(x.slug)).slice(0,15);
 h+=`<section class="mais lista"><h2>Últimas notícias</h2>${resto.map(x=>cartao(x)).join('')}</section></main>`+rodape;
 wr('index.html',h);

 // MATÉRIAS
 for(const x of L){const p=x.p;const rel=L.filter(y=>y.slug!==x.slug&&x.cat&&y.cat&&y.cat.id===x.cat.id).slice(0,4);const autor=p._embedded?.author?.[0]?.name;
  let t=cabeca(x.tit+' — SC Hoje',x.res.slice(0,160),p.link,`<meta property="og:title" content="${esc(x.tit)}">${x.im?`<meta property="og:image" content="${esc(x.im.url)}">`:''}`)+topo+`<main><article class="materia"><span class="chapeu">${esc(x.cat?.name||'')}</span><h1>${esc(x.tit)}</h1>${x.res?`<p class="linha-fina">${esc(x.res)}</p>`:''}<p class="meta">${autor?esc(autor)+' · ':''}${dataBR(x.data)}</p>${x.im?`<div class="capa"><img src="${esc(x.im.url)}" alt="${esc(x.im.alt)}" fetchpriority="high"></div>`:''}<div class="texto">${limpa(p.content?.rendered)}</div></article>${rel.length?`<section class="c mais lista"><h2>Leia também</h2>${rel.map(y=>cartao(y)).join('')}</section>`:''}</main>`+rodape;
  wr(`materia/${x.slug}/index.html`,t)}

 // EDITORIAS
 for(const c of menuCats){let its=[];try{its=(await get(`${API}/posts?categories=${c.id}&per_page=30&_embed=wp:featuredmedia,wp:term&_fields=${F}`)).map(info)}catch(e){console.error('editoria',c.slug,e.message)}
  const t=cabeca(c.name+' — SC Hoje','Notícias de '+c.name,null)+topo+`<main class="c lista"><h1 class="titulo-pag">${esc(c.name)}</h1>${its.map(x=>cartao(x)).join('')||'<p>Sem notícias.</p>'}</main>`+rodape;
  wr(`editoria/${c.slug}/index.html`,t)}

 wr('robots.txt','User-agent: *\nDisallow: /\n');
 fs.cpSync(path.join(__dirname,'estatico'),path.join(OUT,'estatico'),{recursive:true});
 console.log('ok',L.length,'matérias,',menuCats.length,'editorias');
})().catch(e=>{console.error('ERRO',e.message);process.exit(1)});
