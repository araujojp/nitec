# Neon Gestão — como está publicado

Aplicativo próprio (Node.js + Express + MySQL) que substituiu o Directus.
É **um único sistema**, acessível por dois endereços que compartilham o mesmo banco e os mesmos arquivos:

- https://painel.neonsistemas.com  (principal)
- https://gestao.neonsistemas.com  (mesma coisa, segundo endereço)

## Onde roda
- Hospedagem Hostinger, aplicativo Node.js 22 (Express), entrada `server.js`, script de build `build`.
- Banco de dados MySQL `u277642544_painel` (compartilhado pelos dois endereços).
- Arquivos enviados: `/home/u277642544/domains/painel.neonsistemas.com/storage` (compartilhado; fora do public_html, não some em novas publicações).
- As tabelas são criadas sozinhas na primeira execução.

## Variáveis de ambiente (hPanel → Sites → <domínio> → Node.js)
Veja `.env.example`. Os dois domínios usam os mesmos valores de banco e storage; só o `PUBLIC_URL` muda.
Nunca commitar o `.env` nem as senhas.

## Publicar uma nova versão
1. Zipar `server.js`, `server/`, `public/`, `package.json`, `package-lock.json` (sem `node_modules`).
2. Enviar e iniciar o build (Node 22, tipo express, entrada server.js, build `build`) nos dois domínios.
3. Limpar o cache no hPanel se necessário.

## API dos equipamentos
Compatível com o painel antigo (`/items/versoes`, `/assets/:id`, `/items/licencas`, `/items/checkins`)
e com rotas novas em `/api/v1/equipamento`. Cada equipamento usa um token gerado em Instalações.
