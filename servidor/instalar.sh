#!/bin/bash
# Instala (ou atualiza) o servidor de push e newsletter do SC Hoje.
set -e
cd /opt/site-teste/servidor
echo "== Instalando pacotes =="
npm install --omit=dev --no-audit --no-fund --silent
if [ ! -f .env ]; then
  echo
  echo "== Configuração (aparece só na primeira vez) =="
  read -r -p "Cole a chave de API do Brevo (começa com xkeysib-): " K
  read -r -p "E-mail remetente (o mesmo validado no Brevo): " R
  read -r -p "Invente uma senha para o painel: " S
  read -r -p "Endereço do site [https://schoje.online]: " U
  U=${U:-https://schoje.online}
  cat > .env <<EOT
SITE_URL=$U
BREVO_API_KEY=$K
REMETENTE_EMAIL=$R
REMETENTE_NOME=SC Hoje
ADMIN_SENHA=$S
EOT
  chmod 600 .env
fi
echo "== Ligando o servidor =="
cat > /etc/systemd/system/schoje-servidor.service <<EOT
[Unit]
Description=SC Hoje - push e newsletter
After=network.target

[Service]
WorkingDirectory=/opt/site-teste/servidor
ExecStart=$(command -v node) /opt/site-teste/servidor/servidor.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/schoje-api.conf <<'EOT'
location /api/publicador/ { proxy_pass http://127.0.0.1:3100; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; client_max_body_size 25m; }
location /api/ { proxy_pass http://127.0.0.1:3100; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; client_max_body_size 20k; }
location /admin { proxy_pass http://127.0.0.1:3100; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; }
location /redacao { proxy_pass http://127.0.0.1:3100; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; client_max_body_size 20m; }
location /midia/ { alias /opt/site-teste/servidor/dados/midia/; expires 30d; add_header Cache-Control "public"; }
location = /sw.js { add_header Cache-Control "no-cache"; }
EOT
for f in $(grep -Rl "server_name.*schoje.online" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null); do
  if ! grep -q "snippets/schoje-api.conf" "$f"; then
    sed -i --follow-symlinks '/server_name.*schoje.online/a\    include /etc/nginx/snippets/schoje-api.conf;' "$f"
  fi
done
nginx -t
systemctl daemon-reload
systemctl enable schoje-servidor >/dev/null 2>&1
systemctl restart schoje-servidor
systemctl reload nginx
sleep 2
systemctl is-active schoje-servidor
echo
echo "PRONTO. Painel: abra o endereço do site seguido de /admin (usuário: admin)"
