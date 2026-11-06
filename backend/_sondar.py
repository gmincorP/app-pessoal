import json, os
from dotenv import load_dotenv
load_dotenv(".env")
from pluggy_client import PluggyClient, tipo_conta, banco_do_item
pc = PluggyClient.do_env()
for it in os.getenv("PLUGGY_ITEM_IDS").split(","):
    cs = pc.contas(it); banco = banco_do_item(cs)
    print("\n####", banco)
    for c in cs:
        print(" CONTA", tipo_conta(c), "| type", c.get("type"), "| subtype", c.get("subtype"), "| name", c.get("name"), "| number", c.get("number"))
        if tipo_conta(c) == "CARTAO":
            bs = sorted(pc.faturas(c["id"]), key=lambda b: b.get("dueDate", ""), reverse=True)
            print("   faturas:", len(bs), "| campos:", sorted(bs[0].keys()) if bs else None)
            if bs:
                b = dict(bs[0]); b.pop("financeCharges", None)
                print("   ex:", json.dumps(b, ensure_ascii=False)[:400])
            n = 0
            for tx in pc.transacoes(c["id"], "2026-09-01"):
                print("   tx keys:", sorted(tx.keys()))
                print("   ccMeta:", json.dumps(tx.get("creditCardMetadata"), ensure_ascii=False)[:300])
                n += 1
                if n >= 1: break
    try:
        inv = pc.investimentos(it)
        print(" INVESTIMENTOS:", len(inv))
        for i in inv[:6]:
            print("   ", i.get("type"), i.get("subtype"), "|", i.get("name"), "| saldo", i.get("balance"), "| status", i.get("status"))
    except Exception as e:
        print(" investimentos erro:", e)
