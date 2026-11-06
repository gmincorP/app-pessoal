# -*- coding: utf-8 -*-
r"""Puxa o extrato das contas Caixa da GM pelo Pluggy desde 23/08/2024. SO LEITURA.

    ..\.venv\Scripts\python.exe _ver_extrato.py

Salva tudo em _gm_extrato.json e imprime um resumo por conta/mes + os movimentos
que parecem aplicacao/resgate (que e o que falta para fechar o rendimento).
"""
import io, json, os, re
from datetime import date
for ln in io.open(".env", encoding="utf-8", errors="replace"):
    ln = ln.strip()
    if ln and not ln.startswith("#") and "=" in ln:
        k, v = ln.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
from pluggy_client import PluggyClient, tipo_conta, normalizar_transacao

DESDE = "2024-08-23"
RX = re.compile(r"APLIC|RESGAT|CDB|FUNDO|INVEST|GIRO|POUPAN|RENDA\s*FIXA|RDB", re.I)

pc = PluggyClient.do_env()
itens = [i.strip() for i in (os.getenv("PLUGGY_ITEM_IDS_GM") or "").split(",") if i.strip()]
tudo = []
for it in itens:
    for c in pc.contas(it):
        bd = c.get("bankData") or {}
        tn = bd.get("transferNumber") or c.get("number") or c.get("id")
        tp = tipo_conta(c)
        print("\n== %s | %s" % (tn, c.get("name")))
        n = 0
        try:
            for tx in pc.transacoes(c["id"], desde=DESDE):
                r = normalizar_transacao(tx, tp)
                r.pop("bruto", None)
                r["conta"] = tn
                tudo.append(r); n += 1
        except Exception as e:
            print("   erro: %s" % str(e)[:160])
        print("   %d movimento(s) desde %s" % (n, DESDE))

io.open("_gm_extrato.json", "w", encoding="utf-8").write(json.dumps(tudo, ensure_ascii=False, indent=1, default=str))

print("\n=== POR CONTA / MES ===")
agr = {}
for r in tudo:
    k = (r["conta"], (r["data"] or "")[:7])
    a = agr.setdefault(k, {"n": 0, "ent": 0.0, "sai": 0.0})
    a["n"] += 1
    if r["valor"] >= 0: a["ent"] += r["valor"]
    else: a["sai"] += -r["valor"]
for k in sorted(agr):
    a = agr[k]
    print("  %-24s %s  %4d mov | entradas %14.2f | saidas %14.2f" % (k[0], k[1], a["n"], a["ent"], a["sai"]))

print("\n=== MOVIMENTOS QUE PARECEM APLICACAO / RESGATE ===")
ap = [r for r in tudo if RX.search(r["descricao"] or "")]
print("  %d de %d" % (len(ap), len(tudo)))
for r in sorted(ap, key=lambda x: (x["conta"], x["data"]))[:120]:
    print("  %-24s %s %14.2f  %s" % (r["conta"], r["data"], r["valor"], (r["descricao"] or "")[:52]))
print("\nCRU em _gm_extrato.json (%d movimentos)" % len(tudo))
