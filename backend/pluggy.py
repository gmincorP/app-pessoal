"""Sincronizacao com o Pluggy (Open Finance, plano gratis Meu Pluggy -- somente leitura).

Uso:
    python pluggy.py sync            -> sincroniza contas e lancamentos (agendar 1x/dia, 06:00)
    python pluggy.py sync --dias 90  -> carga inicial pegando 90 dias pra tras
    python pluggy.py categorias      -> lista as categorias do Pluggy que ainda nao tem de/para

Fluxo de cada transacao:
  1. ja existe com o mesmo pluggy_tx_id  -> atualiza valor/data/status (pendente que virou postado)
  2. existe PROVISORIO (veio da notificacao do celular) com mesmo valor, conta e data +-2 dias
     -> confirma ele (nao duplica)
  3. senao -> insere novo, ja classificado (tipo, categoria, pote 50/30/20)
"""
import json
import os
import sys
from datetime import date, timedelta

import db
from classificar import classificar
from notificar import notificar, _log
from pluggy_client import (PluggyClient, PluggyErro, tipo_conta, banco_da_conta, banco_do_item,
                           normalizar_transacao, normalizar_fatura, limites_cartao)


def _migrar():
    """Ajustes de schema em bancos ja criados (idempotente)."""
    for sql in (
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS fatura_valor numeric(14,2)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS fatura_vencimento date",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS subtipo text",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS numero text",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS limite_disponivel numeric(14,2)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fatura_mes char(7)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS cartao_final text",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS mcc int",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS estabelecimento text",
        """CREATE TABLE IF NOT EXISTS faturas (
             id serial PRIMARY KEY, conta_id int NOT NULL REFERENCES contas(id),
             pluggy_bill_id text UNIQUE, mes char(7) NOT NULL, fechamento date, vencimento date NOT NULL,
             total numeric(14,2) NOT NULL DEFAULT 0, minimo numeric(14,2), encargos numeric(14,2) DEFAULT 0,
             atualizado_em timestamptz NOT NULL DEFAULT now(), UNIQUE (conta_id, mes))""",
        """CREATE TABLE IF NOT EXISTS fatura_pagamentos (
             id serial PRIMARY KEY, fatura_id int NOT NULL REFERENCES faturas(id) ON DELETE CASCADE,
             pluggy_pagamento_id text UNIQUE, data date NOT NULL, valor numeric(14,2) NOT NULL, tipo text)""",
        # final do cartao -> de quem e o gasto. uso: PESSOAL | GM (gasto da GM nao entra nos potes)
        """CREATE TABLE IF NOT EXISTS cartoes_finais (
             conta_id int NOT NULL REFERENCES contas(id), final text NOT NULL, apelido text,
             uso text NOT NULL DEFAULT 'PESSOAL' CHECK (uso IN ('PESSOAL','GM')), PRIMARY KEY (conta_id, final))""",
        "INSERT INTO categorias (nome, pote) VALUES ('Gasto da GM (reembolsável)','NENHUM') ON CONFLICT (nome) DO NOTHING",
        "ALTER TABLE faturas ADD COLUMN IF NOT EXISTS saldo_anterior numeric(14,2) DEFAULT 0",
        "ALTER TABLE faturas ADD COLUMN IF NOT EXISTS encargos_detalhe jsonb",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS limite_configurado numeric(14,2)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS bandeira text",
        "ALTER TABLE cartoes_finais ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true",
        "ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_origem_check",
        "ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_origem_check CHECK (origem IN ('PLUGGY','NOTIF','WHATSAPP','MANUAL','OFX'))",
        # caixinhas = subcontas de uma conta de aplicacao (ex.: Caixinhas RDB do Nubank)
        """CREATE TABLE IF NOT EXISTS caixinhas (
             id serial PRIMARY KEY, banco text NOT NULL, nome text NOT NULL, meta numeric(14,2), prazo date,
             saldo_inicial numeric(14,2) NOT NULL DEFAULT 0, data_inicial date NOT NULL DEFAULT current_date,
             ativa boolean NOT NULL DEFAULT true, criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE (banco, nome))""",
        # qual caixinha recebeu/devolveu cada "Aplicacao RDB"/"Resgate RDB" do extrato
        """CREATE TABLE IF NOT EXISTS caixinha_movimentos (
             lancamento_id bigint PRIMARY KEY REFERENCES lancamentos(id) ON DELETE CASCADE,
             caixinha_id int NOT NULL REFERENCES caixinhas(id) ON DELETE CASCADE)""",
        # transferencia registrada no app (antes ou sem extrato); liga ao lancamento do banco quando ele chegar
        """CREATE TABLE IF NOT EXISTS transferencias (
             id serial PRIMARY KEY, data date NOT NULL, valor numeric(14,2) NOT NULL CHECK (valor > 0),
             tipo text NOT NULL CHECK (tipo IN ('APLICACAO','RESGATE','ENTRE_BANCOS','SAQUE')),
             de_conta_id int REFERENCES contas(id), para_conta_id int REFERENCES contas(id),
             caixinha_id int REFERENCES caixinhas(id), obs text,
             lancamento_id bigint REFERENCES lancamentos(id), criado_em timestamptz NOT NULL DEFAULT now())""",
        # ---- cadastro manual estilo Minhas Financas ----
        "ALTER TABLE categorias ADD COLUMN IF NOT EXISTS natureza text NOT NULL DEFAULT 'DESPESA'",
        """UPDATE categorias SET natureza='RECEITA' WHERE nome IN ('Salário / renda','Retirada de lucro','Rendimentos',
             'Reembolso da empresa','Empréstimo recebido') AND natureza <> 'RECEITA'""",
        """UPDATE categorias SET natureza='TRANSFERENCIA' WHERE nome IN ('Transferência entre contas','Pagamento de fatura',
             'Dinheiro de terceiros') AND natureza <> 'TRANSFERENCIA'""",
        "INSERT INTO categorias (nome, pote, natureza) VALUES ('Outras receitas','NENHUM','RECEITA') ON CONFLICT (nome) DO NOTHING",
        """CREATE TABLE IF NOT EXISTS subcategorias (
             id serial PRIMARY KEY, categoria_id int NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
             nome text NOT NULL, UNIQUE (categoria_id, nome))""",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS subcategoria_id int REFERENCES subcategorias(id)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS tags text[]",
        """CREATE TABLE IF NOT EXISTS recorrencias (
             id serial PRIMARY KEY, tipo text NOT NULL CHECK (tipo IN ('FIXA','PARCELADA')),
             periodicidade text NOT NULL, a_cada_dias int, total int, criado_em timestamptz NOT NULL DEFAULT now())""",
        # lancamento futuro/nao efetivado: NAO mexe em saldo; vira lancamento quando efetiva ou quando o banco traz
        """CREATE TABLE IF NOT EXISTS agendados (
             id serial PRIMARY KEY, natureza text NOT NULL CHECK (natureza IN ('RECEITA','DESPESA')),
             descricao text NOT NULL, valor numeric(14,2) NOT NULL, data date NOT NULL,
             conta_id int REFERENCES contas(id), categoria_id int REFERENCES categorias(id),
             subcategoria_id int REFERENCES subcategorias(id), tags text[],
             recorrencia_id int REFERENCES recorrencias(id), parcela_n int, parcela_total int,
             lancamento_id bigint REFERENCES lancamentos(id) ON DELETE SET NULL,
             criado_em timestamptz NOT NULL DEFAULT now())""",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS recorrencia_id int REFERENCES recorrencias(id)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS parcela_n int",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS parcela_total int",
        # subcategoria em todo o app: regras aprendidas e ajustes por transacao tambem guardam a subcategoria
        "ALTER TABLE regras ADD COLUMN IF NOT EXISTS subcategoria_id int REFERENCES subcategorias(id) ON DELETE SET NULL",
        "ALTER TABLE ajustes_lancamento ADD COLUMN IF NOT EXISTS subcategoria_id int REFERENCES subcategorias(id) ON DELETE SET NULL",
        # cartao cadastrado a mao (estilo Minhas Financas) + RESPONSAVEL: cartao da GM nao entra nas despesas pessoais
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT 'PESSOAL'",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS cor text",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS dia_fechamento int",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS dia_vencimento int",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS fech_dinamico boolean NOT NULL DEFAULT false",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS venc_dias_uteis boolean NOT NULL DEFAULT false",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS conta_pagamento_id int",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS notif_app text",
        "ALTER TABLE faturas ADD COLUMN IF NOT EXISTS saldo_inicial numeric(14,2) NOT NULL DEFAULT 0",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS responsavel text NOT NULL DEFAULT 'PESSOAL'",
        # caixinha/conta de investimento que NAO conta como economia mensal (ex.: aluguel guardado de terceiro)
        "ALTER TABLE caixinhas ADD COLUMN IF NOT EXISTS economia boolean NOT NULL DEFAULT true",
        # configuracao por banco (nome exibido, cor, emoji) e contas: apelido, atrelar a outro banco, conta manual
        "CREATE TABLE IF NOT EXISTS bancos_config (banco text PRIMARY KEY, apelido text, cor text, emoji text)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS apelido text",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS banco_grupo text",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS saldo_inicial numeric(14,2) NOT NULL DEFAULT 0",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS data_inicial date",
    ):
        db.execute(sql)
    _garantir_contas_virtuais()


def _garantir_contas_virtuais():
    """Contas que o Open Finance nao entrega: carteira (dinheiro) e a conta-mae das caixinhas do Nubank."""
    for nome, banco, tipo in (("Carteira", "Dinheiro", "CARTEIRA"), ("Caixinhas (RDB)", "Nubank", "INVESTIMENTO")):
        if not db.query("SELECT 1 FROM contas WHERE nome=%s AND banco=%s AND tipo=%s", (nome, banco, tipo)):
            db.execute("INSERT INTO contas (nome, banco, tipo, saldo) VALUES (%s,%s,%s,0)", (nome, banco, tipo))


def ligar_transferencias():
    """Transferencia registrada no app + lancamento do extrato com mesmo valor (+-3 dias) = o mesmo movimento.
    Aplicacao/Resgate ligados herdam a caixinha escolhida."""
    n = 0
    for t in db.query("SELECT * FROM transferencias WHERE lancamento_id IS NULL AND tipo IN ('APLICACAO','RESGATE')"):
        desc = "Aplica%%" if t["tipo"] == "APLICACAO" else "Resgate%%"
        sinal = -1 if t["tipo"] == "APLICACAO" else 1
        l = db.query("""SELECT l.id FROM lancamentos l WHERE l.descricao ILIKE %s AND l.valor = %s
                          AND l.data BETWEEN %s::date - 3 AND %s::date + 3
                          AND NOT EXISTS (SELECT 1 FROM transferencias x WHERE x.lancamento_id=l.id)
                        ORDER BY abs(l.data - %s::date) LIMIT 1""",
                     (desc, sinal * float(t["valor"]), t["data"], t["data"], t["data"]))
        if l:
            db.execute("UPDATE transferencias SET lancamento_id=%s WHERE id=%s", (l[0]["id"], t["id"]))
            if t["caixinha_id"]:
                db.execute("""INSERT INTO caixinha_movimentos (lancamento_id, caixinha_id) VALUES (%s,%s)
                              ON CONFLICT (lancamento_id) DO UPDATE SET caixinha_id=EXCLUDED.caixinha_id""",
                           (l[0]["id"], t["caixinha_id"]))
            n += 1
    return n


def _gravar_faturas(pc, conta_id, acc):
    """Todas as faturas do cartao (historico ~12 meses) + pagamentos + fatura vigente na conta."""
    try:
        faturas = [normalizar_fatura(b) for b in pc.faturas(acc["id"])]
    except PluggyErro as e:
        _log(f"[PLUGGY] faturas indisponiveis p/ conta {acc.get('name')}: {e}")
        return
    for f in faturas:
        r = db.execute("""INSERT INTO faturas (conta_id, pluggy_bill_id, mes, fechamento, vencimento, total, minimo, encargos,
                                               saldo_anterior, encargos_detalhe)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                          ON CONFLICT (conta_id, mes) DO UPDATE SET pluggy_bill_id=EXCLUDED.pluggy_bill_id,
                            fechamento=EXCLUDED.fechamento, vencimento=EXCLUDED.vencimento, total=EXCLUDED.total,
                            minimo=EXCLUDED.minimo, encargos=EXCLUDED.encargos, saldo_anterior=EXCLUDED.saldo_anterior,
                            encargos_detalhe=EXCLUDED.encargos_detalhe, atualizado_em=now()
                          RETURNING id""",
                       (conta_id, f["id"], f["mes"], f["fechamento"], f["vencimento"], f["total"], f["minimo"],
                        f["encargos"], f["saldo_anterior"], json.dumps(f["encargos_detalhe"], ensure_ascii=False)))
        fid = r[0]["id"]
        for p in f["pagamentos"]:
            if p["data"] and p["valor"]:
                db.execute("""INSERT INTO fatura_pagamentos (fatura_id, pluggy_pagamento_id, data, valor, tipo)
                              VALUES (%s,%s,%s,%s,%s) ON CONFLICT (pluggy_pagamento_id) DO NOTHING""",
                           (fid, p["id"], p["data"], p["valor"], p["tipo"]))
    limite = (date.today() - timedelta(days=5)).isoformat()
    vig = sorted((f for f in faturas if f["vencimento"] >= limite), key=lambda f: f["vencimento"])
    if vig:
        db.execute("UPDATE contas SET fatura_valor=%s, fatura_vencimento=%s WHERE id=%s",
                   (vig[0]["total"], vig[0]["vencimento"], conta_id))


def _add_mes(d, n):
    import calendar
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def _dia(y, m, d):
    import calendar
    return date(y, m, min(int(d), calendar.monthrange(y, m)[1]))


def _datas_fatura(c, y, m):
    """(fechamento, vencimento) da fatura do cartao manual que VENCE no mes y-m."""
    dv = int(c["dia_vencimento"])
    df = int(c["dia_fechamento"] or dv)
    ve_nom = _dia(y, m, dv)
    py, pm = (y, m - 1) if m > 1 else (y - 1, 12)
    fe_nom = _dia(y, m, df) if df < dv else _dia(py, pm, df)
    ve = ve_nom
    if c["venc_dias_uteis"]:                      # sabado/domingo -> proximo dia util
        while ve.weekday() >= 5:
            ve += timedelta(days=1)
    fe = ve - (ve_nom - fe_nom) if c["fech_dinamico"] else fe_nom   # dinamico: fecha N dias antes do vencimento real
    return fe, ve


def gerar_faturas_manuais(conta_id=None):
    """Cartoes cadastrados a mao: cria as faturas (12 meses pra tras, 24 pra frente) pelos dias de fechamento/vencimento,
    liga as compras pela data e recalcula total, fatura vigente e limite usado."""
    hoje = date.today()
    cs = db.query("""SELECT * FROM contas WHERE tipo='CARTAO' AND pluggy_account_id IS NULL AND dia_vencimento IS NOT NULL
                     AND (%s::int IS NULL OR id=%s::int)""", (conta_id, conta_id))
    if not cs:
        return 0
    base = date(hoje.year, hoje.month, 1)
    for c in cs:
        for k in range(-12, 25):
            d = _add_mes(base, k)
            fe, ve = _datas_fatura(c, d.year, d.month)
            db.execute("""INSERT INTO faturas (conta_id, mes, fechamento, vencimento) VALUES (%s,%s,%s,%s)
                          ON CONFLICT (conta_id, mes) DO UPDATE SET fechamento=EXCLUDED.fechamento, vencimento=EXCLUDED.vencimento
                          WHERE faturas.fechamento IS DISTINCT FROM EXCLUDED.fechamento
                             OR faturas.vencimento IS DISTINCT FROM EXCLUDED.vencimento""",
                       (c["id"], d.strftime("%Y-%m"), fe, ve))
    vincular_faturas()
    for c in cs:
        db.execute("""UPDATE faturas f SET total = coalesce(f.saldo_inicial,0) + coalesce((SELECT -sum(l.valor) FROM lancamentos l
                        WHERE l.conta_id=f.conta_id AND l.fatura_mes=f.mes AND l.tipo <> 'PAG_FATURA'),0), atualizado_em=now()
                      WHERE f.conta_id=%s""", (c["id"],))
        pend = """f.total - coalesce((SELECT sum(p.valor) FROM fatura_pagamentos p WHERE p.fatura_id=f.id),0)"""
        vig = db.query(f"""SELECT greatest({pend},0)::float8 falta, f.vencimento FROM faturas f WHERE f.conta_id=%s
                           AND f.vencimento >= %s ORDER BY f.vencimento LIMIT 1""", (c["id"], hoje - timedelta(days=5)))
        usado = db.query(f"SELECT coalesce(sum(greatest({pend},0)),0)::float8 v FROM faturas f WHERE f.conta_id=%s", (c["id"],))[0]["v"]
        lim = float(c["limite_cartao"] or 0)
        db.execute("""UPDATE contas SET fatura_valor=%s, fatura_vencimento=%s, saldo=%s, limite_disponivel=%s, atualizado_em=now()
                      WHERE id=%s""", (vig[0]["falta"] if vig else 0, vig[0]["vencimento"] if vig else None, round(usado, 2),
                                       round(lim - usado, 2) if lim else None, c["id"]))
    return len(cs)


def aplicar_responsavel():
    """Lancamento e da GM quando o CARTAO (conta) e da GM ou quando o FINAL do cartao esta marcado como GM.
    Gasto da GM fica so na aba Cartoes: fora das despesas, do 50/30/20 e da fatura pessoal."""
    return len(db.execute("""UPDATE lancamentos l SET responsavel=x.r FROM (
            SELECT l2.id, CASE WHEN ct.responsavel='GM' OR EXISTS (SELECT 1 FROM cartoes_finais cf WHERE cf.conta_id=l2.conta_id
                                    AND cf.final=l2.cartao_final AND cf.uso='GM') THEN 'GM' ELSE 'PESSOAL' END r
              FROM lancamentos l2 JOIN contas ct ON ct.id=l2.conta_id) x
        WHERE x.id=l.id AND l.responsavel IS DISTINCT FROM x.r RETURNING l.id"""))


def aplicar_economia():
    """Aplicacao/resgate ligado a uma caixinha que NAO e economia mensal sai do pote Investir (pote NENHUM);
    os demais investimentos voltam para INV. Continua tipo INVESTIMENTO: aparece na tela de investimentos."""
    return len(db.execute("""UPDATE lancamentos l SET pote=x.p FROM (
            SELECT l2.id, CASE WHEN cx.economia IS FALSE THEN 'NENHUM' ELSE 'INV' END p
              FROM lancamentos l2 LEFT JOIN caixinha_movimentos m ON m.lancamento_id=l2.id
              LEFT JOIN caixinhas cx ON cx.id=m.caixinha_id
             WHERE l2.tipo='INVESTIMENTO') x
        WHERE x.id=l.id AND l.pote IS DISTINCT FROM x.p RETURNING l.id"""))


def vincular_faturas():
    """Liga cada compra do cartao a sua fatura PELAS DATAS DE FECHAMENTO (o billForecastDate do Pluggy
    nao e consistente entre bancos: no Inter vem 1 mes defasado). Compra no dia do fechamento vai pra
    proxima fatura. Para alem da ultima fatura conhecida, projeta fechamentos mensais (parcelas futuras)."""
    n = 0
    for c in db.query("SELECT id FROM contas WHERE tipo='CARTAO'"):
        fs = db.query("""SELECT mes, fechamento, vencimento FROM faturas WHERE conta_id=%s AND fechamento IS NOT NULL
                         ORDER BY fechamento""", (c["id"],))
        if not fs:
            continue
        ult = fs[-1]
        for k in range(1, 25):                          # projeta 24 meses a frente
            fe, ve = _add_mes(ult["fechamento"], k), _add_mes(ult["vencimento"], k)
            fs.append({"mes": ve.strftime("%Y-%m"), "fechamento": fe, "vencimento": ve})
        ant = None
        for f in fs:
            cond, params = ("data < %s", [f["fechamento"]]) if ant is None else ("data >= %s AND data < %s", [ant, f["fechamento"]])
            if ant is None:                             # antes da 1a fatura conhecida: so os dos ultimos 35 dias
                cond, params = "data >= %s AND data < %s", [f["fechamento"] - timedelta(days=35), f["fechamento"]]
            r = db.execute(f"""UPDATE lancamentos SET fatura_mes=%s WHERE conta_id=%s AND {cond}
                               AND fatura_mes IS DISTINCT FROM %s RETURNING id""",
                           [f["mes"], c["id"]] + params + [f["mes"]])
            n += len(r)
            ant = f["fechamento"]
    return n


def _gravar_limites(conta_id, acc):
    """Limite configurado pelo cliente e quais finais estao VIGENTES (os demais = cancelados)."""
    lim = limites_cartao(acc)
    db.execute("""UPDATE contas SET limite_configurado=%s, limite_disponivel=%s, bandeira=%s WHERE id=%s""",
               (lim["configurado"], lim["disponivel"], lim["bandeira"], conta_id))
    for f in lim["finais_vigentes"]:
        db.execute("INSERT INTO cartoes_finais (conta_id, final) VALUES (%s,%s) ON CONFLICT DO NOTHING", (conta_id, f))
    if lim["finais_vigentes"]:
        db.execute("UPDATE cartoes_finais SET ativo = (final = ANY(%s)) WHERE conta_id=%s",
                   (lim["finais_vigentes"], conta_id))


def _upsert_conta(acc, item_id, banco):
    tipo = tipo_conta(acc)
    nome = acc.get("marketingName") or acc.get("name") or tipo.title()
    saldo = acc.get("balance") or 0
    cd = acc.get("creditData") or {}
    r = db.execute("""INSERT INTO contas (nome, banco, tipo, pluggy_account_id, pluggy_item_id, saldo, limite_cartao,
                                          limite_disponivel, subtipo, numero)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT (pluggy_account_id) DO UPDATE SET saldo=EXCLUDED.saldo, banco=EXCLUDED.banco,
                        limite_cartao=EXCLUDED.limite_cartao, limite_disponivel=EXCLUDED.limite_disponivel,
                        subtipo=EXCLUDED.subtipo, numero=EXCLUDED.numero, atualizado_em=now()
                      RETURNING id, tipo""",
                   (nome, banco, tipo, acc["id"], item_id, saldo, cd.get("creditLimit"),
                    cd.get("availableCreditLimit"), acc.get("subtype"), acc.get("number")))
    return r[0]["id"], r[0]["tipo"]


def _salvar_tx(tx, conta_id, conta_tipo, titular):
    n = normalizar_transacao(tx, conta_tipo)
    valor, dt, desc, pcat = n["valor"], n["data"], n["descricao"], n["categoria_pluggy"]
    status = "PROVISORIO" if n["pendente"] else "CONFIRMADO"

    extras = (n["fatura_mes"], n["cartao_final"], n["mcc"], n["estabelecimento"])
    if n["cartao_final"]:
        db.execute("""INSERT INTO cartoes_finais (conta_id, final) VALUES (%s,%s) ON CONFLICT DO NOTHING""",
                   (conta_id, n["cartao_final"]))
    ja = db.query("SELECT id FROM lancamentos WHERE pluggy_tx_id=%s", (tx["id"],))
    if ja:
        db.execute("""UPDATE lancamentos SET fatura_mes=%s, cartao_final=%s, mcc=%s, estabelecimento=%s
                      WHERE id=%s AND fatura_mes IS DISTINCT FROM %s""", extras + (ja[0]["id"], n["fatura_mes"]))
        mudou = db.execute("""UPDATE lancamentos SET valor=%s, data=%s, status=%s, atualizado_em=now()
                      WHERE id=%s AND (valor<>%s OR data<>%s OR status<>%s) RETURNING id""",
                   (valor, dt, status, ja[0]["id"], valor, dt, status))
        return "atualizado" if mudou else "igual"

    prov = db.query("""SELECT id FROM lancamentos WHERE pluggy_tx_id IS NULL AND conta_id=%s
                       AND ((status='PROVISORIO' AND origem='NOTIF' AND valor=%s AND data BETWEEN %s::date - 2 AND %s::date + 2)
                         OR (origem='MANUAL' AND sign(valor)=sign(%s) AND abs(valor - %s) <= greatest(1, abs(%s)*0.02)
                             AND data BETWEEN %s::date - 5 AND %s::date + 5))
                       ORDER BY abs(valor - %s), abs(data - %s::date) LIMIT 1""",
                    (conta_id, valor, dt, dt, valor, valor, valor, dt, dt, valor, dt))
    if not prov:
        ag = _casar_agendado(conta_id, valor, dt)
        if ag:
            prov = [{"id": ag}]
    if prov:
        db.execute("""UPDATE lancamentos SET pluggy_tx_id=%s, pluggy_categoria=%s, data=%s, valor=%s,
                      status=%s, atualizado_em=now() WHERE id=%s""",
                   (tx["id"], pcat, dt, valor, status, prov[0]["id"]))
        return "confirmado"

    obs = None
    if n["parcela"]:
        p = n["parcela"]
        obs = f"parcela {p['n']}/{p['total']}" + (f" - compra em {p['data_compra']}" if p["data_compra"] else "")
    c = decidir(desc, valor, pcat, conta_tipo, titular, tx["id"])
    obs = c.pop("obs") or obs
    db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, subcategoria_id, pote,
                    status, origem, pluggy_tx_id, pluggy_categoria, veiculo_id, obs,
                    fatura_mes, cartao_final, mcc, estabelecimento)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'PLUGGY',%s,%s,%s,%s,%s,%s,%s,%s)""",
               (conta_id, dt, desc, valor, c["tipo"], c["categoria_id"], c.get("subcategoria_id"), c["pote"],
                status, tx["id"], pcat, c["veiculo_id"], obs) + extras)
    if n["cartao_final"]:
        _aplicar_uso_cartao(conta_id, n["cartao_final"])
    return "novo"


def _aplicar_uso_cartao(conta_id, final):
    """Se o final do cartao estiver marcado como GM, as compras dele saem dos potes pessoais."""
    u = db.query("SELECT uso FROM cartoes_finais WHERE conta_id=%s AND final=%s", (conta_id, final))
    if u and u[0]["uso"] == "GM":
        cid = db.query("SELECT id FROM categorias WHERE nome='Gasto da GM (reembolsável)'")[0]["id"]
        db.execute("""UPDATE lancamentos SET tipo='DESPESA', categoria_id=%s, subcategoria_id=NULL, pote='NENHUM', atualizado_em=now()
                      WHERE conta_id=%s AND cartao_final=%s AND valor < 0 AND tipo='DESPESA'
                        AND categoria_id IS DISTINCT FROM %s""", (cid, conta_id, final, cid))


def _casar_agendado(conta_id, valor, dt):
    """Lancamento do banco que corresponde a um agendado (receita/despesa prevista cadastrada a mao):
    cria o lancamento com a categoria que VOCE escolheu e marca o agendado como realizado."""
    a = db.query("""SELECT * FROM agendados WHERE lancamento_id IS NULL AND (conta_id IS NULL OR conta_id=%s)
                    AND sign(valor)=sign(%s) AND abs(valor - %s) <= greatest(1, abs(%s)*0.02)
                    AND data BETWEEN %s::date - 5 AND %s::date + 5
                    ORDER BY (conta_id IS NULL), abs(valor - %s), abs(data - %s::date) LIMIT 1""",
                 (conta_id, valor, valor, valor, dt, dt, valor, dt))
    if not a:
        return None
    a = a[0]
    pote = db.query("SELECT pote FROM categorias WHERE id=%s", (a["categoria_id"],))[0]["pote"] if a["categoria_id"] else "NENHUM"
    lid = db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, subcategoria_id, tags, pote,
                          status, origem, recorrencia_id, parcela_n, parcela_total, obs)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'CONFIRMADO','MANUAL',%s,%s,%s,'agendado confirmado pelo banco')
                        RETURNING id""",
                     (conta_id, dt, a["descricao"], valor, a["natureza"], a["categoria_id"], a["subcategoria_id"], a["tags"],
                      "NENHUM" if a["natureza"] == "RECEITA" else pote, a["recorrencia_id"], a["parcela_n"], a["parcela_total"]))[0]["id"]
    db.execute("UPDATE agendados SET lancamento_id=%s WHERE id=%s", (lid, a["id"]))
    return lid


def decidir(desc, valor, pcat, conta_tipo, titular, pluggy_tx_id=None):
    """Classificacao final: regras/de-para (classificar) -> Pix pro proprio nome = transferencia
    -> ajuste manual daquela transacao (ganha de tudo)."""
    c = classificar(desc, valor, pcat, conta_tipo)
    c["obs"] = None
    if titular and titular in (desc or "").upper() and c["tipo"] in ("DESPESA", "RECEITA"):
        cid = db.query("SELECT id FROM categorias WHERE nome='Transferência entre contas'")
        c.update(tipo="TRANSFERENCIA", pote="NENHUM", categoria_id=cid[0]["id"] if cid else None, subcategoria_id=None)
    if pluggy_tx_id:
        aj = db.query("""SELECT a.tipo, a.categoria_id, a.subcategoria_id, a.veiculo_id, a.obs, c.pote FROM ajustes_lancamento a
                         LEFT JOIN categorias c ON c.id=a.categoria_id WHERE a.pluggy_tx_id=%s""", (pluggy_tx_id,))
        if aj:
            a = aj[0]
            if a["tipo"]:
                c["tipo"] = a["tipo"]
            if a["categoria_id"]:
                c["categoria_id"], c["pote"], c["subcategoria_id"] = a["categoria_id"], a["pote"], a["subcategoria_id"]
            if a["veiculo_id"]:
                c["veiculo_id"] = a["veiculo_id"]
            c["obs"] = a["obs"]
            if c["tipo"] in ("RECEITA", "TRANSFERENCIA", "PAG_FATURA"):
                c["pote"] = "NENHUM"
    # combustivel/manutencao sem placa no texto: se so existe UM carro ativo, e dele
    if c["veiculo_id"] is None and c["categoria_id"]:
        nome = db.query("SELECT nome FROM categorias WHERE id=%s", (c["categoria_id"],))[0]["nome"]
        if nome in ("Combustível", "Carro - manutenção", "Compra de veículo"):
            v = db.query("SELECT id FROM veiculos WHERE ativo")
            if len(v) == 1:
                c["veiculo_id"] = v[0]["id"]
    return c


def reclassificar():
    """Reaplica regras/ajustes em todos os lancamentos do Pluggy (depois de ensinar regra nova)."""
    tit = db.query("SELECT valor FROM configuracoes WHERE chave='TITULAR_NOME'")
    titular = (tit[0]["valor"] if tit else "").upper()
    n = 0
    for l in db.query("""SELECT l.id, l.descricao, l.valor, l.pluggy_categoria, l.pluggy_tx_id, ct.tipo conta_tipo
                         FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id WHERE l.origem='PLUGGY'"""):
        c = decidir(l["descricao"], l["valor"], l["pluggy_categoria"], l["conta_tipo"], titular, l["pluggy_tx_id"])
        sub = c.get("subcategoria_id")
        r = db.execute("""UPDATE lancamentos SET tipo=%s, categoria_id=%s, subcategoria_id=%s, pote=%s, veiculo_id=%s,
                            obs=COALESCE(%s, obs), atualizado_em=now()
                          WHERE id=%s AND (tipo<>%s OR categoria_id IS DISTINCT FROM %s OR subcategoria_id IS DISTINCT FROM %s
                                OR pote<>%s OR veiculo_id IS DISTINCT FROM %s) RETURNING id""",
                       (c["tipo"], c["categoria_id"], sub, c["pote"], c["veiculo_id"], c["obs"], l["id"],
                        c["tipo"], c["categoria_id"], sub, c["pote"], c["veiculo_id"]))
        n += len(r)
    for cf in db.query("SELECT conta_id, final FROM cartoes_finais WHERE uso='GM'"):
        _aplicar_uso_cartao(cf["conta_id"], cf["final"])
    aplicar_economia()
    return n


def sincronizar(dias=None):
    dias = int(dias or os.getenv("PLUGGY_JANELA_DIAS", "10"))
    log_id = db.execute("INSERT INTO sync_log (fonte) VALUES ('PLUGGY') RETURNING id")[0]["id"]
    novos = atual = 0
    erros = []
    try:
        pc = PluggyClient.do_env()
        _migrar()
        itens = [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS") or "").split(",") if i.strip()]
        if not itens:
            raise PluggyErro("PLUGGY_ITEM_IDS vazio no .env -- conecte os bancos no Meu Pluggy e cole os IDs")
        tit = db.query("SELECT valor FROM configuracoes WHERE chave='TITULAR_NOME'")
        titular = (tit[0]["valor"] if tit else "").upper()
        desde = (date.today() - timedelta(days=dias)).isoformat()
        for item_id in itens:
            try:
                item = pc.item(item_id)
                banco = "Banco"
                if (item.get("status") or "").upper() in ("LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT"):
                    notificar(f"Pluggy: conexão do {banco} precisa de atenção",
                              f"Status {item.get('status')}. Abra o meu.pluggy.ai e reconecte.", "AVISO")
                contas_item = pc.contas(item_id)
                banco = banco_do_item(contas_item, item)
                for acc in contas_item:
                    conta_id, conta_tipo = _upsert_conta(acc, item_id, banco)
                    if conta_tipo == "CARTAO":
                        _gravar_faturas(pc, conta_id, acc)
                        _gravar_limites(conta_id, acc)
                    for tx in pc.transacoes(acc["id"], desde):
                        r = _salvar_tx(tx, conta_id, conta_tipo, titular)
                        novos += r == "novo"
                        atual += r in ("atualizado", "confirmado")
            except Exception as e:
                erros.append(f"item {item_id}: {e}")
        vincular_faturas()
        gerar_faturas_manuais()
        aplicar_responsavel()
        aplicar_economia()
        ligar_transferencias()
        ok = not erros
        db.execute("UPDATE sync_log SET fim=now(), ok=%s, novos=%s, atualizados=%s, detalhe=%s WHERE id=%s",
                   (ok, novos, atual, "\n".join(erros)[:4000] or None, log_id))
        if erros:
            notificar("Sincronização Pluggy incompleta", "\n".join(erros) +
                      "\nO resto foi importado. Rode de novo ou confira o item no meu.pluggy.ai.")
        _log(f"[PLUGGY] fim: {novos} novos, {atual} atualizados, {len(erros)} erros")
        return {"ok": ok, "novos": novos, "atualizados": atual, "erros": erros}
    except Exception as e:
        db.execute("UPDATE sync_log SET fim=now(), ok=false, detalhe=%s WHERE id=%s", (str(e)[:4000], log_id))
        notificar("Sincronização Pluggy falhou", f"{e}\nNada novo foi importado hoje. Refaça manualmente: python pluggy.py sync")
        return {"ok": False, "erro": str(e)}


def categorias_sem_depara():
    return db.query("""SELECT pluggy_categoria, count(*) n FROM lancamentos l
                       WHERE pluggy_categoria IS NOT NULL AND NOT EXISTS
                         (SELECT 1 FROM categorias_pluggy cp WHERE l.pluggy_categoria ILIKE cp.padrao)
                       GROUP BY 1 ORDER BY 2 DESC""")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sync"
    if cmd == "sync":
        d = sys.argv[sys.argv.index("--dias") + 1] if "--dias" in sys.argv else None
        print(json.dumps(sincronizar(d), ensure_ascii=False, indent=2))
        sys.exit(0)
    if cmd == "categorias":
        for r in categorias_sem_depara():
            print(f"{r['n']:5}  {r['pluggy_categoria']}")
