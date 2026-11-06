import db
for r in db.query("""SELECT l.id, l.data, ct.banco, (-l.valor)::numeric(10,2) valor, c.nome categoria, l.descricao
   FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id LEFT JOIN categorias c ON c.id=l.categoria_id
   WHERE l.tipo='DESPESA' AND l.pote IN ('NEC','DES') AND l.valor <= -80
     AND l.data BETWEEN '2026-07-01' AND '2026-09-30' AND l.obs IS DISTINCT FROM 'x'
   ORDER BY l.valor LIMIT 40"""):
    print(f'#{r["id"]:<4} {r["data"]} {r["banco"]:<12} {r["valor"]:>9}  {str(r["categoria"])[:18]:<18} {r["descricao"][:42]}')
