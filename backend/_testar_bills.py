import json, os
from dotenv import load_dotenv
load_dotenv(".env")
from pluggy_client import PluggyClient, tipo_conta, banco_do_item, PluggyErro
pc = PluggyClient.do_env()
for it in os.getenv("PLUGGY_ITEM_IDS").split(","):
    cs = pc.contas(it)
    for c in cs:
        if tipo_conta(c) != "CARTAO":
            continue
        print(banco_do_item(cs), c.get("name"), "| balance:", c.get("balance"))
        print("   creditData:", json.dumps({k: v for k, v in (c.get("creditData") or {}).items()
                                            if k in ("balanceCloseDate", "balanceDueDate", "minimumPayment", "creditLimit", "availableCreditLimit")}, ensure_ascii=False))
        try:
            for b in sorted(pc.faturas(c["id"]), key=lambda b: b.get("dueDate",""), reverse=True)[:3]:
                print("   fatura:", b.get("dueDate", "")[:10], "total:", b.get("totalAmount"), "min:", b.get("minimumPaymentAmount"))
        except PluggyErro as e:
            print("   /bills erro:", e.status, e)
