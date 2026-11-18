// Tabela de preços padrão do gerador de orçamento (editável no modo admin).
// Cada linha: [grupo, chave, rótulo, valor, unidade, fonte, nota]
// fonte: "pesquisado" = preço de loja/marketplace levantado em nov/2026 (sem data confirmada);
//        "estimativa" = valor de referência, não pesquisado: confirmar antes de usar.
'use strict';
const P = [
  // ---- Access points (Wi-Fi) — 5 níveis, do mais barato ao mais caro ----
  ['Wi-Fi (access point)', 'ap_1', 'Huawei AP361 · Wi-Fi 6 AX1800 (mais barato)', 390, 'un', 'pesquisado', 'Atende corredor e suíte com boa cobertura para até cerca de 15 aparelhos. Fixação no teto ou na parede. Alimentação PoE (802.3af).'],
  ['Wi-Fi (access point)', 'ap_2', 'Ubiquiti U6+ · Wi-Fi 6 dois rádios', 935, 'un', 'pesquisado', 'Melhor custo-benefício para suíte e corredor. Cobertura estável com muitos aparelhos. Gerenciável pelo controlador Ubiquiti.'],
  ['Wi-Fi (access point)', 'ap_3', 'TP-Link Omada EAP650 · Wi-Fi 6 AX3000', 1251, 'un', 'pesquisado', 'Gerenciável em nuvem, PoE, boa estabilidade para uso comercial.'],
  ['Wi-Fi (access point)', 'ap_4', 'TP-Link Omada EAP670 · Wi-Fi 6 AX5400', 1420, 'un', 'pesquisado', 'Mais capacidade e mais velocidade, para locais com muitos hóspedes simultâneos.'],
  ['Wi-Fi (access point)', 'ap_5', 'Ubiquiti U6-Pro · Wi-Fi 6 alta densidade', 1854, 'un', 'pesquisado', 'Topo de linha para alta densidade de aparelhos e cobertura premium.'],

  // ---- Switch principal (24 portas PoE) ----
  ['Switch principal', 'sw_1', 'Intelbras SG2404 PoE Max · 24 portas gerenciável (mais barato)', 1599, 'un', 'pesquisado', 'Gerenciável, PoE, 24 portas gigabit. Ideal para o porte de 30 suítes.'],
  ['Switch principal', 'sw_2', 'Intelbras S2328G-PA · 24 PoE+ e 4 SFP', 3840, 'un', 'pesquisado', 'Portas SFP para fibra ou uplink. PoE+ com mais potência por porta.'],
  ['Switch principal', 'sw_3', 'TP-Link TL-SG3428MP · 24 PoE+ gigabit gerenciável', 4337, 'un', 'pesquisado', 'Gerenciável, PoE+, boa gestão de VLAN e qualidade de serviço.'],
  ['Switch principal', 'sw_4', 'TP-Link TL-SG3428XMP · 24 PoE+ e 4 SFP+ 10G', 5506, 'un', 'pesquisado', 'Uplink de 10 Gbps para o servidor e o núcleo da rede.'],
  ['Switch principal', 'sw_5', 'Ubiquiti USW-24-POE · 24 PoE+ gerenciável', 6874, 'un', 'pesquisado', 'Topo de linha, integrado ao controlador Ubiquiti.'],

  // ---- Switch de ala (8 portas PoE) ----
  ['Switch de ala', 'sa_1', 'Ip-com G2210P-8-102W · 8 PoE gerenciável em nuvem (mais barato)', 763, 'un', 'pesquisado', 'Gerenciável em nuvem, 8 portas PoE, 1 SFP. Atende a ala com access points e tablets.'],
  ['Switch de ala', 'sa_2', 'TP-Link Omada TL-SG2210P · 8 PoE gigabit gerenciável', 1100, 'un', 'estimativa', 'Gerenciável, 8 portas PoE, 2 SFP. Confirmar preço atual.'],
  ['Switch de ala', 'sa_3', 'Ubiquiti EdgeSwitch · 8 PoE + 2 SFP', 1948, 'un', 'pesquisado', 'Modelo a confirmar no anúncio. Gerenciável com boa estabilidade.'],
  ['Switch de ala', 'sa_4', 'Ubiquiti UniFi Switch 8 PoE', 2100, 'un', 'estimativa', 'Integração com o controlador Ubiquiti. Confirmar preço.'],
  ['Switch de ala', 'sa_5', 'Naddod S2100P-8T2S · L2+ 8 PoE+ 130 W e 2 SFP', 3200, 'un', 'estimativa', 'Camada 2+, 130 W de PoE, para alas com muitos equipamentos.'],

  // ---- Cabeamento Cat6 (caixa de 305 m) ----
  ['Cabeamento Cat6', 'cab_1', 'Cabo Cat6 Giga 4 pares · caixa 305 m (mais barato)', 482, 'caixa', 'pesquisado', 'Cabo UTP Cat6 de 4 pares em cobre. Atende a instalação, desde que certificado e bem instalado.'],
  ['Cabeamento Cat6', 'cab_2', 'Furukawa SohoPlus Cat6 U/UTP · caixa 305 m', 1206, 'caixa', 'pesquisado', 'Marca de referência no mercado. Boa qualidade e garantia do fabricante.'],
  ['Cabeamento Cat6', 'cab_3', 'Intelbras IMPACT GIGA Cat6 · caixa 305 m', 1980, 'caixa', 'pesquisado', 'Cabo Cat6 da Intelbras, com garantia do fabricante.'],
  ['Cabeamento Cat6', 'cab_4', 'Furukawa Gigalan Cat6 · caixa 305 m', 2849, 'caixa', 'pesquisado', 'Linha premium para instalações de longa vida útil.'],
  ['Cabeamento Cat6', 'cab_5', 'Cabo Cat6 blindado (FTP) · caixa 305 m', 3500, 'caixa', 'estimativa', 'Blindagem contra interferência. Recomendado em áreas com muitos equipamentos elétricos.'],

  // ---- Insumos por ponto (keystone, caixa 4x2, tomada, patch cord) ----
  ['Insumos por ponto', 'kp_1', 'Kit básico por ponto · keystone, caixa 4x2, tomada e patch cord (mais barato)', 35, 'ponto', 'estimativa', 'Conector Cat6 genérico, caixa e tomada comuns, patch cord de 1 m.'],
  ['Insumos por ponto', 'kp_2', 'Kit padrão por ponto · keystone Cat6 de marca', 55, 'ponto', 'estimativa', 'Conector Cat6 de marca conhecida, caixa 4x2 e patch cord de qualidade.'],
  ['Insumos por ponto', 'kp_3', 'Kit reforçado por ponto · keystone Cat6 de marca', 75, 'ponto', 'estimativa', 'Conector de linha superior, acabamento e identificação completos.'],
  ['Insumos por ponto', 'kp_4', 'Kit premium por ponto · keystone Cat6 blindado', 95, 'ponto', 'estimativa', 'Conector blindado de marca, com acabamento premium.'],
  ['Insumos por ponto', 'kp_5', 'Kit topo por ponto · keystone blindado de linha premium', 120, 'ponto', 'estimativa', 'Linha premium com blindagem completa e acabamento de alto padrão.'],

  // ---- Rack e painel de conexão (conjunto por rack) ----
  ['Rack e painel', 'kr_1', 'Conjunto básico · painel 24 portas + suporte de parede 6U (mais barato)', 700, 'conjunto', 'parcial', 'Painel 24 portas (pesquisado: R$ 259) + suporte de parede (estimativa).'],
  ['Rack e painel', 'kr_2', 'Conjunto intermediário · painel 24 portas de marca + suporte 6U', 1000, 'conjunto', 'parcial', 'Painel 24 portas Rapink (pesquisado: R$ 444) + suporte 6U (estimativa).'],
  ['Rack e painel', 'kr_3', 'Conjunto padrão · rack 6U de parede + painel 24 portas + organizador', 1400, 'conjunto', 'estimativa', 'Rack fechado de parede com organizador de cabos.'],
  ['Rack e painel', 'kr_4', 'Conjunto reforçado · suporte de aço 6U (StarTech) + painel 24 portas', 1800, 'conjunto', 'parcial', 'Suporte StarTech 6U (pesquisado: R$ 1.030) + painel e organizador.'],
  ['Rack e painel', 'kr_5', 'Conjunto topo · rack 6U fechado com porta + painel blindado 24 portas', 2600, 'conjunto', 'estimativa', 'Rack fechado com porta, ventilação e painel blindado.'],

  // ---- Energia ----
  ['Energia', 'nb_600', 'Nobreak 600 VA para rack', 350, 'un', 'estimativa', 'Protege o rack da ala e o servidor da recepção.'],

  // ---- Tablets 8 polegadas (um por suíte) ----
  ['Tablet 8 polegadas', 't8_1', 'Samsung Galaxy Tab A9 Wi-Fi 8,7" 64 GB (mais barato)', 684, 'un', 'pesquisado', 'Tablet Android confiável para painel de suíte. Sem chip de celular.'],
  ['Tablet 8 polegadas', 't8_2', 'Samsung Galaxy Tab A9 Enterprise 4G 8,7" 64 GB', 849, 'un', 'pesquisado', 'Versão corporativa com 4G, gestão de frota e garantia estendida.'],
  ['Tablet 8 polegadas', 't8_3', 'Samsung Galaxy Tab A9 4G 8,7" 64 GB', 1099, 'un', 'pesquisado', 'Mesmo modelo com 4G para operação sem depender do Wi-Fi.'],
  ['Tablet 8 polegadas', 't8_4', 'Tablet 8" de linha superior com 4G', 1300, 'un', 'estimativa', 'Modelo de linha superior de 8 polegadas. Confirmar disponibilidade.'],
  ['Tablet 8 polegadas', 't8_5', 'Tablet 8" industrial ou reforçado', 2200, 'un', 'estimativa', 'Capa reforçada e vidro resistente para uso intenso.'],

  // ---- Tablets 10,1 polegadas (um por suíte) ----
  ['Tablet 10,1 polegadas', 't10_1', 'Tablet Android 10,1" 6 GB / 128 GB (mais barato)', 716, 'un', 'pesquisado', 'Tablet Android 10,1" para estudo e trabalho. Compatível com o painel. Confirmar modelo específico.'],
  ['Tablet 10,1 polegadas', 't10_2', 'Samsung Galaxy Tab A9+ Wi-Fi (11")', 1377, 'un', 'pesquisado', 'Tela de 11 polegadas, a referência mais próxima de 10,1" da Samsung.'],
  ['Tablet 10,1 polegadas', 't10_3', 'Samsung Galaxy Tab A9+ 5G (11")', 1567, 'un', 'pesquisado', 'Versão com 5G, para operação sem depender do Wi-Fi.'],
  ['Tablet 10,1 polegadas', 't10_4', 'Lenovo Tab M10 10,1"', 1500, 'un', 'estimativa', 'Tablet 10,1" de marca conhecida. Confirmar preço.'],
  ['Tablet 10,1 polegadas', 't10_5', 'Samsung Galaxy Tab S9 FE (10,9")', 3000, 'un', 'estimativa', 'Linha premium, com caneta e alto desempenho. Confirmar preço.'],

  // ---- Acessórios de tablet e suíte ----
  ['Acessórios da suíte', 'mt_suporte', 'Suporte de parede antifurto para tablet', 120, 'un', 'estimativa', 'Suporte com trava antifurto, para tablet de 8" ou 10,1".'],
  ['Acessórios da suíte', 'hw_central', 'Central de automação da suíte (placa Neon) · preço de venda', 900, 'suíte', 'definir', 'Custo de fabricação informado: cerca de R$ 500. O preço de venda deve ser definido por você.'],

  // ---- Software Neon (valores configuráveis) ----
  ['Software Neon', 'sw_motel_licenca', 'Neon Motel · licença inicial', 1500, 'licença', 'estimativa', 'Implantação do sistema de gestão. Valor configurável.'],
  ['Software Neon', 'sw_motel_mensal', 'Neon Motel · mensalidade', 499, 'mês', 'estimativa', 'Sugestão baseada em sistemas de gestão hoteleira (faixa de US$ 100 a 300 por mês). Ajustar.'],
  ['Software Neon', 'sw_painel_licenca', 'Painel Neon · licença por suíte (única)', 290, 'suíte', 'estimativa', 'Licença do painel touch por suíte. Valor configurável.'],
  ['Software Neon', 'sw_painel_mensal', 'Painel Neon · mensalidade por suíte', 9, 'suíte/mês', 'estimativa', 'Mensalidade por suíte, com atualizações e cenas. Valor configurável.'],
  ['Software Neon', 'sw_pabx_licenca', 'PABX Neon · licença por ramal (única)', 60, 'ramal', 'estimativa', 'Licença por ramal no celular. Valor configurável.'],
  ['Software Neon', 'sw_pabx_mensal', 'PABX Neon · mensalidade por ramal', 25, 'ramal/mês', 'estimativa', 'Mensalidade por ramal. Valor configurável.'],

  // ---- Serviços e mão de obra (valores configuráveis) ----
  ['Serviços e mão de obra', 'sv_passagem', 'Passagem de cabo Cat6 por ponto', 85, 'ponto', 'estimativa', 'Lançamento, identificação e fixação. Confirmar com empresas locais (SINAPI do estado).'],
  ['Serviços e mão de obra', 'sv_certificacao', 'Certificação e teste por ponto (relatório)', 45, 'ponto', 'estimativa', 'Teste de continuidade e certificação com relatório.'],
  ['Serviços e mão de obra', 'sv_rack', 'Montagem do rack, switches e organização', 500, 'serviço', 'estimativa', 'Fixação, identificação e organização dos cabos.'],
  ['Serviços e mão de obra', 'sv_tomada', 'Tomada elétrica para suíte', 180, 'suíte', 'estimativa', 'Tomada 110/220 V perto do painel.'],
  ['Serviços e mão de obra', 'sv_inst_suite', 'Instalação do painel e tablet por suíte', 250, 'suíte', 'estimativa', 'Fixação do tablet, energia e ligação ao painel.'],
  ['Serviços e mão de obra', 'sv_config_motel', 'Instalação e configuração do Neon Motel', 1200, 'serviço', 'estimativa', 'Servidor da recepção, cadastro de suítes e equipe.'],
  ['Serviços e mão de obra', 'sv_config_pabx', 'Instalação e configuração do PABX Neon', 900, 'serviço', 'estimativa', 'Servidor, ramais, URA e integração com o Neon Motel.'],
  ['Serviços e mão de obra', 'sv_config_rede', 'Configuração de redes Wi-Fi', 600, 'serviço', 'estimativa', 'Separação de redes (sistema, hóspedes e telefonia), segurança e testes.'],
  ['Serviços e mão de obra', 'sv_treino_hora', 'Treinamento da equipe (por hora)', 180, 'hora', 'estimativa', 'Operação do painel, recepção e rotina.'],
  ['Serviços e mão de obra', 'sv_suporte_inicial', 'Suporte inicial (3 meses)', 0, 'mês', 'incluso', 'Incluído no valor da implantação.'],
  ['Serviços e mão de obra', 'sv_suporte_mensal', 'Suporte mensal após o período inicial', 390, 'mês', 'estimativa', 'Atendimento remoto e visitas de manutenção.'],
];

// Metadados: grupos de escolha (5 níveis) para a interface
const NIVEIS = {
  ap: ['ap_1', 'ap_2', 'ap_3', 'ap_4', 'ap_5'],
  sw: ['sw_1', 'sw_2', 'sw_3', 'sw_4', 'sw_5'],
  sa: ['sa_1', 'sa_2', 'sa_3', 'sa_4', 'sa_5'],
  cab: ['cab_1', 'cab_2', 'cab_3', 'cab_4', 'cab_5'],
  kp: ['kp_1', 'kp_2', 'kp_3', 'kp_4', 'kp_5'],
  kr: ['kr_1', 'kr_2', 'kr_3', 'kr_4', 'kr_5'],
  t8: ['t8_1', 't8_2', 't8_3', 't8_4', 't8_5'],
  t10: ['t10_1', 't10_2', 't10_3', 't10_4', 't10_5'],
};

module.exports = { PRECOS: P, NIVEIS };
