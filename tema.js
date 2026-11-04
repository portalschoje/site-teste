/* Tema SC Hoje — menu, busca, topo fixo, notificações, copiar link e contador de leituras. */
(function () {
	'use strict';

	var corpo = document.body;
	var gaveta = document.getElementById('gaveta');
	var fundo = document.querySelector('.gaveta-fundo');
	var botoesMenu = document.querySelectorAll('.js-abrir-gaveta');
	var ultimoBotao = null;

	function abrirGaveta(focarBusca) {
		if (!gaveta) return;
		fundo.hidden = false;
		requestAnimationFrame(function () {
			gaveta.classList.add('aberta');
			fundo.classList.add('aberta');
		});
		gaveta.setAttribute('aria-hidden', 'false');
		botoesMenu.forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
		corpo.classList.add('sem-rolagem');
		var foco = focarBusca ? gaveta.querySelector('input') : gaveta.querySelector('input, a, button');
		if (foco) setTimeout(function () { foco.focus(); }, 50);
	}

	function fecharGaveta() {
		if (!gaveta || !gaveta.classList.contains('aberta')) return;
		gaveta.classList.remove('aberta');
		fundo.classList.remove('aberta');
		gaveta.setAttribute('aria-hidden', 'true');
		botoesMenu.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
		corpo.classList.remove('sem-rolagem');
		setTimeout(function () { fundo.hidden = true; }, 250);
		if (ultimoBotao) ultimoBotao.focus();
	}

	botoesMenu.forEach(function (b) {
		b.addEventListener('click', function () { ultimoBotao = b; abrirGaveta(false); });
	});
	document.querySelectorAll('.js-fechar-gaveta').forEach(function (el) {
		el.addEventListener('click', fecharGaveta);
	});
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') fecharGaveta();
	});

	// Busca: a lupa abre uma tela só com o campo de busca (como no Metrópoles), no computador e no celular.
	var telaBusca = document.getElementById('busca-tela');
	var botaoBusca = null;
	function abrirBusca(btn) {
		if (!telaBusca) return;
		fecharGaveta();
		botaoBusca = btn;
		telaBusca.hidden = false;
		corpo.classList.add('sem-rolagem');
		document.querySelectorAll('.js-abrir-busca').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
		var campo = telaBusca.querySelector('input');
		setTimeout(function () { campo.focus(); campo.select(); }, 30);
	}
	function fecharBusca() {
		if (!telaBusca || telaBusca.hidden) return;
		telaBusca.hidden = true;
		corpo.classList.remove('sem-rolagem');
		document.querySelectorAll('.js-abrir-busca').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
		if (botaoBusca) botaoBusca.focus();
	}
	document.querySelectorAll('.js-abrir-busca').forEach(function (btn) {
		btn.addEventListener('click', function () { abrirBusca(btn); });
	});
	document.querySelectorAll('.js-fechar-busca').forEach(function (b) { b.addEventListener('click', fecharBusca); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharBusca(); });

	// Topo fixo: aparece quando o topo normal sai da tela.
	var topo = document.querySelector('.topo');
	var fixo = document.querySelector('.topo-fixo');
	if (topo && fixo && 'IntersectionObserver' in window) {
		new IntersectionObserver(function (itens) {
			var mostrar = !itens[0].isIntersecting;
			fixo.classList.toggle('visivel', mostrar);
			if (mostrar) { fixo.removeAttribute('inert'); } else { fixo.setAttribute('inert', ''); }
		}).observe(topo);
	}

	// Notificações: abre o aviso do plugin de notificações (Perfecty Push) se ele estiver no site.
	var botoesNotif = document.querySelectorAll('.js-notificacoes');
	function esconderNotif() { botoesNotif.forEach(function (b) { b.hidden = true; }); }
	if (!('Notification' in window) || Notification.permission === 'granted') {
		esconderNotif();
	}
	botoesNotif.forEach(function (btn) {
		btn.addEventListener('click', function () {
			var dialogo = document.getElementById('perfecty-push-dialog-container');
			var sino = document.getElementById('perfecty-push-settings-open');
			if (dialogo) {
				dialogo.style.display = 'block';
				dialogo.classList.add('show');
			} else if (sino) {
				sino.click();
			} else if ('Notification' in window) {
				Notification.requestPermission().then(function (p) { if (p === 'granted') esconderNotif(); });
			}
		});
	});

	// "Carregar mais notícias": traz a página seguinte e junta na lista, sem recarregar.
	document.querySelectorAll('.js-carregar-mais').forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			var lista = document.querySelector('.js-lista');
			if (!lista || !window.fetch || !window.DOMParser) return; // sem isso, o link abre a página 2 normalmente
			e.preventDefault();
			if (btn.classList.contains('carregando')) return;
			btn.classList.add('carregando');
			var texto = btn.textContent;
			btn.textContent = 'Carregando...';
			var buscar = function (url, tentativas) {
				return fetch(url, { credentials: 'same-origin' })
					.then(function (r) { return r.text(); })
					.then(function (html) {
						var doc = new DOMParser().parseFromString(html, 'text/html');
						var novos = doc.querySelectorAll('.js-lista > *');
						var postos = 0;
						novos.forEach(function (n) {
							var a = n.querySelector('a[href]');
							if (a && document.querySelector('main a[href="' + a.getAttribute('href').replace(/"/g, '\\"') + '"]')) return; // já está na capa (destaques, blocos ou lista)
							lista.appendChild(document.importNode(n, true));
							postos++;
						});
						var prox = doc.querySelector('.js-carregar-mais');
						if (prox && novos.length && !postos && tentativas > 0) return buscar(prox.href, tentativas - 1);
						if (prox && novos.length) {
							btn.href = prox.href;
							btn.textContent = texto;
							btn.classList.remove('carregando');
						} else {
							btn.parentNode.remove();
						}
					});
			};
			buscar(btn.href, 3)
				.catch(function () { window.location.href = btn.href; });
		});
	});

	// Carrossel da capa (v0.8.2): troca por deslocamento — setas, pontinhos, arrastar no celular
	// sem troca automática.
	document.querySelectorAll('.js-carrossel').forEach(function (c) {
		var trilho = c.querySelector('.carrossel__trilho');
		var pontos = c.querySelectorAll('.carrossel__ponto');
		var total = trilho ? trilho.children.length : 0;
		if (total < 2) return;
		var atual = 0;
		var ir = function (n) {
			atual = (n + total) % total;
			trilho.style.transform = 'translateX(' + (-100 * atual) + '%)';
			pontos.forEach(function (p, i) {
				p.classList.toggle('ativo', i === atual);
				p.classList.toggle('feito', i < atual);
			});
		};
		var ant = c.querySelector('.js-carrossel-ant');
		var prox = c.querySelector('.js-carrossel-prox');
		if (ant) ant.addEventListener('click', function () { ir(atual - 1); });
		if (prox) prox.addEventListener('click', function () { ir(atual + 1); });
		pontos.forEach(function (p, i) { p.addEventListener('click', function () { ir(i); }); });

		// Arrastar com o dedo.
		var x0 = null, arrastou = false;
		c.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; arrastou = false; }, { passive: true });
		c.addEventListener('touchend', function (e) {
			if (x0 === null) return;
			var dx = e.changedTouches[0].clientX - x0;
			x0 = null;
			if (Math.abs(dx) > 40) { arrastou = true; ir(dx < 0 ? atual + 1 : atual - 1); }
		});
		trilho.addEventListener('click', function (e) { if (arrastou) { e.preventDefault(); arrastou = false; } }, true);
		// Teclado: o link de um slide que não está na tela recebe foco → mostra esse slide.
		Array.prototype.forEach.call(trilho.children, function (s, i) { s.addEventListener('focus', function () { ir(i); }); });

		// 0.9.35: passa sozinho. A faixa de baixo vai enchendo de azul (6 segundos) e, quando termina, troca a foto.
		// Pausa com o mouse em cima, com o dedo na tela, fora da tela ou com a aba escondida.
		pontos.forEach(function (p, i) {
			p.addEventListener('animationend', function () { if (i === atual) ir(atual + 1); });
		});
		var pausa = function (sim) { c.classList.toggle('pausado', sim); };
		c.addEventListener('mouseenter', function () { pausa(true); });
		c.addEventListener('mouseleave', function () { pausa(false); });
		c.addEventListener('focusin', function () { pausa(true); });
		c.addEventListener('focusout', function () { pausa(false); });
		c.addEventListener('touchstart', function () { pausa(true); }, { passive: true });
		c.addEventListener('touchend', function () { setTimeout(function () { pausa(false); }, 1500); });
		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (es) { c.classList.toggle('fora', !es[0].isIntersecting); }).observe(c);
		}
		ir(0);
		c.classList.add('auto');
	});

	// Publicidade: conta a exibição quando o anúncio aparece na tela (envia em lote, sem pesar).
	var pubFila = [], pubVistos = {};
	var pubEnviar = function () {
		if (!pubFila.length || !window.SCHOJE || !SCHOJE.pub) return;
		var ids = pubFila.splice(0).join(',');
		var dados = new FormData(); dados.append('ids', ids);
		if (navigator.sendBeacon) { navigator.sendBeacon(SCHOJE.pub, dados); } else { fetch(SCHOJE.pub, { method: 'POST', body: dados, keepalive: true }); }
	};
	var pubContar = function (id) { if (!id || pubVistos[id]) return; pubVistos[id] = 1; pubFila.push(id); };
	if ('IntersectionObserver' in window) {
		var pubObs = new IntersectionObserver(function (itens) {
			itens.forEach(function (it) { if (it.isIntersecting) { pubContar(it.target.getAttribute('data-anuncio')); pubObs.unobserve(it.target); } });
		}, { threshold: 0.5 });
		document.querySelectorAll('[data-anuncio]').forEach(function (el) { pubObs.observe(el); });
	}
	setInterval(pubEnviar, 5000);
	document.addEventListener('visibilitychange', function () { if (document.hidden) pubEnviar(); });

	// Coloca o conteúdo do anúncio guardado no <template> (scripts do AdSense precisam ser recriados para rodar).
	var pubInserir = function (tpl, destino) {
		destino.appendChild(document.importNode(tpl.content, true));
		destino.querySelectorAll('script').forEach(function (velho) {
			var novo = document.createElement('script');
			for (var i = 0; i < velho.attributes.length; i++) { novo.setAttribute(velho.attributes[i].name, velho.attributes[i].value); }
			novo.text = velho.text;
			velho.parentNode.replaceChild(novo, velho);
		});
	};
	var guardado = function (tipo, chave) { try { return tipo === 'sessao' ? sessionStorage.getItem(chave) : localStorage.getItem(chave); } catch (e) { return null; } };
	var guardar = function (tipo, chave, valor) { try { (tipo === 'sessao' ? sessionStorage : localStorage).setItem(chave, valor); } catch (e) {} };

	// Rodapé fixo: celular e computador, com botão de fechar (fechado, some até o dia seguinte).
	var anc = document.getElementById('pub-ancora');
	if (anc) {
		var ancChave = 'scanc-' + anc.getAttribute('data-anuncio-anc');
		var dia = new Date().toISOString().slice(0, 10);
		if (guardado('dia', ancChave) !== dia) {
			pubInserir(anc.querySelector('template'), anc.querySelector('.pub-ancora__corpo'));
			anc.hidden = false;
			document.body.classList.add('com-ancora');
			pubContar(anc.getAttribute('data-anuncio-anc'));
			anc.querySelector('.pub-ancora__fechar').addEventListener('click', function () {
				anc.remove(); document.body.classList.remove('com-ancora'); guardar('dia', ancChave, dia);
			});
		}
	}

	// Vídeos do "Quem somos": só baixam e tocam quando aparecem na tela.
	var videos = document.querySelectorAll('.js-video-preguicoso');
	if (videos.length && 'IntersectionObserver' in window) {
		var obs = new IntersectionObserver(function (itens) {
			itens.forEach(function (item) {
				var v = item.target;
				if (item.isIntersecting) {
					if (!v.src) { v.src = v.getAttribute('data-src'); }
					var p = v.play(); if (p && p.catch) { p.catch(function () {}); }
				} else if (v.src) {
					v.pause();
				}
			});
		}, { rootMargin: '200px' });
		videos.forEach(function (v) { obs.observe(v); });
	}

	// Copiar link da matéria.
	document.querySelectorAll('.js-copiar').forEach(function (btn) {
		btn.addEventListener('click', function () {
			var aviso = btn.parentNode.querySelector('.compartilhar__aviso');
			var link = btn.getAttribute('data-link');
			var ok = function () { if (aviso) { aviso.textContent = 'Link copiado!'; setTimeout(function () { aviso.textContent = ''; }, 2500); } };
			if (navigator.clipboard) {
				navigator.clipboard.writeText(link).then(ok);
			} else {
				window.prompt('Copie o link:', link);
			}
		});
	});

	// Conta uma leitura da matéria (depois que a página já abriu, sem atrasar nada).
	var artigo = document.querySelector('[data-vista]');
	if (artigo && window.SCHOJE && SCHOJE.vista) {
		var enviar = function () {
			var url = SCHOJE.vista + artigo.getAttribute('data-vista');
			if (navigator.sendBeacon) {
				navigator.sendBeacon(url);
			} else {
				fetch(url, { method: 'POST', keepalive: true });
			}
		};
		if ('requestIdleCallback' in window) {
			requestIdleCallback(enviar, { timeout: 4000 });
		} else {
			setTimeout(enviar, 2000);
		}
	}
})();

// Página de editoria: "Ver mais notícias" mostra as próximas matérias já carregadas.
(function () {
	document.querySelectorAll('.js-mais-cat').forEach(function (btn) {
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			var ocultos = document.querySelectorAll('.cat-item[hidden]');
			for (var i = 0; i < ocultos.length && i < 10; i++) ocultos[i].removeAttribute('hidden');
			if (ocultos.length <= 10) btn.remove();
		});
	});
})();

// Botões de compartilhar da matéria.
(function () {
	var bs = document.querySelectorAll('.compartilhar__b[data-rede]');
	if (!bs.length) return;
	var u = encodeURIComponent(location.href), t = encodeURIComponent(document.title);
	bs.forEach(function (a) {
		var r = a.getAttribute('data-rede');
		if (r === 'whatsapp') a.href = 'https://wa.me/?text=' + t + '%20' + u;
		if (r === 'facebook') a.href = 'https://www.facebook.com/sharer/sharer.php?u=' + u;
		if (r === 'x') a.href = 'https://twitter.com/intent/tweet?text=' + t + '&url=' + u;
		a.target = '_blank';
	});
	document.querySelectorAll('.js-copiar-link').forEach(function (b) {
		b.addEventListener('click', function () {
			var ok = function () { var s = b.querySelector('span'); var o = s.textContent; s.textContent = 'Link copiado!'; setTimeout(function () { s.textContent = o; }, 2000); };
			if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(ok, function () {});
		});
	});
})();

// Tempo agora no topo (Open-Meteo, grátis e sem chave). Guarda 30 min no navegador.
(function () {
	var caixas = document.querySelectorAll('.js-tempo-topo');
	if (!caixas.length || !window.fetch) return;
	var SOL = '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
	var NUV = '<path d="M9 20h12a5 5 0 0 0 .6-9.96A7 7 0 0 0 8.1 8.6 5.6 5.6 0 0 0 9 20Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
	var CHU = NUV + '<path d="M11 23l-1 2M16 23l-1 2M21 23l-1 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="translate(0 -1)"/>';
	var icone = function (c) {
		if (c === 0) return SOL;
		if (c <= 2) return '<g transform="translate(-4 -2) scale(.8)">' + SOL + '</g><g transform="translate(6 4) scale(.8)">' + NUV + '</g>';
		if (c === 3 || (c >= 45 && c <= 48)) return NUV;
		return CHU;
	};
	var pinta = function (d) {
		caixas.forEach(function (b) {
			b.querySelector('.tempo-topo__temp').textContent = Math.round(d.t) + '°';
			b.querySelector('.tempo-topo__ico').innerHTML = icone(d.c);
			b.hidden = false;
		});
	};
	var chave = 'sc-tempo-topo';
	try {
		var g = JSON.parse(localStorage.getItem(chave) || 'null');
		if (g && Date.now() - g.q < 30 * 60 * 1000) { pinta(g); return; }
	} catch (e) {}
	fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.99&longitude=-48.635&current=temperature_2m,weather_code')
		.then(function (r) { return r.json(); })
		.then(function (j) {
			var d = { t: j.current.temperature_2m, c: j.current.weather_code, q: Date.now() };
			pinta(d);
			try { localStorage.setItem(chave, JSON.stringify(d)); } catch (e) {}
		}).catch(function () {});
})();


// Página "Previsão do tempo": um cartão por dia, 10 dias (Open-Meteo).
(function () {
	var raiz = document.querySelector('.js-tempo-pagina');
	if (!raiz || !window.fetch) return;
	var B = 'fill="#fff"';
	var NUVEM = '<path ' + B + ' d="M34 78h52a22 22 0 0 0 3-43.8A30 30 0 0 0 31 30a24 24 0 0 0 3 48Z"/><path fill="#cfe3f2" d="M34 78h52a22 22 0 0 0 5-.6c-4 6-9 8.6-16 8.6H34a24 24 0 0 1-12-3.2c3.6 1.8 7.6 3.2 12 3.2Z" opacity=".0"/>';
	var SOL = '<circle cx="60" cy="48" r="20" fill="#ffc933"/><g stroke="#ffc933" stroke-width="5" stroke-linecap="round"><path d="M60 14v8M60 74v8M26 48h8M86 48h8M36 24l6 6M78 66l6 6M84 24l-6 6M42 66l-6 6"/></g>';
	var GOTAS = '<g fill="#9fd0f0"><path d="M38 90c-3 4-3 8 0 8s3-4 0-8Z"/><path d="M58 92c-3 4-3 8 0 8s3-4 0-8Z"/><path d="M78 90c-3 4-3 8 0 8s3-4 0-8Z"/></g>';
	var RAIO = '<path fill="#ffc933" d="M64 70 52 90h10l-4 14 16-22H64l6-12Z"/>';
	var NEV = '<g stroke="#cfe3f2" stroke-width="4" stroke-linecap="round"><path d="M30 92h60M38 100h44"/></g>';
	function icone(c) {
		var g = function (x) { return '<svg viewBox="0 0 120 110" width="120" height="110" aria-hidden="true" focusable="false">' + x + '</svg>'; };
		if (c === 0) return g(SOL);
		if (c <= 2) return g('<g transform="translate(-14 -10) scale(.8)">' + SOL + '</g><g transform="translate(6 10)">' + NUVEM + '</g>');
		if (c === 3) return g(NUVEM);
		if (c <= 48) return g(NUVEM + NEV);
		if (c >= 95) return g(NUVEM + RAIO);
		return g(NUVEM + GOTAS);
	}
	function texto(c) {
		if (c === 0) return 'Céu limpo'; if (c <= 2) return 'Parcialmente nublado'; if (c === 3) return 'Nublado';
		if (c <= 48) return 'Neblina'; if (c <= 57) return 'Garoa'; if (c <= 67) return 'Chuva';
		if (c <= 82) return 'Pancadas de chuva'; if (c >= 95) return 'Trovoadas'; return 'Instável';
	}
	function cap(s) { return s.replace(/(^|-|\s)([a-zà-ú])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
	function rotulo(iso, i) {
		var d = new Date(iso + 'T12:00:00');
		var dia = cap(new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d)) + ', ' + d.getDate();
		return i === 0 ? 'Hoje, ' + dia : i === 1 ? 'Amanhã, ' + dia : dia;
	}
	var rosa = function (g) { return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8]; };
	var ondas = function (D, i) {
		var h = D.onda_altura && D.onda_altura[i];
		if (h === null || h === undefined || isNaN(h)) return '—';
		var d = D.onda_direcao && D.onda_direcao[i];
		return Number(h).toFixed(1).replace('.', ',') + ' m' + (d === null || d === undefined ? '' : ' · ' + rosa(d));
	};
	var n = function (v, c) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toFixed(c).replace('.', ','); };
	var IP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M2 9c2.5-3 5-3 7.500 0s5 3 7.500 0c1.500-1.800 3-2.400 5-2M2 15c2.500-3 5-3 7.500 0s5 3 7.500 0c1.500-1.800 3-2.400 5-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
	var IC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 12a9 9 0 0 1 18 0H3Zm9 0v7a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
	var IV = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
	function cartao(D, i) {
		return '<article class="tp-card"><div class="tp-card__dia"><span>Previsão do tempo para</span><h2>' + rotulo(D.time[i], i) + '</h2><p class="tp-card__temps"><b>' + Math.round(D.temperature_2m_max[i]) + 'º</b><i>' + Math.round(D.temperature_2m_min[i]) + 'º</i></p></div>' +
			'<div class="tp-card__ico" title="' + texto(D.weather_code[i]) + '">' + icone(D.weather_code[i]) + '<span>' + texto(D.weather_code[i]) + '</span></div>' +
			'<ul class="tp-card__dados"><li>' + IP + '<span><small>Ondas</small><b>' + ondas(D, i) + '</b></span></li>' +
			'<li>' + IC + '<span><small>Precipitação</small><b>' + n(D.precipitation_sum[i], 1) + ' mm</b></span></li>' +
			'<li>' + IV + '<span><small>Ventos de até</small><b>' + n(D.wind_speed_10m_max[i], 0) + ' km/h</b></span></li></ul></article>';
	}
	function pinta(D) {
		var h = '';
		for (var i = 0; i < D.time.length; i++) h += cartao(D, i);
		raiz.innerHTML = h;
	}
	var chave = 'sc-tempo-10d-v2';
	try { var g = JSON.parse(localStorage.getItem(chave) || 'null'); if (g && Date.now() - g.q < 30 * 60 * 1000) { pinta(g.d); return; } } catch (e) {}
	var tempo = fetch('https://api.open-meteo.com/v1/forecast?latitude=-26.99&longitude=-48.635&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=America%2FSao_Paulo&forecast_days=10').then(function (r) { return r.json(); });
	var mar = fetch('https://marine-api.open-meteo.com/v1/marine?latitude=-26.95&longitude=-48.4&daily=wave_height_max,wave_direction_dominant&timezone=America%2FSao_Paulo&forecast_days=10').then(function (r) { return r.json(); }).catch(function () { return null; });
	Promise.all([tempo, mar]).then(function (r) {
		var D = r[0].daily;
		if (r[1] && r[1].daily) { D.onda_altura = r[1].daily.wave_height_max; D.onda_direcao = r[1].daily.wave_direction_dominant; }
		pinta(D);
		try { localStorage.setItem(chave, JSON.stringify({ q: Date.now(), d: D })); } catch (e) {}
	}).catch(function () { raiz.innerHTML = '<p class="tp__carregando">Não foi possível carregar a previsão agora. Tente de novo em instantes.</p>'; });
})();

/* 0.10 — newsletter e notificações (servidor próprio, /api/) */
(function () {
	// Newsletter
	document.querySelectorAll('.js-news').forEach(function (f) {
		var msg = f.parentNode.querySelector('.js-news-msg');
		f.addEventListener('submit', function (ev) {
			ev.preventDefault();
			var email = (f.elements.email.value || '').trim();
			var btn = f.querySelector('button');
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = 'Digite um e-mail válido.'; msg.className = 'news__msg js-news-msg news__msg--erro'; return; }
			btn.disabled = true; msg.textContent = 'Enviando…'; msg.className = 'news__msg js-news-msg';
			fetch('/api/news/inscrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
				.then(function (r) { return r.json(); })
				.then(function (j) { msg.textContent = j.msg || 'Pronto!'; msg.className = 'news__msg js-news-msg' + (j.ok ? ' news__msg--ok' : ' news__msg--erro'); if (j.ok) f.reset(); })
				.catch(function () { msg.textContent = 'Não foi possível agora. Tente de novo em instantes.'; msg.className = 'news__msg js-news-msg news__msg--erro'; })
				.then(function () { btn.disabled = false; });
		});
	});

	// Notificações push: o próprio site pergunta, sem botão fixo
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
	var SEMANA = 7 * 24 * 3600 * 1000;
	function guarda(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
	function pega(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
	function b64(s) { var p = '='.repeat((4 - s.length % 4) % 4), r = (s + p).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(r), a = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return a; }
	function inscreve(reg) {
		return fetch('/api/push/chave').then(function (r) { return r.json(); }).then(function (j) {
			if (!j.chave) throw new Error('sem chave');
			return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(j.chave) });
		}).then(function (s) {
			return fetch('/api/push/inscrever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
		});
	}
	function caixa(reg) {
		var d = document.createElement('div');
		d.className = 'push-aviso'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Receber notificações');
		d.innerHTML = '<p class="push-aviso__txt"><strong>Quer receber notícias de Balneário Camboriú?</strong><span>Receba em primeira mão tudo o que acontece em BC.</span></p><div class="push-aviso__bt"><button type="button" class="push-aviso__sim">Quero receber</button><button type="button" class="push-aviso__nao">Agora não</button></div>';
		document.body.appendChild(d);
		setTimeout(function () { d.classList.add('push-aviso--on'); }, 30);
		function fecha() { d.classList.remove('push-aviso--on'); setTimeout(function () { d.remove(); }, 400); }
		d.querySelector('.push-aviso__nao').addEventListener('click', function () { guarda('sc-push-nao', String(Date.now())); fecha(); });
		d.querySelector('.push-aviso__sim').addEventListener('click', function () {
			fecha();
			Notification.requestPermission().then(function (p) {
				if (p === 'granted') return inscreve(reg);
				guarda('sc-push-nao', String(Date.now()));
			}).catch(function () {});
		});
	}
	navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
		if (Notification.permission === 'denied') return;
		if (Notification.permission === 'granted') { reg.pushManager.getSubscription().then(function (s) { if (!s) inscreve(reg).catch(function () {}); }); return; }
		var nao = +pega('sc-push-nao') || 0;
		if (nao && Date.now() - nao < SEMANA) return;
		function espera() { var c = document.getElementById('sc-cookies'); if (c && !c.hidden) { setTimeout(espera, 1500); return; } caixa(reg); }
		fetch('/api/push/chave').then(function (r) { if (!r.ok) return; setTimeout(espera, 6000); }).catch(function () {});
	});
})();
