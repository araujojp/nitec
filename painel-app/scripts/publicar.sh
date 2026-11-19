#!/usr/bin/env bash
# Publica o Neon Gestão na Hostinger com segurança.
#   scripts/publicar.sh gestao   → só gestao.neonsistemas.com (teste)
#   scripts/publicar.sh painel   → painel.neonsistemas.com (principal)
# Antes de publicar: roda os testes e baixa um backup do banco (pela rota /api/backup).
# Precisa de: token da Hostinger (injetado pelo proxy do ambiente) e NEON_EMAIL / NEON_SENHA
# de um administrador nas variáveis de ambiente (nunca em arquivo).
set -euo pipefail
cd "$(dirname "$0")/.."
ALVO="${1:-}"; case "$ALVO" in gestao|painel) ;; *) echo "uso: $0 gestao|painel"; exit 1;; esac
DOM="$ALVO.neonsistemas.com"; API=https://developers.hostinger.com; USR=u277642544
VERSAO=$(node -p "require('./package.json').version")
BK="${BACKUP_DIR:-../.backups}"; mkdir -p "$BK"

echo "== 1/5 testes"; [ "${PULAR_TESTES:-}" = 1 ] || npm test --silent >/dev/null || { echo "Testes falharam: nada foi publicado."; exit 1; }

echo "== 2/5 backup do banco"
CJ=$(mktemp); trap 'rm -f "$CJ"' EXIT
curl -sS -c "$CJ" -H 'Content-Type: application/json' -o /dev/null -w "login %{http_code}\n" \
  -d "$(node -e 'console.log(JSON.stringify({email:process.env.NEON_EMAIL,senha:process.env.NEON_SENHA}))')" "https://$DOM/api/auth/login"
ARQ="$BK/backup-$(date -u +%Y%m%d-%H%M%S)-$ALVO.json"
curl -sS -f -b "$CJ" -o "$ARQ" "https://$DOM/api/backup" || { echo "Backup falhou: nada foi publicado."; exit 1; }
node -e "const b=require(process.argv[1]); if(!b.tabelas||!b.tabelas.clientes) process.exit(1); console.log('backup ok:', Object.entries(b.tabelas).map(([k,v])=>k+'='+v.length).join(' '))" "$(realpath "$ARQ")"

echo "== 3/5 pacote"
ZIP=app-$VERSAO.zip; rm -f "/tmp/$ZIP"
zip -qr "/tmp/$ZIP" server.js server public ajuda package.json package-lock.json -x '*.DS_Store'
SIZE=$(wc -c < "/tmp/$ZIP")

echo "== 4/5 envio e build ($DOM, v$VERSAO)"
R=$(curl -sS -X POST $API/api/hosting/v1/files/upload-urls -H 'Content-Type: application/json' -d "{\"username\":\"$USR\",\"domain\":\"$DOM\"}")
U=$(node -p "JSON.parse(process.argv[1]).url" "$R"); A=$(node -p "JSON.parse(process.argv[1]).auth_key" "$R"); RA=$(node -p "JSON.parse(process.argv[1]).rest_auth_key" "$R")
curl -sS -o /dev/null -X POST "$U/$ZIP?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $RA" -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $SIZE" -H "Upload-Offset: 0"
curl -sS -o /dev/null -X PATCH "$U/$ZIP?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $RA" -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" -H "Upload-Offset: 0" --data-binary "@/tmp/$ZIP"
B=$(curl -sS -X POST "$API/api/hosting/v1/accounts/$USR/websites/$DOM/nodejs/builds" -H 'Content-Type: application/json' \
  -d "{\"node_version\":22,\"app_type\":\"express\",\"root_directory\":null,\"output_directory\":\".\",\"build_script\":\"build\",\"entry_file\":\"server.js\",\"package_manager\":\"npm\",\"source_type\":\"archive\",\"source_options\":{\"archive_path\":\"$ZIP\"}}")
echo "$B" | head -c 300; echo

echo "== 5/5 conferindo"
for i in $(seq 1 40); do
  V=$(curl -s "https://$DOM/saude?x=$RANDOM" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).versao||'')}catch{console.log('')}})")
  [ "$V" = "$VERSAO" ] && { echo "Publicado: $DOM está na versão $VERSAO"; exit 0; }
  sleep 15
done
echo "A versão nova ainda não apareceu em $DOM. Veja os logs do build na Hostinger."; exit 1
