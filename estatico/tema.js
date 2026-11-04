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
