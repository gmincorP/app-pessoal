"""Importacao de extrato OFX (Nubank e outros). Complementa o Pluggy com o que faltou.
Uso: python ofx.py comparar <arquivos.ofx...>   -> so mostra o que falta (nao grava)
     python ofx.py importar <arquivos.ofx...>   -> grava os que faltam (origem OFX)"""
import glob
import re
import sys
from datetime import date

import db


def ler_ofx(caminho):
    txt = open(caminho, encoding="latin-1", errors="replace").read()
    if "Ã" in txt or "Ã§" in txt:
        txt = open(caminho, encoding="utf-8", errors="replace").read()
    conta = (re.search(r"<ACCTID>([^<\r\n]+)", txt) or [None, ""])[1].strip()
    out = []
    for bloco in re.findall(r"<STMTTRN>(.*?)</STMTTRN>", txt, re.S):
        g = lambda tag: (re.search(rf"<{tag}>([^<\r\n]*)", bloco) or [None, ""])[1].strip()
        d = g("DTPOSTED")
        out.append({"fitid": g("FITID"), "data": date(int(d[:4]), int(d[4:6]), int(d[6:8])),
                    "valor": round(float(g("TRNAMT").replace(",", ".")), 2), "descricao": g("MEMO") or g("NAME"),
                    "conta": conta})
    return out


def _conta_nubank():
    r = db.query("SELECT id FROM contas WHERE banco='Nubank' AND tipo='CORRENTE' LIMIT 1")
    return r[0]["id"] if r else None


def faltantes(arquivos):
    vistos, falta = set(), []
    cid = _conta_nubank()
    for a in arquivos:
        for t in ler_ofx(a):
            if t["fitid"] in vistos:
                continue                         # arquivo duplicado (ex.: "(1).ofx")
            vistos.add(t["fitid"])
            achou = db.query("""SELECT id FROM lancamentos WHERE conta_id=%s AND valor=%s
                                AND data BETWEEN %s::date - 1 AND %s::date + 1 LIMIT 1""",
                             (cid, t["valor"], t["data"], t["data"]))
            if not achou:
                falta.append(t)
    return cid, falta


if __name__ == "__main__":
    modo, arqs = sys.argv[1], [f for p in sys.argv[2:] for f in glob.glob(p)]
    cid, falta = faltantes(arqs)
    print(f"{len(falta)} lancamentos do OFX que NAO estao no banco:")
    for t in sorted(falta, key=lambda t: t["data"]):
        print(f'  {t["data"]} {t["valor"]:>10.2f}  {t["descricao"][:60]}')
    if modo == "importar" and falta:
        import pluggy
        db.execute("ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_origem_check")
        db.execute("""ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_origem_check
                      CHECK (origem IN ('PLUGGY','NOTIF','WHATSAPP','MANUAL','OFX'))""")
        for t in falta:
            c = pluggy.decidir(t["descricao"], t["valor"], None, "CORRENTE", "DJONATHAN")
            db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, pote, status, origem, obs)
                          VALUES (%s,%s,%s,%s,%s,%s,%s,'CONFIRMADO','OFX',%s)""",
                       (cid, t["data"], t["descricao"], t["valor"], c["tipo"], c["categoria_id"], c["pote"],
                        "importado do OFX " + t["fitid"]))
        print("importados:", len(falta))
