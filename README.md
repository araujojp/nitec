# Site da Neon Sistemas — neonsistemas.com

Código-fonte do site institucional da Neon Sistemas (Painel Neon, Neon Motel e PABX Neon),
publicado na hospedagem Hostinger (plano Unlimited Web Hosting) em https://neonsistemas.com.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O site completo e legível: textos, estilos, ilustrações das telas, idiomas, efeitos e sons. **É aqui que se edita o site.** |
| `seo.json` | Título, descrição e palavras-chave de cada idioma (pt, en, es, fr, de, zh). |
| `build.py` | Gera a versão publicada (pasta `dist/`): uma página por idioma, código cifrado, proteções, `sitemap.xml`, `robots.txt` e `.htaccess`. |
| `htaccess.txt` | Regras do servidor: HTTPS, redirecionamento do www, cabeçalhos de segurança, bloqueio de arquivos internos e de hotlink. Vira `.htaccess` no build. |
| `assets/` | Logo, ícones e a imagem de compartilhamento (`og-image.png`) usados no site. |
| `marca/` | Arquivos oficiais da logo, como recebidos. |

## Como atualizar o site

1. Edite `index.html` (textos em português) e, se mudar algum texto, inclua a tradução no
   dicionário `I18N` dentro do próprio `index.html`.
2. Gere a versão publicada:
   ```bash
   python3 build.py            # cria dist/ (o que vai para o servidor)
   python3 build.py --inline   # cria neon-sistemas-preview.html (prévia em arquivo único)
   ```
3. Compacte o conteúdo de `dist/` (incluindo o `.htaccess`) num `.zip` e publique pelo
   hPanel (Gerenciador de Arquivos → `public_html`) ou pela API da Hostinger
   (`files/upload-urls` + `deploy`).
4. Limpe o cache do site e da CDN no hPanel.

> Observação: `dist/` e a prévia não são versionados (são gerados pelo `build.py`).

## Contato configurado no site

- WhatsApp: +55 (34) 98430-2083
- E-mail: contato@neonsistemas.com

## SEO

- Páginas por idioma: `/`, `/en/`, `/es/`, `/fr/`, `/de/`, `/zh/` (com hreflang).
- Dados estruturados (Organization, WebSite, WebPage, Product) gerados pelo `build.py`.
- Google Search Console verificado por registro TXT no DNS (não remover).
