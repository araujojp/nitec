# Neon Gestão

Painel de gestão da Neon Sistemas: clientes, funil, agenda, instalações, licenças, atualizações (até 2 GB),
chamados, cobranças, histórico, sinais dos equipamentos, arquivos, equipe com 2FA, registro de atividades,
API dos equipamentos (compatível com o painel antigo) e Marketing (posts com IA ou modelos, campanhas,
calendário, aprovação pelo Telegram, publicação em Instagram, Facebook, TikTok, YouTube, LinkedIn,
canal do Telegram e site, robôs com horários).

## Rodar
```
npm install
cp .env.example .env   # preencha
npm start
```
Node.js 20+ e MySQL/MariaDB. As tabelas são criadas sozinhas na primeira execução.

## Hostinger
Aplicativo Node.js (Express), arquivo de entrada `server.js`, script de build `build`.
Variáveis de ambiente: veja `.env.example`.
