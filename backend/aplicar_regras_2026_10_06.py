"""Regras e ajustes informados pelo Djonathan em 06/10/2026. Pode rodar de novo sem duplicar."""
import db
import pluggy

with db.transaction() as cur:
    cur.execute("""CREATE TABLE IF NOT EXISTS ajustes_lancamento (
        pluggy_tx_id text PRIMARY KEY, tipo text, categoria_id int REFERENCES categorias(id),
        veiculo_id int REFERENCES veiculos(id), obs text, criado_em timestamptz NOT NULL DEFAULT now())""")
    for nome in ("Retirada de lucro", "Empréstimo recebido", "Dinheiro de terceiros", "Compra de veículo"):
        cur.execute("INSERT INTO categorias (nome, pote) VALUES (%s,'NENHUM') ON CONFLICT (nome) DO NOTHING", (nome,))

cat = {r["nome"]: r["id"] for r in db.query("SELECT id, nome FROM categorias")}

# REGRAS permanentes (valem para todo lancamento futuro com esse texto)
for padrao, tipo, categoria in (
    ("%GILBERTO MULLER%", "RECEITA", "Salário / renda"),           # padrao: salario da GM
    ("%Rainara Kailane%", "TRANSFERENCIA", "Dinheiro de terceiros"), # dinheiro guardado pra ela
):
    db.execute("""INSERT INTO regras (padrao, tipo, categoria_id) VALUES (%s,%s,%s)
                  ON CONFLICT (padrao) DO UPDATE SET tipo=EXCLUDED.tipo, categoria_id=EXCLUDED.categoria_id""",
               (padrao, tipo, cat[categoria]))

# AJUSTES pontuais (so aquela transacao)
def ajustar(where, params, tipo, categoria, obs):
    r = db.query(f"SELECT pluggy_tx_id, data, valor, descricao FROM lancamentos WHERE {where}", params)
    if len(r) != 1:
        print(f"  !! esperava 1 lancamento para '{obs}', achei {len(r)} -- nao ajustei")
        return
    db.execute("""INSERT INTO ajustes_lancamento (pluggy_tx_id, tipo, categoria_id, obs) VALUES (%s,%s,%s,%s)
                  ON CONFLICT (pluggy_tx_id) DO UPDATE SET tipo=EXCLUDED.tipo, categoria_id=EXCLUDED.categoria_id, obs=EXCLUDED.obs""",
               (r[0]["pluggy_tx_id"], tipo, cat[categoria], obs))
    print(f"  ok {r[0]['data']} {r[0]['valor']:>10} {r[0]['descricao'][:40]} -> {categoria}")

print("Ajustes:")
ajustar("data='2026-08-20' AND valor=40000 AND descricao ILIKE %s", ("%GILBERTO MULLER%",),
        "RECEITA", "Retirada de lucro", "Retirada de lucro da GM")
ajustar("data='2026-08-21' AND valor=-34000 AND descricao ILIKE %s", ("%Gabriela Marodin%",),
        "DESPESA", "Compra de veículo", "Compra do Audi (placa JAG...)")
ajustar("data='2026-08-21' AND valor=-6000 AND descricao ILIKE %s", ("%RODRIGO CORREA%",),
        "DESPESA", "Compra de veículo", "Complemento da compra do Audi")
ajustar("data='2026-08-03' AND valor=6000 AND descricao ILIKE %s", ("Crédito em conta%",),
        "TRANSFERENCIA", "Empréstimo recebido", "Empréstimo")

print("Reclassificados:", pluggy.reclassificar())
print()
for r in db.query("""SELECT to_char(data,'YYYY-MM') mes,
       sum(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END)::numeric(12,2) receitas,
       sum(CASE WHEN pote='NEC' THEN -valor ELSE 0 END)::numeric(12,2) nec,
       sum(CASE WHEN pote='DES' THEN -valor ELSE 0 END)::numeric(12,2) des,
       sum(CASE WHEN pote='INV' THEN -valor ELSE 0 END)::numeric(12,2) inv,
       sum(CASE WHEN tipo='DESPESA' AND pote='NENHUM' THEN -valor ELSE 0 END)::numeric(12,2) fora_dos_potes
   FROM lancamentos WHERE data <= current_date GROUP BY 1 ORDER BY 1"""):
    print(r)
