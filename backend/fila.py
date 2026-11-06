"""Fila "Para classificar" + nota fiscal (NFC-e) dividida por item.

Desenho: claude/app-pessoal-fila-e-itens-nota.md (projeto "Assistente pessoal").

- A fila sao os lancamentos do banco (Pluggy/OFX/manual) PESSOAIS, de despesa, sem categoria ou em
  "Outros", mais os que tem nota vinculada com item ainda a revisar.
- A nota (cupom) e lida pela pagina publica da SEFAZ (nfce.py) e LIGADA a um lancamento do banco
  (mesmo valor, data -2/+4 dias). O valor e o pagamento continuam vindo do banco; a nota so detalha.
- Cada item e classificado: regra pelo codigo de barras (produto_regras) -> regra por palavra do cupom
  (regras_item) -> pendente (vai para a revisao, com 3 sugestoes e o motivo de cada uma).
- Nota com todos os itens classificados e ligada a um lancamento = CONCLUIDA: o lancamento e rateado
  entre os itens (nota_itens.valor_lanc) e a view lancamentos_efetivos passa a contar os itens nos
  potes do 50/30/20 no lugar do lancamento inteiro.
- Falha ao ler a SEFAZ vai para o sino (notificacoes). Nada falha em silencio.
"""
from datetime import date, timedelta

from flask import jsonify, request

import db
import nfce
from notificar import notificar, _log

DIAS_FILA = 120

MIGRACOES = (
    """CREATE TABLE IF NOT EXISTS notas (
         id            serial PRIMARY KEY,
         chave         char(44) UNIQUE,
         url           text,
         cnpj          text,
         emitente      text,
         emitida_em    timestamp,
         total         numeric(14,2),
         desconto      numeric(14,2) NOT NULL DEFAULT 0,
         lancamento_id bigint REFERENCES lancamentos(id) ON DELETE SET NULL,
         status        text NOT NULL DEFAULT 'AGUARDANDO'
                       CHECK (status IN ('AGUARDANDO','VINCULADA','CONCLUIDA','ERRO')),
         erro          text,
         origem        text NOT NULL DEFAULT 'APP',
         criado_em     timestamptz NOT NULL DEFAULT now())""",
    "CREATE UNIQUE INDEX IF NOT EXISTS notas_lanc_uq ON notas (lancamento_id) WHERE lancamento_id IS NOT NULL",
    """CREATE TABLE IF NOT EXISTS nota_itens (
         id              serial PRIMARY KEY,
         nota_id         int NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
         ordem           int NOT NULL,
         codigo          text,
         ean             text,
         ncm             text,
         descricao_cupom text NOT NULL,
         qtd             numeric(12,4),
         unidade         text,
         valor_unit      numeric(14,4),
         valor_total     numeric(14,2) NOT NULL,
         valor_lanc      numeric(14,2),
         categoria_id    int REFERENCES categorias(id),
         subcategoria_id int REFERENCES subcategorias(id) ON DELETE SET NULL,
         pote            text,
         origem          text CHECK (origem IN ('EAN','REGRA','USUARIO','LOTE')),
         pendente        boolean NOT NULL DEFAULT true)""",
    "CREATE INDEX IF NOT EXISTS nota_itens_nota_idx ON nota_itens (nota_id)",
    "CREATE INDEX IF NOT EXISTS nota_itens_ean_idx ON nota_itens (ean) WHERE ean IS NOT NULL",
    # aprender pelo CODIGO DE BARRAS. perguntar=true: produto que varia (ex.: energetico) -> sempre vai pra revisao
    """CREATE TABLE IF NOT EXISTS produto_regras (
         ean             text PRIMARY KEY,
         categoria_id    int REFERENCES categorias(id) ON DELETE CASCADE,
         subcategoria_id int REFERENCES subcategorias(id) ON DELETE SET NULL,
         perguntar       boolean NOT NULL DEFAULT false,
         usos            int NOT NULL DEFAULT 0,
         ultimo_uso      date,
         atualizado_em   timestamptz NOT NULL DEFAULT now())""",
    # aprender pela PALAVRA do cupom, para item sem codigo de barras (padrao ILIKE)
    """CREATE TABLE IF NOT EXISTS regras_item (
         id              serial PRIMARY KEY,
         padrao          text NOT NULL UNIQUE,
         categoria_id    int NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
         subcategoria_id int REFERENCES subcategorias(id) ON DELETE SET NULL,
         perguntar       boolean NOT NULL DEFAULT false,
         criado_em       timestamptz NOT NULL DEFAULT now())""",
    # o que conta no 50/30/20: lancamento inteiro, ou os itens da nota quando ela esta CONCLUIDA
    """CREATE OR REPLACE VIEW lancamentos_efetivos AS
       SELECT l.id, l.data, l.descricao, l.valor, l.tipo, l.pote, l.status, l.origem, l.categoria_id, l.subcategoria_id,
              l.conta_id, l.veiculo_id, l.cartao_final, l.responsavel, n.id AS nota_id, NULL::int AS nota_item_id
         FROM lancamentos l LEFT JOIN notas n ON n.lancamento_id = l.id
        WHERE n.id IS NULL OR n.status <> 'CONCLUIDA'
       UNION ALL
       SELECT l.id, l.data, i.descricao_cupom, -i.valor_lanc, CASE WHEN i.pote = 'INV' THEN 'INVESTIMENTO' ELSE l.tipo END,
              i.pote, l.status, l.origem, i.categoria_id, i.subcategoria_id,
              l.conta_id, l.veiculo_id, l.cartao_final, l.responsavel, n.id, i.id
         FROM notas n JOIN lancamentos l ON l.id = n.lancamento_id JOIN nota_itens i ON i.nota_id = n.id
        WHERE n.status = 'CONCLUIDA'""",
)


def migrar():
    for sql in MIGRACOES:
        db.execute(sql)


# ============================== classificacao ==============================
def _palavras(desc):
    return [w for w in (desc or "").upper().replace("*", " ").split() if len(w) >= 2]


def padrao_item(desc):
    """Padrao da regra por palavra: as 2 primeiras palavras do cupom ("SALG TRIGO TORCIDA 60G" -> "%SALG TRIGO%")."""
    p = _palavras(desc)[:2]
    return ("%" + " ".join(p) + "%") if p else None


def _cat(cid):
    r = db.query("SELECT id, nome, pote, natureza FROM categorias WHERE id=%s", (cid,))
    return r[0] if r else None


def classificar_item(desc, ean):
    """-> (categoria_id, subcategoria_id, origem, pendente)."""
    if ean:
        r = db.query("SELECT categoria_id, subcategoria_id, perguntar FROM produto_regras WHERE ean=%s", (ean,))
        if r and r[0]["categoria_id"]:
            return r[0]["categoria_id"], r[0]["subcategoria_id"], "EAN", bool(r[0]["perguntar"])
    r = db.query("""SELECT categoria_id, subcategoria_id, perguntar FROM regras_item
                    WHERE %s ILIKE padrao ORDER BY length(padrao) DESC LIMIT 1""", (desc,))
    if r:
        return r[0]["categoria_id"], r[0]["subcategoria_id"], "REGRA", bool(r[0]["perguntar"])
    return None, None, None, True


def _dm(d):
    return d.strftime("%d/%m") if d else ""


def _sug(lista, vistos, cid, sid, cat, sub, pote, motivo):
    k = (cid, sid)
    if cid and k not in vistos and len(lista) < 3:
        vistos.add(k)
        lista.append({"categoria_id": cid, "subcategoria_id": sid, "categoria": cat, "subcategoria": sub,
                      "pote": pote, "motivo": motivo})


_SUG_SQL = """SELECT x.categoria_id, x.subcategoria_id, c.nome categoria, s.nome subcategoria, c.pote, count(*) n, max(x.d) ult
                FROM ({sub}) x JOIN categorias c ON c.id = x.categoria_id
                LEFT JOIN subcategorias s ON s.id = x.subcategoria_id
               WHERE c.ativa AND c.natureza = 'DESPESA' AND c.nome <> 'Outros'
               GROUP BY 1,2,3,4,5 ORDER BY n DESC, ult DESC NULLS LAST LIMIT 3"""


def sugestoes_lancamento(l):
    """3 categorias provaveis para um lancamento sem categoria, cada uma com o motivo."""
    out, vistos = [], set()
    pad = (l["descricao"] or "").split("*")[0].strip()[:40]
    if pad:
        for r in db.query(_SUG_SQL.format(sub="""SELECT categoria_id, subcategoria_id, data d FROM lancamentos
                                                  WHERE descricao ILIKE %s AND id <> %s AND tipo = 'DESPESA'"""),
                          (pad + "%", l["id"])):
            _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
                 "“%s” foi %s %dx · última %s" % (pad[:24], r["categoria"], r["n"], _dm(r["ult"])))
    if l.get("pluggy_categoria"):
        for r in db.query(_SUG_SQL.format(sub="""SELECT categoria_id, subcategoria_id, data d FROM lancamentos
                                                  WHERE pluggy_categoria = %s AND id <> %s AND tipo = 'DESPESA'"""),
                          (l["pluggy_categoria"], l["id"])):
            _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
                 "o banco chama de “%s” · %dx assim" % (l["pluggy_categoria"], r["n"]))
    for r in db.query(_SUG_SQL.format(sub="""SELECT categoria_id, subcategoria_id, data d FROM lancamentos
                                              WHERE tipo = 'DESPESA' AND responsavel = 'PESSOAL'
                                                AND data >= current_date - 60""")):
        _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
             "usada %dx nos últimos 60 dias" % r["n"])
    return out


def sugestoes_item(it, lanc_cat=None):
    """3 categorias provaveis para um item da nota, cada uma com o motivo."""
    out, vistos = [], set()
    if it.get("categoria_id"):           # ja tem palpite (produto marcado "sempre perguntar"): ele vem primeiro
        c = db.query("""SELECT c.nome, c.pote, s.nome sub FROM categorias c LEFT JOIN subcategorias s ON s.id=%s
                        WHERE c.id=%s""", (it.get("subcategoria_id"), it["categoria_id"]))
        if c:
            _sug(out, vistos, it["categoria_id"], it.get("subcategoria_id"), c[0]["nome"], c[0]["sub"], c[0]["pote"],
                 "a última vez foi assim")
    if it.get("ean"):
        for r in db.query(_SUG_SQL.format(sub="""SELECT i.categoria_id, i.subcategoria_id, n.emitida_em::date d
                                                   FROM nota_itens i JOIN notas n ON n.id = i.nota_id
                                                  WHERE i.ean = %s AND NOT i.pendente AND i.id <> %s
                                                  ORDER BY n.emitida_em DESC NULLS LAST LIMIT 6"""),
                          (it["ean"], it["id"])):
            _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
                 "%d das últimas compras deste produto · %s" % (r["n"], _dm(r["ult"])))
    pal = _palavras(it.get("descricao_cupom"))
    if pal:
        for r in db.query(_SUG_SQL.format(sub="""SELECT i.categoria_id, i.subcategoria_id, n.emitida_em::date d
                                                   FROM nota_itens i JOIN notas n ON n.id = i.nota_id
                                                  WHERE i.descricao_cupom ILIKE %s AND NOT i.pendente AND i.id <> %s"""),
                          (pal[0] + " %", it["id"])):
            _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
                 "usada em %d itens parecidos (%s…)" % (r["n"], pal[0]))
    if lanc_cat and lanc_cat.get("categoria_id"):
        _sug(out, vistos, lanc_cat["categoria_id"], None, lanc_cat["categoria"], None, lanc_cat["pote"],
             "categoria da loja")
    for r in db.query(_SUG_SQL.format(sub="""SELECT categoria_id, subcategoria_id, NULL::date d FROM nota_itens
                                              WHERE NOT pendente""")):
        _sug(out, vistos, r["categoria_id"], r["subcategoria_id"], r["categoria"], r["subcategoria"], r["pote"],
             "usada em %d itens de outras notas" % r["n"])
    m = db.query("SELECT id, pote FROM categorias WHERE nome='Mercado' AND ativa")
    if m:
        _sug(out, vistos, m[0]["id"], None, "Mercado", None, m[0]["pote"], "padrão para compra de mercado")
    return out


# ============================== nota <-> lancamento ==============================
def vincular(nota_id):
    """Procura o lancamento do banco desta nota: mesmo valor, data -2/+4 dias, ainda sem nota. -> lancamento_id ou None."""
    n = db.query("SELECT id, total, emitida_em, emitente, lancamento_id FROM notas WHERE id=%s", (nota_id,))
    if not n or n[0]["lancamento_id"] or not n[0]["total"] or not n[0]["emitida_em"]:
        return n[0]["lancamento_id"] if n else None
    n = n[0]
    d = n["emitida_em"].date()
    cands = db.query("""SELECT l.id, l.descricao FROM lancamentos l
                         WHERE l.valor < 0 AND abs(abs(l.valor) - %s) <= 0.01
                           AND l.data BETWEEN %s::date - 2 AND %s::date + 4
                           AND NOT EXISTS (SELECT 1 FROM notas x WHERE x.lancamento_id = l.id)
                         ORDER BY abs(l.data - %s::date), l.id""", (n["total"], d, d, d))
    if not cands:
        return None
    pal = _palavras(n["emitente"])[:1]
    melhor = next((c for c in cands if pal and pal[0] in (c["descricao"] or "").upper()), cands[0])
    db.execute("UPDATE notas SET lancamento_id=%s WHERE id=%s AND lancamento_id IS NULL", (melhor["id"], nota_id))
    return melhor["id"]


def vincular_pendentes():
    """Notas que chegaram antes do banco: tenta de novo (chamado ao abrir a fila)."""
    for n in db.query("SELECT id FROM notas WHERE lancamento_id IS NULL AND status <> 'ERRO'"):
        if vincular(n["id"]):
            recalcular(n["id"])


def recalcular(nota_id):
    """Atualiza o status. Tudo classificado + lancamento ligado -> rateia o valor do banco entre os itens e CONCLUI."""
    n = db.query("SELECT id, lancamento_id, status FROM notas WHERE id=%s", (nota_id,))
    if not n or n[0]["status"] == "ERRO":
        return
    n = n[0]
    itens = db.query("SELECT id, valor_total, categoria_id, subcategoria_id, pote, pendente FROM nota_itens WHERE nota_id=%s ORDER BY ordem",
                     (nota_id,))
    falta = any(i["pendente"] or not i["categoria_id"] for i in itens)
    if not n["lancamento_id"]:
        db.execute("UPDATE notas SET status='AGUARDANDO' WHERE id=%s", (nota_id,))
        return
    if falta or not itens:
        db.execute("UPDATE notas SET status='VINCULADA' WHERE id=%s", (nota_id,))
        return
    l = db.query("SELECT id, valor, pluggy_tx_id FROM lancamentos WHERE id=%s", (n["lancamento_id"],))[0]
    alvo = round(abs(float(l["valor"])), 2)
    soma = sum(float(i["valor_total"]) for i in itens) or 1.0
    partes = [round(alvo * float(i["valor_total"]) / soma, 2) for i in itens]
    maior = max(range(len(itens)), key=lambda k: partes[k])
    partes[maior] = round(partes[maior] + alvo - sum(partes), 2)     # centavos do arredondamento vao pro maior item
    # categoria do lancamento (listas e Inicio) = a do pote/categoria com mais dinheiro na nota
    por_cat = {}
    for i, v in zip(itens, partes):
        k = (i["categoria_id"], i["subcategoria_id"], i["pote"])
        por_cat[k] = por_cat.get(k, 0) + v
    cid, sid, pote = max(por_cat, key=por_cat.get)
    tipo = "INVESTIMENTO" if pote == "INV" else "DESPESA"
    with db.transaction() as cur:
        for i, v in zip(itens, partes):
            cur.execute("UPDATE nota_itens SET valor_lanc=%s WHERE id=%s", (v, i["id"]))
        cur.execute("UPDATE notas SET status='CONCLUIDA' WHERE id=%s", (nota_id,))
        cur.execute("""UPDATE lancamentos SET categoria_id=%s, subcategoria_id=%s, pote=%s, tipo=%s, atualizado_em=now()
                       WHERE id=%s""", (cid, sid, pote, tipo, l["id"]))
        if l["pluggy_tx_id"]:            # re-sincronizar nao desfaz
            cur.execute("""INSERT INTO ajustes_lancamento (pluggy_tx_id, tipo, categoria_id, subcategoria_id) VALUES (%s,%s,%s,%s)
                           ON CONFLICT (pluggy_tx_id) DO UPDATE SET tipo=EXCLUDED.tipo, categoria_id=EXCLUDED.categoria_id,
                                                                   subcategoria_id=EXCLUDED.subcategoria_id""",
                        (l["pluggy_tx_id"], tipo, cid, sid))


def gravar_nota(dados, url, lancamento_id=None, origem="APP"):
    """Insere a nota lida e os itens ja classificados. -> nota_id."""
    with db.transaction() as cur:
        cur.execute("""INSERT INTO notas (chave, url, cnpj, emitente, emitida_em, total, desconto, origem)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (dados["chave"], url, dados["cnpj"], dados["emitente"], dados["emitida_em"], dados["total"],
                     dados["desconto"], origem))
        nid = cur.fetchone()[0]
        for it in dados["itens"]:
            cid, sid, org, pend = classificar_item(it["descricao"], it["ean"])
            pote = None
            if cid:
                cur.execute("SELECT pote FROM categorias WHERE id=%s", (cid,))
                pote = cur.fetchone()[0]
            cur.execute("""INSERT INTO nota_itens (nota_id, ordem, codigo, ean, descricao_cupom, qtd, unidade, valor_unit,
                                                   valor_total, categoria_id, subcategoria_id, pote, origem, pendente)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (nid, it["ordem"], it["codigo"], it["ean"], it["descricao"], it["qtd"], it["unidade"],
                         it["valor_unit"], it["valor_total"], cid, sid, pote, org, pend))
    if lancamento_id:
        livre = not db.query("SELECT 1 FROM notas WHERE lancamento_id=%s", (lancamento_id,))
        if livre:
            db.execute("UPDATE notas SET lancamento_id=%s WHERE id=%s", (lancamento_id, nid))
    else:
        vincular(nid)
    recalcular(nid)
    return nid


# ============================== consultas ==============================
_FILA_WHERE = """l.responsavel = 'PESSOAL' AND l.valor < 0 AND l.data >= current_date - %s::int
                 AND ((n.id IS NULL AND l.tipo = 'DESPESA' AND (l.categoria_id IS NULL OR c.nome = 'Outros'))
                      OR n.status = 'VINCULADA')"""


def contar_fila(dias=DIAS_FILA):
    return int(db.query(f"""SELECT count(*) n FROM lancamentos l LEFT JOIN categorias c ON c.id = l.categoria_id
                            LEFT JOIN notas n ON n.lancamento_id = l.id WHERE {_FILA_WHERE}""", (dias,))[0]["n"])


def _resumo_itens(nota_id):
    r = db.query("""SELECT count(*) n, count(*) FILTER (WHERE pendente OR categoria_id IS NULL) pend FROM nota_itens
                    WHERE nota_id=%s""", (nota_id,))[0]
    return int(r["n"]), int(r["pend"])


def fila(dias=DIAS_FILA):
    vincular_pendentes()
    lancs = db.query(f"""SELECT l.id, to_char(l.data,'YYYY-MM-DD') data, l.descricao, l.valor::float8 valor, l.pluggy_categoria,
                                l.categoria_id, c.nome categoria, ct.banco, ct.tipo conta_tipo, l.cartao_final,
                                l.parcela_n, l.parcela_total, n.id nota_id, n.status nota_status
                           FROM lancamentos l LEFT JOIN categorias c ON c.id = l.categoria_id
                           LEFT JOIN contas ct ON ct.id = l.conta_id LEFT JOIN notas n ON n.lancamento_id = l.id
                          WHERE {_FILA_WHERE}
                          ORDER BY l.data DESC, l.id DESC LIMIT 200""", (dias,))
    for l in lancs:
        if l["nota_id"]:
            l["itens"], l["pendentes"] = _resumo_itens(l["nota_id"])
        else:
            l["sugestoes"] = sugestoes_lancamento(l)
            l["padrao"] = (l["descricao"] or "").split("*")[0].strip()[:40]
    aguard = db.query("""SELECT id, emitente, to_char(emitida_em,'YYYY-MM-DD') data, total::float8 total, status, erro
                           FROM notas WHERE lancamento_id IS NULL ORDER BY criado_em DESC LIMIT 30""")
    for a in aguard:
        a["itens"], a["pendentes"] = _resumo_itens(a["id"])
    return {"lancamentos": lancs, "notas_sem_lancamento": aguard, "total": len(lancs)}


def nota_detalhe(nota_id):
    n = db.query("""SELECT n.id, n.chave, n.emitente, n.cnpj, to_char(n.emitida_em,'YYYY-MM-DD"T"HH24:MI') emitida_em,
                           n.total::float8 total, n.desconto::float8 desconto, n.status, n.erro, n.lancamento_id,
                           l.descricao lanc_descricao, to_char(l.data,'YYYY-MM-DD') lanc_data, l.valor::float8 lanc_valor,
                           ct.banco, ct.tipo conta_tipo, l.cartao_final, l.categoria_id lanc_categoria_id,
                           c.nome lanc_categoria, c.pote lanc_pote
                      FROM notas n LEFT JOIN lancamentos l ON l.id = n.lancamento_id
                      LEFT JOIN contas ct ON ct.id = l.conta_id LEFT JOIN categorias c ON c.id = l.categoria_id
                     WHERE n.id=%s""", (nota_id,))
    if not n:
        return None
    n = n[0]
    itens = db.query("""SELECT i.id, i.ordem, i.ean, i.descricao_cupom, i.qtd::float8 qtd, i.unidade, i.valor_total::float8 valor_total,
                               i.valor_lanc::float8 valor_lanc, i.categoria_id, i.subcategoria_id, c.nome categoria,
                               s.nome subcategoria, i.pote, i.origem, i.pendente,
                               coalesce(pr.perguntar, ri.perguntar, false) perguntar
                          FROM nota_itens i LEFT JOIN categorias c ON c.id = i.categoria_id
                          LEFT JOIN subcategorias s ON s.id = i.subcategoria_id
                          LEFT JOIN produto_regras pr ON pr.ean = i.ean
                          LEFT JOIN LATERAL (SELECT r.perguntar FROM regras_item r WHERE i.descricao_cupom ILIKE r.padrao
                                              ORDER BY length(r.padrao) DESC LIMIT 1) ri ON true
                         WHERE i.nota_id=%s ORDER BY i.ordem""", (nota_id,))
    lanc_cat = None
    if n["lanc_categoria_id"] and n["lanc_categoria"] != "Outros":
        lanc_cat = {"categoria_id": n["lanc_categoria_id"], "categoria": n["lanc_categoria"], "pote": n["lanc_pote"]}
    potes = {"NEC": 0.0, "DES": 0.0, "INV": 0.0, "PEND": 0.0}
    for i in itens:
        v = i["valor_lanc"] if i["valor_lanc"] is not None else i["valor_total"]
        if i["pendente"] or not i["categoria_id"]:
            potes["PEND"] += v
            i["sugestoes"] = sugestoes_item(i, lanc_cat)
        else:
            potes[i["pote"] if i["pote"] in potes else "NEC"] += v
    n["itens"] = itens
    n["potes"] = {k: round(v, 2) for k, v in potes.items()}
    n["pendentes"] = sum(1 for i in itens if i["pendente"] or not i["categoria_id"])
    return n


# ============================== gravacao ==============================
def classificar_um(item_id, categoria_id, subcategoria_id=None, lembrar=True):
    """Usuario escolheu a categoria de um item. lembrar=True -> regra (codigo de barras ou palavra) e aplica nos
    pendentes iguais de outras notas; lembrar=False -> 'sempre perguntar' (o produto varia)."""
    it = db.query("SELECT id, nota_id, ean, descricao_cupom FROM nota_itens WHERE id=%s", (item_id,))
    if not it:
        return None, "item inexistente"
    it = it[0]
    cat = _cat(categoria_id)
    if not cat or cat["natureza"] != "DESPESA":
        return None, "escolha uma categoria de despesa"
    if subcategoria_id and not db.query("SELECT 1 FROM subcategorias WHERE id=%s AND categoria_id=%s",
                                        (subcategoria_id, categoria_id)):
        return None, "subcategoria não pertence à categoria"
    notas = {it["nota_id"]}
    with db.transaction() as cur:
        cur.execute("""UPDATE nota_itens SET categoria_id=%s, subcategoria_id=%s, pote=%s, origem='USUARIO', pendente=false
                       WHERE id=%s""", (categoria_id, subcategoria_id, cat["pote"], item_id))
        if it["ean"]:
            cur.execute("""INSERT INTO produto_regras (ean, categoria_id, subcategoria_id, perguntar, usos, ultimo_uso)
                           VALUES (%s,%s,%s,%s,1,current_date)
                           ON CONFLICT (ean) DO UPDATE SET categoria_id=EXCLUDED.categoria_id, subcategoria_id=EXCLUDED.subcategoria_id,
                               perguntar=EXCLUDED.perguntar, usos=produto_regras.usos+1, ultimo_uso=current_date, atualizado_em=now()""",
                        (it["ean"], categoria_id, subcategoria_id, not lembrar))
        else:
            pad = padrao_item(it["descricao_cupom"])
            if pad:
                cur.execute("""INSERT INTO regras_item (padrao, categoria_id, subcategoria_id, perguntar) VALUES (%s,%s,%s,%s)
                               ON CONFLICT (padrao) DO UPDATE SET categoria_id=EXCLUDED.categoria_id,
                                   subcategoria_id=EXCLUDED.subcategoria_id, perguntar=EXCLUDED.perguntar""",
                            (pad, categoria_id, subcategoria_id, not lembrar))
        if lembrar:                      # o mesmo produto pendente em outras notas ja sai da fila
            if it["ean"]:
                cur.execute("""UPDATE nota_itens SET categoria_id=%s, subcategoria_id=%s, pote=%s, origem='EAN', pendente=false
                               WHERE ean=%s AND pendente AND id<>%s RETURNING nota_id""",
                            (categoria_id, subcategoria_id, cat["pote"], it["ean"], item_id))
                notas.update(r[0] for r in cur.fetchall())
    for nid in notas:
        recalcular(nid)
    return it["nota_id"], None


def classificar_lote(nota_id, categoria_id, subcategoria_id=None):
    """'Marcar os pendentes como X'. Produto NOVO aprende (proxima compra ja entra sozinho); produto que ja tinha
    regra -- inclusive os de 'sempre perguntar' -- nao tem a regra trocada pelo atalho."""
    cat = _cat(categoria_id)
    if not cat or cat["natureza"] != "DESPESA":
        return "escolha uma categoria de despesa"
    with db.transaction() as cur:
        cur.execute("""UPDATE nota_itens SET categoria_id=%s, subcategoria_id=%s, pote=%s, origem='LOTE', pendente=false
                       WHERE nota_id=%s AND (pendente OR categoria_id IS NULL) RETURNING ean, descricao_cupom""",
                    (categoria_id, subcategoria_id, cat["pote"], nota_id))
        for ean, desc in cur.fetchall():
            if ean:
                cur.execute("""INSERT INTO produto_regras (ean, categoria_id, subcategoria_id, usos, ultimo_uso)
                               VALUES (%s,%s,%s,1,current_date) ON CONFLICT (ean) DO NOTHING""",
                            (ean, categoria_id, subcategoria_id))
            elif padrao_item(desc):
                cur.execute("""INSERT INTO regras_item (padrao, categoria_id, subcategoria_id) VALUES (%s,%s,%s)
                               ON CONFLICT (padrao) DO NOTHING""", (padrao_item(desc), categoria_id, subcategoria_id))
    recalcular(nota_id)
    return None


def ler_e_gravar(texto, lancamento_id=None, origem="APP"):
    """Do link do QR ate a nota gravada. -> (nota_id, erro). Falha vai pro sino."""
    ch = nfce.chave_de(texto)
    if ch:
        ja = db.query("SELECT id, status FROM notas WHERE chave=%s", (ch,))
        if ja and ja[0]["status"] != "ERRO":
            if lancamento_id and not db.query("SELECT 1 FROM notas WHERE lancamento_id=%s", (lancamento_id,)):
                db.execute("UPDATE notas SET lancamento_id=%s WHERE id=%s AND lancamento_id IS NULL", (lancamento_id, ja[0]["id"]))
                recalcular(ja[0]["id"])
            return ja[0]["id"], None
        if ja:
            db.execute("DELETE FROM notas WHERE id=%s", (ja[0]["id"],))
    try:
        url, dados = nfce.ler(texto)
    except nfce.NfceErro as e:
        notificar("Cupom fiscal não lido", "%s. Link/chave: %s. Tente de novo pelo app (Para classificar › + cupom)."
                  % (e, (texto or "")[:300]), "AVISO")
        return None, str(e)
    except Exception as e:
        notificar("Cupom fiscal: erro inesperado", "%s -- %s" % (e, (texto or "")[:300]))
        return None, "erro inesperado ao ler a nota: %s" % e
    if not dados.get("chave"):
        dados["chave"] = ch
    if dados["chave"] and db.query("SELECT 1 FROM notas WHERE chave=%s", (dados["chave"],)):
        return db.query("SELECT id FROM notas WHERE chave=%s", (dados["chave"],))[0]["id"], None
    nid = gravar_nota(dados, url, lancamento_id, origem)
    _log("[nota] %s itens de %s gravados (nota %s)" % (len(dados["itens"]), dados["emitente"], nid))
    return nid, None


# ============================== rotas ==============================
def registrar(app, token):
    @app.get("/api/fila")
    @token
    def api_fila():
        return jsonify(fila(int(request.args.get("dias") or DIAS_FILA)))

    @app.get("/api/fila/contagem")
    @token
    def api_fila_contagem():
        return jsonify(total=contar_fila())

    @app.post("/api/notas")
    @token
    def api_nota_nova():
        """{texto: link do QR ou chave, lancamento_id?} -> lê na SEFAZ, grava, classifica e liga ao lançamento."""
        b = request.get_json(force=True) or {}
        texto = (b.get("texto") or "").strip()
        if not texto:
            return jsonify(ok=False, erro="mande o link do QR code ou a chave da nota"), 400
        lid = int(b["lancamento_id"]) if b.get("lancamento_id") else None
        nid, erro = ler_e_gravar(texto, lid, b.get("origem") or "APP")
        if erro:
            return jsonify(ok=False, erro=erro), 422
        return jsonify(ok=True, id=nid, nota=nota_detalhe(nid))

    @app.get("/api/notas/<int:nid>")
    @token
    def api_nota(nid):
        n = nota_detalhe(nid)
        return jsonify(n) if n else (jsonify(ok=False, erro="nota inexistente"), 404)

    @app.delete("/api/notas/<int:nid>")
    @token
    def api_nota_excluir(nid):
        """Apaga a nota (lida errada ou ligada no lançamento errado). O lançamento do banco fica como está."""
        db.execute("DELETE FROM notas WHERE id=%s", (nid,))
        return jsonify(ok=True)

    @app.post("/api/notas/<int:nid>/lote")
    @token
    def api_nota_lote(nid):
        b = request.get_json(force=True) or {}
        erro = classificar_lote(nid, int(b.get("categoria_id") or 0), int(b["subcategoria_id"]) if b.get("subcategoria_id") else None)
        if erro:
            return jsonify(ok=False, erro=erro), 400
        return jsonify(ok=True, nota=nota_detalhe(nid))

    @app.patch("/api/nota-itens/<int:iid>")
    @token
    def api_item(iid):
        b = request.get_json(force=True) or {}
        nid, erro = classificar_um(iid, int(b.get("categoria_id") or 0),
                                   int(b["subcategoria_id"]) if b.get("subcategoria_id") else None,
                                   bool(b.get("lembrar", True)))
        if erro:
            return jsonify(ok=False, erro=erro), 400
        return jsonify(ok=True, nota=nota_detalhe(nid))
