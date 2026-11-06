import json, urllib.request, datetime, db
B = "http://127.0.0.1:5100"
def req(m, u, body=None):
    r = urllib.request.Request(B+u, method=m, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as x: return json.loads(x.read().decode())
    except urllib.error.HTTPError as e: return {"HTTP": e.code, **json.loads(e.read().decode() or "{}")}
hoje = datetime.date.today(); mes = hoje.strftime("%Y-%m")
print("responsavel GM ja existente (finais):", db.query("SELECT responsavel, count(*) n FROM lancamentos GROUP BY 1"))
r0 = req("GET", f"/api/resumo?mes={mes}")
print("ANTES  despesas(fora cartao)=%s cartao=%s fatura=%s potes=%s" % (r0["despesas"], r0["despesas_cartao"], r0["fatura_cartao"], [(p["pote"], p["usado"]) for p in r0["potes"]]))
c = req("POST", "/api/cartoes", {"nome": "ZZ Teste GM", "banco": "Itaú", "responsavel": "GM", "limite": "5000", "fatura_atual": "300",
                                  "dia_fechamento": 28, "dia_vencimento": 5, "venc_dias_uteis": True, "numero": "1234", "bandeira": "VISA"})
print("criar:", c); cid = c["id"]
print("erro validacao:", req("POST", "/api/cartoes", {"nome": "x", "dia_fechamento": 40, "dia_vencimento": 5}))
r = req("POST", "/api/lancamentos", {"natureza": "DESPESA", "descricao": "ZZ teste compra GM", "valor": 100, "data": hoje.isoformat(), "conta_id": cid,
                                      "recorrencia": {"tipo": "PARCELADA", "periodicidade": "MENSAL", "parcela_inicial": 1, "quantidade": 2}})
print("compra 2x:", r)
print("estorno:", req("POST", "/api/lancamentos", {"natureza": "ESTORNO", "descricao": "ZZ teste estorno", "valor": 20, "data": hoje.isoformat(), "conta_id": cid}))
k = [x for x in req("GET", "/api/cartoes") if x["id"] == cid][0]
print("cartao:", {x: k[x] for x in ("responsavel", "manual", "usado", "disponivel", "limite", "numero")})
for f in sorted(k["faturas"], key=lambda f: f["mes"])[11:15]:
    print("  fatura", f["mes"], "fecha", f["fechamento"], "vence", f["vencimento"], "total", f["total"], "inicial", f["saldo_inicial"], f["status"], "gm", f["gm"])
print("lancamentos responsavel:", db.query("SELECT descricao, valor::float8, tipo, responsavel, fatura_mes FROM lancamentos WHERE conta_id=%s", (cid,)))
r1 = req("GET", f"/api/resumo?mes={mes}")
print("DEPOIS despesas=%s cartao=%s fatura=%s potes=%s" % (r1["despesas"], r1["despesas_cartao"], r1["fatura_cartao"], [(p["pote"], p["usado"]) for p in r1["potes"]]))
mv = req("GET", f"/api/movimentos?mes={mes}&natureza=DESPESA")
print("Despesas lista tem teste?", any("ZZ" in i["descricao"] for i in mv["itens"]), "| itens", len(mv["itens"]))
print("mudar p/ PESSOAL:", req("PATCH", f"/api/cartoes/{cid}", {"responsavel": "PESSOAL"}))
r2 = req("GET", f"/api/resumo?mes={mes}"); print("como PESSOAL cartao=%s potes=%s" % (r2["despesas_cartao"], [(p["pote"], p["usado"]) for p in r2["potes"]]))
fm = [f for f in k["faturas"] if f["total"] > 0 and f["status"] not in ("ABERTA",)]
print("pagar (fatura fechada mais antiga c/ valor):", fm and req("POST", f"/api/cartoes/{cid}/fatura/{fm[0]['mes']}/pagar", {}))
print("excluir (tem compras -> desativa):", req("DELETE", f"/api/cartoes/{cid}"))
# limpeza total do teste
db.execute("DELETE FROM agendados WHERE conta_id=%s", (cid,))
db.execute("DELETE FROM lancamentos WHERE conta_id=%s", (cid,))
db.execute("DELETE FROM recorrencias r WHERE NOT EXISTS (SELECT 1 FROM agendados a WHERE a.recorrencia_id=r.id) AND NOT EXISTS (SELECT 1 FROM lancamentos l WHERE l.recorrencia_id=r.id)")
db.execute("DELETE FROM faturas WHERE conta_id=%s", (cid,)); db.execute("DELETE FROM cartoes_finais WHERE conta_id=%s", (cid,)); db.execute("DELETE FROM contas WHERE id=%s", (cid,))
r3 = req("GET", f"/api/resumo?mes={mes}")
print("FINAL  despesas=%s cartao=%s fatura=%s (igual ao ANTES: %s)" % (r3["despesas"], r3["despesas_cartao"], r3["fatura_cartao"],
      (r3["despesas"], r3["despesas_cartao"], r3["fatura_cartao"]) == (r0["despesas"], r0["despesas_cartao"], r0["fatura_cartao"])))
