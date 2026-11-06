# -*- coding: utf-8 -*-
"""pluggy_client.py -- cliente da API Pluggy (Open Finance) REAPROVEITAVEL.

Feito para ser COPIADO igual entre projetos (app pessoal, ERP GM): nao conhece banco de dados,
categorias nem regras de negocio de ninguem. So fala com a API e devolve dados normalizados.
Dependencias: so biblioteca padrao do Python (json, urllib, time, datetime).

Uso basico:
    from pluggy_client import PluggyClient
    pc = PluggyClient(client_id, client_secret)          # ou PluggyClient.do_env()
    for conta in pc.contas(item_id):
        for tx in pc.transacoes(conta["id"], desde="2026-07-01"):
            n = normalizar_transacao(tx, tipo_conta(conta))
            print(n["data"], n["valor"], n["descricao"])

Licoes aprendidas (out/2026) -- NAO desfazer:
  * GET /transactions (v1) responde 410 ENDPOINT_DEPRECATED -> usar GET /v2/transactions.
  * /v2/transactions NAO aceita pageSize (400 "property pageSize should not exist"); pagina por cursor
    no campo `next`, que deve ser reenviado EXATAMENTE como veio (re-encodar quebra o base64).
  * Via conector MeuPluggy o item se chama "MeuPluggy": o banco real so aparece no NOME da conta.
  * Sinal do valor: conta BANK -> DEBIT ja vem negativo; CARTAO -> compra vem POSITIVA (type DEBIT).
    normalizar_transacao() devolve sempre: saida = negativo, entrada = positivo.
  * Itens pertencem a UMA aplicacao do dashboard: credencial de outra aplicacao -> 404 no item.
  * Cartao traz parcelas FUTURAS (data ate meses a frente) com creditCardMetadata.installmentNumber.
  * creditCardMetadata.billForecastDate (AAAA-MM) = MES DO VENCIMENTO da fatura em que a compra cai;
    creditCardMetadata.cardNumber = FINAL do cartao fisico/virtual usado (separa cartao adicional/da empresa).
  * /bills traz billClosingDate, dueDate, totalAmount, minimumPaymentAmount, financeCharges[] e payments[]
    (no Nubank payments[] pode vir vazio mesmo pago -> conferir pelos creditos "Pagamento recebido").
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

__version__ = "1.1.0 (2026-10-06)"
BASE_URL = "https://api.pluggy.ai"


class PluggyErro(Exception):
    """Erro da API. `status` = HTTP (0 = sem conexao), `codigo` = codeDescription do Pluggy."""

    def __init__(self, msg, status=0, codigo=None, corpo=None):
        super().__init__(msg)
        self.status, self.codigo, self.corpo = status, codigo, corpo


class PluggyClient:
    TENTATIVAS = 3                     # para 429 / 5xx / queda de rede
    VALIDADE_TOKEN = 110 * 60          # apiKey vale 2h; renova antes

    def __init__(self, client_id, client_secret, base_url=BASE_URL, timeout=60):
        if not client_id or not client_secret:
            raise PluggyErro("client_id/client_secret vazios")
        self.client_id, self.client_secret = client_id, client_secret
        self.base_url, self.timeout = base_url.rstrip("/"), timeout
        self._token, self._token_em = None, 0.0

    @classmethod
    def do_env(cls, prefixo="PLUGGY_"):
        """Le {prefixo}CLIENT_ID e {prefixo}CLIENT_SECRET do ambiente (ex.: .env ja carregado)."""
        return cls(os.getenv(prefixo + "CLIENT_ID"), os.getenv(prefixo + "CLIENT_SECRET"))

    # ---------------------------------------------------------------- HTTP
    def _http(self, metodo, caminho, corpo=None, autenticado=True):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        ultimo = None
        for tentativa in range(self.TENTATIVAS):
            req = urllib.request.Request(self.base_url + caminho, data=dados, method=metodo)
            req.add_header("Content-Type", "application/json")
            req.add_header("Accept", "application/json")
            if autenticado:
                req.add_header("X-API-KEY", self.api_key())
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    txt = r.read().decode() or "{}"
                    return json.loads(txt)
            except urllib.error.HTTPError as e:
                txt = e.read().decode(errors="replace")
                try:
                    j = json.loads(txt)
                except ValueError:
                    j = {}
                ultimo = PluggyErro(f"{metodo} {caminho} -> HTTP {e.code}: {j.get('message') or txt[:300]}",
                                    e.code, j.get("codeDescription"), txt[:2000])
                if e.code == 401 and autenticado and tentativa == 0:
                    self._token = None          # token expirou antes da hora: renova e tenta de novo
                    continue
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 ** tentativa * 2)
                    continue
                raise ultimo
            except urllib.error.URLError as e:
                ultimo = PluggyErro(f"{metodo} {caminho} -> sem conexao: {e.reason}", 0)
                time.sleep(2 ** tentativa * 2)
        raise ultimo

    def api_key(self):
        if not self._token or time.time() - self._token_em > self.VALIDADE_TOKEN:
            r = self._http("POST", "/auth", {"clientId": self.client_id, "clientSecret": self.client_secret},
                           autenticado=False)
            self._token, self._token_em = r["apiKey"], time.time()
        return self._token

    # ---------------------------------------------------------------- recursos
    def item(self, item_id):
        """Status da conexao: UPDATED | UPDATING | LOGIN_ERROR | OUTDATED | WAITING_USER_INPUT ..."""
        return self._http("GET", f"/items/{item_id}")

    def atualizar_item(self, item_id):
        """Pede ao Pluggy para buscar dados novos agora (MeuPluggy ja atualiza sozinho 1x/dia)."""
        return self._http("PATCH", f"/items/{item_id}", {})

    def contas(self, item_id):
        return self._http("GET", f"/accounts?itemId={item_id}").get("results", [])

    def transacoes(self, account_id, desde, ate=None, limite_paginas=500):
        """Gera as transacoes da conta (GET /v2/transactions, paginacao por cursor)."""
        base = "/v2/transactions"
        q = {"accountId": account_id, "dateFrom": str(desde)[:10]}
        if ate:
            q["dateTo"] = str(ate)[:10]
        caminho = base + "?" + urllib.parse.urlencode(q)
        for _ in range(limite_paginas):
            r = self._http("GET", caminho)
            for tx in r.get("results", []):
                yield tx
            nxt = r.get("next")
            if not nxt:
                return
            if nxt.startswith("http"):
                caminho = nxt.split(self.base_url, 1)[-1] if self.base_url in nxt else nxt.split("pluggy.ai", 1)[-1]
            elif nxt.startswith("/"):
                caminho = nxt
            elif nxt.startswith("?") or "=" in nxt:
                caminho = base + (nxt if nxt.startswith("?") else "?" + nxt)
            else:                                     # cursor puro: vai como veio (sem re-encodar)
                caminho = f"{base}?{urllib.parse.urlencode(q)}&cursor={nxt}"

    def faturas(self, account_id):
        """Faturas do cartao (GET /bills?accountId=): dueDate, totalAmount, minimumPaymentAmount..."""
        return self._http("GET", f"/bills?accountId={account_id}").get("results", [])

    def investimentos(self, item_id):
        return self._http("GET", f"/investments?itemId={item_id}").get("results", [])

    def identidade(self, item_id):
        return self._http("GET", f"/identity?itemId={item_id}")

    def criar_webhook(self, evento, url):
        """Ex.: criar_webhook('transactions/created', 'https://.../api/pluggy/webhook').
        Exige URL publica (https). Eventos uteis: item/updated, item/error, transactions/created."""
        return self._http("POST", "/webhooks", {"event": evento, "url": url})

    def webhooks(self):
        return self._http("GET", "/webhooks").get("results", [])


# -------------------------------------------------------------------- normalizacao (sem banco)
def tipo_conta(conta):
    """CORRENTE | CARTAO | INVESTIMENTO (a partir do type/subtype do Pluggy)."""
    t, sub = (conta.get("type") or "").upper(), (conta.get("subtype") or "").upper()
    if t == "CREDIT" or "CREDIT_CARD" in sub:
        return "CARTAO"
    if "INVEST" in t or "INVEST" in sub:
        return "INVESTIMENTO"
    return "CORRENTE"


_BANCOS = (("NU PAGAMENTOS", "Nubank"), ("NUBANK", "Nubank"), ("ULTRAVIOLET", "Nubank"),
           ("MERCADO PAGO", "Mercado Pago"), ("BANCO INTER", "Inter"), ("INTER ", "Inter"),
           ("CAIXA", "Caixa"), ("ITAU", "Itaú"), ("ITAÚ", "Itaú"), ("BRADESCO", "Bradesco"),
           ("SANTANDER", "Santander"), ("BANCO DO BRASIL", "Banco do Brasil"), ("SICREDI", "Sicredi"),
           ("SICOOB", "Sicoob"), ("C6", "C6 Bank"), ("BTG", "BTG"), ("XP ", "XP"))


def banco_da_conta(nome_conta, padrao=None):
    """Via MeuPluggy o conector se chama 'MeuPluggy': o banco real sai do nome da conta."""
    n = (nome_conta or "").upper() + " "
    for chave, banco in _BANCOS:
        if chave in n:
            return banco
    return padrao


def normalizar_fatura(bill):
    """Fatura do Pluggy -> dict estavel.
    ATENCAO: financeCharges mistura CUSTO (juros, multa, IOF) com SALDO CARREGADO da fatura anterior
    ("Saldo em atraso", "Saldo em rotativo", type OTHER). Saldo carregado NAO e custo: vai em `saldo_anterior`."""
    encargos, carregado, detalhe = 0.0, 0.0, []
    for f in bill.get("financeCharges") or []:
        v = float(f.get("amount") or 0)
        if not v:
            continue
        info = (f.get("additionalInfo") or "").strip()
        if info.lower().startswith("saldo em"):
            carregado += v
        else:
            encargos += v
            detalhe.append({"tipo": f.get("type"), "descricao": info, "valor": round(v, 2)})
    pags = []
    for p in bill.get("payments") or []:
        pags.append({"id": p.get("id"), "data": str(p.get("paymentDate") or "")[:10],
                     "valor": round(float(p.get("amount") or p.get("value") or 0), 2),
                     "tipo": p.get("valueType")})
    return {"id": bill["id"], "fechamento": str(bill.get("billClosingDate") or "")[:10] or None,
            "vencimento": str(bill.get("dueDate") or "")[:10], "mes": str(bill.get("dueDate") or "")[:7],
            "total": round(float(bill.get("totalAmount") or 0), 2),
            "minimo": round(float(bill.get("minimumPaymentAmount") or 0), 2),
            "encargos": round(encargos, 2), "encargos_detalhe": detalhe,
            "saldo_anterior": round(carregado, 2), "pagamentos": pags}


def limites_cartao(conta):
    """Limite APROVADO, CONFIGURADO pelo cliente (customizedLimitAmount), usado e disponivel sobre o configurado,
    + finais VIGENTES (titular + additionalCards). Final que nao esta na lista = cartao cancelado."""
    cd = conta.get("creditData") or {}
    aprovado = cd.get("creditLimit")
    config = None
    for l in cd.get("disaggregatedCreditLimits") or []:
        if l.get("customizedLimitAmount") and l.get("identificationNumber") in (conta.get("number"), None):
            config = l["customizedLimitAmount"]
            break
    if config is None:
        config = next((l["customizedLimitAmount"] for l in cd.get("disaggregatedCreditLimits") or []
                       if l.get("customizedLimitAmount")), None)
    usado = float(conta.get("balance") or 0)
    limite = float(config or aprovado or 0)
    vigentes = [conta.get("number")] + [a.get("number") for a in cd.get("additionalCards") or [] if a.get("number")]
    return {"aprovado": aprovado, "configurado": config, "usado": round(usado, 2),
            "disponivel": round(max(limite - usado, 0), 2) if limite else cd.get("availableCreditLimit"),
            "finais_vigentes": [f for f in vigentes if f], "status": cd.get("status"),
            "bandeira": cd.get("brand"), "nivel": cd.get("level")}


def banco_do_item(contas, item=None):
    """Banco de um item inteiro: o 1o nome de conta reconhecivel (cartao as vezes so diz 'GOLD')."""
    for c in contas:
        b = banco_da_conta(c.get("name")) or banco_da_conta(c.get("marketingName"))
        if b:
            return b
    return ((item or {}).get("connector") or {}).get("name") or "Banco"


def normalizar_transacao(tx, conta_tipo):
    """Transacao do Pluggy -> dict estavel, igual para qualquer projeto:
       id, data (AAAA-MM-DD), descricao, valor (saida NEGATIVO / entrada POSITIVO), pendente (bool),
       categoria_pluggy, parcela (n, total, data_compra) ou None, contraparte (nome/documento se vier)."""
    amount = float(tx.get("amount") or 0)
    tipo = (tx.get("type") or "").upper()
    if conta_tipo == "CARTAO":
        valor = abs(amount) if tipo == "CREDIT" else -abs(amount)   # compra no cartao vem positiva
    else:
        valor = -abs(amount) if tipo == "DEBIT" else abs(amount)
    cc = tx.get("creditCardMetadata") or {}
    parcela = None
    if cc.get("totalInstallments") and int(cc["totalInstallments"]) > 1:
        parcela = {"n": cc.get("installmentNumber"), "total": cc.get("totalInstallments"),
                   "data_compra": str(cc.get("purchaseDate") or "")[:10] or None}
    pd = tx.get("paymentData") or {}
    outro = pd.get("receiver") if valor < 0 else pd.get("payer")
    outro = outro or {}
    doc = (outro.get("documentNumber") or {}).get("value") if isinstance(outro.get("documentNumber"), dict) else outro.get("documentNumber")
    merchant = tx.get("merchant") or {}
    return {
        "id": tx["id"],
        "data": (tx.get("date") or "")[:10],
        "descricao": (tx.get("description") or "").strip() or "(sem descricao)",
        "valor": round(valor, 2),
        "pendente": (tx.get("status") or "").upper() == "PENDING",
        "categoria_pluggy": tx.get("category"),
        "parcela": parcela,
        "contraparte": {"nome": outro.get("name"), "documento": doc} if (outro.get("name") or doc) else None,
        "fatura_mes": cc.get("billForecastDate"),          # AAAA-MM do vencimento (so cartao)
        "cartao_final": cc.get("cardNumber"),              # final do plastico/virtual usado
        "mcc": cc.get("payeeMCC"),                         # codigo do tipo de estabelecimento
        "estabelecimento": merchant.get("businessName") or merchant.get("name"),
        "cnpj_estabelecimento": merchant.get("cnpj"),
        "bruto": tx,
    }


if __name__ == "__main__":       # teste rapido: python pluggy_client.py <item_id>
    import sys
    pc = PluggyClient.do_env()
    for it in sys.argv[1:]:
        cs = pc.contas(it)
        print(it[:8], banco_do_item(cs, pc.item(it)))
        for c in cs:
            print("  ", tipo_conta(c), c.get("name"), c.get("balance"))
