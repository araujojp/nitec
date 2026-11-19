set -e
cd "$(dirname "$0")"
cp fix5/pt.html site5/index.html; for l in en es fr de zh; do cp fix5/$l.html site5/$l/index.html; done
python3 -I patch.py site5/index.html site5/en/index.html site5/es/index.html site5/fr/index.html site5/de/index.html site5/zh/index.html >/dev/null
python3 -I mkblue.py site5/index.html site5/previa-azul/index.html >/dev/null
[ "$1" = build ] && exit 0
rm -f site.zip; (cd site5 && zip -qr ../site.zip . -x '.*' && zip -q ../site.zip .htaccess)
API=https://developers.hostinger.com
R=$(curl -sS -X POST $API/api/hosting/v1/files/upload-urls -H 'Content-Type: application/json' -d '{"username":"u277642544","domain":"neonsistemas.com"}')
g(){ echo "$R"|python3 -I -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
U=$(g url); A=$(g auth_key); RA=$(g rest_auth_key); SIZE=$(wc -c < site.zip)
curl -sS -o /dev/null -w "POST %{http_code}\n" -X POST "$U/site.zip?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $RA" -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $SIZE" -H "Upload-Offset: 0"
curl -sS -D - -o /dev/null -X PATCH "$U/site.zip?override=true" -H "X-Auth: $A" -H "X-Auth-Rest: $RA" -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" -H "Upload-Offset: 0" --data-binary @site.zip | grep -i upload-offset; echo size=$SIZE
curl -sS -w " DEPLOY %{http_code}\n" -X POST $API/api/hosting/v1/accounts/u277642544/websites/neonsistemas.com/deploy -H 'Content-Type: application/json' -d '{"archive_path":"site.zip"}'
for i in $(seq 1 14); do curl -s "https://neonsistemas.com/?v=$RANDOM" -o live2.html; cmp -s live2.html site5/index.html && break; sleep 15; done
cmp -s live2.html site5/index.html && echo LIVE-OK || echo LIVE-MISMATCH
curl -sS -o /dev/null -w "cache %{http_code}\n" -X DELETE $API/api/hosting/v1/accounts/u277642544/websites/neonsistemas.com/cache/clear
curl -sS -o /dev/null -w "cdn %{http_code}\n" -X DELETE $API/api/hosting/v1/accounts/u277642544/websites/neonsistemas.com/cdn/purge
for p in en es fr de zh; do curl -s "https://neonsistemas.com/$p/?v=$RANDOM" | cmp -s - site5/$p/index.html && echo "$p ok" || echo "$p diff"; done
