BEGIN;
INSERT INTO categorias (nome, pote) VALUES
 ('Moradia','NEC'),('Mercado','NEC'),('Contas da casa','NEC'),('Saúde','NEC'),('Farmácia','NEC'),
 ('Combustível','NEC'),('Transporte','NEC'),('Carro - manutenção','NEC'),('Educação','NEC'),
 ('Seguros','NEC'),('Impostos e taxas','NEC'),('Juros e encargos','NEC'),('Empréstimos e financiamentos','NEC'),('Pets','NEC'),
 ('Restaurantes','DES'),('Delivery','DES'),('Lazer','DES'),('Compras','DES'),('Assinaturas','DES'),
 ('Viagem','DES'),('Beleza e cuidados','DES'),('Presentes','DES'),('Outros','DES'),
 ('Investimentos','INV'),('Reserva de emergência','INV'),
 ('Salário / renda','NENHUM'),('Retirada de lucro','NENHUM'),('Reembolso da empresa','NENHUM'),('Empréstimo recebido','NENHUM'),('Dinheiro de terceiros','NENHUM'),('Compra de veículo','NENHUM'),('Rendimentos','NENHUM'),('Transferência entre contas','NENHUM'),('Pagamento de fatura','NENHUM');

-- De/para das categorias do Pluggy (ILIKE). Ajuste depois de ver as reais no sync_log.
INSERT INTO categorias_pluggy (padrao, categoria_id)
SELECT p, (SELECT id FROM categorias WHERE nome = c) FROM (VALUES
 ('%groceries%','Mercado'),('%supermarket%','Mercado'),
 ('%rent%','Moradia'),('%housing%','Moradia'),
 ('%utilities%','Contas da casa'),('%electricity%','Contas da casa'),('%water%','Contas da casa'),('%internet%','Contas da casa'),('%telecom%','Contas da casa'),
 ('%pharmac%','Farmácia'),('%health%','Saúde'),('%hospital%','Saúde'),
 ('%gas station%','Combustível'),('%fuel%','Combustível'),
 ('%taxi%','Transporte'),('%ride%','Transporte'),('%public transport%','Transporte'),('%parking%','Transporte'),('%toll%','Transporte'),
 ('%vehicle%','Carro - manutenção'),('%automotive%','Carro - manutenção'),
 ('%education%','Educação'),('%insurance%','Seguros'),('%tax%','Impostos e taxas'),('%bank fees%','Impostos e taxas'),
 ('%food delivery%','Delivery'),('%eating out%','Restaurantes'),('%restaurant%','Restaurantes'),
 ('%leisure%','Lazer'),('%entertainment%','Lazer'),('%streaming%','Assinaturas'),('%subscription%','Assinaturas'),('%digital services%','Assinaturas'),
 ('%shopping%','Compras'),('%clothing%','Compras'),('%electronics%','Compras'),
 ('%travel%','Viagem'),('%airline%','Viagem'),('%hotel%','Viagem'),('%lodging%','Viagem'),
 ('%beauty%','Beleza e cuidados'),('%gift%','Presentes'),('%donation%','Presentes'),
 ('%investment%','Investimentos'),
 ('%salary%','Salário / renda'),('%income%','Salário / renda'),('%interest%','Rendimentos'),
 ('%credit card payment%','Pagamento de fatura'),
 ('%interests charged%','Juros e encargos'),('%late payment%','Juros e encargos'),('%overdraft%','Juros e encargos'),
 ('%proceeds interests%','Rendimentos'),('%dividends%','Rendimentos'),
 ('%tax on financial operations%','Impostos e taxas'),
 ('%loans%','Empréstimos e financiamentos'),('%financing%','Empréstimos e financiamentos'),
 ('%school%','Educação'),('%pet supplies%','Pets'),('%vet%','Pets'),
 ('%food and drinks%','Restaurantes'),('%transfer - internal%','Transferência entre contas'),
 ('%same person transfer%','Transferência entre contas')
) v(p, c);

INSERT INTO listas (nome) VALUES ('Mercado'),('Farmácia'),('Casa');
INSERT INTO configuracoes (chave, valor) VALUES ('TITULAR_NOME','DJONATHAN');
COMMIT;
