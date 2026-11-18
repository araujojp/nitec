# Painel de Gestão Neon (VPS)

Painel de gestão de clientes, instalações, licenças, suporte, cobranças e atualizações,
com API para os equipamentos. Roda na VPS Hostinger (projeto Docker `neon-gestao`).

- Endereço: https://gestao.srv2172498.hstgr.cloud
- Ferramenta: Directus 11.17.4 + PostgreSQL 16 + backup diário automático
- Manual completo: `Manual-Painel-de-Gestao-Neon.pdf` (entregue fora do repositório, contém senha inicial)

## Arquivos
| Arquivo | O que é |
|---|---|
| `compose.yml` | Serviços Docker (banco, painel, backup). As senhas entram por variáveis de ambiente no Docker Manager da Hostinger, não ficam aqui. |
| `setup.py` | Cria as tabelas, campos e relações pela API do painel. |
| `setup2.py` | Pastas, produtos, funções/permissões (Equipe e Equipamento), automação de "último contato", dashboard e logo. |
| `test_api.py` | Teste de ponta a ponta da API como se fosse um equipamento. |

Os scripts leem as credenciais de um `cred.json` local (não versionado):
`{"ADMIN_EMAIL": "...", "ADMIN_PASSWORD": "...", "HOST": "gestao.srv2172498.hstgr.cloud"}`.
