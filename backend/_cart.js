// ===================== ABA CARTÕES (estilo Minhas Finanças) =====================
let fabCart=false, CF=null;
const BV={"Nubank":["nubank","NU","#7A2FCF"],"Mercado Pago":["mercadopago","MP","#0A7BC2"],"Inter":["inter","IN","#E8660C"],"Caixa":["caixa","CX","#1C5BA8"],
  "Itaú":["itau","IT","#EC7000"],"Bradesco":["bradesco","BR","#CC092F"],"Santander":["santander","SA","#EC0000"],"Banco do Brasil":["bb","BB","#2C55A3"],
  "C6":["c6","C6","#2B2B2B"],"XP":["xp","XP","#1A1A1A"],"BTG":["btg","BT","#0B2A4A"],"Sicredi":["sicredi","SI","#3FA110"],"Sicoob":["sicoob","SC","#00A091"]};
const EMISSORES=["Nubank","Inter","Mercado Pago","Itaú","Bradesco","Santander","Banco do Brasil","Caixa","C6","XP","BTG","Sicredi","Sicoob","Outro"];
const CORES_CARTAO=["#7A2FCF","#E8660C","#0A7BC2","#1FA0E8","#3FA110","#E3C35B","#CC092F","#4A4B55"];
const BANDEIRAS=[["MASTERCARD","Mastercard"],["VISA","Visa"],["ELO","Elo"],["AMEX","American Express"],["HIPERCARD","Hipercard"],["OUTRA","Outra"]];
const ICO_CART={
  novo:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="17" height="12" rx="2"/><path d="M2 9h17M19 15v6M16 18h6"/></svg>',
  estorno:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  lapis:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
  dinheiro:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11"/></svg>',
  fatura:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  fecha:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M10 13l4 4M14 13l-4 4"/></svg>',
  pessoa:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  sino:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  hash:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>'};
function visualBanco(c){
  const v=BV[c.banco]||[String(c.banco||"").toLowerCase().replace(/\s/g,""), String(c.nome||c.banco||"?").slice(0,2).toUpperCase(), "#4A4B55"];
  return {slug:v[0], sigla:v[1], cor:c.cor||v[2]};
}
function voltarPara(h){ if(rotaAnterior===h) history.back(); else location.hash=h; }

async function telaCartoesLista(){
  fabCart=false; esqueleto();
  try{ CART=await api("/api/cartoes"); }catch(e){ return; }
  renderCartoesLista();
}
function renderCartoesLista(){
  const m=ym(mesAtual), nomeMes=MESES[mesAtual.getMonth()]+" "+mesAtual.getFullYear();
  let totP=0, faltaP=0, totGM=0;
  const linhas=CART.map(c=>{
    const f=c.faturas.find(x=>x.mes===m), gm=c.responsavel==="GM";
    if(f){ if(gm) totGM+=f.total; else { totP+=f.total; faltaP+=Math.max(f.total-f.pago,0); } }
    const st=f?(STATUS[f.status]||[f.status,"#1C1D25","var(--mut)"]):null;
    const lim=+c.limite||0, usado=+(c.usado??0), disp=c.disponivel!=null?+c.disponivel:lim-usado, pct=lim?Math.min(Math.max(lim-disp,0)/lim*100,100):0;
    const b=visualBanco(c);
    return `<section class="card" data-cartao="${c.id}" role="button" tabindex="0" style="cursor:pointer;padding:16px">
      <div style="display:flex;align-items:center;gap:12px">${logo(b,42)}
        <div style="flex-grow:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <b style="font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nome)}${gm?'<span class="tag" style="background:#3A2E1A;color:var(--des)">GM</span>':""}</b>
          <small style="color:var(--mut);font-size:12px">${esc(c.banco)}${c.numero?" · •"+esc(c.numero):""}${c.manual?"":" · do banco"}</small>
          ${f?`<small style="color:var(--mut);font-size:12px">fecha ${dm(f.fechamento)} · vence ${dm(f.vencimento)}</small>`:""}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="num" style="font-weight:700;font-size:16px;white-space:nowrap">${f?brl(f.total):"—"}</span>
          ${st?`<span class="badge" style="background:${st[1]};color:${st[2]}">${esc(st[0])}</span>`:`<small style="color:var(--mut)">sem fatura</small>`}</div></div>
      ${lim?`<div class="barra" style="height:6px;margin-top:12px"><i style="width:${pct.toFixed(0)}%;background:${pct>85?"var(--desp)":b.cor}"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--mut);margin-top:6px"><span>Disponível <b class="num" style="color:var(--txt)">${brl0(disp)}</b></span><span>limite ${brl0(lim)}</span></div>`:""}
    </section>`;
  }).join("");
  const vazio=`<div class="vazio-g">${SVG.vazio}<b style="color:var(--txt);font-size:17px">Nada aqui</b><span>Nenhum cartão cadastrado.<br>Toque no <b style="color:var(--nec)">+</b> para cadastrar.</span></div>`;
  document.getElementById("raiz").innerHTML=`
  <div class="app">
    <div class="top"><span style="width:44px"></span><b class="num" style="font-size:19px">Cartões de crédito</b>
      <button class="icon" id="sync" aria-label="Sincronizar bancos agora"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></button></div>
    <div style="display:flex;align-items:center;justify-content:center;gap:4px">
      <button class="icon" id="ant" aria-label="Mês anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="mes"><b style="font-size:16px">${nomeMes}</b></div>
      <button class="icon" id="prox" aria-label="Próximo mês"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button></div>
    ${CART.length?`<div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Faturas que vencem no mês · suas</div>
      <div class="num" style="font-size:32px;font-weight:700">${brl(totP)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">pago <b class="num">${brl0(totP-faltaP)}</b></span><span class="chip">a pagar <b class="num">${brl0(faltaP)}</b></span>
        ${totGM?`<span class="chip" style="color:var(--des)">GM <b class="num">${brl0(totGM)}</b> · fora das suas</span>`:""}</div></div>`:""}
    <div class="cards">${linhas||vazio}</div>
  </div>
  ${fabCart?`<div class="veu" id="veu"></div><div class="fab-menu">
      <a href="#novo-cartao"><span class="r">Novo cartão</span><span class="b" style="background:var(--nec)">${ICO_CART.novo}</span></a>
      <a href="#novo-estorno"><span class="r">Novo estorno</span><span class="b" style="background:var(--nec)">${ICO_CART.estorno}</span></a>
      <a href="#nova-despesa-cartao"><span class="r">Despesa cartão</span><span class="b" style="background:var(--nec)">${SVG.cartao}</span></a></div>`:""}
  <button class="fab ${fabCart?"aberto":""}" id="fab" style="background:var(--nec)" aria-label="Adicionar" aria-expanded="${fabCart}">${SVG.mais}</button>
  ${nav("cartoes")}`;
  const q=id=>document.getElementById(id);
  q("ant").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()-1,1); renderCartoesLista(); };
  q("prox").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()+1,1); renderCartoesLista(); };
  q("sync").onclick=sincronizar;
  q("fab").onclick=()=>{ fabCart=!fabCart; renderCartoesLista(); };
  if(q("veu")) q("veu").onclick=()=>{ fabCart=false; renderCartoesLista(); };
  document.querySelectorAll("[data-cartao]").forEach(el=>el.onclick=()=>{ cartSel=+el.dataset.cartao; mesSel=m; location.hash="#cartao-"+el.dataset.cartao; });
}
function botaoPagar(c,f){
  if(!f||!c.manual) return "";
  const falta=f.total-f.pago;
  if(falta<=0.01||["ABERTA","PREVISTA","ZERADA"].includes(f.status)) return "";
  return `<button class="btn pri" id="pagarFat" style="width:100%;margin-top:14px">Marcar como paga · ${brl(falta)}</button>`;
}

// ---------- cadastro / edição de cartão ----------
async function telaCartaoForm(id){
  esqueleto();
  let cart, contas;
  try{ [cart, contas]=await Promise.all([api("/api/cartoes"), api("/api/contas")]); }catch(e){ return; }
  CART=cart;
  const c = id ? cart.find(x=>x.id===id) : null;
  if(id && !c){ location.hash="#cartoes"; return; }
  const hj=isoLocal(new Date());
  const fA = c ? c.faturas.filter(f=>f.fechamento && f.fechamento>hj).sort((a,b)=>a.fechamento.localeCompare(b.fechamento))[0] : null;
  const virg = v => v!=null && +v ? (+v).toFixed(2).replace(".",",") : "";
  CF={id, c, manual:!c||c.manual, contas:contas.contas.filter(x=>x.tipo!=="CARTAO"),
      nome:c?c.nome:"", banco:c?(EMISSORES.includes(c.banco)?c.banco:"Outro"):"Nubank", cor:c?visualBanco(c).cor:CORES_CARTAO[0],
      responsavel:c?c.responsavel:"PESSOAL", limite:c?virg(c.limite):"", fatura:fA?virg(fA.saldo_inicial):"", bandeira:c?(c.bandeira||"MASTERCARD"):"MASTERCARD",
      conta:c&&c.conta_pagamento_id?String(c.conta_pagamento_id):"", fech:c&&c.dia_fechamento?String(c.dia_fechamento):"", venc:c&&c.dia_vencimento?String(c.dia_vencimento):"",
      din:c?!!c.fech_dinamico:false, uteis:c?!!c.venc_dias_uteis:false, notif:c?(c.notif_app||""):"", numero:c?(c.numero||""):"",
      erro:"", salvando:false, confirmar:false};
  CF.fatura0=CF.fatura;
  renderCartaoForm();
}
function lerCF(){
  const g=id=>{ const e=document.getElementById(id); return e?(e.type==="checkbox"?e.checked:e.value):undefined; };
  const m={nome:"cfNome",banco:"cfBanco",limite:"cfLimite",fatura:"cfFatura",bandeira:"cfBandeira",conta:"cfConta",fech:"cfFech",venc:"cfVenc",
           din:"cfDin",uteis:"cfUteis",notif:"cfNotif",numero:"cfNumero"};
  for(const k in m){ const v=g(m[k]); if(v!==undefined) CF[k]=v; }
}
function renderCartaoForm(){
  const c=CF.c, man=CF.manual;
  const dias=sel=>`<option value="">—</option>`+Array.from({length:31},(_,i)=>i+1).map(d=>`<option value="${d}" ${String(d)===String(sel)?"selected":""}>${String(d).padStart(2,"0")}</option>`).join("");
  const hj=isoLocal(new Date()), fA=c?c.faturas.filter(f=>f.fechamento&&f.fechamento>hj).sort((a,b)=>a.fechamento.localeCompare(b.fechamento))[0]:null;
  const prev = b=>{ // previa das proximas datas (cartao manual)
    if(!CF.fech||!CF.venc) return "";
    const fake={dia_fechamento:+CF.fech, dia_vencimento:+CF.venc, fech_dinamico:CF.din, venc_dias_uteis:CF.uteis};
    const h=new Date(), out=[];
    for(let k=0;k<3 && out.length<2;k++){ const d=new Date(h.getFullYear(),h.getMonth()+k,1); const [fe,ve]=datasFatura(fake,d.getFullYear(),d.getMonth()+1); if(fe>=isoLocal(h)) out.push(`fecha ${dm(fe)} → vence ${dm(ve)}`); }
    return out.length?`<div style="padding:0 16px 12px 52px;font-size:12px;color:var(--mut)">Próximas: ${out.join(" · ")}</div>`:"";
  };
  document.getElementById("raiz").innerHTML=`
  <div class="fm" style="--cor-f:#5B9DFF">
    <div class="top"><button class="icon" id="cfFechar" aria-label="Fechar">${SVG.fechar}</button>
      <b class="num" style="font-size:18px">${CF.id?"Editar cartão":"Novo cartão"}</b>
      <button id="cfSalvarTopo" style="height:40px;padding:0 16px;border-radius:20px;font-weight:700;background:var(--nec);color:#0D0E12">Salvar</button></div>
    <div class="cards" style="padding-top:8px">
      ${CF.erro?`<div class="alerta" style="margin:0;background:#3D2023;color:#FFB4AE">${esc(CF.erro)}</div>`:""}
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${SVG.texto}</span><div class="c"><label for="cfNome">Nome</label><input id="cfNome" placeholder="Ex.: Nubank roxinho, Cartão GM" value="${esc(CF.nome)}" autocomplete="off"></div>
          ${logo({slug:(BV[CF.banco]||[""])[0],sigla:(BV[CF.banco]||["",(CF.nome||"?").slice(0,2).toUpperCase()])[1],cor:CF.cor},36)}</div>
        <div class="pilulas" style="padding:4px 16px 12px 52px;gap:10px">${CORES_CARTAO.map(k=>`<button class="cor-b ${CF.cor===k?"on":""}" data-cor="${k}" style="background:${k}" aria-label="Cor ${k}"></button>`).join("")}</div>
        <div class="campo"><span class="ico">${SVG.conta}</span><div class="c"><label for="cfBanco">Banco / emissor</label>
          <select id="cfBanco" ${man?"":"disabled"}>${(man?EMISSORES:[c.banco]).map(e=>`<option ${e===CF.banco||(!man&&e===c.banco)?"selected":""}>${esc(e)}</option>`).join("")}</select></div></div>
      </section>
      <section class="card" style="padding:0">
        <div class="campo" style="flex-wrap:wrap"><span class="ico">${ICO_CART.pessoa}</span><div class="c"><span class="rot">Responsável</span>
          <div class="pilulas"><button class="pil ${CF.responsavel==="PESSOAL"?"on":""}" data-resp="PESSOAL">Eu · pessoal</button><button class="pil ${CF.responsavel==="GM"?"on":""}" data-resp="GM">GM Incorporações</button></div></div></div>
        <div style="padding:0 16px 14px 52px;font-size:12px;color:${CF.responsavel==="GM"?"var(--des)":"var(--mut)"}">${CF.responsavel==="GM"
          ?"Os gastos deste cartão ficam só aqui na aba Cartões: não entram nas suas despesas, no 50/30/20, na fatura do Início nem no patrimônio."
          :"Os gastos entram nas suas despesas e no 50/30/20. Para um cartão adicional usado pela empresa, marque o final como GM na fatura."}</div>
      </section>
      ${man?`<section class="card" style="padding:0">
        <div class="campo"><span class="ico">${ICO_CART.dinheiro}</span><div class="c"><label for="cfLimite">Limite</label><input id="cfLimite" inputmode="decimal" placeholder="R$ 0,00" value="${esc(CF.limite)}"></div></div>
        <div class="campo"><span class="ico">${ICO_CART.fatura}</span><div class="c"><label for="cfFatura">Fatura atual (o que já foi gasto antes de usar o app)</label><input id="cfFatura" inputmode="decimal" placeholder="R$ 0,00" value="${esc(CF.fatura)}"></div></div>
        <div class="campo"><span class="ico">${SVG.cartao}</span><div class="c"><label for="cfBandeira">Bandeira do cartão</label><select id="cfBandeira">${BANDEIRAS.map(([k,t])=>`<option value="${k}" ${CF.bandeira===k?"selected":""}>${t}</option>`).join("")}</select></div></div>
      </section>`:`<section class="card" style="font-size:13px;color:var(--mut)">Cartão sincronizado pelo banco: limite, faturas, datas, bandeira e finais vêm do Pluggy.
        ${c.limite?`<div class="kv" style="margin-top:8px"><span>Limite</span><span>${brl(+c.limite)}</span></div>`:""}${fA?`<div class="kv"><span>Fatura aberta</span><span>fecha ${dm(fA.fechamento)} · vence ${dm(fA.vencimento)}</span></div>`:""}</section>`}
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${SVG.conta}</span><div class="c"><label for="cfConta">Conta que paga a fatura</label>
          <select id="cfConta"><option value="">Nenhuma</option>${CF.contas.map(x=>`<option value="${x.id}" ${String(x.id)===CF.conta?"selected":""}>${esc(x.banco)} · ${esc(rotuloConta(x))}</option>`).join("")}</select></div></div>
        ${man?`<div class="campo"><span class="ico">${ICO_CART.fecha}</span><div class="c"><label for="cfFech">Fecha dia</label><select id="cfFech">${dias(CF.fech)}</select></div></div>
        <div class="campo"><span class="ico"></span><div class="c"><span style="font-size:14px">Fechamento dinâmico</span><span style="font-size:11px;color:var(--mut)">Fecha sempre a mesma quantidade de dias antes do vencimento real</span></div>
          <label class="sw"><input type="checkbox" id="cfDin" ${CF.din?"checked":""}><span></span></label></div>
        <div class="campo"><span class="ico">${SVG.cal}</span><div class="c"><label for="cfVenc">Vence dia</label><select id="cfVenc">${dias(CF.venc)}</select></div></div>
        <div class="campo"><span class="ico"></span><div class="c"><span style="font-size:14px">Vencimento em dias úteis</span><span style="font-size:11px;color:var(--mut)">Caiu no sábado ou domingo, vence na segunda</span></div>
          <label class="sw"><input type="checkbox" id="cfUteis" ${CF.uteis?"checked":""}><span></span></label></div>
        ${prev()}`:""}
      </section>
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${ICO_CART.sino}</span><div class="c"><label for="cfNotif">Importar notificações do app</label>
          <select id="cfNotif"><option value="">Nenhum</option>${EMISSORES.map(e=>`<option ${e===CF.notif?"selected":""}>${esc(e)}</option>`).join("")}</select></div></div>
        ${man?`<div class="campo"><span class="ico">${ICO_CART.hash}</span><div class="c"><label for="cfNumero">Últimos 4 dígitos</label><input id="cfNumero" inputmode="numeric" maxlength="4" placeholder="0000" value="${esc(CF.numero)}"></div></div>`:""}
      </section>
      <button class="btn" id="cfSalvar" style="background:var(--nec);color:#0D0E12" ${CF.salvando?"disabled":""}>${CF.salvando?"Salvando…":"Salvar"}</button>
      ${CF.id&&man?`<button class="btn sec" id="cfExcluir" style="${CF.confirmar?"color:var(--desp);border-color:var(--desp)":""}">${CF.confirmar?"Toque de novo para confirmar":"Excluir cartão"}</button>`:""}
    </div>
  </div>`;
  const q=id=>document.getElementById(id), re=()=>{ lerCF(); renderCartaoForm(); };
  q("cfFechar").onclick=()=>voltarPara(CF.id?"#cartao-"+CF.id:"#cartoes");
  q("cfSalvar").onclick=salvarCartao; q("cfSalvarTopo").onclick=salvarCartao;
  document.querySelectorAll("[data-cor]").forEach(b=>b.onclick=()=>{ lerCF(); CF.cor=b.dataset.cor; renderCartaoForm(); });
  document.querySelectorAll("[data-resp]").forEach(b=>b.onclick=()=>{ lerCF(); CF.responsavel=b.dataset.resp; renderCartaoForm(); });
  ["cfBanco","cfFech","cfVenc","cfDin","cfUteis"].forEach(id=>{ if(q(id)) q(id).onchange=()=>{ const antes=CF.banco; lerCF(); if(id==="cfBanco"&&BV[CF.banco]&&CF.banco!==antes) CF.cor=BV[CF.banco][2]; renderCartaoForm(); }; });
  if(q("cfExcluir")) q("cfExcluir").onclick=async()=>{ if(!CF.confirmar){ CF.confirmar=true; return re(); }
    const r=await del(`/api/cartoes/${CF.id}`); if(!r.ok){ CF.erro=r.erro||"Não consegui excluir"; CF.confirmar=false; return renderCartaoForm(); }
    toast(r.desativado?"Cartão desativado (tinha compras — histórico mantido)":"Cartão excluído"); location.hash="#cartoes"; };
}
function datasFatura(c,y,m){   // espelho de pluggy._datas_fatura, so para a previa
  const ult=(yy,mm)=>new Date(yy,mm,0).getDate(), dia=(yy,mm,d)=>new Date(yy,mm-1,Math.min(d,ult(yy,mm)));
  const dv=c.dia_vencimento, df=c.dia_fechamento||dv;
  const veN=dia(y,m,dv), feN = df<dv ? dia(y,m,df) : (m>1?dia(y,m-1,df):dia(y-1,12,df));
  let ve=new Date(veN); if(c.venc_dias_uteis) while(ve.getDay()===0||ve.getDay()===6) ve.setDate(ve.getDate()+1);
  const fe = c.fech_dinamico ? new Date(ve.getTime()-(veN-feN)) : feN;
  return [isoLocal(fe), isoLocal(ve)];
}
async function salvarCartao(){
  if(CF.salvando) return;
  lerCF(); CF.erro="";
  const nome=(CF.nome||"").trim(), numero=String(CF.numero||"").replace(/\D/g,"");
  if(!nome) CF.erro="Informe o nome do cartão.";
  else if(CF.manual && (!CF.fech||!CF.venc)) CF.erro="Escolha o dia de fechamento e o de vencimento.";
  else if(CF.manual && numero && numero.length!==4) CF.erro="Últimos 4 dígitos: informe exatamente 4 números.";
  if(CF.erro) return renderCartaoForm();
  const body={nome, cor:CF.cor, responsavel:CF.responsavel, conta_pagamento_id:+CF.conta||null, notif_app:CF.notif||null};
  if(CF.manual) Object.assign(body,{banco:CF.banco==="Outro"?nome:CF.banco, bandeira:CF.bandeira, numero, limite:numBR(CF.limite)||null,
    dia_fechamento:+CF.fech, dia_vencimento:+CF.venc, fech_dinamico:!!CF.din, venc_dias_uteis:!!CF.uteis});
  if(CF.manual && (!CF.id || CF.fatura!==CF.fatura0)) body.fatura_atual=numBR(CF.fatura)||0;
  CF.salvando=true; renderCartaoForm();
  let r; try{ r = CF.id ? await patch(`/api/cartoes/${CF.id}`,body) : await post("/api/cartoes",body); }catch(e){ r={ok:false,erro:e.message}; }
  CF.salvando=false;
  if(!r.ok){ CF.erro=r.erro||"Não consegui salvar"; return renderCartaoForm(); }
  toast(CF.id?(r.lancamentos_movidos?`Cartão salvo · ${r.lancamentos_movidos} lançamento(s) mudaram de responsável`:"Cartão salvo"):"Cartão criado");
  if(CF.id) voltarPara("#cartao-"+CF.id); else { cartSel=r.id; mesSel=null; location.hash="#cartao-"+r.id; }
}

