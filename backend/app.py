"""App pessoal -- API (Flask). Servico SEPARADO do ERP: outra pasta, outro banco, outra porta (5100).

Rotas (todas exigem header X-Token = APP_TOKEN do .env):
  GET   /api/saude
  GET   /api/resumo?mes=2026-10        -> dados da tela Inicio (layout 1)
  GET   /api/lancamentos?mes=2026-10
  PATCH /api/lancamentos/<id>          -> corrige categoria; {"aprender": true} vira regra
  POST  /api/pluggy/sync               -> roda a sincronizacao agora
  GET   /api/notificacoes              -> sino
"""
import calendar
import os
from datetime import date, timedelta
from functools import wraps

from flask import Flask, jsonify, request, abort, send_from_directory

import db
import pluggy
from notificar import notificar

app = Flask(__name__)
app.json.ensure_ascii = False
try:
    pluggy._migrar()          # tabelas novas (caixinhas, transferencias...) mesmo antes do 1o sync
    pluggy.aplicar_responsavel()
    pluggy.gerar_faturas_manuais()
    pluggy.aplicar_economia()
except Exception as _e:
    print("[migrar] falhou:", _e)


def _token(f):
    @wraps(f)
    def w(*a, **k):
        local = request.remote_addr in ("127.0.0.1", "::1") and not request.headers.get("X-Forwarded-For")
        if not local and (not os.getenv("APP_TOKEN") or request.headers.get("X-Token") != os.getenv("APP_TOKEN")):
            abort(401)          # no proprio PC (localhost) dispensa o token; celular/VPS exigem
        return f(*a, **k)
    return w


def _mes(s):
    hoje = date.today()
    try:
        y, m = (int(x) for x in (s or "").split("-"))
    except ValueError:
        y, m = hoje.year, hoje.month
    ini = date(y, m, 1)
    return ini, date(y, m, calendar.monthrange(y, m)[1])


def _soma(sql, p):
    return float(db.query(sql, p)[0]["v"] or 0)


STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


@app.get("/")
def inicio():
    """Tela Inicio (layout 1). Mesma pagina vai na WebView do app Android."""
    return send_from_directory(STATIC, "index.html")


@app.get("/api/saude")
def saude():
    db.query("SELECT 1")
    return jsonify(ok=True, servico="app-pessoal")


@app.get("/api/resumo")
@_token
def resumo():
    ini, fim = _mes(request.args.get("mes"))
    hoje = date.today()
    aberto = ini <= hoje <= fim
    CC = "c.tipo IN ('CORRENTE','CARTEIRA')"

    saldo_atual = _soma(f"SELECT sum(saldo) v FROM contas c WHERE ativa AND {CC}", ())
    mov_desde = lambda d: _soma(f"""SELECT sum(l.valor) v FROM lancamentos l JOIN contas c ON c.id=l.conta_id
                                    WHERE {CC} AND l.data >= %s""", (d,))
    saldo_ini = saldo_atual - mov_desde(ini)
    saldo_fim = saldo_atual - mov_desde(fim + timedelta(days=1))
    saldo = saldo_atual if aberto else saldo_fim

    def tot(tipo):
        return _soma("SELECT sum(valor) v FROM lancamentos WHERE tipo=%s AND responsavel='PESSOAL' AND data BETWEEN %s AND %s",
                     (tipo, ini, fim))

    receitas = tot("RECEITA")
    # investido = so o que conta como ECONOMIA (caixinha marcada "nao conta" fica com pote NENHUM)
    investido = -_soma("""SELECT sum(valor) v FROM lancamentos WHERE tipo='INVESTIMENTO' AND responsavel='PESSOAL'
                          AND pote <> 'NENHUM' AND data BETWEEN %s AND %s""", (ini, fim))
    despesas = -_soma("""SELECT sum(l.valor) v FROM lancamentos l LEFT JOIN contas ct ON ct.id=l.conta_id
                         WHERE l.tipo='DESPESA' AND l.responsavel='PESSOAL' AND ct.tipo IS DISTINCT FROM 'CARTAO'
                           AND l.data BETWEEN %s AND %s""", (ini, fim))
    despesas_cartao = -_soma("""SELECT sum(l.valor) v FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                         WHERE l.tipo='DESPESA' AND l.responsavel='PESSOAL' AND ct.tipo='CARTAO'
                           AND l.data BETWEEN %s AND %s""", (ini, fim))
    # fatura A PAGAR: faturas atuais (Pluggy /bills) que vencem ate o fim do mes, menos o que ja foi pago
    fatura = 0.0
    for c in db.query("""SELECT id, fatura_valor, fatura_vencimento FROM contas
                         WHERE ativa AND tipo='CARTAO' AND responsavel='PESSOAL' AND fatura_valor > 0
                           AND fatura_vencimento <= %s AND pluggy_account_id IS NOT NULL""", (fim,)):
        pago = _soma("""SELECT sum(valor) v FROM lancamentos WHERE conta_id=%s AND tipo='PAG_FATURA' AND valor > 0
                        AND data > %s::date - 25""", (c["id"], c["fatura_vencimento"]))
        fatura += max(float(c["fatura_valor"]) - pago, 0)
    fatura += _soma("""SELECT sum(fatura_valor) v FROM contas WHERE ativa AND tipo='CARTAO' AND responsavel='PESSOAL'
                       AND pluggy_account_id IS NULL AND fatura_valor > 0 AND fatura_vencimento <= %s""", (fim,))

    orc = db.query("SELECT * FROM orcamento_mes WHERE mes=%s", (ini,))
    o = orc[0] if orc else {"renda": None, "pct_nec": 50, "pct_des": 30, "pct_inv": 20}
    # renda recorrente do mes = receitas menos extraordinarias (retirada de lucro nao infla os tetos)
    extra = _soma("""SELECT sum(l.valor) v FROM lancamentos l JOIN categorias c ON c.id=l.categoria_id
                     WHERE l.tipo='RECEITA' AND c.nome IN ('Retirada de lucro') AND l.data BETWEEN %s AND %s""", (ini, fim))
    recorrente = receitas - extra
    # renda ESPERADA = media do Salario/renda dos 3 meses anteriores (o salario cai no meio do mes)
    esperada = _soma("""SELECT avg(v) v FROM (SELECT date_trunc('month', l.data) m, sum(l.valor) v
                          FROM lancamentos l JOIN categorias c ON c.id=l.categoria_id
                         WHERE l.tipo='RECEITA' AND c.nome='Salário / renda'
                           AND l.data >= %s::date - interval '3 months' AND l.data < %s GROUP BY 1) x""", (ini, ini))
    futuro_ou_aberto = aberto or ini > hoje
    if o["renda"]:
        renda = float(o["renda"])
    elif futuro_ou_aberto:
        renda = max(recorrente, esperada)
    else:
        renda = recorrente
    falta_receber = max(renda - recorrente, 0) if futuro_ou_aberto else 0
    ag = db.query("""SELECT coalesce(sum(valor) FILTER (WHERE natureza='RECEITA'),0)::float8 rec,
                            coalesce(-sum(valor) FILTER (WHERE natureza='DESPESA'),0)::float8 desp
                       FROM agendados WHERE lancamento_id IS NULL AND data BETWEEN %s AND %s
                        AND (conta_id IS NULL OR conta_id NOT IN (SELECT id FROM contas WHERE responsavel='GM'))""", (max(ini, hoje), fim))[0]
    if ag["rec"] > 0:                    # receitas cadastradas valem mais que a media estimada
        falta_receber = ag["rec"]

    usado = {r["pote"]: float(r["v"]) for r in db.query(
        """SELECT pote, -sum(valor) v FROM lancamentos WHERE tipo IN ('DESPESA','INVESTIMENTO') AND responsavel='PESSOAL'
           AND data BETWEEN %s AND %s GROUP BY pote""", (ini, fim))}
    potes = []
    for k, nome, pct in (("NEC", "Necessidades", o["pct_nec"]), ("DES", "Desejos", o["pct_des"]),
                         ("INV", "Investir", o["pct_inv"])):
        teto = renda * float(pct) / 100
        potes.append({"pote": k, "nome": nome, "pct": float(pct), "teto": round(teto, 2),
                      "usado": round(usado.get(k, 0), 2)})

    previsto, previsto_det = saldo, None
    if not aberto:
        # mes fechado/futuro: soma das faturas que VENCEM no mes (cartoes pessoais), nao so a vigente
        fatura = _soma("""SELECT sum(f.total) v FROM faturas f JOIN contas c ON c.id=f.conta_id
                          WHERE c.ativa AND c.responsavel='PESSOAL' AND f.vencimento BETWEEN %s AND %s""", (ini, fim))
        fatura += _soma("""SELECT -sum(l.valor) v FROM lancamentos l JOIN contas c ON c.id=l.conta_id
                           WHERE c.ativa AND c.tipo='CARTAO' AND c.responsavel='PESSOAL' AND l.tipo <> 'PAG_FATURA' AND l.fatura_mes=%s
                             AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.conta_id=c.id AND f.mes=%s)""",
                        (ini.strftime("%Y-%m"), ini.strftime("%Y-%m")))
    if aberto:
        # o que ainda sai direto da conta (fora do cartao): media diaria dos ultimos 60 dias
        diario = -_soma(f"""SELECT sum(l.valor) v FROM lancamentos l JOIN contas c ON c.id=l.conta_id
                            WHERE {CC} AND l.tipo='DESPESA' AND l.valor < 0 AND l.valor >= -1000
                              AND l.pote IN ('NEC','DES')
                              AND l.data BETWEEN %s::date - 60 AND %s""", (hoje, hoje)) / 60
        # (fora da media: compra de carro, gastos > R$ 1.000 e o que nao e pote -- sao pontuais)
        previsto = saldo + falta_receber - fatura - diario * (fim - hoje).days - ag["desp"]
        previsto_det = {"saldo": round(saldo, 2), "falta_receber": round(falta_receber, 2), "fatura": round(fatura, 2),
                        "gasto_diario": round(diario, 2), "dias": (fim - hoje).days, "agendados": round(ag["desp"], 2)}

    cats = db.query("""SELECT c.id, c.nome, c.pote, -sum(l.valor) valor FROM lancamentos l
                       JOIN categorias c ON c.id=l.categoria_id
                       WHERE l.tipo='DESPESA' AND l.responsavel='PESSOAL' AND l.data BETWEEN %s AND %s
                       GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 10""", (ini, fim))
    subs = db.query("""SELECT l.categoria_id, coalesce(s.nome,'Sem subcategoria') nome, -sum(l.valor)::float8 valor
                       FROM lancamentos l LEFT JOIN subcategorias s ON s.id=l.subcategoria_id
                       WHERE l.tipo='DESPESA' AND l.responsavel='PESSOAL' AND l.data BETWEEN %s AND %s GROUP BY 1,2 ORDER BY 3 DESC""", (ini, fim))
    for c in cats:
        c["subcategorias"] = [{"nome": x["nome"], "valor": round(x["valor"], 2)} for x in subs if x["categoria_id"] == c["id"]]

    mov_dia = {r["data"].isoformat(): float(r["v"]) for r in db.query(
        f"""SELECT l.data, sum(l.valor) v FROM lancamentos l JOIN contas c ON c.id=l.conta_id
            WHERE {CC} AND l.data BETWEEN %s AND %s GROUP BY 1""", (ini, fim))}
    serie, acc, d = [], saldo_ini, ini
    ate = min(fim, hoje) if aberto else fim
    while d <= ate:
        acc += mov_dia.get(d.isoformat(), 0)
        serie.append({"dia": d.day, "saldo": round(acc, 2)})
        d += timedelta(days=1)

    contas = db.query("""SELECT id, nome, banco, tipo, subtipo, numero, saldo, fatura_valor, fatura_vencimento::text
                         FROM contas WHERE ativa AND responsavel='PESSOAL'
                         ORDER BY CASE tipo WHEN 'CORRENTE' THEN 1 WHEN 'CARTEIRA' THEN 2 WHEN 'INVESTIMENTO' THEN 3 ELSE 4 END,
                                  banco, subtipo""")
    inv = db.query("""SELECT coalesce(-sum(valor) FILTER (WHERE valor < 0),0)::float8 aplicado,
                             coalesce(sum(valor) FILTER (WHERE valor > 0),0)::float8 resgatado
                        FROM lancamentos WHERE tipo='INVESTIMENTO' AND responsavel='PESSOAL' AND pote <> 'NENHUM'
                         AND data BETWEEN %s AND %s""", (ini, fim))[0]
    return jsonify(previsto_det=previsto_det, aplicado=round(inv["aplicado"], 2), resgatado=round(inv["resgatado"], 2),
                   despesas_cartao=round(despesas_cartao, 2), mes=ini.strftime("%Y-%m"), aberto=aberto, dias=fim.day, hoje=hoje.day if aberto else fim.day,
                   inicial=round(saldo_ini, 2), saldo=round(saldo, 2), previsto=round(previsto, 2),
                   receitas=round(receitas, 2), despesas=round(despesas, 2), investido=round(investido, 2),
                   fatura_cartao=round(fatura, 2), renda=round(renda, 2), falta_receber=round(falta_receber, 2), potes=potes,
                   categorias=cats, serie=serie, contas=contas)


@app.get("/api/lancamentos")
@_token
def lancamentos():
    """?mes  [&pote=NEC|DES|INV] [&categoria_id=] [&tipo=] -- pote/categoria = so o que e PESSOAL (igual aos totais do Inicio)."""
    ini, fim = _mes(request.args.get("mes"))
    cond, par = ["l.data BETWEEN %s AND %s"], [ini, fim]
    a = request.args
    if a.get("pote"):
        cond += ["l.pote=%s", "l.tipo IN ('DESPESA','INVESTIMENTO')", "l.responsavel='PESSOAL'"]; par.append(a["pote"].upper())
    if a.get("categoria_id"):
        cond += ["l.categoria_id=%s", "l.responsavel='PESSOAL'"]; par.append(int(a["categoria_id"]))
    if a.get("tipo"):
        cond.append("l.tipo=%s"); par.append(a["tipo"].upper())
    return jsonify(db.query(f"""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.descricao, l.valor::float8 valor, l.tipo, l.pote, l.status, l.origem,
                                 c.nome categoria, l.categoria_id, s.nome subcategoria, l.subcategoria_id, ct.banco, ct.nome conta, v.placa,
                                 ct.tipo conta_tipo, l.cartao_final, l.responsavel
                               FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
                               LEFT JOIN subcategorias s ON s.id=l.subcategoria_id
                               LEFT JOIN contas ct ON ct.id=l.conta_id LEFT JOIN veiculos v ON v.id=l.veiculo_id
                               WHERE {' AND '.join(cond)} ORDER BY l.data DESC, l.id DESC""", par))  # data como texto: JSON estavel


@app.get("/api/investimentos")
@_token
def investimentos():
    """Investido no mes: aplicacoes/resgates do mes, onde esta guardado (saldo estimado pelo extrato, sem rendimentos) e caixinhas."""
    ini, fim = _mes(request.args.get("mes"))
    mov = db.query("""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.descricao, l.valor::float8 valor, ct.banco, ct.tipo conta_tipo,
                             c.nome categoria, l.categoria_id, s.nome subcategoria, l.subcategoria_id,
                             cx.id caixinha_id, cx.nome caixinha, coalesce(cx.economia, true) economia
                        FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id LEFT JOIN categorias c ON c.id=l.categoria_id
                        LEFT JOIN subcategorias s ON s.id=l.subcategoria_id
                        LEFT JOIN caixinha_movimentos m ON m.lancamento_id=l.id LEFT JOIN caixinhas cx ON cx.id=m.caixinha_id
                       WHERE l.tipo='INVESTIMENTO' AND l.responsavel='PESSOAL' AND l.data BETWEEN %s AND %s
                       ORDER BY l.data DESC, l.id DESC""", (ini, fim))
    bancos = db.query("""SELECT ct.banco, (-sum(l.valor))::float8 saldo, to_char(min(l.data),'YYYY-MM-DD') desde,
                                coalesce(-sum(l.valor) FILTER (WHERE l.valor < 0 AND l.data >= %s),0)::float8 aplicado_mes,
                                coalesce(sum(l.valor) FILTER (WHERE l.valor > 0 AND l.data >= %s),0)::float8 resgatado_mes, count(*) n
                           FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                          WHERE l.tipo='INVESTIMENTO' AND l.responsavel='PESSOAL' AND l.data <= %s GROUP BY 1 ORDER BY 2 DESC""", (ini, ini, fim))
    for b in bancos:
        slug, sigla, cor = BANCOS_VISUAL.get(b["banco"], (b["banco"].lower().replace(" ", ""), b["banco"][:2].upper(), "#4A4B55"))
        b.update(slug=slug, sigla=sigla, cor=cor, saldo=round(b["saldo"], 2))
    cxs = [{"id": c["id"], "banco": c["banco"], "nome": c["nome"], "saldo": c["saldo"], "meta": c["meta"], "economia": c["economia"],
            "prazo": c["prazo"].isoformat() if c["prazo"] else None,
            "mes": round(sum(-m["valor"] for m in mov if m["caixinha_id"] == c["id"]), 2)} for c in _saldos_caixinhas()]
    eco = [m for m in mov if m["economia"]]
    fora = [m for m in mov if not m["economia"]]
    aplicado = round(sum(-m["valor"] for m in eco if m["valor"] < 0), 2)
    resgatado = round(sum(m["valor"] for m in eco if m["valor"] > 0), 2)
    return jsonify(movimentos=mov, aplicado=aplicado, resgatado=resgatado, liquido=round(aplicado - resgatado, 2),
                   fora_aplicado=round(sum(-m["valor"] for m in fora if m["valor"] < 0), 2),
                   fora_resgatado=round(sum(m["valor"] for m in fora if m["valor"] > 0), 2),
                   bancos=bancos, caixinhas=cxs, guardado=round(sum(b["saldo"] for b in bancos), 2))


@app.patch("/api/lancamentos/<int:lid>")
@_token
def corrigir(lid):
    """Troca categoria/subcategoria de um lancamento. {categoria_id | categoria (nome), subcategoria_id?, aprender?}
    - lancamento do banco: grava ajuste pela id da transacao (re-sincronizar nao desfaz)
    - aprender=true: vira regra -> proximas compras desse estabelecimento ja entram com a mesma categoria/subcategoria."""
    b = request.get_json(force=True) or {}
    cat = (db.query("SELECT id, nome, pote, natureza FROM categorias WHERE id=%s", (int(b["categoria_id"]),)) if b.get("categoria_id")
           else db.query("SELECT id, nome, pote, natureza FROM categorias WHERE nome=%s", (b.get("categoria"),)))
    if not cat:
        return jsonify(ok=False, erro="categoria inexistente"), 400
    cat = cat[0]
    sub = int(b["subcategoria_id"]) if b.get("subcategoria_id") else None
    if sub and not db.query("SELECT 1 FROM subcategorias WHERE id=%s AND categoria_id=%s", (sub, cat["id"])):
        return jsonify(ok=False, erro="subcategoria não pertence à categoria"), 400
    if cat["natureza"] == "TRANSFERENCIA":
        tipo = "PAG_FATURA" if cat["nome"] == "Pagamento de fatura" else "TRANSFERENCIA"
    elif cat["natureza"] == "RECEITA":
        tipo = "RECEITA"
    else:
        tipo = "INVESTIMENTO" if cat["pote"] == "INV" else "DESPESA"
    pote = "NENHUM" if tipo in ("RECEITA", "TRANSFERENCIA", "PAG_FATURA") else cat["pote"]
    with db.transaction() as cur:
        cur.execute("""UPDATE lancamentos SET categoria_id=%s, subcategoria_id=%s, tipo=%s, pote=%s, atualizado_em=now()
                       WHERE id=%s RETURNING descricao, valor, pluggy_tx_id""", (cat["id"], sub, tipo, pote, lid))
        r = db.rows(cur)
        if not r:
            return jsonify(ok=False, erro="lancamento nao encontrado"), 404
        if r[0]["pluggy_tx_id"]:
            cur.execute("""INSERT INTO ajustes_lancamento (pluggy_tx_id, tipo, categoria_id, subcategoria_id) VALUES (%s,%s,%s,%s)
                           ON CONFLICT (pluggy_tx_id) DO UPDATE SET tipo=EXCLUDED.tipo, categoria_id=EXCLUDED.categoria_id,
                                                                   subcategoria_id=EXCLUDED.subcategoria_id""",
                        (r[0]["pluggy_tx_id"], tipo, cat["id"], sub))
        if b.get("aprender"):
            padrao = "%" + r[0]["descricao"].split("*")[0].strip()[:40] + "%"
            cur.execute("DELETE FROM regras WHERE padrao=%s AND valor IS NULL", (padrao,))
            cur.execute("INSERT INTO regras (padrao, tipo, categoria_id, subcategoria_id) VALUES (%s,%s,%s,%s)",
                        (padrao, tipo, cat["id"], sub))
    n = 0
    if b.get("aprender"):
        # aplica a regra nova nos outros lancamentos parecidos que NAO tem ajuste manual
        n = len(db.execute("""UPDATE lancamentos l SET categoria_id=%s, subcategoria_id=%s, tipo=%s, pote=%s, atualizado_em=now()
                              WHERE l.descricao ILIKE %s AND l.id<>%s AND sign(l.valor)=sign(%s)
                                AND NOT EXISTS (SELECT 1 FROM ajustes_lancamento a WHERE a.pluggy_tx_id=l.pluggy_tx_id)
                                AND (l.categoria_id IS DISTINCT FROM %s OR l.subcategoria_id IS DISTINCT FROM %s) RETURNING l.id""",
                           (cat["id"], sub, tipo, pote, padrao, lid, r[0]["valor"], cat["id"], sub)))
    return jsonify(ok=True, tipo=tipo, aplicados=n)


# ============================== CARTOES / FATURAS ==============================
def _status_fatura(f, hoje):
    if f["fechamento"] and hoje < f["fechamento"]:
        return "ABERTA"
    if f["total"] <= 0.009:
        return "ZERADA"
    if f["pago"] >= f["total"] - 0.01:
        return "PAGA"
    if hoje > f["vencimento"]:
        return "PAGA PARCIAL" if f["pago"] > 0 else "VENCIDA"
    return "FECHADA"


@app.get("/api/cartoes")
@_token
def cartoes():
    """Cada cartao com limite, finais (e de quem e cada um) e TODAS as faturas: historicas (Pluggy /bills)
    + futuras projetadas pelas compras/parcelas ja lancadas."""
    hoje = date.today()
    out = []
    for c in db.query("""SELECT id, banco, nome, numero, limite_cartao, limite_configurado, limite_disponivel, saldo, bandeira,
                                responsavel, cor, dia_fechamento, dia_vencimento, fech_dinamico, venc_dias_uteis, conta_pagamento_id,
                                notif_app, (pluggy_account_id IS NULL) manual
                         FROM contas WHERE ativa AND tipo='CARTAO' ORDER BY responsavel DESC, banco, nome"""):
        finais = db.query("""SELECT cf.final, cf.uso, cf.apelido, cf.ativo, count(l.id) n, coalesce(-sum(l.valor),0)::numeric(12,2) total,
                                    max(l.data) ultima
                               FROM cartoes_finais cf LEFT JOIN lancamentos l
                                 ON l.conta_id=cf.conta_id AND l.cartao_final=cf.final AND l.valor < 0
                              WHERE cf.conta_id=%s GROUP BY 1,2,3,4 ORDER BY cf.ativo DESC, n DESC""", (c["id"],))
        fats = {}
        for f in db.query("""SELECT f.mes, f.fechamento, f.vencimento, f.total::float8 total, f.minimo::float8 minimo,
                                    f.encargos::float8 encargos, coalesce(f.saldo_anterior,0)::float8 saldo_anterior,
                                    f.encargos_detalhe, coalesce(f.saldo_inicial,0)::float8 saldo_inicial
                               FROM faturas f WHERE f.conta_id=%s""", (c["id"],)):
            f["estimada"] = False
            fats[f["mes"]] = f
        # meses que so existem pelas compras (fatura aberta e futuras)
        for r in db.query("""SELECT fatura_mes mes, -sum(valor)::float8 total FROM lancamentos
                             WHERE conta_id=%s AND fatura_mes IS NOT NULL AND tipo <> 'PAG_FATURA'
                             GROUP BY 1""", (c["id"],)):
            if r["mes"] not in fats:
                fats[r["mes"]] = {"mes": r["mes"], "fechamento": None, "vencimento": None, "total": round(r["total"], 2),
                                  "minimo": None, "encargos": 0.0, "saldo_anterior": 0.0, "encargos_detalhe": [],
                                  "estimada": True}
        # datas projetadas para as estimadas (a partir da ultima conhecida)
        conhecidas = sorted((f for f in fats.values() if not f["estimada"]), key=lambda f: f["mes"])
        for f in sorted(fats.values(), key=lambda f: f["mes"]):
            if f["estimada"] and conhecidas:
                u = conhecidas[-1]
                k = (int(f["mes"][:4]) - int(u["mes"][:4])) * 12 + int(f["mes"][5:]) - int(u["mes"][5:])
                if k > 0:
                    from pluggy import _add_mes
                    f["fechamento"], f["vencimento"] = _add_mes(u["fechamento"], k), _add_mes(u["vencimento"], k)
        lista = []
        for f in sorted(fats.values(), key=lambda f: f["mes"], reverse=True):
            if not f["vencimento"]:
                continue
            pag = db.query("""SELECT coalesce(sum(p.valor),0)::float8 v, max(p.data) d FROM fatura_pagamentos p
                              JOIN faturas x ON x.id=p.fatura_id WHERE x.conta_id=%s AND x.mes=%s""", (c["id"], f["mes"]))[0]
            # Nubank nem sempre manda payments[]: conferir creditos "Pagamento recebido" no cartao
            pag_tx = db.query("""SELECT coalesce(sum(valor),0)::float8 v, max(data) d FROM lancamentos
                                 WHERE conta_id=%s AND tipo='PAG_FATURA' AND valor > 0
                                   AND data > %s::date AND data <= %s::date + 25""",
                              (c["id"], f["fechamento"] or f["vencimento"], f["vencimento"]))[0]
            pago = max(pag["v"], pag_tx["v"])
            data_pag = pag["d"] if pag["v"] >= pag_tx["v"] else pag_tx["d"]
            div = db.query("""SELECT coalesce(-sum(l.valor) FILTER (WHERE l.responsavel='GM'),0)::float8 gm,
                                     coalesce(-sum(l.valor) FILTER (WHERE l.responsavel<>'GM'),0)::float8 pessoal,
                                     count(*) n
                                FROM lancamentos l
                               WHERE l.conta_id=%s AND l.fatura_mes=%s AND l.tipo <> 'PAG_FATURA'""", (c["id"], f["mes"]))[0]
            f.update(pago=round(pago, 2), data_pagamento=data_pag.isoformat() if data_pag else None,
                     gm=round(div["gm"], 2), pessoal=round(div["pessoal"], 2), compras=div["n"])
            f["status"] = "PREVISTA" if f["estimada"] and hoje < (f["fechamento"] or f["vencimento"]) - timedelta(days=31) \
                else _status_fatura(f, hoje)
            for k in ("fechamento", "vencimento"):
                f[k] = f[k].isoformat() if f[k] else None
            lista.append(f)
        out.append({"id": c["id"], "banco": c["banco"], "nome": c["nome"], "numero": c["numero"], "bandeira": c["bandeira"],
                    "limite": c["limite_configurado"] or c["limite_cartao"], "limite_aprovado": c["limite_cartao"],
                    "usado": c["saldo"], "disponivel": c["limite_disponivel"],
                    "responsavel": c["responsavel"], "cor": c["cor"], "manual": c["manual"], "dia_fechamento": c["dia_fechamento"],
                    "dia_vencimento": c["dia_vencimento"], "fech_dinamico": c["fech_dinamico"], "venc_dias_uteis": c["venc_dias_uteis"],
                    "conta_pagamento_id": c["conta_pagamento_id"], "notif_app": c["notif_app"],
                    "finais": finais, "faturas": lista})
    return jsonify(out)


@app.get("/api/cartoes/<int:cid>/fatura/<mes>")
@_token
def fatura_detalhe(cid, mes):
    return jsonify(db.query("""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.descricao, l.valor, l.tipo, l.obs,
                                      l.cartao_final, coalesce(cf.uso,'PESSOAL') uso, c.nome categoria, l.pote,
                                      l.categoria_id, s.nome subcategoria, l.subcategoria_id
                                 FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
                                 LEFT JOIN subcategorias s ON s.id=l.subcategoria_id
                                 LEFT JOIN cartoes_finais cf ON cf.conta_id=l.conta_id AND cf.final=l.cartao_final
                                WHERE l.conta_id=%s AND l.fatura_mes=%s ORDER BY l.data DESC, l.id DESC""", (cid, mes)))


@app.post("/api/cartoes/<int:cid>/finais/<final>")
@_token
def definir_final(cid, final):
    """{"uso": "GM"|"PESSOAL", "apelido": "..."} -- GM tira as compras desse final dos potes pessoais."""
    b = request.get_json(force=True) or {}
    uso = (b.get("uso") or "PESSOAL").upper()
    if uso not in ("GM", "PESSOAL"):
        return jsonify(ok=False, erro="uso deve ser GM ou PESSOAL"), 400
    db.execute("""INSERT INTO cartoes_finais (conta_id, final, uso, apelido) VALUES (%s,%s,%s,%s)
                  ON CONFLICT (conta_id, final) DO UPDATE SET uso=EXCLUDED.uso, apelido=COALESCE(EXCLUDED.apelido, cartoes_finais.apelido)""",
               (cid, final, uso, b.get("apelido")))
    n = pluggy.reclassificar()           # volta a classificacao normal (PESSOAL) ou aplica GM
    pluggy.aplicar_responsavel()
    return jsonify(ok=True, reclassificados=n)


# ---------- cadastro de cartao (estilo Minhas Financas) ----------
BANDEIRAS = ("MASTERCARD", "VISA", "ELO", "AMEX", "HIPERCARD", "OUTRA")


def _num(v):
    try:
        return round(float(str(v).replace(",", ".")), 2) if v not in (None, "") else None
    except ValueError:
        return None


def _dados_cartao(b, manual):
    """Valida e devolve {coluna: valor}. Cartao do Pluggy: limite, datas, bandeira e final vem do banco."""
    d = {}
    if "nome" in b:
        if not (b["nome"] or "").strip():
            raise ValueError("informe o nome do cartão")
        d["nome"] = b["nome"].strip()
    if "responsavel" in b:
        r = (b["responsavel"] or "PESSOAL").upper()
        if r not in ("PESSOAL", "GM"):
            raise ValueError("responsável deve ser PESSOAL ou GM")
        d["responsavel"] = r
    for k in ("cor", "notif_app"):
        if k in b:
            d[k] = (b[k] or None)
    if "conta_pagamento_id" in b:
        d["conta_pagamento_id"] = int(b["conta_pagamento_id"]) if b["conta_pagamento_id"] else None
    if manual:
        if "banco" in b:
            d["banco"] = (b["banco"] or "").strip() or d.get("nome") or "Cartão"
        if "bandeira" in b:
            band = (b["bandeira"] or "OUTRA").upper()
            d["bandeira"] = band if band in BANDEIRAS else "OUTRA"
        if "numero" in b:
            n = "".join(ch for ch in str(b["numero"] or "") if ch.isdigit())
            if n and len(n) != 4:
                raise ValueError("últimos 4 dígitos: informe exatamente 4 números")
            d["numero"] = n or None
        if "limite" in b:
            d["limite_cartao"] = _num(b["limite"])
        for k in ("dia_fechamento", "dia_vencimento"):
            if k in b:
                v = int(b[k] or 0)
                if not 1 <= v <= 31:
                    raise ValueError("dia de fechamento/vencimento deve ser de 1 a 31")
                d[k] = v
        for k in ("fech_dinamico", "venc_dias_uteis"):
            if k in b:
                d[k] = bool(b[k])
    return d


def _fatura_atual_inicial(cid, valor):
    """'Fatura atual' do cadastro = o que ja foi gasto na fatura aberta antes de usar o app (nao entra nos potes)."""
    f = db.query("SELECT mes FROM faturas WHERE conta_id=%s AND fechamento > %s ORDER BY fechamento LIMIT 1", (cid, date.today()))
    if f:
        db.execute("UPDATE faturas SET saldo_inicial=%s WHERE conta_id=%s AND mes=%s", (valor or 0, cid, f[0]["mes"]))


@app.post("/api/cartoes")
@_token
def cartao_novo():
    b = request.get_json(force=True) or {}
    try:
        d = _dados_cartao(b, manual=True)
    except (ValueError, TypeError) as e:
        return jsonify(ok=False, erro=str(e)), 400
    if not d.get("nome"):
        return jsonify(ok=False, erro="informe o nome do cartão"), 400
    if not d.get("dia_vencimento") or not d.get("dia_fechamento"):
        return jsonify(ok=False, erro="informe os dias de fechamento e vencimento"), 400
    d.setdefault("banco", d["nome"])
    cols = ["tipo", "saldo"] + list(d)
    cid = db.execute(f"INSERT INTO contas ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id",
                     ["CARTAO", 0] + list(d.values()))[0]["id"]
    if d.get("numero"):
        db.execute("INSERT INTO cartoes_finais (conta_id, final) VALUES (%s,%s) ON CONFLICT DO NOTHING", (cid, d["numero"]))
    pluggy.gerar_faturas_manuais(cid)
    if _num(b.get("fatura_atual")):
        _fatura_atual_inicial(cid, _num(b.get("fatura_atual")))
        pluggy.gerar_faturas_manuais(cid)
    pluggy.aplicar_responsavel()
    return jsonify(ok=True, id=cid)


@app.patch("/api/cartoes/<int:cid>")
@_token
def cartao_editar(cid):
    c = db.query("SELECT (pluggy_account_id IS NULL) manual FROM contas WHERE id=%s AND tipo='CARTAO'", (cid,))
    if not c:
        return jsonify(ok=False, erro="cartão não encontrado"), 404
    manual = c[0]["manual"]
    b = request.get_json(force=True) or {}
    try:
        d = _dados_cartao(b, manual)
    except (ValueError, TypeError) as e:
        return jsonify(ok=False, erro=str(e)), 400
    if d:
        db.execute(f"UPDATE contas SET {', '.join(k + '=%s' for k in d)}, atualizado_em=now() WHERE id=%s", list(d.values()) + [cid])
    if manual:
        if d.get("numero"):
            db.execute("INSERT INTO cartoes_finais (conta_id, final) VALUES (%s,%s) ON CONFLICT DO NOTHING", (cid, d["numero"]))
        pluggy.gerar_faturas_manuais(cid)
        if "fatura_atual" in b:
            _fatura_atual_inicial(cid, _num(b.get("fatura_atual")))
            pluggy.gerar_faturas_manuais(cid)
    n = pluggy.aplicar_responsavel()
    return jsonify(ok=True, lancamentos_movidos=n)


@app.delete("/api/cartoes/<int:cid>")
@_token
def cartao_excluir(cid):
    """So cartao manual. Com compras lancadas -> desativa (historico continua)."""
    c = db.query("SELECT (pluggy_account_id IS NULL) manual FROM contas WHERE id=%s AND tipo='CARTAO'", (cid,))
    if not c or not c[0]["manual"]:
        return jsonify(ok=False, erro="só dá para excluir cartão cadastrado no app"), 400
    if db.query("SELECT 1 FROM lancamentos WHERE conta_id=%s LIMIT 1", (cid,)) or db.query("SELECT 1 FROM agendados WHERE conta_id=%s LIMIT 1", (cid,)):
        db.execute("UPDATE contas SET ativa=false WHERE id=%s", (cid,))
        return jsonify(ok=True, desativado=True)
    with db.transaction() as cur:
        cur.execute("DELETE FROM faturas WHERE conta_id=%s", (cid,))
        cur.execute("DELETE FROM cartoes_finais WHERE conta_id=%s", (cid,))
        cur.execute("DELETE FROM contas WHERE id=%s", (cid,))
    return jsonify(ok=True, desativado=False)


@app.post("/api/cartoes/<int:cid>/fatura/<mes>/pagar")
@_token
def fatura_pagar(cid, mes):
    """Marca a fatura como paga (cartao manual / da GM). {valor?, data?} -- sem valor = o que falta."""
    b = request.get_json(force=True) or {}
    f = db.query("""SELECT f.id, f.total::float8 total, coalesce((SELECT sum(p.valor) FROM fatura_pagamentos p WHERE p.fatura_id=f.id),0)::float8 pago
                    FROM faturas f WHERE f.conta_id=%s AND f.mes=%s""", (cid, mes))
    if not f:
        return jsonify(ok=False, erro="fatura não encontrada"), 404
    valor = _num(b.get("valor")) or round(f[0]["total"] - f[0]["pago"], 2)
    if valor <= 0:
        return jsonify(ok=False, erro="nada a pagar nesta fatura"), 400
    db.execute("INSERT INTO fatura_pagamentos (fatura_id, data, valor, tipo) VALUES (%s,%s,%s,'MANUAL')",
               (f[0]["id"], b.get("data") or date.today().isoformat(), valor))
    pluggy.gerar_faturas_manuais(cid)
    return jsonify(ok=True, valor=valor)


# ============================== CONTAS EM CASCATA / CAIXINHAS / TRANSFERENCIAS ==============================
BANCOS_VISUAL = {"Nubank": ("nubank", "NU", "#7A2FCF"), "Mercado Pago": ("mercadopago", "MP", "#0A7BC2"),
                 "Inter": ("inter", "IN", "#E8660C"), "Caixa": ("caixa", "CX", "#1C5BA8"),
                 "Dinheiro": ("carteira", "R$", "#3C7A61")}
ORDEM_BANCOS = ["Nubank", "Mercado Pago", "Inter", "Dinheiro"]


def _saldos_caixinhas():
    """Saldo de cada caixinha = saldo informado na criacao + aplicacoes - resgates alocados a ela depois disso."""
    cxs = db.query("""SELECT c.id, c.banco, c.nome, c.meta::float8 meta, c.prazo, c.saldo_inicial::float8 saldo_inicial, c.data_inicial, c.economia,
                             coalesce((SELECT -sum(l.valor) FROM caixinha_movimentos m JOIN lancamentos l ON l.id=m.lancamento_id
                                        WHERE m.caixinha_id=c.id AND l.data >= c.data_inicial),0)::float8 mov
                        FROM caixinhas c WHERE c.ativa ORDER BY c.id""")
    for c in cxs:
        c["saldo"] = round(c["saldo_inicial"] + c["mov"], 2)
    return cxs


def _rdb_pendentes():
    """Aplicacoes/resgates (de qualquer banco) depois da 1a caixinha daquele banco e sem caixinha definida."""
    return db.query("""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.valor::float8 valor, l.descricao,
                              coalesce(ct.banco_grupo, ct.banco) banco
                         FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                         JOIN (SELECT banco, min(data_inicial) d FROM caixinhas WHERE ativa GROUP BY 1) cx
                           ON cx.banco=coalesce(ct.banco_grupo, ct.banco)
                        WHERE l.tipo='INVESTIMENTO' AND l.responsavel='PESSOAL' AND l.data >= cx.d
                          AND NOT EXISTS (SELECT 1 FROM caixinha_movimentos m WHERE m.lancamento_id=l.id)
                        ORDER BY l.data DESC""")


def _atualizar_saldos_manuais():
    """Conta sem Pluggy (carteira, conta manual): saldo = saldo informado + lancamentos desde a data informada."""
    db.execute("""UPDATE contas c SET saldo = c.saldo_inicial + coalesce((SELECT sum(l.valor) FROM lancamentos l
                    WHERE l.conta_id=c.id AND (c.data_inicial IS NULL OR l.data >= c.data_inicial)),0)
                  WHERE c.pluggy_account_id IS NULL AND c.tipo IN ('CORRENTE','CARTEIRA')""")


def _visual(banco):
    slug, sigla, cor = BANCOS_VISUAL.get(banco, (banco.lower().replace(" ", ""), banco[:2].upper(), "#4A4B55"))
    cfg = db.query("SELECT apelido, cor, emoji FROM bancos_config WHERE banco=%s", (banco,))
    cfg = cfg[0] if cfg else {}
    return {"slug": slug, "sigla": sigla, "cor": cfg.get("cor") or cor, "emoji": cfg.get("emoji"), "apelido": cfg.get("apelido")}


@app.get("/api/contas")
@_token
def contas_cascata():
    hoje = date.today()
    cxs = _saldos_caixinhas()
    pend = _rdb_pendentes()
    _atualizar_saldos_manuais()
    linhas = db.query("""SELECT id, coalesce(banco_grupo, banco) banco, nome, apelido, tipo, subtipo, numero, saldo::float8 saldo,
                                fatura_valor::float8 fatura_valor, (pluggy_account_id IS NULL) manual,
                                fatura_vencimento, limite_configurado::float8 limite_configurado, limite_cartao::float8 limite_cartao
                           FROM contas WHERE ativa AND responsavel='PESSOAL' ORDER BY 2,
                                CASE tipo WHEN 'CORRENTE' THEN 1 WHEN 'CARTEIRA' THEN 1 WHEN 'INVESTIMENTO' THEN 2 ELSE 3 END, subtipo""")
    bancos, tot = {}, {"contas": 0.0, "guardado": 0.0, "dividas": 0.0}
    for c in linhas:
        b = bancos.setdefault(c["banco"], {"banco": c["banco"], "itens": [], "total": 0.0, "guardado": 0.0, "fatura": 0.0})
        if c["tipo"] in ("CORRENTE", "CARTEIRA"):
            sub = {"CHECKING_ACCOUNT": "Conta corrente", "SAVINGS_ACCOUNT": "Poupança"}.get(c["subtipo"], "Dinheiro em mãos" if c["tipo"] == "CARTEIRA" else "Conta")
            guard = c["subtipo"] == "SAVINGS_ACCOUNT"
            b["itens"].append({"nivel": 1, "tipo": "POUPANCA" if guard else c["tipo"], "id": c["id"], "nome": c["apelido"] or (c["nome"] if c["manual"] and c["tipo"] == "CORRENTE" else sub),
                               "sub": c["numero"] or "", "valor": c["saldo"]})
            b["total"] += c["saldo"]
            tot["guardado" if guard else "contas"] += c["saldo"]
            if guard:
                b["guardado"] += c["saldo"]
        elif c["tipo"] == "INVESTIMENTO":
            meus = [x for x in cxs if x["banco"] == c["banco"]]
            pend_b = [x for x in pend if x["banco"] == c["banco"]]
            nao_aloc = round(sum(-x["valor"] for x in pend_b), 2)
            v = round(sum(x["saldo"] for x in meus) + nao_aloc, 2)
            b["itens"].append({"nivel": 1, "tipo": "INVESTIMENTO", "id": c["id"], "nome": c["apelido"] or c["nome"], "valor": v,
                               "sub": f"{len(meus)} caixinha(s)" if meus else "toque em + Caixinha para começar"})
            for x in meus:
                pct = round(min(x["saldo"] / x["meta"] * 100, 100)) if x["meta"] else None
                b["itens"].append({"nivel": 2, "tipo": "CAIXINHA", "id": x["id"], "nome": x["nome"], "valor": x["saldo"],
                                   "meta": x["meta"], "pct": pct, "economia": x["economia"],
                                   "sub": (f"meta R$ {x['meta']:,.0f}".replace(",", ".") + (f" · {pct}%" if pct is not None else "")
                                           + (f" até {x['prazo'].strftime('%m/%y')}" if x["prazo"] else "")) if x["meta"] else "sem meta"})
            if pend_b:
                b["itens"].append({"nivel": 2, "tipo": "NAO_ALOCADO", "id": None, "nome": "Não alocado", "valor": nao_aloc,
                                   "sub": f"{len(pend_b)} movimento(s) sem caixinha"})
            b["total"] += v
            b["guardado"] += v
            tot["guardado"] += v
        elif c["tipo"] == "CARTAO":
            usado = c["saldo"] or 0
            venc = c["fatura_vencimento"].strftime("%d/%m") if c["fatura_vencimento"] else None
            lim = c["limite_configurado"] or c["limite_cartao"]
            b["itens"].append({"nivel": 1, "tipo": "CARTAO", "id": c["id"], "nome": c["apelido"] or f"Cartão {c['numero'] or ''}".strip(),
                               "valor": -usado,
                               "sub": (f"fatura R$ {c['fatura_valor']:,.2f} vence {venc}".replace(",", "X").replace(".", ",").replace("X", ".")
                                       if c["fatura_valor"] and venc else "sem fatura aberta")
                                      + (f" · limite R$ {lim:,.0f}".replace(",", ".") if lim else "")})
            b["total"] -= usado
            b["fatura"] += c["fatura_valor"] or 0
            tot["dividas"] += usado
    lista = []
    for nome in ORDEM_BANCOS + sorted(set(bancos) - set(ORDEM_BANCOS)):
        if nome in bancos:
            b = bancos[nome]
            b.update(_visual(nome), total=round(b["total"], 2))
            lista.append(b)
    return jsonify(bancos=lista, pendentes=pend, caixinhas=[{"id": x["id"], "nome": x["nome"], "banco": x["banco"], "saldo": x["saldo"],
                                                             "economia": x["economia"]} for x in cxs],
                   contas=[{"id": c["id"], "banco": c["banco"], "nome": c["nome"], "tipo": c["tipo"], "saldo": c["saldo"]}
                           for c in linhas if c["tipo"] in ("CORRENTE", "CARTEIRA")],
                   patrimonio={"contas": round(tot["contas"], 2), "guardado": round(tot["guardado"], 2),
                               "dividas": round(tot["dividas"], 2),
                               "liquido": round(tot["contas"] + tot["guardado"] - tot["dividas"], 2)})


@app.post("/api/caixinhas")
@_token
def criar_caixinha():
    """{"nome", "saldo_atual", "meta"?, "prazo"? (AAAA-MM-DD), "banco"? (padrao Nubank)}"""
    b = request.get_json(force=True) or {}
    nome = (b.get("nome") or "").strip()
    if not nome:
        return jsonify(ok=False, erro="informe o nome"), 400
    banco = b.get("banco") or "Nubank"
    if not db.query("SELECT 1 FROM contas WHERE tipo='INVESTIMENTO' AND coalesce(banco_grupo, banco)=%s", (banco,)):
        db.execute("INSERT INTO contas (nome, banco, tipo, saldo) VALUES ('Caixinhas', %s, 'INVESTIMENTO', 0)", (banco,))
    r = db.execute("""INSERT INTO caixinhas (banco, nome, meta, prazo, saldo_inicial, economia) VALUES (%s,%s,%s,%s,%s,%s)
                  ON CONFLICT (banco, nome) DO UPDATE SET meta=EXCLUDED.meta, prazo=EXCLUDED.prazo,
                    saldo_inicial=EXCLUDED.saldo_inicial, data_inicial=current_date, ativa=true, economia=EXCLUDED.economia
                  RETURNING id""",
               (banco, nome, b.get("meta") or None, b.get("prazo") or None, float(b.get("saldo_atual") or 0),
                b.get("economia", True) is not False))
    pluggy.aplicar_economia()
    return jsonify(ok=True, id=r[0]["id"])


@app.patch("/api/caixinhas/<int:cid>")
@_token
def editar_caixinha(cid):
    """{nome?, meta?, prazo?, economia?, ativa?} -- economia=false: aplicacoes/resgates dela saem do pote Investir."""
    b = request.get_json(force=True) or {}
    sets, par = [], []
    if "nome" in b:
        if not (b["nome"] or "").strip():
            return jsonify(ok=False, erro="informe o nome"), 400
        sets.append("nome=%s"); par.append(b["nome"].strip())
    for k in ("meta", "prazo"):
        if k in b:
            sets.append(f"{k}=%s"); par.append(b[k] or None)
    for k in ("economia", "ativa"):
        if k in b:
            sets.append(f"{k}=%s"); par.append(bool(b[k]))
    if sets:
        db.execute(f"UPDATE caixinhas SET {', '.join(sets)} WHERE id=%s", par + [cid])
    n = pluggy.aplicar_economia()
    return jsonify(ok=True, reclassificados=n)


@app.get("/api/contas/<int:cid>/extrato")
@_token
def conta_extrato(cid):
    """Lancamentos do mes da conta com o SALDO DEPOIS de cada um (calculado de tras pra frente a partir do saldo atual)."""
    ini, fim = _mes(request.args.get("mes"))
    _atualizar_saldos_manuais()
    c = db.query("""SELECT id, coalesce(banco_grupo, banco) banco, nome, apelido, tipo, subtipo, numero, saldo::float8 saldo,
                           (pluggy_account_id IS NULL) manual, atualizado_em FROM contas WHERE id=%s""", (cid,))
    if not c:
        return jsonify(ok=False, erro="conta não encontrada"), 404
    c = c[0]
    itens = db.query("""SELECT * FROM (
            SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.data d, l.descricao, l.valor::float8 valor, l.tipo, l.status,
                   c.nome categoria, l.categoria_id, s.nome subcategoria, l.subcategoria_id,
                   (%s - coalesce(sum(l.valor) OVER (ORDER BY l.data DESC, l.id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0))::float8 saldo_apos
              FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id LEFT JOIN subcategorias s ON s.id=l.subcategoria_id
             WHERE l.conta_id=%s) x WHERE x.d BETWEEN %s AND %s ORDER BY x.d DESC, x.id DESC""", (c["saldo"], cid, ini, fim))
    for i in itens:
        i.pop("d", None)
    depois = lambda d: _soma("SELECT sum(valor) v FROM lancamentos WHERE conta_id=%s AND data >= %s", (cid, d))
    return jsonify(conta={k: c[k] for k in ("id", "banco", "nome", "apelido", "tipo", "subtipo", "numero", "saldo", "manual")},
                   atualizado=c["atualizado_em"].isoformat() if c["atualizado_em"] else None,
                   saldo_inicio=round(c["saldo"] - depois(ini), 2), saldo_fim=round(c["saldo"] - depois(fim + timedelta(days=1)), 2),
                   entradas=round(sum(i["valor"] for i in itens if i["valor"] > 0), 2),
                   saidas=round(-sum(i["valor"] for i in itens if i["valor"] < 0), 2), itens=itens)


@app.get("/api/caixinhas/<int:cid>/extrato")
@_token
def caixinha_extrato(cid):
    cx = [x for x in _saldos_caixinhas() if x["id"] == cid]
    if not cx:
        return jsonify(ok=False, erro="caixinha não encontrada"), 404
    cx = cx[0]
    mov = db.query("""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.data d, l.descricao, -l.valor::float8 valor, ct.banco
                        FROM caixinha_movimentos m JOIN lancamentos l ON l.id=m.lancamento_id JOIN contas ct ON ct.id=l.conta_id
                       WHERE m.caixinha_id=%s ORDER BY l.data, l.id""", (cid,))
    saldo = cx["saldo_inicial"]
    for m in mov:                       # saldo corre a partir do saldo informado na criacao
        conta = m["d"] >= cx["data_inicial"]
        if conta:
            saldo += m["valor"]
        m.update(saldo_apos=round(saldo, 2) if conta else None, antes_do_inicio=not conta)
        m.pop("d")
    mov.reverse()
    return jsonify(caixinha={"id": cx["id"], "nome": cx["nome"], "banco": cx["banco"], "saldo": cx["saldo"], "meta": cx["meta"],
                             "economia": cx["economia"], "prazo": cx["prazo"].isoformat() if cx["prazo"] else None,
                             "saldo_inicial": cx["saldo_inicial"], "data_inicial": cx["data_inicial"].isoformat()}, movimentos=mov)


@app.get("/api/bancos/<path:banco>")
@_token
def banco_config(banco):
    _atualizar_saldos_manuais()
    contas = db.query("""SELECT id, banco banco_origem, coalesce(banco_grupo, banco) grupo, nome, apelido, tipo, subtipo, numero,
                                saldo::float8 saldo, ativa, (pluggy_account_id IS NULL) manual, responsavel
                           FROM contas ORDER BY tipo, nome""")
    return jsonify(banco=banco, **_visual(banco), contas=[c for c in contas if c["grupo"] == banco],
                   outras=[c for c in contas if c["grupo"] != banco and c["ativa"]],
                   caixinhas=[{"id": x["id"], "nome": x["nome"], "saldo": x["saldo"], "economia": x["economia"]}
                              for x in _saldos_caixinhas() if x["banco"] == banco])


@app.patch("/api/bancos/<path:banco>")
@_token
def banco_config_salvar(banco):
    b = request.get_json(force=True) or {}
    db.execute("""INSERT INTO bancos_config (banco, apelido, cor, emoji) VALUES (%s,%s,%s,%s)
                  ON CONFLICT (banco) DO UPDATE SET apelido=EXCLUDED.apelido, cor=EXCLUDED.cor, emoji=EXCLUDED.emoji""",
               (banco, (b.get("apelido") or "").strip() or None, b.get("cor") or None, (b.get("emoji") or "").strip()[:4] or None))
    return jsonify(ok=True)


@app.post("/api/contas")
@_token
def conta_nova():
    """Conta manual (sem Pluggy): {nome, banco, tipo: CORRENTE|POUPANCA|CARTEIRA, saldo_atual}."""
    b = request.get_json(force=True) or {}
    nome, banco = (b.get("nome") or "").strip(), (b.get("banco") or "").strip()
    tipo = (b.get("tipo") or "CORRENTE").upper()
    if not nome or not banco or tipo not in ("CORRENTE", "POUPANCA", "CARTEIRA"):
        return jsonify(ok=False, erro="informe nome, banco e tipo"), 400
    r = db.execute("""INSERT INTO contas (nome, banco, tipo, subtipo, saldo, saldo_inicial, data_inicial)
                      VALUES (%s,%s,%s,%s,%s,%s,current_date) RETURNING id""",
                   (nome, banco, "CARTEIRA" if tipo == "CARTEIRA" else "CORRENTE",
                    "SAVINGS_ACCOUNT" if tipo == "POUPANCA" else ("CHECKING_ACCOUNT" if tipo == "CORRENTE" else None),
                    float(b.get("saldo_atual") or 0), float(b.get("saldo_atual") or 0)))
    return jsonify(ok=True, id=r[0]["id"])


@app.patch("/api/contas/<int:cid>")
@_token
def conta_editar(cid):
    """{apelido?, banco_grupo? (atrelar a outro banco; vazio = banco original), ativa? (ocultar), saldo_atual? (so conta manual)}"""
    b = request.get_json(force=True) or {}
    c = db.query("SELECT banco, (pluggy_account_id IS NULL) manual FROM contas WHERE id=%s", (cid,))
    if not c:
        return jsonify(ok=False, erro="conta não encontrada"), 404
    if "apelido" in b:
        db.execute("UPDATE contas SET apelido=%s WHERE id=%s", ((b["apelido"] or "").strip() or None, cid))
    if "banco_grupo" in b:
        g = (b["banco_grupo"] or "").strip() or None
        db.execute("UPDATE contas SET banco_grupo=%s WHERE id=%s", (None if g == c[0]["banco"] else g, cid))
    if "ativa" in b:
        db.execute("UPDATE contas SET ativa=%s WHERE id=%s", (bool(b["ativa"]), cid))
    if "saldo_atual" in b and c[0]["manual"]:
        hoje_mov = _soma("SELECT sum(valor) v FROM lancamentos WHERE conta_id=%s AND data >= current_date", (cid,))
        db.execute("UPDATE contas SET saldo_inicial=%s, data_inicial=current_date WHERE id=%s",
                   (float(b["saldo_atual"] or 0) - hoje_mov, cid))
        _atualizar_saldos_manuais()
    return jsonify(ok=True)


@app.post("/api/caixinhas/alocar")
@_token
def alocar_caixinha():
    """{"lancamento_id", "caixinha_id"} -- diz para qual caixinha foi uma Aplicacao/Resgate RDB."""
    b = request.get_json(force=True) or {}
    if not b.get("caixinha_id"):                     # tirar da caixinha
        db.execute("DELETE FROM caixinha_movimentos WHERE lancamento_id=%s", (int(b["lancamento_id"]),))
    else:
        db.execute("""INSERT INTO caixinha_movimentos (lancamento_id, caixinha_id) VALUES (%s,%s)
                      ON CONFLICT (lancamento_id) DO UPDATE SET caixinha_id=EXCLUDED.caixinha_id""",
                   (int(b["lancamento_id"]), int(b["caixinha_id"])))
    pluggy.aplicar_economia()
    return jsonify(ok=True)


@app.post("/api/transferencias")
@_token
def nova_transferencia():
    """{"tipo": APLICACAO|RESGATE|ENTRE_BANCOS|SAQUE, "valor", "data"?, "de_conta_id"?, "para_conta_id"?, "caixinha_id"?, "obs"?}
    APLICACAO/RESGATE: quando o "Aplicacao/Resgate RDB" chegar no extrato, liga sozinho (sem contar 2x).
    SAQUE: entra na Carteira na hora (o debito da conta vem do extrato)."""
    b = request.get_json(force=True) or {}
    tipo = (b.get("tipo") or "").upper()
    valor = round(float(b.get("valor") or 0), 2)
    if tipo not in ("APLICACAO", "RESGATE", "ENTRE_BANCOS", "SAQUE") or valor <= 0:
        return jsonify(ok=False, erro="tipo ou valor invalido"), 400
    dt = b.get("data") or date.today().isoformat()
    para = b.get("para_conta_id")
    if tipo == "SAQUE" and not para:
        para = db.query("SELECT id FROM contas WHERE tipo='CARTEIRA' LIMIT 1")[0]["id"]
    tid = db.execute("""INSERT INTO transferencias (data, valor, tipo, de_conta_id, para_conta_id, caixinha_id, obs)
                        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                     (dt, valor, tipo, b.get("de_conta_id"), para, b.get("caixinha_id"), b.get("obs")))[0]["id"]
    if tipo == "SAQUE":
        cat = db.query("SELECT id FROM categorias WHERE nome='Transferência entre contas'")[0]["id"]
        db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, pote, status, origem, obs)
                      VALUES (%s,%s,%s,%s,'TRANSFERENCIA',%s,'NENHUM','CONFIRMADO','MANUAL',%s)""",
                   (para, dt, "Saque para a carteira", valor, cat, f"transferencia #{tid}"))
    ligadas = pluggy.ligar_transferencias()
    return jsonify(ok=True, id=tid, ligadas_ao_extrato=ligadas)


# ============================== CADASTRO MANUAL (estilo Minhas Financas) ==============================
@app.get("/api/categorias")
@_token
def categorias_lista():
    """?natureza=RECEITA|DESPESA|TRANSFERENCIA  ?todas=1 inclui arquivadas. Cada categoria vem com subcategorias e uso."""
    nat = (request.args.get("natureza") or "").upper()
    todas = bool(request.args.get("todas"))
    cats = db.query("""SELECT c.id, c.nome, c.pote, c.natureza, c.ativa,
                              (SELECT count(*) FROM lancamentos l WHERE l.categoria_id=c.id) uso
                         FROM categorias c WHERE (c.ativa OR %s) AND (%s = '' OR c.natureza = %s) ORDER BY c.nome""", (todas, nat, nat))
    subs = db.query("""SELECT s.id, s.categoria_id, s.nome, (SELECT count(*) FROM lancamentos l WHERE l.subcategoria_id=s.id) uso
                         FROM subcategorias s ORDER BY s.nome""")
    for c in cats:
        c["subcategorias"] = [{"id": x["id"], "nome": x["nome"], "uso": x["uso"]} for x in subs if x["categoria_id"] == c["id"]]
    return jsonify(cats)


CATEGORIAS_SISTEMA = {"Outros", "Pagamento de fatura", "Transferência entre contas", "Gasto da GM (reembolsável)",
                      "Salário / renda", "Outras receitas"}


@app.patch("/api/categorias/<int:cid>")
@_token
def categoria_editar(cid):
    """{nome?, pote?, ativa?} -- trocar o pote reclassifica as despesas dessa categoria no 50/30/20."""
    b = request.get_json(force=True) or {}
    c = db.query("SELECT nome, natureza FROM categorias WHERE id=%s", (cid,))
    if not c:
        return jsonify(ok=False, erro="categoria inexistente"), 404
    if b.get("nome") and b["nome"].strip() != c[0]["nome"]:
        if c[0]["nome"] in CATEGORIAS_SISTEMA:
            return jsonify(ok=False, erro="essa categoria é usada pelo app e não pode ser renomeada"), 400
        if db.query("SELECT 1 FROM categorias WHERE nome=%s AND id<>%s", (b["nome"].strip(), cid)):
            return jsonify(ok=False, erro="já existe uma categoria com esse nome"), 400
        db.execute("UPDATE categorias SET nome=%s WHERE id=%s", (b["nome"].strip(), cid))
    if b.get("pote") and c[0]["natureza"] == "DESPESA":
        pote = b["pote"].upper()
        if pote not in ("NEC", "DES", "INV"):
            return jsonify(ok=False, erro="pote inválido"), 400
        db.execute("UPDATE categorias SET pote=%s WHERE id=%s", (pote, cid))
        db.execute("""UPDATE lancamentos SET pote=%s, tipo=CASE WHEN %s='INV' THEN 'INVESTIMENTO' ELSE 'DESPESA' END, atualizado_em=now()
                      WHERE categoria_id=%s AND tipo IN ('DESPESA','INVESTIMENTO')
                        AND NOT EXISTS (SELECT 1 FROM cartoes_finais cf WHERE cf.conta_id=lancamentos.conta_id
                                        AND cf.final=lancamentos.cartao_final AND cf.uso='GM')""", (pote, pote, cid))
    if "ativa" in b:
        db.execute("UPDATE categorias SET ativa=%s WHERE id=%s", (bool(b["ativa"]), cid))
    return jsonify(ok=True)


@app.delete("/api/categorias/<int:cid>")
@_token
def categoria_excluir(cid):
    """Sem uso -> apaga. Com lancamentos/agendados/regras -> arquiva (some das listas, historico continua certo)."""
    c = db.query("SELECT nome FROM categorias WHERE id=%s", (cid,))
    if not c:
        return jsonify(ok=False, erro="categoria inexistente"), 404
    if c[0]["nome"] in CATEGORIAS_SISTEMA:
        return jsonify(ok=False, erro="essa categoria é usada pelo app e não pode ser excluída"), 400
    usada = db.query("""SELECT (SELECT count(*) FROM lancamentos WHERE categoria_id=%s) + (SELECT count(*) FROM agendados WHERE categoria_id=%s)
                             + (SELECT count(*) FROM regras WHERE categoria_id=%s) + (SELECT count(*) FROM categorias_pluggy WHERE categoria_id=%s)
                             + (SELECT count(*) FROM ajustes_lancamento WHERE categoria_id=%s) n""", (cid,) * 5)[0]["n"]
    if usada:
        db.execute("UPDATE categorias SET ativa=false WHERE id=%s", (cid,))
        return jsonify(ok=True, arquivada=True)
    db.execute("DELETE FROM categorias WHERE id=%s", (cid,))
    return jsonify(ok=True, arquivada=False)


@app.patch("/api/subcategorias/<int:sid>")
@_token
def subcategoria_editar(sid):
    b = request.get_json(force=True) or {}
    nome = (b.get("nome") or "").strip()
    if not nome:
        return jsonify(ok=False, erro="informe o nome"), 400
    s0 = db.query("SELECT categoria_id FROM subcategorias WHERE id=%s", (sid,))
    if not s0:
        return jsonify(ok=False, erro="subcategoria inexistente"), 404
    if db.query("SELECT 1 FROM subcategorias WHERE categoria_id=%s AND nome=%s AND id<>%s", (s0[0]["categoria_id"], nome, sid)):
        return jsonify(ok=False, erro="já existe essa subcategoria"), 400
    db.execute("UPDATE subcategorias SET nome=%s WHERE id=%s", (nome, sid))
    return jsonify(ok=True)


@app.delete("/api/subcategorias/<int:sid>")
@_token
def subcategoria_excluir(sid):
    """Os lancamentos continuam na categoria, so ficam sem subcategoria."""
    with db.transaction() as cur:
        for t in ("lancamentos", "agendados", "regras", "ajustes_lancamento"):
            cur.execute(f"UPDATE {t} SET subcategoria_id=NULL WHERE subcategoria_id=%s", (sid,))
        cur.execute("DELETE FROM subcategorias WHERE id=%s", (sid,))
    return jsonify(ok=True)


@app.patch("/api/agendados/<int:aid>")
@_token
def agendado_editar(aid):
    """{categoria_id, subcategoria_id?, serie?} -- serie=true troca tambem os proximos da mesma recorrencia."""
    b = request.get_json(force=True) or {}
    a = db.query("SELECT recorrencia_id, data FROM agendados WHERE id=%s", (aid,))
    if not a:
        return jsonify(ok=False, erro="agendado inexistente"), 404
    cid = int(b["categoria_id"]) if b.get("categoria_id") else None
    sub = int(b["subcategoria_id"]) if b.get("subcategoria_id") else None
    if sub and not db.query("SELECT 1 FROM subcategorias WHERE id=%s AND categoria_id=%s", (sub, cid)):
        return jsonify(ok=False, erro="subcategoria não pertence à categoria"), 400
    if b.get("serie") and a[0]["recorrencia_id"]:
        n = db.execute("""UPDATE agendados SET categoria_id=%s, subcategoria_id=%s WHERE recorrencia_id=%s AND data >= %s
                          AND lancamento_id IS NULL RETURNING id""", (cid, sub, a[0]["recorrencia_id"], a[0]["data"]))
    else:
        n = db.execute("UPDATE agendados SET categoria_id=%s, subcategoria_id=%s WHERE id=%s RETURNING id", (cid, sub, aid))
    return jsonify(ok=True, alterados=len(n))


@app.post("/api/categorias")
@_token
def categoria_nova():
    b = request.get_json(force=True) or {}
    nat = (b.get("natureza") or "DESPESA").upper()
    pote = "NENHUM" if nat == "RECEITA" else (b.get("pote") or "DES").upper()
    r = db.execute("""INSERT INTO categorias (nome, pote, natureza) VALUES (%s,%s,%s)
                      ON CONFLICT (nome) DO UPDATE SET ativa=true RETURNING id""", (b["nome"].strip(), pote, nat))
    return jsonify(ok=True, id=r[0]["id"])


@app.post("/api/subcategorias")
@_token
def subcategoria_nova():
    b = request.get_json(force=True) or {}
    r = db.execute("""INSERT INTO subcategorias (categoria_id, nome) VALUES (%s,%s)
                      ON CONFLICT (categoria_id, nome) DO UPDATE SET nome=EXCLUDED.nome RETURNING id""",
                   (int(b["categoria_id"]), b["nome"].strip()))
    return jsonify(ok=True, id=r[0]["id"])


def _proxima(d, periodicidade, a_cada, k):
    from pluggy import _add_mes
    per = periodicidade.upper()
    if per == "MENSAL":
        return _add_mes(d, k)
    if per == "TRIMESTRAL":
        return _add_mes(d, 3 * k)
    if per == "ANUAL":
        return _add_mes(d, 12 * k)
    if per == "SEMANAL":
        return d + timedelta(days=7 * k)
    if per == "DIARIO":
        return d + timedelta(days=k)
    return d + timedelta(days=int(a_cada or 30) * k)          # PERSONALIZADO: a cada N dias


QTD_FIXA = {"MENSAL": 12, "TRIMESTRAL": 4, "ANUAL": 2, "SEMANAL": 26, "DIARIO": 31, "PERSONALIZADO": 12}


@app.post("/api/lancamentos")
@_token
def lancamento_novo():
    """Cadastro manual. {natureza: RECEITA|DESPESA, descricao, valor (positivo), data, efetivada, conta_id, categoria_id,
    subcategoria_id?, tags?[], recorrencia?: {tipo: NAO|FIXA|PARCELADA, periodicidade, a_cada_dias?, parcela_inicial?, quantidade?}}
    Efetivada -> lancamento (conta no saldo). Nao efetivada / parcelas futuras -> agendados (nao mexem no saldo ate
    efetivar ou o banco trazer o movimento -- ai ligam sozinhos, sem duplicar)."""
    b = request.get_json(force=True) or {}
    nat = (b.get("natureza") or "").upper()
    valor = round(abs(float(b.get("valor") or 0)), 2)
    if nat not in ("RECEITA", "DESPESA", "ESTORNO") or valor <= 0 or not (b.get("descricao") or "").strip():
        return jsonify(ok=False, erro="preencha descrição e valor"), 400
    sinal = -1 if nat == "DESPESA" else 1
    tipo_l = "DESPESA" if nat == "ESTORNO" else nat          # estorno = credito no cartao que desconta do pote
    if nat == "ESTORNO":
        b["efetivada"], b["recorrencia"] = True, None
    d0 = date.fromisoformat(b.get("data") or date.today().isoformat())
    rec = b.get("recorrencia") or {}
    tipo_rec = (rec.get("tipo") or "NAO").upper()
    per = (rec.get("periodicidade") or "MENSAL").upper()
    rid, ocorrencias = None, [(d0, None, None)]
    if tipo_rec in ("FIXA", "PARCELADA"):
        if tipo_rec == "PARCELADA":
            ini, qtd = int(rec.get("parcela_inicial") or 1), int(rec.get("quantidade") or 2)
            ns = list(range(ini, qtd + 1))
        else:
            qtd, ns = None, list(range(1, QTD_FIXA.get(per, 12) + 1))
        rid = db.execute("INSERT INTO recorrencias (tipo, periodicidade, a_cada_dias, total) VALUES (%s,%s,%s,%s) RETURNING id",
                         (tipo_rec, per, rec.get("a_cada_dias"), qtd))[0]["id"]
        ocorrencias = [(_proxima(d0, per, rec.get("a_cada_dias"), k), n if tipo_rec == "PARCELADA" else None, qtd)
                       for k, n in enumerate(ns)]
    cat = db.query("SELECT pote FROM categorias WHERE id=%s", (b.get("categoria_id"),)) if b.get("categoria_id") else []
    pote = "NENHUM" if nat == "RECEITA" or not cat else cat[0]["pote"]
    tags = [t.strip() for t in (b.get("tags") or []) if t.strip()] or None
    criados = 0
    for i, (d, n, tot) in enumerate(ocorrencias):
        desc = b["descricao"].strip() + (f" ({n}/{tot})" if n else "")
        if i == 0 and b.get("efetivada", True) and d <= date.today():
            db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, subcategoria_id, tags, pote,
                            status, origem, recorrencia_id, parcela_n, parcela_total, cartao_final)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'CONFIRMADO','MANUAL',%s,%s,%s,%s)""",
                       (b.get("conta_id"), d, desc, sinal * valor, tipo_l, b.get("categoria_id"), b.get("subcategoria_id"),
                        tags, pote, rid, n, tot, b.get("cartao_final") or None))
        else:
            db.execute("""INSERT INTO agendados (natureza, descricao, valor, data, conta_id, categoria_id, subcategoria_id, tags,
                            recorrencia_id, parcela_n, parcela_total) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                       (nat, desc, sinal * valor, d, b.get("conta_id"), b.get("categoria_id"), b.get("subcategoria_id"),
                        tags, rid, n, tot))
        criados += 1
    if b.get("conta_id") and db.query("SELECT 1 FROM contas WHERE id=%s AND tipo='CARTAO'", (b["conta_id"],)):
        pluggy.vincular_faturas()                     # compra no cartao -> cai na fatura certa pelo fechamento
        pluggy.gerar_faturas_manuais(int(b["conta_id"]))
    pluggy.aplicar_responsavel()
    return jsonify(ok=True, criados=criados)


@app.get("/api/movimentos")
@_token
def movimentos():
    """Lista do mes por natureza (RECEITA|DESPESA): realizados + agendados pendentes, como no Minhas Financas."""
    ini, fim = _mes(request.args.get("mes"))
    nat = (request.args.get("natureza") or "RECEITA").upper()
    real = db.query("""SELECT l.id, 'L' fonte, to_char(l.data,'YYYY-MM-DD') data, l.descricao, l.valor::float8 valor, true efetivada,
                              c.nome categoria, s.nome subcategoria, ct.banco, l.origem, l.tags, l.categoria_id, l.subcategoria_id, l.tipo
                         FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
                         LEFT JOIN subcategorias s ON s.id=l.subcategoria_id LEFT JOIN contas ct ON ct.id=l.conta_id
                        WHERE l.tipo=%s AND l.data BETWEEN %s AND %s AND l.responsavel='PESSOAL'
                          AND (%s <> 'DESPESA' OR ct.tipo IS DISTINCT FROM 'CARTAO')""", (nat, ini, fim, nat))
    pend = db.query("""SELECT a.id, 'A' fonte, to_char(a.data,'YYYY-MM-DD') data, a.descricao, a.valor::float8 valor, false efetivada,
                              c.nome categoria, s.nome subcategoria, ct.banco, 'AGENDADO' origem, a.tags, a.categoria_id, a.subcategoria_id,
                              a.natureza tipo, (a.recorrencia_id IS NOT NULL) serie
                         FROM agendados a LEFT JOIN categorias c ON c.id=a.categoria_id
                         LEFT JOIN subcategorias s ON s.id=a.subcategoria_id LEFT JOIN contas ct ON ct.id=a.conta_id
                        WHERE a.natureza=%s AND a.lancamento_id IS NULL AND a.data BETWEEN %s AND %s
                          AND coalesce(ct.responsavel,'PESSOAL')='PESSOAL'
                          AND (%s <> 'DESPESA' OR ct.tipo IS DISTINCT FROM 'CARTAO')""", (nat, ini, fim, nat))
    itens = sorted(real + pend, key=lambda x: (x["data"], x["id"]), reverse=True)
    return jsonify(itens=itens, realizado=round(sum(abs(x["valor"]) for x in real), 2),
                   pendente=round(sum(abs(x["valor"]) for x in pend), 2))


@app.post("/api/agendados/<int:aid>/efetivar")
@_token
def agendado_efetivar(aid):
    a = db.query("SELECT * FROM agendados WHERE id=%s AND lancamento_id IS NULL", (aid,))
    if not a:
        return jsonify(ok=False, erro="já efetivado ou inexistente"), 404
    a = a[0]
    pote = "NENHUM"
    if a["natureza"] == "DESPESA" and a["categoria_id"]:
        pote = db.query("SELECT pote FROM categorias WHERE id=%s", (a["categoria_id"],))[0]["pote"]
    lid = db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, subcategoria_id, tags, pote,
                          status, origem, recorrencia_id, parcela_n, parcela_total)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'CONFIRMADO','MANUAL',%s,%s,%s) RETURNING id""",
                     (a["conta_id"], min(a["data"], date.today()), a["descricao"], a["valor"], a["natureza"], a["categoria_id"],
                      a["subcategoria_id"], a["tags"], pote, a["recorrencia_id"], a["parcela_n"], a["parcela_total"]))[0]["id"]
    db.execute("UPDATE agendados SET lancamento_id=%s WHERE id=%s", (lid, aid))
    return jsonify(ok=True)


@app.delete("/api/agendados/<int:aid>")
@_token
def agendado_excluir(aid):
    """?serie=1 apaga este e os proximos da mesma recorrencia."""
    a = db.query("SELECT recorrencia_id, data FROM agendados WHERE id=%s", (aid,))
    if not a:
        return jsonify(ok=False), 404
    if request.args.get("serie") and a[0]["recorrencia_id"]:
        n = db.execute("""DELETE FROM agendados WHERE recorrencia_id=%s AND data >= %s AND lancamento_id IS NULL RETURNING id""",
                       (a[0]["recorrencia_id"], a[0]["data"]))
    else:
        n = db.execute("DELETE FROM agendados WHERE id=%s RETURNING id", (aid,))
    return jsonify(ok=True, apagados=len(n))


@app.post("/api/pluggy/sync")
@_token
def pluggy_sync():
    return jsonify(pluggy.sincronizar(request.args.get("dias")))


@app.get("/api/notificacoes")
@_token
def notificacoes():
    return jsonify(db.query("SELECT * FROM notificacoes ORDER BY lida, id DESC LIMIT 50"))


@app.errorhandler(Exception)
def erro(e):
    if hasattr(e, "code") and isinstance(getattr(e, "code"), int) and e.code < 500:
        return jsonify(ok=False, erro=str(e)), e.code
    notificar("Erro na API do app pessoal", f"{request.method} {request.path}: {e}")
    return jsonify(ok=False, erro="erro interno -- registrado no sino"), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("APP_PORT", "5100")))
