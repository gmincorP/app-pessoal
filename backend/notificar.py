"""Sino do app pessoal: toda automacao que falhar avisa aqui. Falha silenciosa e proibida."""
import datetime
import db


def _log(msg):
    print(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def notificar(titulo, texto=None, nivel="ERRO"):
    _log(f"[{nivel}] {titulo} -- {texto or ''}")
    try:
        db.execute("INSERT INTO notificacoes (nivel, titulo, texto) VALUES (%s,%s,%s)",
                   (nivel, titulo[:200], (texto or "")[:4000]))
    except Exception as e:          # se nem o banco responde, ao menos fica no log
        _log(f"[SINO] nao consegui gravar a notificacao: {e}")
