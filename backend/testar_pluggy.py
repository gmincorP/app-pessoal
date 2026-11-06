"""Teste SOMENTE LEITURA do Pluggy: autentica, lista contas e conta transacoes desde 01/09.
Nao grava nada e nao mostra o Secret. Usa so a biblioteca padrao do Python.
Rodar:  py testar_pluggy.py"""
import collections, json, os, urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
env = {}
for l in open(os.path.join(AQUI, ".env"), encoding="utf-8"):
    l = l.strip()
    if l and not l.startswith("#") and "=" in l:
        k, v = l.split("=", 1)
        env[k.strip()] = v.strip()

B = "https://api.pluggy.ai"


def req(m, p, body=None, key=None):
    r = urllib.request.Request(B + p, data=json.dumps(body).encode() if body else None, method=m)
    r.add_header("Content-Type", "application/json")
    if key:
        r.add_header("X-API-KEY", key)
    with urllib.request.urlopen(r, timeout=60) as x:
        return json.loads(x.read())


print("Secret preenchido:", bool(env.get("PLUGGY_CLIENT_SECRET")))
try:
    key = req("POST", "/auth", {"clientId": env["PLUGGY_CLIENT_ID"], "clientSecret": env["PLUGGY_CLIENT_SECRET"]})["apiKey"]
    print("AUTENTICACAO OK\n")
except urllib.error.HTTPError as e:
    print("AUTENTICACAO FALHOU:", e.code, e.read()[:300])
    raise SystemExit(1)

cats = collections.Counter()
for item in env["PLUGGY_ITEM_IDS"].split(","):
    try:
        it = req("GET", f"/items/{item}", key=key)
    except urllib.error.HTTPError as e:
        print(f"ITEM {item[:8]}  NAO ACESSIVEL ({e.code}) -- esse item pertence a outra aplicacao\n")
        continue
    print(f"ITEM {item[:8]}  status={it.get('status')}  atualizado={it.get('lastUpdatedAt')}")
    for a in req("GET", f"/accounts?itemId={item}", key=key)["results"]:
        try:
            tx = req("GET", f"/v2/transactions?accountId={a['id']}&dateFrom=2026-09-01", key=key)
        except urllib.error.HTTPError as e:
            print(f"   {a.get('type'):7} {(a.get('name') or '')[:28]:28} ERRO transacoes {e.code}: {e.read()[:300]}")
            continue
        res = tx.get("results", [])
        tx["total"] = f"{len(res)}{' (+ mais paginas)' if tx.get('next') else ''}"
        for t in res:
            cats[t.get("category")] += 1
        tipos = dict(collections.Counter(t.get("type") for t in res))
        nome = (a.get("marketingName") or a.get("name") or "")[:28]
        print(f"   {a.get('type'):7} {nome:28} saldo={a.get('balance')}  transacoes desde 01/09: {tx.get('total')} {tipos}")
        if res:
            t = res[0]
            print(f"      exemplo: {t.get('date','')[:10]}  {t.get('type')}  {t.get('amount')}  {t.get('category')}  sinal_do_valor={'negativo' if (t.get('amount') or 0) < 0 else 'positivo'}")
    print()

print("CATEGORIAS QUE O PLUGGY MANDOU (desde 01/09):")
for c, n in cats.most_common():
    print(f"   {n:4}  {c}")
input("\nEnter pra fechar...")
