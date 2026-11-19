/* Usa o mesmo tema escolhido no painel (claro/escuro) */
(function () { try { var t = localStorage.getItem('neon_tema'); if (t === 'claro') document.documentElement.dataset.theme = 'light'; else if (t === 'escuro') document.documentElement.dataset.theme = 'dark'; } catch (e) { /* sem armazenamento */ } })();
