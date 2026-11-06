-- Rodar conectado ao banco app_pessoal, como app_pessoal.
BEGIN;

CREATE TABLE contas (
  id              serial PRIMARY KEY,
  nome            text NOT NULL,
  banco           text NOT NULL,                 -- Nubank / Mercado Pago / Inter / Carteira
  tipo            text NOT NULL CHECK (tipo IN ('CORRENTE','CARTAO','INVESTIMENTO','CARTEIRA')),
  pluggy_account_id text UNIQUE,
  pluggy_item_id  text,
  saldo           numeric(14,2) NOT NULL DEFAULT 0,
  limite_cartao   numeric(14,2),
  fatura_valor    numeric(14,2),                 -- fatura ATUAL do cartao (Pluggy /bills)
  fatura_vencimento date,
  ativa           boolean NOT NULL DEFAULT true,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Pote do 50/30/20: NEC = necessidades, DES = desejos, INV = investir, NENHUM = nao conta (receita/transferencia)
CREATE TABLE categorias (
  id      serial PRIMARY KEY,
  nome    text NOT NULL UNIQUE,
  pote    text NOT NULL CHECK (pote IN ('NEC','DES','INV','NENHUM')),
  ativa   boolean NOT NULL DEFAULT true
);

-- De/para: categoria que o Pluggy manda -> nossa categoria (padrao ILIKE)
CREATE TABLE categorias_pluggy (
  id            serial PRIMARY KEY,
  padrao        text NOT NULL UNIQUE,
  categoria_id  int NOT NULL REFERENCES categorias(id)
);

-- Regras que voce ensina ("iFood e Desejos"): descricao ILIKE padrao -> categoria. Ganham de tudo.
CREATE TABLE regras (
  id            serial PRIMARY KEY,
  padrao        text NOT NULL,
  valor         numeric(14,2),                    -- opcional: regra so vale pra esse valor exato (ex.: salario 6000)
  categoria_id  int REFERENCES categorias(id),
  tipo          text CHECK (tipo IN ('DESPESA','RECEITA','TRANSFERENCIA','INVESTIMENTO','PAG_FATURA')),
  veiculo_id    int,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX regras_padrao_valor_uq ON regras (padrao, COALESCE(valor, -1));

CREATE TABLE veiculos (
  id           serial PRIMARY KEY,
  placa        text NOT NULL UNIQUE,              -- sem traco, maiuscula: ABC1D23
  apelido      text,                              -- "audi", "a5"
  modelo       text,
  combustivel  text,
  ativo        boolean NOT NULL DEFAULT true
);

CREATE TABLE lancamentos (
  id            bigserial PRIMARY KEY,
  conta_id      int REFERENCES contas(id),
  data          date NOT NULL,
  descricao     text NOT NULL,
  valor         numeric(14,2) NOT NULL,           -- negativo = saida, positivo = entrada
  tipo          text NOT NULL CHECK (tipo IN ('DESPESA','RECEITA','TRANSFERENCIA','INVESTIMENTO','PAG_FATURA')),
  categoria_id  int REFERENCES categorias(id),
  pote          text NOT NULL DEFAULT 'NENHUM' CHECK (pote IN ('NEC','DES','INV','NENHUM')),
  status        text NOT NULL DEFAULT 'CONFIRMADO' CHECK (status IN ('PROVISORIO','CONFIRMADO')),
  origem        text NOT NULL CHECK (origem IN ('PLUGGY','NOTIF','WHATSAPP','MANUAL')),
  pluggy_tx_id  text UNIQUE,
  pluggy_categoria text,
  veiculo_id    int REFERENCES veiculos(id),
  obs           text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lanc_data_idx ON lancamentos (data);
CREATE INDEX lanc_prov_idx ON lancamentos (status, data) WHERE status = 'PROVISORIO';

-- Renda e percentuais de cada mes (padrao 50/30/20)
CREATE TABLE orcamento_mes (
  mes      date PRIMARY KEY,                      -- sempre dia 1
  renda    numeric(14,2),                         -- null = usa as receitas do mes
  pct_nec  numeric(5,2) NOT NULL DEFAULT 50,
  pct_des  numeric(5,2) NOT NULL DEFAULT 30,
  pct_inv  numeric(5,2) NOT NULL DEFAULT 20
);

CREATE TABLE metas (
  id         serial PRIMARY KEY,
  nome       text NOT NULL,
  alvo       numeric(14,2) NOT NULL,
  acumulado  numeric(14,2) NOT NULL DEFAULT 0,
  prazo      date,
  ativa      boolean NOT NULL DEFAULT true
);

CREATE TABLE veiculo_eventos (
  id             serial PRIMARY KEY,
  veiculo_id     int NOT NULL REFERENCES veiculos(id),
  lancamento_id  bigint REFERENCES lancamentos(id),
  tipo           text NOT NULL CHECK (tipo IN ('ABASTECIMENTO','MANUTENCAO','DOCUMENTO')),
  data           date NOT NULL,
  km             int,
  litros         numeric(8,2),
  descricao      text
);

CREATE TABLE manutencao_planos (
  id            serial PRIMARY KEY,
  veiculo_id    int NOT NULL REFERENCES veiculos(id),
  nome          text NOT NULL,                    -- "Troca de oleo + filtro"
  a_cada_km     int,
  a_cada_meses  int,
  ultimo_km     int,
  ultima_data   date
);

CREATE TABLE listas (
  id    serial PRIMARY KEY,
  nome  text NOT NULL UNIQUE
);
CREATE TABLE lista_itens (
  id         serial PRIMARY KEY,
  lista_id   int NOT NULL REFERENCES listas(id) ON DELETE CASCADE,
  texto      text NOT NULL,
  feito      boolean NOT NULL DEFAULT false,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lembretes (
  id           serial PRIMARY KEY,
  texto        text NOT NULL,
  quando       timestamptz,
  recorrencia  text,                              -- null | DIARIA | MENSAL:10 | ...
  enviado_em   timestamptz,
  ativo        boolean NOT NULL DEFAULT true
);

-- Sino: toda falha de automacao vira notificacao (falha silenciosa e proibida)
CREATE TABLE notificacoes (
  id         serial PRIMARY KEY,
  nivel      text NOT NULL DEFAULT 'ERRO' CHECK (nivel IN ('INFO','AVISO','ERRO')),
  titulo     text NOT NULL,
  texto      text,
  lida       boolean NOT NULL DEFAULT false,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_log (
  id        serial PRIMARY KEY,
  fonte     text NOT NULL,
  inicio    timestamptz NOT NULL DEFAULT now(),
  fim       timestamptz,
  ok        boolean,
  novos     int DEFAULT 0,
  atualizados int DEFAULT 0,
  detalhe   text
);

-- Ajuste manual de UM lancamento (sobrevive a reimportacao: chave = id da transacao no Pluggy)
CREATE TABLE ajustes_lancamento (
  pluggy_tx_id  text PRIMARY KEY,
  tipo          text,
  categoria_id  int REFERENCES categorias(id),
  veiculo_id    int REFERENCES veiculos(id),
  obs           text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE configuracoes (
  chave  text PRIMARY KEY,
  valor  text
);

COMMIT;
