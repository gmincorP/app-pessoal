import db, pluggy
cat = db.query("SELECT id FROM categorias WHERE nome='Carro - manutenção'")[0]["id"]
vid = db.query("SELECT id FROM veiculos WHERE placa='JAG0041'")[0]["id"]
# regras (mecanicos recorrentes)
for p in ("%%Jorge Ronaldo Tesche%%", "%%Regis Davi Conrad%%"):
    db.execute("DELETE FROM regras WHERE padrao=%s AND valor IS NULL", (p.replace('%%','%'),))
    db.execute("INSERT INTO regras (padrao, tipo, categoria_id, veiculo_id) VALUES (%s,'DESPESA',%s,%s)", (p.replace('%%','%'), cat, vid))
# ajuste pontual: guincho Mithi R$ 580
r = db.query("SELECT pluggy_tx_id FROM lancamentos WHERE id=24 AND valor=-580")
if r:
    db.execute("""INSERT INTO ajustes_lancamento (pluggy_tx_id, tipo, categoria_id, veiculo_id, obs) VALUES (%s,'DESPESA',%s,%s,'Guincho do Audi')
                  ON CONFLICT (pluggy_tx_id) DO UPDATE SET tipo='DESPESA', categoria_id=EXCLUDED.categoria_id, veiculo_id=EXCLUDED.veiculo_id, obs=EXCLUDED.obs""",
               (r[0]["pluggy_tx_id"], cat, vid))
print("Reclassificados:", pluggy.reclassificar())
for x in db.query("""SELECT l.data, (-l.valor)::numeric(10,2) v, c.nome, l.descricao FROM lancamentos l JOIN categorias c ON c.id=l.categoria_id
                     WHERE l.descricao ILIKE ANY (ARRAY['%%Jorge Ronaldo%%','%%Regis Davi%%','%%MITHI%%']) ORDER BY l.data"""):
    print(x["data"], x["v"], x["nome"], x["descricao"][:45])
print(db.query("""SELECT (-sum(valor))::numeric(12,2) manutencao_audi FROM lancamentos l JOIN categorias c ON c.id=l.categoria_id
                  WHERE l.veiculo_id=%s AND c.nome='Carro - manutenção'""", (vid,)))
