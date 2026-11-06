# -*- coding: utf-8 -*-
"""So leitura: o que tem nos itens GM do Pluggy. Nao imprime segredo nem item id inteiro.
    ..\.venv\Scripts\python.exe _ver_gm.py
"""
import io, os
from datetime import date, timedelta
for ln in io.open(".env", encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if ln and not ln.startswith("#") and "=" in ln:
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
from pluggy_client import PluggyClient, tipo_conta, banco_do_item
pc = PluggyClient.do_env()
itens = [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS_GM") or "").split(",") if i.strip()]
print("itens GM no .env:", len(itens))
desde = (date.today() - timedelta(days=30)).isoformat()
for it in itens:
    try:
        item = pc.item(it)
        cs = pc.contas(it)
        print("item %s... status=%s conector=%s banco=%s contas=%d"
              % (it[:8], item.get("status"), ((item.get("connector") or {}).get("name")),
                 banco_do_item(cs, item), len(cs)))
        for c in cs:
            n = 0
            try:
                for _ in pc.transacoes(c["id"], desde=desde):
                    n += 1
            except Exception as e:
                n = "erro " + str(e)[:70]
            print("   %-12s | %-36s | saldo=%s | tx30d=%s"
                  % (tipo_conta(c), (c.get("name") or "")[:36], c.get("balance"), n))
    except Exception as e:
        print("item %s... ERRO: %s" % (it[:8], str(e)[:200]))
