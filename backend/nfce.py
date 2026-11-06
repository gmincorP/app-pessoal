"""Leitura da NFC-e (cupom fiscal eletronico) pela pagina publica da SEFAZ.

Entrada: o link do QR code do cupom (ex.: https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=CHAVE|2|1|1|HASH)
ou, em ultimo caso, so a chave de 44 digitos (a SEFAZ costuma exigir o link completo do QR).

Saida de ler(): dict com chave, emitente, cnpj, emitida_em (datetime), total, desconto e itens
[{ordem, descricao, codigo, ean, qtd, unidade, valor_unit, valor_total}].

A pagina publica (layout padrao SVRS: #tabResult, span.txtTit / RCod / Rqtd / RUN / RvlUnit / valor)
NAO traz NCM nem o desconto por item -- so o desconto total. O rateio do desconto e feito depois,
proporcional, na hora de dividir o lancamento do banco entre os itens.
"""
import html as _html
import re
import urllib.parse
import urllib.request
from datetime import datetime

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
TIMEOUT = 25
URL_RS = "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p={p}"


class NfceErro(Exception):
    pass


def chave_de(texto):
    """44 digitos da chave de acesso, vindos do link do QR (p=CHAVE|...) ou do texto digitado (com ou sem espacos)."""
    t = urllib.parse.unquote(texto or "")
    m = re.search(r"[?&]p=(\d{44})", t)
    if m:
        return m.group(1)
    so = re.sub(r"\D", "", t)
    m = re.search(r"\d{44}", so)
    return m.group(0) if m else None


def url_de(texto):
    """Link para consultar. Se veio o link do QR, usa ele; se veio so a chave, monta o link do RS (sem hash)."""
    t = (texto or "").strip()
    if re.match(r"https?://", t, re.I):
        return t
    ch = chave_de(t)
    if not ch:
        raise NfceErro("não achei a chave de acesso (44 dígitos) nem o link do QR code")
    return URL_RS.format(p=ch + "|2|1|1|")


def _baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        bruto = r.read()
        cs = r.headers.get_content_charset() or "utf-8"
    try:
        return bruto.decode(cs)
    except (LookupError, UnicodeDecodeError):
        return bruto.decode("latin-1")


def buscar(texto):
    """Baixa a pagina da nota. A pagina do RS embrulha a consulta num iframe do portal SVRS: segue o iframe."""
    url = url_de(texto)
    try:
        pag = _baixar(url)
        if "tabResult" not in pag:
            m = re.search(r"<iframe[^>]+src=[\"']([^\"']+)[\"']", pag, re.I)
            if m:
                pag = _baixar(urllib.parse.urljoin(url, _html.unescape(m.group(1))))
    except Exception as e:
        raise NfceErro("não consegui abrir a página da SEFAZ: %s" % e)
    return url, pag


def _num(s):
    s = re.sub(r"[^\d,.-]", "", s or "")
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _txt(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", _html.unescape(s)).strip()


def _span(bloco, classe):
    m = re.search(r"<span[^>]*class=[\"'][^\"']*\b%s\b[^\"']*[\"'][^>]*>(.*?)</span>" % classe, bloco, re.I | re.S)
    return _txt(m.group(1)) if m else ""


def ler_html(pag, chave=None):
    """Extrai cabecalho e itens da pagina. Levanta NfceErro se nao achar nenhum item."""
    itens = []
    tab = re.search(r"id=[\"']tabResult[\"'](.*?)</table>", pag, re.I | re.S)
    corpo = tab.group(1) if tab else pag
    for bloco in re.findall(r"<tr[^>]*>(.*?)</tr>", corpo, re.I | re.S):
        if "txtTit" not in bloco or ("Rqtd" not in bloco and "RvlUnit" not in bloco):
            continue
        desc = _span(bloco, "txtTit")
        cod = re.sub(r"\D", "", _span(bloco, "RCod"))
        qtd = _num(_span(bloco, "Rqtd").split(":")[-1])
        un = _span(bloco, "RUN").split(":")[-1].strip()
        vu = _num(_span(bloco, "RvlUnit").split(":")[-1])
        vt = _num(_span(bloco, "valor"))
        if not desc or vt is None:
            continue
        itens.append({"ordem": len(itens) + 1, "descricao": desc[:200], "codigo": cod or None,
                      "ean": cod if len(cod) in (8, 12, 13, 14) else None,
                      "qtd": qtd, "unidade": un[:10] or None, "valor_unit": vu, "valor_total": round(vt, 2)})
    if not itens:
        if re.search(r"captcha|n[aã]o foi poss[ií]vel|inexistente|inv[aá]lid", pag, re.I):
            raise NfceErro("a SEFAZ não mostrou a nota (link incompleto, nota cancelada ou consulta bloqueada)")
        raise NfceErro("a página da SEFAZ não trouxe os itens da nota")

    texto = _txt(pag)
    emit = re.search(r"id=[\"']u20[\"'][^>]*>(.*?)</", pag, re.I | re.S)
    cnpj = re.search(r"CNPJ:?\s*([\d./-]{14,18})", texto)
    em = re.search(r"Emiss[ãa]o:?\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)", texto)
    emitida = None
    if em:
        hora = em.group(2) if em.group(2).count(":") == 2 else em.group(2) + ":00"
        emitida = datetime.strptime(em.group(1) + " " + hora, "%d/%m/%Y %H:%M:%S")

    def _total(rotulo):
        m = re.search(rotulo + r"[^<]*</label>\s*<span[^>]*>([^<]+)</span>", pag, re.I | re.S)
        return _num(m.group(1)) if m else None

    total = _total(r"Valor a pagar")
    desconto = _total(r"Descontos?") or 0.0
    if total is None:
        total = round(sum(i["valor_total"] for i in itens) - desconto, 2)
    if not chave:
        ch = re.search(r"(\d{4}(?:\s?\d{4}){10})", texto)
        chave = re.sub(r"\s", "", ch.group(1)) if ch else None
    return {"chave": chave, "emitente": _txt(emit.group(1))[:200] if emit else None,
            "cnpj": re.sub(r"\D", "", cnpj.group(1)) if cnpj else None, "emitida_em": emitida,
            "total": round(total, 2), "desconto": round(desconto, 2), "itens": itens}


def ler(texto):
    """Do link/chave ate a nota lida: (url, dict)."""
    url, pag = buscar(texto)
    return url, ler_html(pag, chave_de(texto) or chave_de(url))
