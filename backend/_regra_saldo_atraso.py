import db, pluggy
cid = db.query("SELECT id FROM categorias WHERE nome='Pagamento de fatura'")[0]["id"]
db.execute("DELETE FROM regras WHERE padrao='%%Saldo em atraso%%'")
db.execute("INSERT INTO regras (padrao, tipo, categoria_id) VALUES ('%%Saldo em atraso%%', 'PAG_FATURA', %s)", (cid,))
print("Reclassificados:", pluggy.reclassificar())
for r in db.query("SELECT data, valor, tipo, pote FROM lancamentos WHERE descricao ILIKE '%%Saldo em atraso%%'"):
    print(r)
