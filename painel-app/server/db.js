const mysql = require('mysql2/promise');

let pool;

function config() {
  const env = process.env;
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE || env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(env.DB_POOL || 8),
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(config());
    pool.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));
  }
  return pool;
}

async function q(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    senha_hash VARCHAR(100) NULL,
    funcao VARCHAR(20) NOT NULL DEFAULT 'equipe',
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    totp_secret VARCHAR(64) NULL,
    totp_ativo TINYINT(1) NOT NULL DEFAULT 0,
    sessao_versao INT NOT NULL DEFAULT 1,
    ultimo_acesso DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS arquivos (
    id CHAR(36) PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    disco VARCHAR(255) NOT NULL,
    pasta VARCHAR(60) NOT NULL DEFAULT 'geral',
    mime VARCHAR(120) NULL,
    tamanho BIGINT NOT NULL DEFAULT 0,
    sha256 CHAR(64) NULL,
    completo TINYINT(1) NOT NULL DEFAULT 0,
    enviado_por INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (pasta)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    codigo VARCHAR(60) NOT NULL UNIQUE,
    preco_padrao DECIMAL(12,2) NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    descricao TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'lead',
    tipo VARCHAR(20) NULL,
    nome_fantasia VARCHAR(160) NOT NULL,
    razao_social VARCHAR(200) NULL,
    cnpj VARCHAR(20) NULL,
    num_suites INT NULL,
    responsavel_id INT NULL,
    origem VARCHAR(20) NULL,
    contato_nome VARCHAR(120) NULL,
    telefone VARCHAR(20) NULL,
    whatsapp VARCHAR(20) NULL,
    email VARCHAR(160) NULL,
    cep VARCHAR(9) NULL,
    endereco VARCHAR(200) NULL,
    numero VARCHAR(20) NULL,
    bairro VARCHAR(100) NULL,
    cidade VARCHAR(100) NULL,
    uf CHAR(2) NULL,
    etapa_funil VARCHAR(20) NULL DEFAULT 'novo',
    valor_estimado DECIMAL(12,2) NULL,
    cliente_desde DATE NULL,
    observacoes TEXT NULL,
    ultimo_contato DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (status), INDEX (nome_fantasia), INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS instalacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    produto_id INT NOT NULL,
    codigo VARCHAR(60) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ativa',
    canal VARCHAR(10) NOT NULL DEFAULT 'estavel',
    versao_instalada VARCHAR(40) NULL,
    ip VARCHAR(60) NULL,
    acesso_remoto VARCHAR(200) NULL,
    observacoes TEXT NULL,
    ultimo_contato DATETIME NULL,
    token_hash CHAR(64) NULL,
    token_prefixo VARCHAR(12) NULL,
    token_criado_em DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (cliente_id), INDEX (produto_id), UNIQUE KEY (token_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS licencas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chave VARCHAR(40) NOT NULL UNIQUE,
    cliente_id INT NULL,
    instalacao_id INT NOT NULL,
    plano VARCHAR(20) NULL,
    valor_mensal DECIMAL(12,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativa',
    inicio DATE NULL,
    vencimento DATE NULL,
    gerar_cobranca TINYINT(1) NOT NULL DEFAULT 1,
    dia_vencimento INT NULL DEFAULT 10,
    contrato_arquivo CHAR(36) NULL,
    observacoes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (instalacao_id), INDEX (cliente_id), INDEX (vencimento)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS versoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    numero VARCHAR(40) NOT NULL,
    canal VARCHAR(10) NOT NULL DEFAULT 'estavel',
    data_lancamento DATE NULL,
    publicada TINYINT(1) NOT NULL DEFAULT 0,
    obrigatoria TINYINT(1) NOT NULL DEFAULT 0,
    arquivo CHAR(36) NULL,
    sha256 VARCHAR(64) NULL,
    notas TEXT NULL,
    downloads INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (produto_id, canal, publicada)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS chamados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    instalacao_id INT NULL,
    titulo VARCHAR(200) NOT NULL,
    prioridade VARCHAR(10) NOT NULL DEFAULT 'media',
    status VARCHAR(20) NOT NULL DEFAULT 'aberto',
    canal VARCHAR(20) NULL,
    responsavel_id INT NULL,
    prazo DATE NULL,
    descricao TEXT NULL,
    solucao TEXT NULL,
    anexos JSON NULL,
    resolvido_em DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (cliente_id), INDEX (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS cobrancas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    licenca_id INT NULL,
    competencia CHAR(7) NOT NULL,
    valor DECIMAL(12,2) NOT NULL DEFAULT 0,
    vencimento DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    pago_em DATE NULL,
    forma VARCHAR(20) NULL,
    comprovante CHAR(36) NULL,
    observacoes TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (cliente_id), INDEX (status, vencimento), UNIQUE KEY lic_comp (licenca_id, competencia)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contatos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'ligacao',
    data DATETIME NOT NULL,
    usuario_id INT NULL,
    resumo TEXT NOT NULL,
    proximo_passo VARCHAR(255) NULL,
    lembrete DATETIME NULL,
    concluido TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (cliente_id), INDEX (lembrete, concluido)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS checkins (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    instalacao_id INT NULL,
    codigo_instalacao VARCHAR(60) NULL,
    evento VARCHAR(20) NULL,
    versao VARCHAR(40) NULL,
    mensagem VARCHAR(500) NULL,
    detalhes JSON NULL,
    ip VARCHAR(60) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (instalacao_id, created_at), INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS atividades (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,
    usuario_nome VARCHAR(120) NULL,
    acao VARCHAR(20) NOT NULL,
    entidade VARCHAR(40) NULL,
    entidade_id VARCHAR(40) NULL,
    resumo VARCHAR(255) NULL,
    mudancas JSON NULL,
    ip VARCHAR(60) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (entidade, entidade_id), INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS campanhas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(160) NOT NULL,
    objetivo VARCHAR(30) NULL,
    produto_id INT NULL,
    publico VARCHAR(255) NULL,
    tom VARCHAR(30) NULL,
    inicio DATE NULL,
    fim DATE NULL,
    orcamento DECIMAL(12,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    redes JSON NULL,
    briefing TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campanha_id INT NULL,
    titulo VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NULL,
    texto TEXT NULL,
    textos JSON NULL,
    hashtags VARCHAR(500) NULL,
    imagem CHAR(36) NULL,
    video CHAR(36) NULL,
    redes JSON NULL,
    publicar_site TINYINT(1) NOT NULL DEFAULT 0,
    agendado_para DATETIME NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    resultado JSON NULL,
    tentativas INT NOT NULL DEFAULT 0,
    publicado_em DATETIME NULL,
    gerado_por_ia TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (status, agendado_para), INDEX (campanha_id), INDEX (publicar_site, publicado_em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS integracoes (
    rede VARCHAR(30) PRIMARY KEY,
    ativo TINYINT(1) NOT NULL DEFAULT 0,
    config JSON NULL,
    ultimo_teste DATETIME NULL,
    ultimo_status VARCHAR(255) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS tarefas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(160) NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    cron VARCHAR(60) NOT NULL,
    parametros JSON NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    sistema TINYINT(1) NOT NULL DEFAULT 0,
    ultima_execucao DATETIME NULL,
    proxima_execucao DATETIME NULL,
    ultimo_resultado TEXT NULL,
    ultimo_ok TINYINT(1) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS configuracoes (
    chave VARCHAR(60) PRIMARY KEY,
    valor TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Colunas adicionadas depois da primeira versão
const COLUMNS = [
  ['posts', 'modelo', 'VARCHAR(30) NULL'],
  ['posts', 'arte', 'JSON NULL'],
  ['posts', 'biblioteca', 'TINYINT(1) NOT NULL DEFAULT 0'],
];

async function migrate() {
  for (const sql of SCHEMA) await q(sql);
  for (const [t, c, def] of COLUMNS) {
    const ex = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]);
    if (!ex.length) await q(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`);
  }
}

module.exports = { q, one, getPool, migrate };
