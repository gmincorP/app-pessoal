"""Diagnostico do que entrou (SOMENTE LEITURA, exceto corrigir o nome do banco nas contas).
Rodar: ..\\.venv\\Scripts\\python.exe diagnostico.py"""
import db
from pluggy import banco_da_conta

# corrige nome do banco das contas ja importadas (por item)
for item in db.query("SELECT DISTINCT pluggy_item_id FROM contas"):
    contas = db.query("SELECT id, nome FROM contas WHERE pluggy_item_id=%s", (item["pluggy_item_id"],))
    banco = next((banco_da_conta(c["nome"], None) for c in contas if banco_da_conta(c["nome"], None)), None)
    if banco:
        db.execute("UPDATE contas SET banco=%s WHERE pluggy_item_id=%s", (banco, item["pluggy_item_id"]))

def tab(titulo, sql, p=()):
    print("\n=== " + titulo)
    rs = db.query(sql, p)
    if not rs:
        print("(nada)"); return
    cols = list(rs[0].keys())
    print(" | ".join(cols))
    for r in rs:
        print(" | ".join(str(r[c])[:45] for c in cols))

tab("CONTAS", "SELECT banco, tipo, nome, saldo FROM contas ORDER BY banco, tipo")
tab("AGOSTO: 25 maiores movimentos", """
  SELECT l.data, ct.banco, ct.tipo conta, l.valor, l.tipo, l.pote, c.nome categoria, l.pluggy_categoria, l.descricao
    FROM lancamentos l JOIN contas ct ON ct.id=l.conta_id LEFT JOIN categorias c ON c.id=l.categoria_id
   WHERE l.data BETWEEN '2026-08-01' AND '2026-08-31' ORDER BY abs(l.valor) DESC LIMIT 25""")
tab("AGO-SET: categoria do Pluggy x tipo (soma)", """
  SELECT pluggy_categoria, tipo, count(*) n, sum(valor)::numeric(12,2) total
    FROM lancamentos WHERE data BETWEEN '2026-08-01' AND '2026-09-30'
   GROUP BY 1,2 ORDER BY abs(sum(valor)) DESC LIMIT 25""")
tab("PARCELAS FUTURAS (cartao)", """
  SELECT to_char(data,'YYYY-MM') mes, count(*) n, (-sum(valor))::numeric(12,2) total
    FROM lancamentos WHERE data > current_date GROUP BY 1 ORDER BY 1""")
input("\nEnter pra fechar...")
