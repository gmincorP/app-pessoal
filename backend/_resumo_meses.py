import db
for r in db.query("""SELECT to_char(l.data,'YYYY-MM') mes,
       sum(CASE WHEN l.tipo='RECEITA' THEN l.valor ELSE 0 END)::numeric(12,2) receitas,
       sum(CASE WHEN l.pote='NEC' THEN -l.valor ELSE 0 END)::numeric(12,2) nec,
       sum(CASE WHEN l.pote='DES' THEN -l.valor ELSE 0 END)::numeric(12,2) des,
       sum(CASE WHEN l.pote='INV' THEN -l.valor ELSE 0 END)::numeric(12,2) inv,
       sum(CASE WHEN c.nome='Reembolso da empresa' THEN l.valor ELSE 0 END)::numeric(12,2) reemb_gm
   FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
   WHERE l.data <= current_date GROUP BY 1 ORDER BY 1"""):
    print(r)
