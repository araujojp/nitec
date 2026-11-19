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
Use o roteiro, que roda os testes, baixa um backup do banco, envia, faz o build e confere a versão em `/saude`:
```
NEON_EMAIL=... NEON_SENHA=... scripts/publicar.sh gestao   # primeiro aqui, para testar
NEON_EMAIL=... NEON_SENHA=... scripts/publicar.sh painel   # depois no principal
```
O backup fica em `../.backups/` (fora do Git). Suba `version` no `package.json` a cada versão.
Mudanças no banco são sempre aditivas (tabelas/colunas novas), então a versão antiga continua funcionando
no outro endereço enquanto a nova é testada.

Manual (se preciso): zipar `server.js`, `server/`, `public/`, `package.json`, `package-lock.json` (sem `node_modules`),
enviar e iniciar o build (Node 22, tipo express, entrada server.js, build `build`).

## API dos equipamentos
Compatível com o painel antigo (`/items/versoes`, `/assets/:id`, `/items/licencas`, `/items/checkins`)
e com rotas novas em `/api/v1/equipamento`. Cada equipamento usa um token gerado em Instalações.

## Integrações configuradas pelo painel (não por variáveis)
- E-mail de avisos (SMTP da Hostinger): Configurações → Alertas → E-mail de avisos.
- Asaas: Configurações → Asaas. O aviso de pagamento chega em `/publico/asaas/webhook`.
- Notificação no celular: chaves geradas sozinhas na primeira ativação.
As senhas e chaves ficam na tabela `integracoes` e nunca voltam para o navegador.
