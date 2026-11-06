"""Teste da fila + nota fiscal por item, contra um banco de TESTE (nunca rode no banco real).

    PGDATABASE=app_pessoal_teste python _teste_fila.py

Monta uma pagina da SEFAZ (layout SVRS) igual ao cupom do mercado de 18/10/2026, um lancamento do
cartao de R$ 199,00, e confere: leitura, vinculo, classificacao, rateio e os potes do Inicio.
"""
import os
import sys
from datetime import date

import db

if "teste" not in os.getenv("PGDATABASE", "") and "--forcar" not in sys.argv:
    sys.exit("Use um banco de TESTE (PGDATABASE com 'teste' no nome).")

import nfce
import fila
import app as appmod

ITENS = [("SALG TRIGO TORCIDA 60G", "7892840822644", 1, 2.39), ("SALG TRIGO TORCIDA 60G", "7892840822590", 1, 2.49),
         ("SALG TRIGO TORCIDA 60G", "7892840822552", 1, 2.39), ("MIST BEB COCO LEVE 190G", "7896970731337", 2, 6.98),
         ("MIST BEB COCO LEVE 190G", "7898996082222", 1, 3.49), ("MIST BEB COCO LEVE 190G", "7898970731443", 1, 3.49),
         ("PEITO PERU SEAR 150G", "7894904268559", 1, 15.89), ("PEITO PERU SEAR 150G", "7894904268559", 1, 15.89),
         ("QJ MUSSARELA TIROL 150G", "7896256600544", 1, 7.99), ("QJO PRATO PRESIDENT 3", "7891097103858", 1, 15.98),
         ("WHISK WHITE HORSE 1L", "5000265001335", 1, 74.15), ("PAO QJO SERTAOZINHO 800", "7898909901107", 1, 9.49),
         ("LASANHA LEBON 600G BO", "7894904201778", 1, 11.99), ("F MIGNON SUI SEARA 27", "7894904607433", 1, 19.90),
         ("BEB ENERG BALY 2L", "7898080662668", 1, 9.49)]
CHAVE = "43261009477652020200651170000706111786837892"


def pagina():
    linhas = "".join(
        f'<tr id="Item + {k}"><td valign="top"><span class="txtTit">{d}</span><span class="RCod">(Código: {c} )</span><br>'
        f'<span class="Rqtd"><strong>Qtde.:</strong>{q}</span><span class="RUN"><strong>UN: </strong>UN</span>'
        f'<span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;{v / q:.2f}'.replace(".", ",") + '</span></td>'
        f'<td align="right" valign="top" class="txtTit noWrap">Vl. Total<br><span class="valor">{v:.2f}'.replace(".", ",") + '</span></td></tr>'
        for k, (d, c, q, v) in enumerate(ITENS, 1))
    return f"""<html><body><div id="conteudo"><div class="txtCenter"><div id="u20" class="txtTopo">SDB COMERCIO DE ALIMENTOS LTDA</div>
      <div class="text">CNPJ: 09.477.652/0202-00</div></div><table id="tabResult" cellspacing="0">{linhas}</table>
      <div id="totalNota"><div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">15</span></div>
      <div id="linhaTotal"><label>Valor total R$:</label><span class="totalNumb">202,00</span></div>
      <div id="linhaTotal"><label>Descontos R$:</label><span class="totalNumb">3,00</span></div>
      <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">199,00</span></div></div>
      <ul><li><strong>Número: </strong>70611<strong> Série: </strong>117<strong> Emissão: </strong>18/10/2026 16:55:03 - Via Consumidor</li></ul>
      <span class="chave">4326 1009 4776 5202 0200 6511 7000 0706 1117 8683 7892</span></div></body></html>"""


def ok(cond, msg):
    print(("OK   " if cond else "FALHA ") + msg)
    if not cond:
        ok.falhas += 1
ok.falhas = 0


def main():
    # --- leitura da pagina
    d = nfce.ler_html(pagina(), CHAVE)
    ok(len(d["itens"]) == 15, "15 itens lidos")
    ok(d["total"] == 199.0 and d["desconto"] == 3.0, "total 199,00 e desconto 3,00")
    ok(d["emitente"] == "SDB COMERCIO DE ALIMENTOS LTDA" and d["cnpj"] == "09477652020200", "emitente e CNPJ")
    ok(d["emitida_em"].strftime("%d/%m/%Y %H:%M") == "18/10/2026 16:55", "data/hora de emissão")
    ok(d["itens"][10]["ean"] == "5000265001335" and d["itens"][3]["qtd"] == 2, "EAN e quantidade")
    ok(nfce.chave_de("https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=%s|2|1|1|ABC" % CHAVE) == CHAVE, "chave do link do QR")
    ok(nfce.chave_de("4326 1009 4776 5202 0200 6511 7000 0706 1117 8683 7892") == CHAVE, "chave digitada com espaços")

    # --- base limpa
    for t in ("nota_itens", "notas", "produto_regras", "regras_item", "ajustes_lancamento", "lancamentos"):
        db.execute(f"DELETE FROM {t}")
    conta = db.query("SELECT id FROM contas WHERE tipo='CARTAO' LIMIT 1")
    if not conta:
        conta = db.query("INSERT INTO contas (nome, banco, tipo) VALUES ('Nubank cartão','Nubank','CARTAO') RETURNING id")
    cid = conta[0]["id"]
    cat = {r["nome"]: r["id"] for r in db.query("SELECT id, nome FROM categorias")}
    if "Bebidas" not in cat:
        cat["Bebidas"] = db.query("INSERT INTO categorias (nome, pote) VALUES ('Bebidas','DES') RETURNING id")[0]["id"]
    db.execute("UPDATE categorias SET pote='DES', natureza='DESPESA' WHERE id=%s", (cat["Bebidas"],))
    lid = db.query("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, pote, origem, pluggy_tx_id)
                      VALUES (%s,'2026-10-18','SDB COMERCIO DE ALIM',-199.00,'DESPESA',%s,'NEC','PLUGGY','tx-sdb') RETURNING id""",
                   (cid, cat["Mercado"]))[0]["id"]
    db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, categoria_id, pote, origem)
                  VALUES (%s,'2026-10-17','POSTO SAO JOAO',-250,'DESPESA',NULL,'NENHUM','MANUAL'),
                         (%s,'2026-09-17','POSTO SAO JOAO',-200,'DESPESA',%s,'NEC','MANUAL')""",
               (cid, cid, cat["Combustível"]))

    # --- fila sem nota: posto entra com sugestao pela loja
    f = fila.fila(9999)
    posto = [l for l in f["lancamentos"] if l["descricao"] == "POSTO SAO JOAO"]
    ok(len(posto) == 1 and posto[0]["sugestoes"][0]["categoria"] == "Combustível", "posto na fila sugerindo Combustível")

    # --- grava a nota: liga sozinha ao lancamento de 199
    nid = fila.gravar_nota(d, "https://exemplo/qr")
    n = fila.nota_detalhe(nid)
    ok(n["lancamento_id"] == lid and n["status"] == "VINCULADA", "nota ligada ao lançamento do cartão")
    ok(n["pendentes"] == 15, "primeira vez: 15 itens pendentes")
    ok(any(s["categoria"] == "Mercado" for s in n["itens"][0]["sugestoes"]), "Mercado entre as sugestões")
    ok(fila.contar_fila(9999) == 2, "fila: posto + nota com pendência")

    # --- usuario: whisky e coco em Bebidas (lembrar), energetico 'sempre perguntar', resto em lote
    by = {i["descricao_cupom"]: i for i in n["itens"]}
    fila.classificar_um(by["WHISK WHITE HORSE 1L"]["id"], cat["Bebidas"])
    for i in n["itens"]:
        if i["descricao_cupom"].startswith("MIST BEB COCO"):
            fila.classificar_um(i["id"], cat["Bebidas"])
    fila.classificar_um(by["BEB ENERG BALY 2L"]["id"], cat["Bebidas"], lembrar=False)
    fila.classificar_lote(nid, cat["Mercado"])
    n = fila.nota_detalhe(nid)
    ok(n["status"] == "CONCLUIDA" and n["pendentes"] == 0, "nota concluída")
    soma = round(sum(i["valor_lanc"] for i in n["itens"]), 2)
    ok(soma == 199.0, "rateio fecha com o lançamento (%s)" % soma)
    ok(n["potes"]["DES"] == round(sum(i["valor_lanc"] for i in n["itens"] if i["pote"] == "DES"), 2), "potes da nota")

    # --- Inicio: potes contam os itens
    c = appmod.app.test_client()
    r = c.get("/api/resumo?mes=2026-10").get_json()
    pot = {p["pote"]: p["usado"] for p in r["potes"]}
    ok(abs(pot["NEC"] + pot["DES"] - 199.0) < 0.02 and pot["DES"] > 90, "Início: R$ 199 divididos em NEC %.2f + DES %.2f" % (pot["NEC"], pot["DES"]))
    lp = c.get("/api/lancamentos?mes=2026-10&pote=DES").get_json()
    ok(any("WHISK" in x["descricao"] for x in lp), "lista do pote Desejo mostra o whisky")
    la = c.get("/api/lancamentos?mes=2026-10").get_json()
    ok(sum(1 for x in la if x["id"] == lid) == 1 and [x for x in la if x["id"] == lid][0]["nota_id"] == nid,
       "lista comum: compra aparece 1x com nota_id")

    # --- segunda compra igual: whisky entra sozinho, energetico volta pra revisao
    d2 = dict(d, chave=CHAVE[:-1] + "0", emitida_em=d["emitida_em"].replace(day=25))
    db.execute("""INSERT INTO lancamentos (conta_id, data, descricao, valor, tipo, pote, origem)
                  VALUES (%s,'2026-10-25','SDB COMERCIO DE ALIM',-199.00,'DESPESA','NENHUM','MANUAL')""", (cid,))
    n2 = fila.nota_detalhe(fila.gravar_nota(d2, "x"))
    by2 = {i["descricao_cupom"]: i for i in n2["itens"]}
    ok(not by2["WHISK WHITE HORSE 1L"]["pendente"] and by2["WHISK WHITE HORSE 1L"]["origem"] == "EAN", "2ª nota: whisky pelo código de barras")
    e = by2["BEB ENERG BALY 2L"]
    ok(e["pendente"] and e["perguntar"] and e["sugestoes"][0]["categoria"] == "Bebidas", "2ª nota: energético pergunta de novo, sugerindo a última")
    ok(not by2["PEITO PERU SEAR 150G"]["pendente"], "2ª nota: item marcado em lote aprendeu (peito entra sozinho)")
    ok(n2["pendentes"] == 1, "2ª nota: só o energético pede revisão (%s)" % n2["pendentes"])
    # --- HTTP
    r = c.post("/api/notas", json={"texto": "nada aqui"})
    ok(r.status_code == 422, "link inválido devolve erro claro")
    ok(db.query("SELECT count(*) n FROM notificacoes WHERE titulo LIKE 'Cupom fiscal%%'")[0]["n"] >= 1, "falha foi pro sino")
    r = c.get("/api/fila").get_json()
    ok(r["total"] >= 2, "GET /api/fila responde")
    print("\n%s" % ("TUDO OK" if not ok.falhas else "%d FALHA(S)" % ok.falhas))
    sys.exit(1 if ok.falhas else 0)


if __name__ == "__main__":
    main()
