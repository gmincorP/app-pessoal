import json, os
from dotenv import load_dotenv
load_dotenv(".env")
from pluggy_client import PluggyClient, tipo_conta, banco_do_item
pc = PluggyClient.do_env()
for it in os.getenv("PLUGGY_ITEM_IDS").split(","):
    cs = pc.contas(it); banco = banco_do_item(cs)
    for c in cs:
        if tipo_conta(c) != "CARTAO":
            continue
        print(f"\n######## {banco} cartao {c.get('number')}")
        print("creditData:", json.dumps(c.get("creditData"), ensure_ascii=False))
        print("outros campos da conta:", {k: v for k, v in c.items() if k not in ("creditData", "bankData", "id", "itemId")})
        for b in sorted(pc.faturas(c["id"]), key=lambda b: b["dueDate"], reverse=True)[:6]:
            fc = b.get("financeCharges") or []
            print(f'  fatura {b["dueDate"][:10]} total {b.get("totalAmount")}  encargos:',
                  json.dumps([{k: x.get(k) for k in ("type", "amount", "additionalInfo")} for x in fc], ensure_ascii=False))
