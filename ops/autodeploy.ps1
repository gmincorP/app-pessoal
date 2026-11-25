# Atualizacao automatica do app pessoal na VPS (tarefa agendada "AppPessoal-AutoDeploy", a cada 5 min).
# Se o ramo main do GitHub mudou: git pull, confere a sintaxe do Python e reinicia o servico AppPessoal.
# Falhou? avisa no sino do app (tabela notificacoes) e volta para a versao anterior.
$ErrorActionPreference = "Continue"
$raiz = "C:\AppPessoal"
$git  = "C:\Program Files\Git\cmd\git.exe"
$nssm = "C:\ProgramData\chocolatey\bin\nssm.exe"
$py   = "$raiz\.venv\Scripts\python.exe"
$log  = "$raiz\logs\deploy.log"

function Log($m) { Add-Content $log ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) }
function Sino($titulo, $texto, $nivel = "ERRO") {
    Push-Location "$raiz\backend"
    & $py -c "import sys, notificar; notificar.notificar(sys.argv[1], sys.argv[2], sys.argv[3])" $titulo $texto $nivel 2>&1 | Out-Null
    Pop-Location
}

& $git -C $raiz fetch -q origin main 2>&1 | Out-Null
$local  = (& $git -C $raiz rev-parse HEAD).Trim()
$remoto = (& $git -C $raiz rev-parse origin/main).Trim()
if ($local -eq $remoto) { exit 0 }

if (& $git -C $raiz status --porcelain --untracked-files=no) {
    Log "abortado: alteracao local nao commitada na VPS"
    Sino "App pessoal: atualização não aplicada" "Há alteração local na VPS (C:\AppPessoal). Atualização $($remoto.Substring(0,7)) não foi aplicada."
    exit 1
}

Log "atualizando $($local.Substring(0,7)) -> $($remoto.Substring(0,7))"
& $git -C $raiz merge -q --ff-only origin/main 2>&1 | % { Log "  $_" }
& $py -m pip install -q --disable-pip-version-check -r "$raiz\requirements.txt" 2>&1 | % { Log "  pip: $_" }
& $py -m py_compile "$raiz\backend\app.py" "$raiz\backend\fila.py" "$raiz\backend\pluggy.py" 2>&1 | % { Log "  $_" }
$compilou = ($LASTEXITCODE -eq 0)

if ($compilou) {
    & $nssm restart AppPessoal 2>&1 | Out-Null
    Start-Sleep 6
    try { $ok = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5100/api/saude -TimeoutSec 15).StatusCode -eq 200 } catch { $ok = $false }
} else { $ok = $false }

if ($ok) {
    Log "ok: rodando $($remoto.Substring(0,7))"
    Sino "App pessoal atualizado" "Versão $($remoto.Substring(0,7)) no ar." "INFO"
    exit 0
}

Log "FALHOU -- voltando para $($local.Substring(0,7))"
& $git -C $raiz reset -q --hard $local 2>&1 | % { Log "  $_" }
& $nssm restart AppPessoal 2>&1 | Out-Null
Sino "App pessoal: atualização falhou" "A versão $($remoto.Substring(0,7)) não subiu (veja C:\AppPessoal\logs\deploy.log). O app voltou para $($local.Substring(0,7)). Corrija e publique de novo."
exit 1
