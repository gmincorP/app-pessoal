import db
print("\n######## LANCAMENTOS DE JUROS/IOF/ENCARGOS/ATRASO NOS CARTOES")
for r in db.query("""SELECT ct.banco, l.data, l.valor, l.fatura_mes, l.cartao_final, l.pluggy_categoria, l.descricao
                     FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                    WHERE ct.tipo='CARTAO' AND (l.pluggy_categoria ILIKE ANY (ARRAY['%%interest%%','%%late%%','%%tax on%%','%%fee%%'])
                       OR l.descricao ~* '(juro|iof|encargo|multa|atraso|rotativo|parcelamento de fatura|mora)')
                    ORDER BY ct.banco, l.data"""):
    print(r["banco"], r["data"], f'{r["valor"]:>9}', r["fatura_mes"], r["cartao_final"], r["pluggy_categoria"], "|", r["descricao"][:50])
print("\n######## ULTIMA COMPRA POR FINAL (cartao parado ha muito tempo = provavel cancelado)")
for r in db.query("""SELECT ct.banco, l.cartao_final, max(l.data) FILTER (WHERE l.obs IS NULL OR l.obs NOT LIKE 'parcela%%') ultima_compra_avista,
                            max(l.data) ultima_qualquer, count(*) n
                       FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id
                      WHERE l.cartao_final IS NOT NULL AND l.valor < 0 GROUP BY 1,2 ORDER BY 1,3 DESC NULLS LAST"""):
    print(r["banco"], r["cartao_final"], "ultima compra a vista:", r["ultima_compra_avista"], "| ultimo lancamento:", r["ultima_qualquer"], "|", r["n"])
