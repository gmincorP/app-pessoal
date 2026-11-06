import json, urllib.request, db
B="http://127.0.0.1:5100"
g=lambda u: json.loads(urllib.request.urlopen(B+u).read().decode())
cc=[c for c in g("/api/contas")["contas"] if c["banco"]=="Nubank" and c["tipo"]=="CORRENTE"][0]
for mes in ("2026-09","2026-05"):
    ex=g(f"/api/contas/{cc['id']}/extrato?mes={mes}")
    it=ex["itens"]
    print(mes, "inicio", ex["saldo_inicio"], "fim", ex["saldo_fim"], "itens", len(it), "entrou", ex["entradas"], "saiu", ex["saidas"],
          "| ultimo saldo_apos == fim:", it and round(it[0]["saldo_apos"],2)==ex["saldo_fim"], "| primeiro-valor == inicio:", it and round(it[-1]["saldo_apos"]-it[-1]["valor"],2)==ex["saldo_inicio"])
    for i in it[:3]: print("   ", i["data"], i["descricao"][:30], i["valor"], "saldo", i["saldo_apos"])
