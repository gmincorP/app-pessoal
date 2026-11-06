"""Apaga as TABELAS do banco app_pessoal (so dele), recria schema+seed lendo os .sql em UTF-8
e reimporta do Pluggy. Seguro: tudo que esta no banco hoje veio do Pluggy e volta na reimportacao.
Rodar: ..\\.venv\\Scripts\\python.exe recriar_e_importar.py"""
import os
import sys
import db
import pluggy

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
manuais = db.query("SELECT count(*) n FROM lancamentos WHERE origem <> 'PLUGGY'")[0]["n"]
if manuais:
    print(f"ATENCAO: ha {manuais} lancamentos que NAO vieram do Pluggy. Abortei para nao perder nada.")
    sys.exit(1)

with db.transaction() as cur:
    cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    for (t,) in cur.fetchall():
        cur.execute(f'DROP TABLE IF EXISTS "{t}" CASCADE')
print("tabelas antigas removidas")

for arq in ("02_schema.sql", "03_seed.sql"):
    sql = open(os.path.join(RAIZ, "database", arq), encoding="utf-8").read()
    linhas = [l for l in sql.splitlines() if not l.strip().startswith("--")]
    cmds = [c.strip() for c in "\n".join(linhas).split(";")]
    with db.transaction() as cur:
        for c in cmds:
            if c and c.upper() not in ("BEGIN", "COMMIT"):
                cur.execute(c)
    print(f"{arq} aplicado")

print(db.query("SELECT nome FROM categorias WHERE nome LIKE 'Transfer%%'"))
r = pluggy.sincronizar(90)
print(r)
