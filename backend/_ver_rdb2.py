import db
print("\n=== Como os RDB (caixinhas) estao classificados hoje")
for r in db.query("""SELECT CASE WHEN descricao ILIKE 'Aplica%%' THEN 'Aplicacao RDB' ELSE 'Resgate RDB' END mov, tipo, pote,
                            count(*) n, sum(valor)::numeric(12,2) total, min(data) de, max(data) ate
                       FROM lancamentos WHERE descricao ILIKE '%%RDB%%' GROUP BY 1,2,3 ORDER BY 1"""):
    print(r)
print("saldo liquido aplicado no periodo (aplicacoes - resgates):",
      db.query("SELECT (-sum(valor))::numeric(12,2) v FROM lancamentos WHERE descricao ILIKE '%%RDB%%'")[0]["v"])
