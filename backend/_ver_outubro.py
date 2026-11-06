import db, pluggy
print("Reclassificados:", pluggy.reclassificar())
for r in db.query("""SELECT l.data, ct.banco, l.valor, l.tipo, c.nome categoria, l.descricao FROM lancamentos l
   JOIN contas ct ON ct.id=l.conta_id LEFT JOIN categorias c ON c.id=l.categoria_id
   WHERE l.descricao ILIKE '%%GILBERTO%%' OR (l.tipo='RECEITA' AND l.data >= '2026-09-01')
   ORDER BY l.data"""):
    print(r["data"], r["banco"], f'{r["valor"]:>10}', r["tipo"], r["categoria"], r["descricao"][:50])
