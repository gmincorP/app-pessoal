import json, urllib.request, datetime
B = "http://127.0.0.1:5100"
def req(m, u, body=None):
    r = urllib.request.Request(B+u, method=m, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r) as x:
        t = x.read().decode("utf-8")
        return json.loads(t) if t.lstrip().startswith(("{","[")) else t
html = req("GET", "/")
print("html tem telaMov:", "telaMov" in html, "| FAB:", "nova-despesa-cartao" in html)
for n in ("RECEITA", "DESPESA"):
    c = req("GET", "/api/categorias?natureza="+n); print(n, "categorias:", len(c), [x["nome"] for x in c][:6])
mes = datetime.date.today().strftime("%Y-%m")
for n in ("RECEITA", "DESPESA"):
    m = req("GET", f"/api/movimentos?mes={mes}&natureza={n}"); print(n, mes, "itens", len(m["itens"]), "realizado", m["realizado"], "pendente", m["pendente"])
contas = req("GET", "/api/contas")["contas"]
cc = next(c for c in contas if c["tipo"] == "CORRENTE")
fut = (datetime.date.today() + datetime.timedelta(days=40)).isoformat()
r = req("POST", "/api/lancamentos", {"natureza": "DESPESA", "descricao": "TESTE AUTOMATICO apagar", "valor": 12.34, "data": fut,
         "efetivada": False, "conta_id": cc["id"], "recorrencia": {"tipo": "PARCELADA", "periodicidade": "MENSAL", "parcela_inicial": 1, "quantidade": 3}})
print("POST parcelada 3x:", r)
mf = fut[:7]
m = req("GET", f"/api/movimentos?mes={mf}&natureza=DESPESA")
t = [x for x in m["itens"] if x["descricao"].startswith("TESTE AUTOMATICO")]
print("no mes", mf, ":", [(x["descricao"], x["valor"], x["fonte"]) for x in t])
if t:
    print("DELETE serie:", req("DELETE", f"/api/agendados/{t[0]['id']}?serie=1"))
