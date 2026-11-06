import json, os, urllib.request
from dotenv import load_dotenv
load_dotenv(".env")
import pluggy
print("vinculados:", pluggy.vincular_faturas())
base = "http://127.0.0.1:" + os.getenv("APP_PORT", "5100")
cs = json.loads(urllib.request.urlopen(base + "/api/cartoes").read())
for c in cs:
    print(f'\n{c["banco"]} {c["numero"]} limite {c["limite"]} disp {c["disponivel"]} | finais {[ (f["final"], f["uso"], f["n"]) for f in c["finais"]]}')
    for f in c["faturas"][:8]:
        print(f'  {f["mes"]} {f["status"]:<13} fecha {f["fechamento"]} vence {f["vencimento"]} total {f["total"]:>9} pago {f["pago"]:>9} em {f["data_pagamento"]} | pessoal {f["pessoal"]:>9} compras {f["compras"]}{" (estimada)" if f["estimada"] else ""}')
