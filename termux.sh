#!/data/data/com.termux/files/usr/bin/bash
# Instala e liga o Sasuke no Termux (telemovel). Uso:  bash termux.sh
cd "$(dirname "$0")" || exit 1
echo "🩸 A instalar o necessário (1.ª vez demora uns minutos)..."
pkg update -y && pkg install -y nodejs git || { echo "Falhou a instalação do Node/Git."; exit 1; }
termux-wake-lock 2>/dev/null || true      # impede o telemóvel de adormecer o bot
npm install --omit=dev --no-audit --no-fund || { echo "npm install falhou: apague a pasta node_modules e tente de novo."; exit 1; }
echo "✅ Pronto. A ligar o bot — o CÓDIGO de pareamento vai aparecer abaixo."
node index.js
