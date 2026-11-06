-- Rodar conectado como postgres:  psql -U postgres -v senha=XXXX -f 01_criar_banco.sql
-- Pode rodar de novo sem erro (cria so o que falta; atualiza a senha).
SELECT format('CREATE ROLE app_pessoal LOGIN PASSWORD %L', :'senha')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_pessoal') \gexec
SELECT format('ALTER ROLE app_pessoal PASSWORD %L', :'senha') \gexec
SELECT 'CREATE DATABASE app_pessoal OWNER app_pessoal ENCODING ''UTF8'' TEMPLATE template0'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'app_pessoal') \gexec
-- O usuario app_pessoal nao recebe nenhuma permissao nas tabelas do ERP (banco crm_incorporadora).
