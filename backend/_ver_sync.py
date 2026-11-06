import db, subprocess
for r in db.query("SELECT id, inicio, fim, ok, novos, atualizados, left(coalesce(detalhe,''),120) d FROM sync_log ORDER BY id DESC LIMIT 12"):
    print(r)
out = subprocess.run('schtasks /query /fo LIST /v | findstr /i "Nome da tarefa TaskName Pr.xima Next Run Status app-pessoal pluggy sync"', shell=True, capture_output=True, text=True, encoding="cp850", errors="replace").stdout
print("\n".join(l for l in out.splitlines() if any(k in l.lower() for k in ("pluggy","sync","pessoal")))[:2000] or "nenhuma tarefa agendada com pluggy/sync/pessoal no nome")
