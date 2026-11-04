/* Aviso de cookies. Carrega o Google Analytics, o AdSense e o Pixel da Meta só depois do consentimento (modo padrão). */
(function () {
	'use strict';

	var C = window.SC_COOKIES || {};
	var NOME = 'sc_cookies'; // guarda a escolha do leitor: todos | essenciais | visto
	var carregado = { ga: false, ads: false, px: false };

	function ler() {
		var m = document.cookie.match(new RegExp('(?:^|; )' + NOME + '=([^;]*)'));
		return m ? decodeURIComponent(m[1]) : '';
	}

	function gravar(valor) {
		document.cookie = NOME + '=' + encodeURIComponent(valor) + '; max-age=31536000; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
	}

	function carregarAnalytics() {
		if (carregado.ga || !C.ga) { return; }
		carregado.ga = true;
		window.dataLayer = window.dataLayer || [];
		window.gtag = function () { window.dataLayer.push(arguments); };
		window.gtag('js', new Date());
		window.gtag('config', C.ga);
		var s = document.createElement('script');
		s.async = true;
		s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(C.ga);
		document.head.appendChild(s);
	}

	function carregarAnuncios() {
		if (carregado.ads || !C.ads) { return; }
		carregado.ads = true;
		var s = document.createElement('script');
		s.async = true;
		s.crossOrigin = 'anonymous';
		s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(C.ads);
		document.head.appendChild(s);
	}

	function carregarPixel() {
		if (carregado.px || !C.px) { return; }
		carregado.px = true;
		/* Código oficial do Pixel da Meta */
		!function (f, b, e, v, n, t, s) {
			if (f.fbq) { return; }
			n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
			if (!f._fbq) { f._fbq = n; }
			n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
			t = b.createElement(e); t.async = !0; t.src = v;
			s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
		}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
		window.fbq('init', C.px);
		window.fbq('track', 'PageView');
	}

	function carregarTudo() {
		carregarAnalytics();
		carregarPixel();
		carregarAnuncios();
	}

	// Quem tinha aceitado e agora escolhe "só os essenciais": apaga os cookies do Google.
	function apagarCookiesDeTerceiros() {
		var host = location.hostname;
		var base = host.replace(/^www\./, '');
		var dominios = ['', host, '.' + host, base, '.' + base];
		document.cookie.split('; ').forEach(function (c) {
			var nome = c.split('=')[0];
			if (!/^(_ga|_gid|_gat|__gads|__gpi|_gcl_|FCNEC|__eoi|_fbp|_fbc)/.test(nome)) { return; }
			dominios.forEach(function (d) {
				document.cookie = nome + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
			});
		});
	}

	var caixa = document.getElementById('sc-cookies');

	function mostrar() { if (caixa) { caixa.hidden = false; } }
	function esconder() { if (caixa) { caixa.hidden = true; } }

	function escolher(valor) {
		var antes = ler();
		gravar(valor);
		esconder();
		if (valor === 'todos' || valor === 'visto') {
			carregarTudo();
		} else if (antes === 'todos') {
			apagarCookiesDeTerceiros();
			location.reload();
		}
	}

	var modo = C.modo || 'consentimento';
	var escolha = ler();

	if (modo === 'desligado') {
		carregarTudo();
	} else if (modo === 'informativo') {
		carregarTudo();
		if (!escolha) { mostrar(); }
	} else {
		if (escolha === 'todos') {
			carregarTudo();
		} else if (escolha !== 'essenciais') {
			mostrar();
		}
	}

	document.addEventListener('click', function (e) {
		if (!e.target.closest) { return; }
		var b = e.target.closest('[data-sc-cookies]');
		if (b) {
			e.preventDefault();
			escolher(b.getAttribute('data-sc-cookies'));
			return;
		}
		if (e.target.closest('.js-cookies-abrir')) {
			e.preventDefault();
			mostrar();
		}
	});
})();
