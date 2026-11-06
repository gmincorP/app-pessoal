import db, pluggy
db.execute("""INSERT INTO veiculos (placa, apelido, modelo, combustivel) VALUES ('JAG0041','audi','Audi A5 Coupé 2014','gasolina')
              ON CONFLICT (placa) DO NOTHING""")
vid = db.query("SELECT id FROM veiculos WHERE placa='JAG0041'")[0]["id"]
db.execute("""UPDATE ajustes_lancamento SET veiculo_id=%s WHERE categoria_id=(SELECT id FROM categorias WHERE nome='Compra de veículo')""", (vid,))
print("Reclassificados:", pluggy.reclassificar())
for r in db.query("""SELECT c.nome, count(*) n, (-sum(l.valor))::numeric(12,2) total FROM lancamentos l
                     JOIN categorias c ON c.id=l.categoria_id WHERE l.veiculo_id=%s GROUP BY 1 ORDER BY 3 DESC""", (vid,)):
    print(r)
