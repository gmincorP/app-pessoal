import db
print("=== FINAIS DE CARTAO (o que foi usado em cada cartao)")
for r in db.query("""SELECT ct.banco, ct.numero conta_final, l.cartao_final, count(*) n, (-sum(l.valor))::numeric(12,2) total,
                            min(l.data) de, max(l.data) ate
                       FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                      WHERE l.cartao_final IS NOT NULL AND l.valor < 0 GROUP BY 1,2,3 ORDER BY 1,3"""):
    print(f'{r["banco"]:<13} cartao {r["conta_final"]} | final usado {r["cartao_final"]:<5} | {r["n"]:>4} compras | R$ {r["total"]:>10} | {r["de"]} a {r["ate"]}')
print("\n=== FATURAS (ultimas 4 por cartao)")
for r in db.query("""SELECT * FROM (SELECT ct.banco, f.mes, f.fechamento, f.vencimento, f.total, f.minimo, f.encargos,
            (SELECT coalesce(sum(valor),0) FROM fatura_pagamentos p WHERE p.fatura_id=f.id) pago_pluggy,
            (SELECT max(data) FROM fatura_pagamentos p WHERE p.fatura_id=f.id) dt_pag,
            (SELECT coalesce(-sum(valor),0) FROM lancamentos l WHERE l.conta_id=f.conta_id AND l.fatura_mes=f.mes AND l.valor<0) compras,
            row_number() OVER (PARTITION BY f.conta_id ORDER BY f.mes DESC) rn
          FROM faturas f JOIN contas ct ON ct.id=f.conta_id) x WHERE rn<=4 ORDER BY banco, mes DESC"""):
    print(f'{r["banco"]:<13} {r["mes"]} fecha {r["fechamento"]} vence {r["vencimento"]} | total {r["total"]:>9} | min {r["minimo"]:>8} | encargos {r["encargos"]:>7} | pago(pluggy) {r["pago_pluggy"]:>8} em {r["dt_pag"]} | compras ligadas {r["compras"]:>9}')
print("\n=== FATURAS FUTURAS (so pelas compras/parcelas)")
for r in db.query("""SELECT ct.banco, l.fatura_mes, (-sum(l.valor))::numeric(12,2) v FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                     WHERE l.fatura_mes > to_char(current_date,'YYYY-MM') GROUP BY 1,2 ORDER BY 1,2"""):
    print(f'{r["banco"]:<13} {r["fatura_mes"]} R$ {r["v"]}')
