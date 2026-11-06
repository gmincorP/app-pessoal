import db
c = db.query("SELECT id FROM contas WHERE banco='Inter' AND tipo='CARTAO'")[0]["id"]
print("=== INTER: fatura x compras do ciclo x saldo carregado (estima encargos escondidos)")
fs = db.query("SELECT mes, fechamento, vencimento, total FROM faturas WHERE conta_id=%s ORDER BY mes", (c,))
ant = None
for f in fs:
    compras = db.query("""SELECT coalesce(-sum(valor),0)::float8 v, count(*) n FROM lancamentos
                          WHERE conta_id=%s AND fatura_mes=%s AND tipo <> 'PAG_FATURA'""", (c, f["mes"]))[0]
    pago_ant = db.query("""SELECT coalesce(sum(p.valor),0)::float8 v FROM fatura_pagamentos p JOIN faturas x ON x.id=p.fatura_id
                           WHERE x.conta_id=%s AND x.mes=%s""", (c, ant["mes"]))[0]["v"] if ant else 0
    carregado = max(float(ant["total"]) - pago_ant, 0) if ant else 0
    sobra = float(f["total"]) - compras["v"] - carregado
    print(f'{f["mes"]} total {f["total"]:>9} | compras do ciclo {compras["v"]:>9.2f} ({compras["n"]}) | nao pago da anterior {carregado:>8.2f} | diferenca (encargos?) {sobra:>8.2f}')
    ant = f
for r in db.query("""SELECT data, valor, descricao, pluggy_categoria FROM lancamentos WHERE conta_id=%s
                     AND data BETWEEN '2026-05-01' AND '2026-06-10' AND (descricao ~* '(juro|iof|encargo|multa|atraso|rotativo|mora|ajuste)' OR pluggy_categoria ILIKE ANY(ARRAY['%%interest%%','%%late%%','%%fee%%','%%tax%%']))
                     ORDER BY data""", (c,)):
    print("  ", r)
