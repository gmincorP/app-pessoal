"""GM: so R$ 6.000 e salario; o resto e reembolso de compra da empresa no cartao pessoal."""
import db, pluggy
with db.transaction() as cur:
    cur.execute("ALTER TABLE regras ADD COLUMN IF NOT EXISTS valor numeric(14,2)")
    cur.execute("ALTER TABLE regras DROP CONSTRAINT IF EXISTS regras_padrao_key")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS regras_padrao_valor_uq ON regras (padrao, COALESCE(valor, -1))")
    cur.execute("INSERT INTO categorias (nome, pote) VALUES ('Reembolso da empresa','NENHUM') ON CONFLICT (nome) DO NOTHING")
cat = {r["nome"]: r["id"] for r in db.query("SELECT id, nome FROM categorias")}
db.execute("DELETE FROM regras WHERE padrao='%%GILBERTO MULLER%%'")
db.execute("INSERT INTO regras (padrao, valor, tipo, categoria_id) VALUES ('%%GILBERTO MULLER%%', 6000, 'RECEITA', %s)", (cat["Salário / renda"],))
db.execute("INSERT INTO regras (padrao, tipo, categoria_id) VALUES ('%%GILBERTO MULLER%%', 'TRANSFERENCIA', %s)", (cat["Reembolso da empresa"],))
print("Reclassificados:", pluggy.reclassificar())
for r in db.query("""SELECT l.data, l.valor, l.tipo, c.nome categoria FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id
                     WHERE l.descricao ILIKE '%%GILBERTO%%' ORDER BY l.data"""):
    print(r["data"], f'{r["valor"]:>10}', r["tipo"], r["categoria"])
print()
for r in db.query("""SELECT to_char(data,'YYYY-MM') mes,
       sum(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END)::numeric(12,2) receitas,
       sum(CASE WHEN pote='NEC' THEN -valor ELSE 0 END)::numeric(12,2) nec,
       sum(CASE WHEN pote='DES' THEN -valor ELSE 0 END)::numeric(12,2) des,
       sum(CASE WHEN c.nome='Reembolso da empresa' THEN valor ELSE 0 END)::numeric(12,2) reembolsos_gm
   FROM lancamentos l LEFT JOIN categorias c ON c.id=l.categoria_id WHERE data <= current_date GROUP BY 1 ORDER BY 1"""):
    print(r)
