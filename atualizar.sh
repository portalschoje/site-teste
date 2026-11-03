#!/bin/bash
# Atualiza o site de teste: baixa as novidades do GitHub e gera as páginas.
cd /opt/site-teste && git pull -q && node gerar.js
