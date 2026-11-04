#!/bin/bash
# Volta o schoje.news para o WordPress (como estava antes da troca).
set -e
test -f /root/schoje-nginx-wordpress.bak || { echo "Não achei a cópia antiga."; exit 1; }
ATUAL=$(cat /root/schoje-nginx-wordpress.caminho)
rm -f /etc/nginx/sites-enabled/schoje
if [ "$(dirname "$ATUAL")" = "/etc/nginx/sites-available" ]; then ln -s "$ATUAL" /etc/nginx/sites-enabled/schoje; else cp /root/schoje-nginx-wordpress.bak /etc/nginx/sites-enabled/schoje; fi
nginx -t
systemctl reload nginx
echo "PRONTO. O WordPress voltou ao ar. Limpe o cache na Cloudflare (Purge Everything)."
