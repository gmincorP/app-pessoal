# App pessoal (50/30/20)

Projeto **separado do ERP**: pasta, repositório, banco (`app_pessoal`) e serviço (porta **5100**) próprios.
Só divide o servidor (VPS) e o PostgreSQL instalado.

## Estrutura
```
app-pessoal/
├── database/  01_criar_banco.sql · 02_schema.sql · 03_seed.sql
└── backend/   app.py (API) · pluggy.py (Open Finance) · classificar.py (categoria/pote/placa)
               db.py · notificar.py (sino -- nenhuma falha silenciosa) · .env.example
```

## 1. Pluggy (no celular, ~10 min)
1. Crie conta em **meu.pluggy.ai** e conecte Nubank, Mercado Pago e Inter (autoriza no app de cada banco).
2. Crie conta em **dashboard.pluggy.ai** → crie uma aplicação → copie **Client ID** e **Client Secret**.
3. Ative o conector **MeuPluggy** na aplicação e conecte por ele → anote o **Item ID** de cada banco.
4. Coloque tudo em `backend/.env` (copie de `.env.example`).

## 2. Banco
```powershell
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $psql -U postgres -f .\database\01_criar_banco.sql          # troque a senha antes
& $psql -U app_pessoal -d app_pessoal -f .\database\02_schema.sql
& $psql -U app_pessoal -d app_pessoal -f .\database\03_seed.sql
```

## 3. Rodar
```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd backend
..\.venv\Scripts\python.exe pluggy.py sync --dias 90     # carga inicial
..\.venv\Scripts\python.exe pluggy.py categorias         # categorias do Pluggy sem de/para
..\.venv\Scripts\python.exe app.py                       # API em http://localhost:5100
```

## 4. Sincronizar todo dia às 06:00 (Agendador de Tarefas)
```powershell
schtasks /Create /TN "AppPessoal-Pluggy" /SC DAILY /ST 06:00 /F /TR "\"C:\AppPessoal\.venv\Scripts\python.exe\" \"C:\AppPessoal\backend\pluggy.py\" sync"
```

## Regras de negócio
- Saída = valor negativo. Compra no cartão conta no pote **na data da compra**; pagar a fatura é `PAG_FATURA` (não conta de novo).
- Pix/TED para o próprio nome = `TRANSFERENCIA` (não é despesa nem receita).
- Classificação: regra que você ensinou → de/para da categoria do Pluggy → "Outros".
- Notificação do celular cria lançamento `PROVISORIO`; o Pluggy confirma no dia seguinte (mesmo valor, conta, ±2 dias), sem duplicar.
- Toda falha (Pluggy fora, conexão vencida, erro de API) vai pra tabela `notificacoes` (sino).
- **Para classificar** (`fila.py`, tela `#fila`): gastos pessoais sem categoria ou em "Outros" + notas com item a revisar.
  Cada um vem com 3 categorias sugeridas e o motivo (pela loja, pela categoria do banco, pelas mais usadas).
- **Cupom fiscal por item** (`nfce.py` + `fila.py`, tela `#nota-<id>`): o link do QR da NFC-e é lido na SEFAZ,
  a nota se liga sozinha ao gasto do banco (mesmo valor, até 4 dias) e cada item ganha categoria
  (código de barras → palavra do cupom → revisão). Nota concluída conta nos potes **por item**
  (view `lancamentos_efetivos`); o valor continua sendo o do banco, rateado entre os itens.
  Teste: `python _teste_fila.py` com `PGDATABASE` apontando para um banco de teste.

## Onde roda (desde 24/11/2026)
Na **VPS**, junto com o CRM: pasta `C:\AppPessoal`, serviço Windows **AppPessoal** (nssm, porta 5100,
firewall só Tailscale) e banco `app_pessoal` no PostgreSQL 18 da VPS.
Acesso: `http://100.89.98.127:5100` (Tailscale). Logs em `C:\AppPessoal\logs\`.
- **Pluggy:** tarefa agendada `AppPessoal-Pluggy` (SYSTEM), todo dia às 06:00 → `logs\pluggy.log`.
- **Atualização:** tarefa `AppPessoal-AutoDeploy` a cada 5 min roda `ops\autodeploy.ps1`: se o `main` do
  GitHub mudou, faz pull, confere a sintaxe e reinicia o serviço; se não subir, volta a versão e avisa no sino.
  Ou seja: **código novo = push no `main`**, e em até 5 min está no ar.
- A cópia do PC (`C:\Sistemas claude\app-pessoal`) virou só o clone de desenvolvimento; o banco local
  ficou como backup de 24/11 e não é mais atualizado.

## Próximas etapas
- Roteador WhatsApp (5674 pessoal / 2789 empresa, ponte com o ERP por token)
- Leitor de notificações no app Android (tempo real)
- Telas do app (layout 1) consumindo `/api/resumo`
- Carros por placa, listas e lembretes
