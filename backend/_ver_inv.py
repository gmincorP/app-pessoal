# -*- coding: utf-8 -*-
r"""Dump CRU das aplicacoes do item da Caixa, para achar por onde amarrar com as contas do ERP.

    ..\.venv\Scripts\python.exe _ver_inv.py
"""
import io, json, os
for ln in io.open(".env", encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if ln and not ln.startswith("#") and "=" in ln:
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
from pluggy_client import PluggyClient
pc = PluggyClient.do_env()
itens = [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS_GM") or "").split(",") if i.strip()]
tudo = []
campos = set()
for it in itens:
    try:
        inv = pc.investimentos(it)
    except Exception as e:
        print("item %s.. erro: %s" % (it[:8], str(e)[:150])); continue
    for v in inv:
        v["_item"] = it
        tudo.append(v)
        campos |= set(v.keys())
io.open("_gm_investimentos.json", "w", encoding="utf-8").write(json.dumps(tudo, ensure_ascii=False, indent=1, default=str))
print("aplicacoes:", len(tudo))
print("\nCAMPOS que aparecem:", ", ".join(sorted(campos)))
for v in tudo:
    if (v.get("balance") or 0) <= 0:
        continue
    print("\n--- %s | %s | saldo %s" % (v.get("type"), v.get("name"), v.get("balance")))
    for k in sorted(v.keys()):
        if k in ("_item", "transactions"):
            continue
        val = v[k]
        if isinstance(val, (dict, list)):
            val = json.dumps(val, ensure_ascii=False, default=str)[:160]
        print("      %-22s %s" % (k, str(val)[:110]))
    tr = v.get("transactions")
    if tr:
        print("      transactions: %d (1a: %s)" % (len(tr), json.dumps(tr[0], ensure_ascii=False, default=str)[:200]))
print("\nCRU completo em _gm_investimentos.json")
