import json, os, urllib.request
from dotenv import load_dotenv
load_dotenv(".env")
tk = os.getenv("APP_TOKEN"); base = "http://127.0.0.1:" + os.getenv("APP_PORT", "5100")
print("pagina /:", urllib.request.urlopen(base + "/").status)
for m in ("2026-10", "2026-08"):
    r = json.loads(urllib.request.urlopen(urllib.request.Request(base + "/api/resumo?mes=" + m, headers={"X-Token": tk})).read())
    print(m, {k: r[k] for k in ("inicial", "saldo", "previsto", "receitas", "despesas", "fatura_cartao", "renda")})
    print("   potes:", [(p["pote"], p["usado"], p["teto"]) for p in r["potes"]], "| serie:", len(r["serie"]), "dias")
l = json.loads(urllib.request.urlopen(urllib.request.Request(base + "/api/lancamentos?mes=2026-10", headers={"X-Token": tk})).read())
print("lancamentos out:", len(l), l[0]["data"] if l else None)
