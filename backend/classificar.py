"""Decide tipo, categoria e pote de um lancamento.

Ordem: (1) regra que o usuario ensinou -> (2) de/para da categoria do Pluggy -> (3) 'Outros'.
Transferencia entre as proprias contas, pagamento de fatura e aplicacao NAO contam como despesa.
"""
import re
import db

_PLACA = re.compile(r"\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b")


def placa_no_texto(texto):
    """ABC1D23 (Mercosul) ou ABC-1234 (antiga) -> 'ABC1D23' / 'ABC1234'."""
    m = _PLACA.search((texto or "").upper())
    return (m.group(1) + m.group(2)) if m else None


def _cat_id(nome):
    r = db.query("SELECT id, pote FROM categorias WHERE nome=%s", (nome,))
    return (r[0]["id"], r[0]["pote"]) if r else (None, "NENHUM")


def classificar(descricao, valor, pluggy_categoria=None, conta_tipo="CORRENTE"):
    """Retorna dict {tipo, categoria_id, pote, veiculo_id}."""
    desc = descricao or ""
    out = {"tipo": None, "categoria_id": None, "subcategoria_id": None, "pote": "NENHUM", "veiculo_id": None}
    cat_regra = None

    # 1) regra do usuario (mais especifica primeiro)
    r = db.query("""SELECT r.categoria_id, r.subcategoria_id, r.tipo, r.veiculo_id, c.pote FROM regras r
                    LEFT JOIN categorias c ON c.id=r.categoria_id
                    WHERE %s ILIKE r.padrao AND (r.valor IS NULL OR r.valor = abs(%s))
                    ORDER BY (r.valor IS NOT NULL) DESC, length(r.padrao) DESC LIMIT 1""", (desc, valor))
    # regra de RECEITA so vale pra entrada (ex.: GM -> salario); saida pro mesmo nome segue o fluxo normal
    if r and not (r[0]["tipo"] == "RECEITA" and valor < 0):
        out.update(categoria_id=r[0]["categoria_id"], pote=r[0]["pote"] or "NENHUM",
                   veiculo_id=r[0]["veiculo_id"], tipo=r[0]["tipo"], subcategoria_id=r[0]["subcategoria_id"])
        cat_regra = r[0]["categoria_id"]

    # 2) de/para da categoria do Pluggy
    if out["categoria_id"] is None and pluggy_categoria:
        m = db.query("""SELECT cp.categoria_id, c.pote FROM categorias_pluggy cp
                        JOIN categorias c ON c.id=cp.categoria_id
                        WHERE %s ILIKE cp.padrao ORDER BY length(cp.padrao) DESC LIMIT 1""",
                     (pluggy_categoria,))
        if m:
            out.update(categoria_id=m[0]["categoria_id"], pote=m[0]["pote"])

    # 3) tipo a partir da categoria / sinal
    nome = ""
    if out["categoria_id"]:
        nome = db.query("SELECT nome FROM categorias WHERE id=%s", (out["categoria_id"],))[0]["nome"]
    d = desc.upper()
    eh_pag_fatura = ("PAGAMENTO DE FATURA" in d or "PAGAMENTO FATURA" in d or "PAG FATURA" in d
                     or (conta_tipo == "CARTAO" and valor > 0 and "PAGAMENTO" in d))
    if out["tipo"] is None:
        if eh_pag_fatura or nome == "Pagamento de fatura":
            out["tipo"] = "PAG_FATURA"
        elif nome == "Transferência entre contas":
            out["tipo"] = "TRANSFERENCIA"
        elif out["pote"] == "INV":
            out["tipo"] = "INVESTIMENTO"
        elif valor > 0 and out["pote"] in ("NEC", "DES"):
            out["tipo"] = "DESPESA"          # estorno/devolucao: valor positivo DESCONTA do pote
        elif valor > 0:
            out["tipo"] = "RECEITA"
        else:
            out["tipo"] = "DESPESA"

    if out["tipo"] == "PAG_FATURA":
        out["categoria_id"], out["pote"] = _cat_id("Pagamento de fatura")
    # credito no cartao que nao e pagamento nem estorno categorizado = estorno generico
    if conta_tipo == "CARTAO" and valor > 0 and out["tipo"] == "RECEITA":
        out["tipo"] = "DESPESA"
        out["categoria_id"], out["pote"] = _cat_id("Outros")

    if out["tipo"] == "DESPESA" and out["categoria_id"] is None:
        out["categoria_id"], out["pote"] = _cat_id("Outros")
    if out["tipo"] in ("RECEITA", "TRANSFERENCIA", "PAG_FATURA"):
        out["pote"] = "NENHUM"

    if out["categoria_id"] != cat_regra:              # categoria trocada depois da regra: subcategoria nao vale mais
        out["subcategoria_id"] = None
    if out["veiculo_id"] is None:
        p = placa_no_texto(desc)
        if p:
            v = db.query("SELECT id FROM veiculos WHERE placa=%s", (p,))
            out["veiculo_id"] = v[0]["id"] if v else None
    return out
