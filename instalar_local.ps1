# Instala o app pessoal NESTE computador: banco, Python e primeira importacao do Pluggy.
# Rodar no PowerShell, dentro da pasta app-pessoal:   powershell -ExecutionPolicy Bypass -File .\instalar_local.ps1
$ErrorActionPreference = "Stop"
$env:PGCLIENTENCODING = "UTF8"   # sem isso o psql le os .sql como WIN1252 e quebra os acentos
$raiz = $PSScriptRoot
$envFile = Join-Path $raiz "backend\.env"

function Set-EnvVar($chave, $valor) {
    $txt = [IO.File]::ReadAllText($envFile)
    $txt = [regex]::Replace($txt, "(?m)^$chave=.*$", "$chave=$valor")
    [IO.File]::WriteAllText($envFile, $txt, (New-Object Text.UTF8Encoding($false)))
}

Write-Host "`n[1/5] Procurando o PostgreSQL..." -ForegroundColor Cyan
$psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $psql) {
    Write-Host "PostgreSQL NAO encontrado. Instale a versao 16+ em https://www.postgresql.org/download/windows/ (porta 5432) e rode este script de novo." -ForegroundColor Red
    exit 1
}
Write-Host "   achei: $psql"

# Usa a senha do postgres que o ERP local ja guarda (crm-incorporadora\backend\.env); so pergunta se falhar.
$erpEnv = Join-Path (Split-Path $raiz -Parent) "crm-incorporadora\backend\.env"
$env:PGPASSWORD = ""
if (Test-Path $erpEnv) {
    $linha = Select-String -Path $erpEnv -Pattern '^PGPASSWORD=(.*)$' | Select-Object -First 1
    if ($linha) { $env:PGPASSWORD = $linha.Matches[0].Groups[1].Value.Trim() }
}
& $psql -U postgres -h 127.0.0.1 -d postgres -tAc "select 1" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   senha do postgres lida do .env do ERP local -- OK"
} else {
    $sp = Read-Host "Senha do usuario 'postgres' (nao achei/nao funcionou a do ERP)" -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sp))
    & $psql -U postgres -h 127.0.0.1 -d postgres -tAc "select 1" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "Senha do postgres recusada." -ForegroundColor Red; exit 1 }
}

Write-Host "`n[2/5] Criando banco 'app_pessoal' e usuario proprio (separado do ERP)..." -ForegroundColor Cyan
$senhaApp = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")).Substring(0, 32)
& $psql -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -v "senha=$senhaApp" -q -f (Join-Path $raiz "database\01_criar_banco.sql")
if ($LASTEXITCODE -ne 0) { exit 1 }
Set-EnvVar "PGPASSWORD" $senhaApp
Set-EnvVar "PGHOST" "localhost"
Set-EnvVar "PGUSER" "app_pessoal"
Set-EnvVar "PGDATABASE" "app_pessoal"
$tok = [IO.File]::ReadAllText($envFile)
if ($tok -match "(?m)^APP_TOKEN=TROCAR\s*$") { Set-EnvVar "APP_TOKEN" ([guid]::NewGuid().ToString("N")) }

$env:PGPASSWORD = $senhaApp
$existe = & $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -tAc "select to_regclass('public.contas') is not null"
if ($existe -eq "t") {
    Write-Host "   tabelas ja existem -- pulando schema e seed"
} else {
    & $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -v ON_ERROR_STOP=1 -q -f (Join-Path $raiz "database\02_schema.sql")
    if ($LASTEXITCODE -ne 0) { exit 1 }
    & $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -v ON_ERROR_STOP=1 -q -f (Join-Path $raiz "database\03_seed.sql")
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "   tabelas e categorias criadas"
}

Write-Host "`n[3/5] Preparando o Python (.venv)..." -ForegroundColor Cyan
$py = Join-Path $raiz ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { py -m venv (Join-Path $raiz ".venv") }
& $py -m pip install -q --disable-pip-version-check -r (Join-Path $raiz "requirements.txt")
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`n[4/5] Primeira importacao do Pluggy (90 dias)..." -ForegroundColor Cyan
Push-Location (Join-Path $raiz "backend")
& $py pluggy.py sync --dias 90
Pop-Location

Write-Host "`n[5/5] Resumo do que entrou:" -ForegroundColor Cyan
& $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -c @"
select c.banco, c.tipo, count(l.id) lancamentos, min(l.data) de, max(l.data) ate
  from contas c left join lancamentos l on l.conta_id = c.id group by 1,2 order by 1,2;
"@
& $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -c @"
select to_char(data,'YYYY-MM') mes,
       sum(case when tipo='RECEITA' then valor else 0 end)::numeric(12,2) receitas,
       sum(case when pote='NEC' then -valor else 0 end)::numeric(12,2) necessidades,
       sum(case when pote='DES' then -valor else 0 end)::numeric(12,2) desejos,
       sum(case when pote='INV' then -valor else 0 end)::numeric(12,2) investir
  from lancamentos where data <= current_date group by 1 order by 1;
"@
& $psql -U app_pessoal -h 127.0.0.1 -d app_pessoal -c "select nivel, titulo, texto from notificacoes order by id desc limit 5;"
Remove-Item Env:PGPASSWORD
Write-Host "`nPronto. Para subir a API:  cd backend ; ..\.venv\Scripts\python.exe app.py" -ForegroundColor Green
