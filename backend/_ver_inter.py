import os
from dotenv import load_dotenv
load_dotenv(".env")
import db
from pluggy_client import PluggyClient, tipo_conta, normalizar_fatura
pc = PluggyClient.do_env()
print("=== INTER: TODAS as faturas que o banco enviou")
for c in pc.contas("f30a640c-7c6c-469b-aab9-f4132dd73ef7"):
    if tipo_conta(c) == "CARTAO":
        for b in sorted(pc.faturas(c["id"]), key=lambda b: b["dueDate"]):
            f = normalizar_fatura(b)
            print(f'  vence {f["vencimento"]} total {f["total"]:>9} min {f["minimo"]:>7} encargos {f["encargos"]:>7} carregado {f["saldo_anterior"]:>8} {f["encargos_detalhe"]} pag {[(p["data"], p["valor"]) for p in f["pagamentos"]]}')
print("\n=== CARTOES apos sync")
for r in db.query("""SELECT ct.banco, ct.numero, ct.limite_cartao, ct.limite_configurado, ct.saldo, ct.limite_disponivel,
                            (SELECT string_agg(final || CASE WHEN ativo THEN '' ELSE '(cancelado)' END, ', ' ORDER BY final)
                               FROM cartoes_finais cf WHERE cf.conta_id=ct.id) finais
                     FROM contas ct WHERE tipo='CARTAO'"""):
    print(r)
print("\n=== NUBANK faturas com encargos")
for r in db.query("""SELECT f.mes, f.total, f.encargos, f.saldo_anterior, f.encargos_detalhe FROM faturas f JOIN contas c ON c.id=f.conta_id
                     WHERE c.banco='Nubank' AND (f.encargos>0 OR f.saldo_anterior>0) ORDER BY f.mes"""):
    print(r)
