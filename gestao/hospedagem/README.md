# Cópia do Painel de Gestão na hospedagem (gestao.neonsistemas.com)

Mesmo Directus 11.17.4 da VPS, rodando como aplicativo Node.js 22 no plano Unlimited Web Hosting,
com banco MySQL `u277642544_gestao`. Serve de salvaguarda caso a VPS seja cancelada.

- `server.cjs`: entrada para o LiteSpeed da Hostinger (descobre o host do MySQL, roda o bootstrap e sobe o Directus).
- `package.json`: fixa `argon2@0.41.1` (o binário da versão nova exige glibc 2.34; o servidor tem 2.28) e troca o
  `isolated-vm` (sem binário compatível) por um substituto vazio em `shims/` — só desativa a operação "Executar script" dos Fluxos.
- `.npmrc`: `ignore-scripts=true` (a hospedagem não tem compilador C).
- As configurações e senhas ficam nas **variáveis de ambiente** do app (hPanel → Sites → gestao.neonsistemas.com → Node.js), não em arquivo.
- Arquivos enviados ficam em `/home/u277642544/domains/gestao.neonsistemas.com/directus-arquivos` (fora do public_html, não somem num novo deploy).

Para publicar de novo: zipar `package.json`, `package-lock.json`, `server.cjs`, `.npmrc` e `shims/`, enviar e iniciar o build
(Node 22, tipo `express`, entrada `server.cjs`, script de build `build`).
