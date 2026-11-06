import json, urllib.request, datetime, db
B = "http://127.0.0.1:5100"
def req(m, u, body=None):
    r = urllib.request.Request(B+u, method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as x: return json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return {"HTTP": e.code, **json.loads(e.read().decode() or "{}")}
print("colunas regras/ajustes:", [r["table_name"] for r in db.query("SELECT table_name FROM information_schema.columns WHERE column_name='subcategoria_id' ORDER BY 1")])
cats = req("GET", "/api/categorias?todas=1"); print("categorias:", len(cats), "| exemplo:", {k: cats[0][k] for k in ("nome","natureza","pote","uso")})
# categoria nova -> renomear -> sub -> excluir
c = req("POST", "/api/categorias", {"nome": "ZZ Teste cat", "natureza": "DESPESA", "pote": "DES"}); cid = c["id"]
print("renomear:", req("PATCH", f"/api/categorias/{cid}", {"nome": "ZZ Teste cat 2", "pote": "NEC"}))
oid = db.query("SELECT id FROM categorias WHERE nome='Outros'")[0]["id"]
print("renomear sistema (deve recusar):", req("PATCH", f"/api/categorias/{oid}", {"nome": "X"}))
s = req("POST", "/api/subcategorias", {"categoria_id": cid, "nome": "Sub A"}); sid = s["id"]
print("renomear sub:", req("PATCH", f"/api/subcategorias/{sid}", {"nome": "Sub B"}))
# lancamento real: troca para a categoria de teste + sub, confere, devolve como estava
l = db.query("""SELECT id, to_char(data,'YYYY-MM') mes, categoria_id, subcategoria_id, tipo, pote, pluggy_tx_id FROM lancamentos WHERE tipo='DESPESA' AND origem='PLUGGY' ORDER BY data DESC LIMIT 1""")[0]
tinha_aj = bool(db.query("SELECT 1 FROM ajustes_lancamento WHERE pluggy_tx_id=%s", (l["pluggy_tx_id"],)))
print("PATCH lanc:", req("PATCH", f"/api/lancamentos/{l['id']}", {"categoria_id": cid, "subcategoria_id": sid}))
mes = l["mes"]; print("mes do lancamento:", mes)
x = [i for i in req("GET", f"/api/lancamentos?mes={mes}") if i["id"] == l["id"]]
print("lista mostra:", x and (x[0]["categoria"], x[0]["subcategoria"]))
r = req("GET", f"/api/resumo?mes={mes}"); t = [c for c in r["categorias"] if c["nome"] == "ZZ Teste cat 2"]
print("resumo quebra por sub:", t and t[0]["subcategorias"])
print("sub de outra categoria (deve recusar):", req("PATCH", f"/api/lancamentos/{l['id']}", {"categoria_id": l["categoria_id"], "subcategoria_id": sid}))
db.execute("UPDATE lancamentos SET categoria_id=%s, subcategoria_id=%s, tipo=%s, pote=%s WHERE id=%s", (l["categoria_id"], l["subcategoria_id"], l["tipo"], l["pote"], l["id"]))
if not tinha_aj: db.execute("DELETE FROM ajustes_lancamento WHERE pluggy_tx_id=%s", (l["pluggy_tx_id"],))
else: print("AVISO: ja tinha ajuste, verificar")
print("excluir sub:", req("DELETE", f"/api/subcategorias/{sid}"))
print("excluir cat (sem uso -> apaga):", req("DELETE", f"/api/categorias/{cid}"))
print("reclassificar roda:", __import__("pluggy").reclassificar(), "alterados")
print("restou teste?", db.query("SELECT count(*) n FROM categorias WHERE nome LIKE 'ZZ Teste%%'")[0]["n"])
