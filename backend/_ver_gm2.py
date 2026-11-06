# -*- coding: utf-8 -*-
r"""Identidade das contas GM no Pluggy + as APLICACOES de cada item. Nao busca transacao (rapido).

    ..\.venv\Scripts\python.exe _ver_gm2.py

Em tela vai so o que da para ler; o mapa completo (com os ids) fica em _gm_contas.json.
"""
import io, json, os
for ln in io.open(".env", encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if ln and not ln.startswith("#") and "=" in ln:
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
from pluggy_client import PluggyClient, tipo_conta

pc = PluggyClient.do_env()
itens = [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS_GM") or "").split(",") if i.strip()]
saida = {"contas": [], "investimentos": []}

print("== CONTAS ==")
for it in itens:
    item = pc.item(it)
    for c in pc.contas(it):
        bd = c.get("bankData") or {}
        reg = {"item_id": it, "item_status": item.get("status"), "account_id": c.get("id"),
               "tipo": tipo_conta(c), "name": c.get("name"), "marketingName": c.get("marketingName"),
               "number": c.get("number"), "taxNumber": c.get("taxNumber"), "owner": c.get("owner"),
               "transferNumber": bd.get("transferNumber"), "closingBalance": bd.get("closingBalance"),
               "balance": c.get("balance"), "updatedAt": c.get("updatedAt")}
        saida["contas"].append(reg)
        print("  %s.. | %-10s | num=%-20s | transf=%-24s | saldo=%s"
              % (it[:8], reg["tipo"], str(reg["number"])[:20], str(reg["transferNumber"])[:24],
                 reg["balance"]))

print("\n== APLICACOES (/investments) ==")
for it in itens:
    try:
        inv = pc.investimentos(it)
    except Exception as e:
        print("  %s.. erro: %s" % (it[:8], str(e)[:120]))
        continue
    if not inv:
        print("  %s.. nenhuma aplicacao" % it[:8])
    for v in inv:
        reg = {"item_id": it, "investment_id": v.get("id"), "name": v.get("name"),
               "type": v.get("type"), "subtype": v.get("subtype"), "number": v.get("number"),
               "balance": v.get("balance"), "value": v.get("value"), "quantity": v.get("quantity"),
               "amount": v.get("amount"), "amountOriginal": v.get("amountOriginal"),
               "date": v.get("date"), "dueDate": v.get("dueDate"), "issuer": v.get("issuer"),
               "rate": v.get("rate"), "rateType": v.get("rateType"), "status": v.get("status")}
        saida["investimentos"].append(reg)
        print("  %s.. | %-14s | %-30s | saldo=%-12s | vence=%s"
              % (it[:8], str(reg["type"])[:14], str(reg["name"])[:30], reg["balance"], reg["dueDate"]))

io.open("_gm_contas.json", "w", encoding="utf-8").write(json.dumps(saida, ensure_ascii=False, indent=1))
print("\n%d conta(s), %d aplicacao(oes). Mapa completo em _gm_contas.json"
      % (len(saida["contas"]), len(saida["investimentos"])))
