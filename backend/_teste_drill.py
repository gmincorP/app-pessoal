import json, urllib.request, urllib.parse, datetime, db
B = "http://127.0.0.1:5100"
def req(m, u, body=None):
    r = urllib.request.Request(B+u, method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as x: return json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return {"HTTP": e.code, "txt": e.read().decode()[:300]}
mes = "2026-05"
r = req("GET", f"/api/resumo?mes={mes}")
print("RESUMO mai: investido", r["investido"], "aplicado", r["aplicado"], "resgatado", r["resgatado"], "fatura(mes fechado)", r["fatura_cartao"], "prev_det", r["previsto_det"])
print("RESUMO out prev_det:", req("GET", "/api/resumo")["previsto_det"])
for p in ("NEC", "DES", "INV"):
    l = req("GET", f"/api/lancamentos?mes={mes}&pote={p}")
    print("pote", p, len(l), "lanc soma", round(-sum(x["valor"] for x in l), 2), "| resumo usado", [x["usado"] for x in r["potes"] if x["pote"] == p])
cid = r["categorias"][0]["id"]; l = req("GET", f"/api/lancamentos?mes={mes}&categoria_id={cid}")
print("categoria", r["categorias"][0]["nome"], len(l), "lanc soma", round(-sum(x["valor"] for x in l), 2), "resumo", r["categorias"][0]["valor"])
iv = req("GET", f"/api/investimentos?mes={mes}")
print("INVEST mai: liquido", iv["liquido"], "aplic", iv["aplicado"], "resg", iv["resgatado"], "guardado", iv["guardado"], "bancos", [(b["banco"], b["saldo"]) for b in iv["bancos"]], "mov", len(iv["movimentos"]))
ct = req("GET", "/api/contas")
print("CONTAS bancos:", [(b["banco"], b.get("apelido"), b["total"], [(i["tipo"], i["nome"]) for i in b["itens"]]) for b in ct["bancos"]])
cc = [c for c in ct["contas"] if c["banco"] == "Nubank" and c["tipo"] == "CORRENTE"][0]
ex = req("GET", f"/api/contas/{cc['id']}/extrato?mes=2026-10")
print("EXTRATO Nubank out: saldo", ex["conta"]["saldo"], "inicio", ex["saldo_inicio"], "fim", ex["saldo_fim"], "itens", len(ex["itens"]), "1o saldo_apos", ex["itens"][0]["saldo_apos"] if ex["itens"] else None,
      "| confere inicio+mov=fim:", round(ex["saldo_inicio"] + sum(i["valor"] for i in ex["itens"]), 2) == ex["saldo_fim"])
bc = req("GET", "/api/bancos/" + urllib.parse.quote("Mercado Pago")); print("BANCO MP:", bc["cor"], [(c["nome"], c["tipo"]) for c in bc["contas"]], "outras", len(bc["outras"]))
# caixinha fora da economia no MP + alocar um movimento de maio
tinha_inv = bool(db.query("SELECT 1 FROM contas WHERE tipo='INVESTIMENTO' AND banco='Mercado Pago'"))
c = req("POST", "/api/caixinhas", {"nome": "ZZ Teste aluguel", "banco": "Mercado Pago", "saldo_atual": 100, "economia": False}); print("caixinha:", c)
m = iv["movimentos"][-1]
print("alocar", m["descricao"], m["valor"], req("POST", "/api/caixinhas/alocar", {"lancamento_id": m["id"], "caixinha_id": c["id"]}))
r2 = req("GET", f"/api/resumo?mes={mes}"); iv2 = req("GET", f"/api/investimentos?mes={mes}")
print("depois: investido", r2["investido"], "(antes", r["investido"], ") fora", iv2["fora_aplicado"], iv2["fora_resgatado"], "| pote do lanc:", db.query("SELECT pote FROM lancamentos WHERE id=%s", (m["id"],))[0]["pote"])
print("extrato caixinha:", req("GET", f"/api/caixinhas/{c['id']}/extrato")["caixinha"])
print("tirar:", req("POST", "/api/caixinhas/alocar", {"lancamento_id": m["id"], "caixinha_id": None}), "pote:", db.query("SELECT pote FROM lancamentos WHERE id=%s", (m["id"],))[0]["pote"])
db.execute("DELETE FROM caixinhas WHERE id=%s", (c["id"],))
if not tinha_inv: db.execute("DELETE FROM contas WHERE tipo='INVESTIMENTO' AND banco='Mercado Pago' AND nome='Caixinhas'")
print("investido final", req("GET", f"/api/resumo?mes={mes}")["investido"])
