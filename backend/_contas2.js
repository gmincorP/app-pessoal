// ===================== CONTAS: extrato, caixinha, configuração do banco =====================
let EX=null, CXE=null, BC=null;
const EMOJIS=["🏦","💜","🧡","💙","💰","🐷","💳","🏠","🚗","⭐","🎯","📈"];
const urlBanco=n=>"#banco-"+encodeURIComponent(n);
function irItemConta(tipo,id,banco){
  if(tipo==="CARTAO"){ cartSel=+id; mesSel=null; location.hash="#cartao-"+id; }
  else if(tipo==="CAIXINHA") location.hash="#caixinha-"+id;
  else if(tipo==="INVESTIMENTO"||tipo==="NAO_ALOCADO") location.hash="#investimentos";
  else if(id && id!=="null") location.hash="#conta-"+id;
}

// ---------- extrato da conta (saldo depois de cada lançamento) ----------
async function telaExtrato(id){
  esqueleto();
  try{ EX=await api(`/api/contas/${id}/extrato?mes=${ym(mesAtual)}`); }catch(e){ return; }
  const c=EX.conta, nome=c.apelido||(c.manual&&c.tipo==="CORRENTE"?c.nome:rotuloConta(c).split(" · ")[0]);
  let ult="", out="";
  for(const i of EX.itens){
    if(i.data!==ult){ out+=`<div class="dia">${rotDia(i.data)}</div>`; ult=i.data; }
    ED["L"+i.id]=edItem(i,"L");
    out+=`<div class="mov" data-ed="L${i.id}"><div class="d"><span>${esc(i.descricao)}</span><small>${esc(catTxt(i)||i.tipo)}${i.status==="PROVISORIO"?" · pendente":""}</small></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="num" style="font-weight:600;white-space:nowrap;color:${i.valor>0?"var(--rec)":"var(--txt)"}">${brl(i.valor)}</span>
      <small class="num" style="color:var(--mut);font-size:11px;white-space:nowrap">saldo ${brl(i.saldo_apos)}</small></div></div>`;
  }
  const atual=ehMesAtual();
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar(nome, esc(c.banco)+(c.numero?" · "+esc(c.numero):"")+(c.manual?" · manual":""), `<a class="icon" href="${urlBanco(c.banco)}" aria-label="Configurar banco" style="color:var(--txt)">${ICO_CART.lapis}</a>`)}
    ${barraMes()}
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">${atual?"Saldo atual":"Saldo no fim do mês"}</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${(atual?c.saldo:EX.saldo_fim)<0?"var(--desp)":"var(--txt)"}">${brl(atual?c.saldo:EX.saldo_fim)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">início do mês <b class="num">${brl0(EX.saldo_inicio)}</b></span>
        <span class="chip">entrou <b class="num" style="color:var(--rec)">${brl0(EX.entradas)}</b></span>
        <span class="chip">saiu <b class="num" style="color:var(--desp)">${brl0(EX.saidas)}</b></span></div></div>
    <div class="cards">
      ${c.manual?`<button class="btn sec" id="ajSaldo">Ajustar saldo de hoje</button>`:""}
      ${EX.itens.length?`<section class="card" style="padding:8px 16px"><h2 style="margin:10px 0 0">Extrato</h2>${out}</section>
        <small style="color:var(--mut);text-align:center">O saldo ao lado de cada lançamento é calculado para trás a partir do saldo ${c.manual?"informado":"que o banco envia"}. Toque num lançamento para mudar a categoria.</small>`
        :`<div class="vazio-g">${SVG.vazio}<b style="color:var(--txt);font-size:17px">Nada aqui</b><span>Sem movimentos nesta conta no mês.</span></div>`}
    </div></div>${nav("contas")}`;
  document.getElementById("voltar").onclick=()=>voltar("#contas");
  navMes(()=>telaExtrato(id));
  ligarEdicao();
  if(document.getElementById("ajSaldo")) document.getElementById("ajSaldo").onclick=()=>{
    folha(`<b style="font-size:17px">Saldo de hoje em ${esc(nome)}</b><div class="form" style="margin-top:12px">
      <input id="ajV" inputmode="decimal" value="${String(c.saldo).replace(".",",")}"><div class="grade2"><button class="btn sec" id="ajC">Cancelar</button><button class="btn pri" id="ajOk">Salvar</button></div></div>`);
    document.getElementById("ajC").onclick=fecharSheet;
    document.getElementById("ajOk").onclick=async()=>{ await patch(`/api/contas/${id}`,{saldo_atual:numBR(document.getElementById("ajV").value)}); fecharSheet(); toast("Saldo ajustado"); telaExtrato(id); };
  };
}

// ---------- caixinha ----------
async function telaCaixinha(id){
  esqueleto();
  let d, ct; try{ [d,ct]=await Promise.all([api(`/api/caixinhas/${id}/extrato`), api("/api/contas")]); }catch(e){ return; }
  CXE={d, caixinhas:ct.caixinhas}; CONTAS=ct;
  const c=d.caixinha, pct=c.meta?Math.min(c.saldo/c.meta*100,100):null;
  let ult="", out="";
  for(const m of d.movimentos){
    if(m.data!==ult){ out+=`<div class="dia">${rotDia(m.data)}</div>`; ult=m.data; }
    const ap=m.valor>0;
    out+=`<div class="mov" data-mvc="${m.id}" role="button" style="cursor:pointer;${m.antes_do_inicio?"opacity:.55":""}"><div class="bola" style="background:${ap?"#13261C":"#3A2E1A"};color:${ap?"var(--inv)":"var(--des)"}">${ap?"↓":"↑"}</div>
      <div class="d"><span>${esc(m.descricao)}</span><small>${esc(m.banco)}${m.antes_do_inicio?" · antes do saldo informado (não soma)":""}</small></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span class="num" style="font-weight:600;color:${ap?"var(--inv)":"var(--des)"}">${ap?"+ ":"− "}${brl(Math.abs(m.valor))}</span>
      ${m.saldo_apos!=null?`<small class="num" style="color:var(--mut);font-size:11px">saldo ${brl(m.saldo_apos)}</small>`:""}</div></div>`;
  }
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar(c.nome, esc(c.banco)+(c.economia?" · conta como economia":" · fora da economia"), `<button class="icon" id="cxEdit" aria-label="Editar caixinha" style="color:var(--txt)">${ICO_CART.lapis}</button>`)}
    <div style="text-align:center;padding:10px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Saldo</div>
      <div class="num" style="font-size:34px;font-weight:700;color:var(--inv)">${brl(c.saldo)}</div>
      ${c.meta?`<div class="barra" style="height:8px;margin:10px 30px 4px"><i style="width:${pct.toFixed(0)}%;background:var(--inv)"></i></div>
        <small style="color:var(--mut)">${Math.round(pct)}% de ${brl0(c.meta)}${c.prazo?` · até ${dm(c.prazo)}/${c.prazo.slice(2,4)}`:""}</small>`:""}</div>
    <div class="cards">
      <section class="card" style="padding:8px 16px"><h2 style="margin:10px 0 0">Histórico</h2>
        <div class="kv"><span>Saldo informado em ${dm(c.data_inicial)}</span><span class="num">${brl(c.saldo_inicial)}</span></div>
        ${out||'<div class="vazio" style="padding:10px 0">Nenhuma aplicação ou resgate ligado a esta caixinha ainda. Em Investimentos, toque num movimento para escolher a caixinha.</div>'}</section>
      <a class="card linha" href="#investimentos" style="padding:14px 18px"><div class="nm">Ligar aplicações e resgates<small>em Investimentos, toque no movimento e escolha a caixinha</small></div><span class="chev">›</span></a>
    </div></div>${nav("contas")}`;
  document.getElementById("voltar").onclick=()=>voltar("#contas");
  document.getElementById("cxEdit").onclick=()=>abrirCaixinha(c);
  document.querySelectorAll("[data-mvc]").forEach(el=>el.onclick=()=>{ const m=d.movimentos.find(x=>x.id===+el.dataset.mvc);
    abrirAlocar({id:m.id, descricao:m.descricao, valor:-m.valor, data:m.data, banco:m.banco, caixinha_id:c.id}, CXE.caixinhas); });
}

// ---------- configuração do banco (toque no logo) ----------
async function telaBanco(nome){
  esqueleto();
  try{ BC=await api("/api/bancos/"+encodeURIComponent(nome)); }catch(e){ return; }
  BC.edit={apelido:BC.apelido||"", cor:BC.cor, emoji:BC.emoji||""};
  renderBanco();
}
function renderBanco(){
  const e=BC.edit, nomeTela=e.apelido||BC.banco;
  const TIPO={CORRENTE:"Conta corrente",CARTEIRA:"Dinheiro",INVESTIMENTO:"Caixinhas / investimento",CARTAO:"Cartão de crédito"};
  const contas=BC.contas.map(c=>`<div style="padding:10px 0;border-bottom:1px solid var(--line);${c.ativa?"":"opacity:.55"}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex-grow:1;min-width:0;display:flex;flex-direction:column"><b style="font-size:15px">${esc(c.apelido||c.nome)}</b>
          <small style="color:var(--mut);font-size:12px">${c.subtipo==="SAVINGS_ACCOUNT"?"Poupança":TIPO[c.tipo]||c.tipo}${c.numero?" · "+esc(c.numero):""}${c.manual?" · manual":" · do banco"}${c.banco_origem!==BC.banco?" · atrelada (veio de "+esc(c.banco_origem)+")":""}${c.responsavel==="GM"?" · GM":""}${c.ativa?"":" · oculta"}</small></div>
        <span class="num" style="font-weight:600;white-space:nowrap">${c.tipo==="CARTAO"?brl(-Math.abs(c.saldo||0)):brl(c.saldo||0)}</span></div>
      <div class="acoes"><button class="mini-b" data-ver="${c.tipo}:${c.id}">Ver ${c.tipo==="CARTAO"?"fatura":"extrato"}</button>
        <button class="mini-b" data-ren="${c.id}">Renomear</button>
        <button class="mini-b" data-oc="${c.id}" data-at="${c.ativa?1:0}">${c.ativa?"Ocultar":"Mostrar"}</button>
        ${c.banco_origem!==BC.banco?`<button class="mini-b" data-des="${c.id}">Devolver ao ${esc(c.banco_origem)}</button>`:""}</div>
      <div id="ren${c.id}"></div></div>`).join("");
  const cxs=BC.caixinhas.map(x=>`<a class="linha" href="#caixinha-${x.id}" style="color:inherit;text-decoration:none"><div class="mini" style="background:#13261C;color:var(--inv)">◆</div>
      <div class="nm">${esc(x.nome)}<small>${x.economia?"conta como economia":"fora da economia"}</small></div><span class="vl num">${brl(x.saldo)}</span><span class="chev">›</span></a>`).join("");
  const outras=BC.outras.filter(c=>c.tipo!=="CARTAO"||true);
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar(nomeTela,"configurações do banco")}
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 16px 0">${logo({slug:BC.slug,sigla:BC.sigla,cor:e.cor,emoji:e.emoji},68)}<b style="font-size:18px">${esc(nomeTela)}</b></div>
    <div class="cards">
      <section class="card form"><h2>Aparência</h2>
        <label for="bcNome">Nome exibido</label><input id="bcNome" value="${esc(e.apelido)}" placeholder="${esc(BC.banco)}">
        <label for="bcEmoji">Emoji no lugar do logo (opcional)</label>
        <div style="display:flex;gap:8px;align-items:center"><input id="bcEmoji" value="${esc(e.emoji)}" maxlength="4" style="width:80px;text-align:center;font-size:20px">
          <button class="mini-b" data-emo="">sem emoji</button></div>
        <div class="pilulas">${EMOJIS.map(x=>`<button class="pil ${e.emoji===x?"on":""}" data-emo="${x}" style="font-size:18px;--cor-f:var(--nec)">${x}</button>`).join("")}</div>
        <label>Cor</label><div class="pilulas" style="gap:10px">${[...new Set([BC.cor,...CORES_CARTAO])].map(k=>`<button class="cor-b ${e.cor===k?"on":""}" data-corb="${k}" style="background:${k}" aria-label="Cor ${k}"></button>`).join("")}</div>
        <button class="btn pri" id="bcSalvar" style="margin-top:6px">Salvar aparência</button></section>
      <section class="card"><h2>Contas neste banco</h2>${contas||'<div class="vazio">Nenhuma conta.</div>'}</section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Caixinhas</h2></div>
        ${cxs||'<div class="vazio">Nenhuma caixinha neste banco.</div>'}
        <button class="btn sec" id="bcCx" style="width:100%;margin-top:8px">+ Caixinha no ${esc(nomeTela)}</button></section>
      <section class="card form"><h2>Atrelar conta de outro banco</h2>
        <small style="color:var(--mut)">Mostra aqui, dentro de ${esc(nomeTela)}, uma conta que veio separada (ex.: conta manual, carteira, conta de outra conexão).</small>
        <select id="bcAtr"><option value="">Escolha a conta…</option>${outras.map(c=>`<option value="${c.id}">${esc(c.grupo)} · ${esc(c.apelido||c.nome)}</option>`).join("")}</select>
        <button class="btn sec" id="bcAtrOk">Atrelar aqui</button></section>
      <section class="card form"><h2>Nova conta manual</h2>
        <small style="color:var(--mut)">Para contas que o Pluggy não traz. O saldo segue pelos lançamentos que você cadastrar.</small>
        <label for="ncN">Nome</label><input id="ncN" placeholder="Ex.: Conta salário, Reserva separada">
        <label for="ncT">Tipo</label><select id="ncT"><option value="CORRENTE">Conta corrente</option><option value="POUPANCA">Poupança</option><option value="CARTEIRA">Dinheiro</option></select>
        <label for="ncS">Saldo hoje</label><input id="ncS" inputmode="decimal" placeholder="0,00">
        <button class="btn sec" id="ncOk">Criar conta</button><div id="bcErro" class="erro"></div></section>
    </div></div>${nav("contas")}`;
  const q=id=>document.getElementById(id), ler=()=>{ e.apelido=q("bcNome").value; e.emoji=q("bcEmoji").value; };
  q("voltar").onclick=()=>voltar("#contas");
  document.querySelectorAll("[data-emo]").forEach(b=>b.onclick=()=>{ ler(); e.emoji=b.dataset.emo; renderBanco(); });
  document.querySelectorAll("[data-corb]").forEach(b=>b.onclick=()=>{ ler(); e.cor=b.dataset.corb; renderBanco(); });
  q("bcSalvar").onclick=async()=>{ ler(); const r=await patch("/api/bancos/"+encodeURIComponent(BC.banco),{apelido:e.apelido,cor:e.cor,emoji:e.emoji}); toast(r.ok?"Banco atualizado":"Não consegui salvar"); telaBanco(BC.banco); };
  document.querySelectorAll("[data-ver]").forEach(b=>b.onclick=()=>{ const [t,id]=b.dataset.ver.split(":"); irItemConta(t==="INVESTIMENTO"?"INVESTIMENTO":t,id); });
  document.querySelectorAll("[data-oc]").forEach(b=>b.onclick=async()=>{ await patch(`/api/contas/${b.dataset.oc}`,{ativa:b.dataset.at!=="1"}); toast(b.dataset.at==="1"?"Conta oculta (some dos saldos e listas)":"Conta visível de novo"); telaBanco(BC.banco); });
  document.querySelectorAll("[data-des]").forEach(b=>b.onclick=async()=>{ await patch(`/api/contas/${b.dataset.des}`,{banco_grupo:null}); toast("Conta devolvida ao banco de origem"); telaBanco(BC.banco); });
  document.querySelectorAll("[data-ren]").forEach(b=>b.onclick=()=>{ const id=b.dataset.ren, c=BC.contas.find(x=>x.id===+id);
    q("ren"+id).innerHTML=`<div class="parte" style="margin-top:6px"><input id="renV${id}" value="${esc(c.apelido||c.nome)}" style="flex:1 1 auto;text-align:left"><button class="mini-b" id="renOk${id}">Salvar</button></div>`;
    q("renOk"+id).onclick=async()=>{ await patch(`/api/contas/${id}`,{apelido:q("renV"+id).value}); toast("Nome salvo"); telaBanco(BC.banco); }; });
  q("bcCx").onclick=()=>abrirCaixinha(null,null,BC.banco);
  q("bcAtrOk").onclick=async()=>{ const id=q("bcAtr").value; if(!id) return; await patch(`/api/contas/${id}`,{banco_grupo:BC.banco}); toast("Conta atrelada"); telaBanco(BC.banco); };
  q("ncOk").onclick=async()=>{ const nome=q("ncN").value.trim(); if(!nome){ q("bcErro").textContent="Informe o nome."; return; }
    const r=await post("/api/contas",{nome, banco:BC.banco, tipo:q("ncT").value, saldo_atual:numBR(q("ncS").value)});
    if(!r.ok){ q("bcErro").textContent=r.erro||"Não consegui criar"; return; } toast("Conta criada"); telaBanco(BC.banco); };
}

