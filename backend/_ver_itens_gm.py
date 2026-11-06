import os
from pluggy_client import PluggyClient, tipo_conta
import db
pc = PluggyClient.do_env()
for item in [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS_GM") or "").split(",") if i.strip()]:
    it = pc.item(item)
    print("ITEM", item[:8], "|", (it.get("connector") or {}).get("name"), "| status", it.get("status"))
    for a in pc.contas(item):
        cd = a.get("creditData") or {}
        print("   ", tipo_conta(a), "|", a.get("subtype"), "|", a.get("marketingName") or a.get("name"), "| final", a.get("number"),
              "| saldo", a.get("balance"), "| limite", cd.get("creditLimit"))
print("FINAIS no app (compras por final):")
for r in db.query("""SELECT ct.banco, cf.final, cf.uso, cf.ativo, count(l.id) n, coalesce(-sum(l.valor),0)::numeric(12,2) total, max(l.data) ultima
                     FROM cartoes_finais cf JOIN contas ct ON ct.id=cf.conta_id
                     LEFT JOIN lancamentos l ON l.conta_id=cf.conta_id AND l.cartao_final=cf.final AND l.valor<0
                     GROUP BY 1,2,3,4 ORDER BY 1, 5 DESC"""):
    print("   ", r["banco"], r["final"], r["uso"], "ativo" if r["ativo"] else "cancelado", r["n"], "compras", r["total"], "ultima", r["ultima"])
