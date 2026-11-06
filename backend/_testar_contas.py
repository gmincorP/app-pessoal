import json, urllib.request
r = json.loads(urllib.request.urlopen("http://127.0.0.1:5100/api/contas").read())
print("patrimonio:", r["patrimonio"])
for b in r["bancos"]:
    print(f'\n{b["banco"]} ({b["sigla"]}) total {b["total"]}')
    for i in b["itens"]:
        print(f'  {"    " if i["nivel"]==2 else ""}{i["tipo"]:<12} {i["nome"]:<28} {i["valor"]:>11}  {i["sub"]}')
print("pendentes RDB:", len(r["pendentes"]), "| caixinhas:", r["caixinhas"])
print("pagina:", urllib.request.urlopen("http://127.0.0.1:5100/").status)
