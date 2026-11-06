import os, json
from pluggy_client import PluggyClient
import db
pc = PluggyClient.do_env()
for item in [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS") or "").split(",") if i.strip()]:
    try:
        inv = list(pc.investimentos(item))
    except Exception as e:
        print("ITEM", item[:8], "erro", e); continue
    print("ITEM", item[:8], len(inv), "investimentos")
    for x in inv[:40]:
        print("   ", x.get("type"), "|", x.get("subtype"), "|", x.get("name"), "|", x.get("balance"), "|", x.get("status"), "| taxa", x.get("rate"), x.get("rateType"), "| venc", x.get("dueDate"), "| keys", ",".join(k for k in x.keys() if k not in ("id","itemId"))[:200] if x is inv[0] else "")
print("contas INVESTIMENTO:", db.query("SELECT id, banco, nome, saldo FROM contas WHERE tipo='INVESTIMENTO'"))
print("caixinhas:", db.query("SELECT * FROM caixinhas"))
m = db.query("""SELECT to_char(data,'YYYY-MM') mes, count(*) n, sum(valor) FILTER (WHERE valor<0) aplic, sum(valor) FILTER (WHERE valor>0) resg
                FROM lancamentos WHERE tipo='INVESTIMENTO' GROUP BY 1 ORDER BY 1""")
print("INVESTIMENTO por mes:", [(r["mes"], r["n"], float(r["aplic"] or 0), float(r["resg"] or 0)) for r in m])
print("exemplos:", db.query("SELECT data, descricao, valor, c.banco FROM lancamentos l JOIN contas c ON c.id=l.conta_id WHERE l.tipo='INVESTIMENTO' AND data>='2026-05-01' AND data<'2026-06-01' ORDER BY data LIMIT 12"))
