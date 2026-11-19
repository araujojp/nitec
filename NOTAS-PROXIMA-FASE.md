# Neon Sistemas — resumo para a próxima fase

## Onde está cada coisa
- **Site** neonsistemas.com (Hostinger, conta u277642544). Estático, 6 idiomas (pt, en, es, fr, de, zh), conteúdo cifrado.
  - Gerador: `site-patch/` (patch.py aplica tudo sobre as páginas-base; deploy.sh monta, envia e publica).
  - Base das páginas e assets: pasta de rascunho da sessão (`fix5/*.html` = páginas-base, `site4/c` = assets, `site5` = saída).
  - Recursos: 4 temas (claro/escuro × azul/laranja; abre em azul conforme o aparelho; o logo alterna), suíte 3D sob demanda,
    comando de voz, sons de interface, calculadora, comparativo, FAQ, depoimentos (do Neon Gestão), novidades (do Neon Gestão),
    WhatsApp com escolha entre (34) 98430-2083 e (62) 99214-7679, estatísticas próprias, página /privacidade/.
- **Neon Gestão**: `painel-app/` → painel.neonsistemas.com e gestao.neonsistemas.com (Node 22, MySQL u277642544_painel).
  Inclui "Depoimentos do site" e o feed de novidades (Marketing → posts com "publicar no site").
- **Gerador de orçamento + estatísticas**: `orcamento-app/` → orcamento.neonsistemas.com (memória com senha; painel de estatísticas).
- **Token da Hostinger**: credencial do ambiente (injetada pelo proxy). Nunca colocar senhas/tokens em arquivos ou no chat.
