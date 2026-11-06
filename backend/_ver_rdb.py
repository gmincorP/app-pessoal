import db
print("RDB no banco (Pluggy):", db.query("SELECT count(*) n FROM lancamentos WHERE descricao ILIKE '%%RDB%%' OR descricao ILIKE '%%caixinha%%'")[0]["n"])
for d, v in (("2026-06-04", 6125.03), ("2026-06-09", -5125.03), ("2026-09-11", 417.04), ("2026-08-03", 6000.0), ("2026-06-21", -2186.03)):
    r = db.query("""SELECT l.data, l.valor, l.descricao FROM lancamentos l JOIN contas c ON c.id=l.conta_id
                    WHERE c.banco='Nubank' AND c.tipo='CORRENTE' AND l.data=%s AND abs(l.valor)=abs(%s)""", (d, v))
    print(d, v, "->", [(x["valor"], x["descricao"][:40]) for x in r] or "NAO ESTA NO PLUGGY")
print("Nubank CC: lancamentos jun-set =", db.query("""SELECT count(*) n FROM lancamentos l JOIN contas c ON c.id=l.conta_id
      WHERE c.banco='Nubank' AND c.tipo='CORRENTE' AND l.data BETWEEN '2026-06-01' AND '2026-09-30'""")[0]["n"])
