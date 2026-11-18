# Gerador de orçamento — orcamento.neonsistemas.com

Aplicativo Node.js (Express + MySQL) para montar pré-orçamentos e orçamentos da Neon Sistemas.

- Editor com identificação do cliente, estrutura do local, situação atual (sim/não), itens com
  "precisa / cliente já possui / não se aplica", quantidades calculadas e valores editáveis.
- Exportação: PDF (pelo navegador, padrão da proposta), Excel (.xlsx) e Word (.docx).
- Salvar: cada orçamento recebe um código de edição (guardar com você) e cada alteração vira uma versão.
- Memória: consulta, edição, histórico de versões e exclusão, protegidas pela senha de acesso.

## Configuração (variáveis de ambiente no hPanel → Node.js)
DB_HOST, DB_PORT, DB_DATABASE, DB_USER, DB_PASSWORD, SECRET (texto aleatório longo),
MEMORIA_SENHA (senha de acesso à memória). Nunca versionar estes valores.

## Publicar
Zipar package.json, package-lock.json, server.cjs, .npmrc e public/ (sem node_modules).
Node 22, tipo express, entrada server.cjs, build `build`.
