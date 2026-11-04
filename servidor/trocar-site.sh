#!/bin/bash
# Troca o schoje.news do WordPress para o site novo (sem WordPress).
# Guarda a configuração antiga e testa antes de ligar. Para voltar: bash servidor/voltar-wordpress.sh
set -e
cd /opt/site-teste/servidor
ATUAL=$(readlink -f /etc/nginx/sites-enabled/schoje)
if grep -q "site-novo-schoje" "$ATUAL" 2>/dev/null; then echo "O site novo já está no ar."; exit 0; fi
echo "== 1. Guardando a configuração antiga do WordPress =="
cp "$ATUAL" /root/schoje-nginx-wordpress.bak
echo "$ATUAL" > /root/schoje-nginx-wordpress.caminho
echo "== 2. Ligando o modo produção =="
if grep -q '^SITE_URL=' .env; then sed -i 's#^SITE_URL=.*#SITE_URL=https://schoje.news#' .env; else echo 'SITE_URL=https://schoje.news' >> .env; fi
touch dados/producao
systemctl restart schoje-servidor
sleep 2
echo "== 3. Gerando todas as páginas =="
OUT=/var/www/teste DADOS_DIR=/opt/site-teste/servidor/dados SITE_URL=https://schoje.news PRODUCAO=1 node ../gerar.js >/dev/null
test -f /var/www/teste/index.html || { echo "ERRO: a capa não foi gerada. Nada foi trocado."; exit 1; }
echo "== 4. Preparando a configuração nova =="
cat > /etc/nginx/sites-available/schoje-novo <<'EOT'
# site-novo-schoje
server {
    listen 80;
    listen [::]:80;
    server_name schoje.news www.schoje.news;

    location = /Dturbo388 { return 410; }
    location ~* ^/(AICONWIN|AJNETOTO|AMAHIRTOTO|AVICTORY88|Dmaxbet999|Bmata-4d|ARTP-NINJA-GACOR|ATERMINAL4D|Dhidup99|ABCA88|AOLE388|AMELATI188|AJAYA77|ASENSA838|ARTP8000|Dbni4d|ADADU500|Dsumur88|AGECE138|AAJAIB888)$ { return 410; }
    location ~ ^/(2019|2020|2021|2022|2023|2024|2025)/ { return 410; }
    location ^~ /webstories/ { return 410; }
    location ~ ^/author/.+/page/[0-9]+/?$ { return 410; }
    if ($args ~* "(^|&)amp($|&)") { return 410; }
    if ($arg_news_id) { return 410; }

    root /var/www/teste;
    index index.html;
    access_log /var/log/nginx/schoje.access.log;
    error_log  /var/log/nginx/schoje.error.log;

    include /etc/nginx/snippets/schoje-api.conf;

    # fotos antigas do WordPress continuam funcionando nos mesmos endereços
    location ^~ /wp-content/uploads/ { alias /var/www/schoje/wp-content/uploads/; expires 30d; access_log off; }

    location / { try_files $uri $uri/ =404; }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2)$ { expires 30d; log_not_found off; try_files $uri =404; }
    location ~ /\.(?!well-known) { deny all; }
    location ~ ^/(servidor|dados)/ { deny all; }
}
EOT
echo "== 5. Ligando o site novo =="
rm /etc/nginx/sites-enabled/schoje
ln -s /etc/nginx/sites-available/schoje-novo /etc/nginx/sites-enabled/schoje
if nginx -t 2>/dev/null; then
  systemctl reload nginx
  echo
  echo "PRONTO. O site novo está no ar em https://schoje.news"
  echo "Agora limpe o cache na Cloudflare (Caching > Configuration > Purge Everything)."
  echo "Para voltar ao WordPress: bash /opt/site-teste/servidor/voltar-wordpress.sh"
else
  rm /etc/nginx/sites-enabled/schoje
  ln -s "$ATUAL" /etc/nginx/sites-enabled/schoje 2>/dev/null || cp /root/schoje-nginx-wordpress.bak /etc/nginx/sites-enabled/schoje
  nginx -t && systemctl reload nginx
  echo "ERRO na configuração nova. Voltei tudo como estava (WordPress no ar)."
  exit 1
fi
