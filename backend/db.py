"""Acesso ao banco app_pessoal (pg8000, mesmo driver do ERP). Banco SEPARADO do ERP."""
import os
import threading
from decimal import Decimal
from contextlib import contextmanager
import pg8000.dbapi
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

_pool, _lock = [], threading.Lock()
_POOL_MAX = 5


def _conv(v):
    return float(v) if isinstance(v, Decimal) else v


def _new_conn():
    host = os.getenv("PGHOST", "localhost")
    if host.lower() == "localhost":
        host = "127.0.0.1"
    return pg8000.dbapi.connect(host=host, port=int(os.getenv("PGPORT", "5432")),
                                database=os.getenv("PGDATABASE", "app_pessoal"),
                                user=os.getenv("PGUSER", "app_pessoal"),
                                password=os.getenv("PGPASSWORD", ""))


def _borrow():
    with _lock:
        c = _pool.pop() if _pool else None
    if c is None:
        return _new_conn()
    try:
        cur = c.cursor(); cur.execute("SELECT 1"); cur.fetchall()
        return c
    except Exception:
        try: c.close()
        except Exception: pass
        return _new_conn()


def _devolver(c):
    with _lock:
        if len(_pool) < _POOL_MAX:
            _pool.append(c); return
    c.close()


@contextmanager
def transaction():
    """Bloco atomico: tudo ou nada. Use: with db.transaction() as cur: cur.execute(...)"""
    c = _borrow()
    try:
        cur = c.cursor()
        yield cur
        c.commit()
        _devolver(c)
    except Exception:
        try: c.rollback()
        except Exception: pass
        c.close()
        raise


def rows(cur):
    if cur.description is None:
        return []
    cols = [d[0] for d in cur.description]
    return [{k: _conv(v) for k, v in zip(cols, r)} for r in cur.fetchall()]


def query(sql, params=()):
    with transaction() as cur:
        cur.execute(sql, params)
        return rows(cur)


def execute(sql, params=()):
    with transaction() as cur:
        cur.execute(sql, params)
        try:
            return rows(cur)
        except Exception:
            return []
