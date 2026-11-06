// ===================== RECEITAS / DESPESAS (estilo Minhas Finanças) =====================
const NAT = {
  receitas:{nat:"RECEITA", titulo:"Receitas", um:"receita", cor:"var(--rec)", hex:"#4CC38A", fundo:"#1E3A2C", feito:"Recebi", falta:"a receber", ok:"recebido"},
  despesas:{nat:"DESPESA", titulo:"Despesas", um:"despesa", cor:"var(--desp)", hex:"#FF7A70", fundo:"#3D2023", feito:"Paguei", falta:"a pagar", ok:"pago"}};
const SVG = {
  voltar:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
  fechar:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  mais:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  maisP:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  menos:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg>',
  cartao:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
  texto:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 7h14M5 12h14M5 17h9"/></svg>',
  repetir:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
  camadas:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  cal:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  check:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  pasta:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  sub:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4v10a3 3 0 0 0 3 3h9"/><path d="M15 14l3 3-3 3"/></svg>',
  conta:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/></svg>',
  tag:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
  seguir:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
  vazio:'<svg width="110" height="96" viewBox="0 0 110 96" fill="none"><rect x="22" y="10" width="66" height="78" rx="10" fill="#17181F" stroke="#262833" stroke-width="2"/><path d="M36 32h38M36 46h38M36 60h22" stroke="#333542" stroke-width="4" stroke-linecap="round"/><circle cx="84" cy="70" r="16" fill="#0D0E12" stroke="#4A4B55" stroke-width="3"/><path d="M95 81l9 9" stroke="#4A4B55" stroke-width="4" stroke-linecap="round"/></svg>'};
let fabAberto=false, MOV=null, F=null, CONTAS_F=null, rotaAtual="", rotaAnterior="", toastT=null;
const CATS={};
const DIAS_SEM=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const isoLocal = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const numBR = v => { const t=String(v||"").trim().replace(/^R\$\s*/,""); return (!t.includes(",") && /^\d+\.\d{1,2}$/.test(t)) ? parseFloat(t) : num(t); };
function toast(msg){
  let t=document.querySelector(".toast"); if(!t){ t=document.createElement("div"); t.className="toast"; document.body.appendChild(t); }
  t.textContent=msg; clearTimeout(toastT); toastT=setTimeout(()=>t.remove(),2200);
}
async function del(url){ return fetch(url,{method:"DELETE",headers:{"X-Token":token||""}}).then(r=>r.json()); }
function rotDia(iso){
  const d=new Date(iso+"T12:00:00"), h=new Date(), k=Math.round((new Date(h.getFullYear(),h.getMonth(),h.getDate(),12)-d)/864e5);
  if(k===0) return "Hoje"; if(k===1) return "Ontem"; if(k===-1) return "Amanhã";
  return DIAS_SEM[d.getDay()]+", "+dm(iso);
}

// ---------- lista do mês ----------
async function telaMov(chave){
  fabAberto=false; esqueleto();
  let d; try{ d=await api(`/api/movimentos?mes=${ym(mesAtual)}&natureza=${NAT[chave].nat}`); }catch(e){ return; }
  MOV={chave, d}; renderMov();
}
function renderMov(){
  const {chave,d}=MOV, N=NAT[chave], nomeMes=MESES[mesAtual.getMonth()]+" "+mesAtual.getFullYear();
  let ult="", corpo="";
  for(const i of d.itens){
    if(i.data!==ult){ corpo+=`<div class="dia">${rotDia(i.data)}</div>`; ult=i.data; }
    const ini=(i.categoria||i.descricao||"?").trim().slice(0,2).toUpperCase();
    const det=[i.categoria,i.subcategoria,i.banco].filter(Boolean).map(esc).join(" · ")||"sem categoria";
    const tags=(i.tags&&i.tags.length)?" · #"+i.tags.map(esc).join(" #"):"";
    corpo+=`<div class="mov"><div class="bola" style="background:${N.fundo};color:${N.cor}">${esc(ini)}</div>
      <div class="d"><span>${esc(i.descricao)}</span><small>${det}${tags}</small>
        ${i.efetivada?"":`<div class="acoes"><button class="mini-b" data-ef="${i.id}" style="color:${N.cor};border-color:${N.cor}">✓ ${N.feito}</button>
          <button class="mini-b" data-ex="${i.id}">Excluir</button><button class="mini-b" data-exs="${i.id}">Excluir este e os próximos</button></div>`}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="num" style="font-weight:600;white-space:nowrap;color:${i.efetivada?N.cor:"var(--mut)"}">${brl(Math.abs(i.valor))}</span>
        ${i.efetivada?"":`<span class="badge" style="background:var(--alerta-bg);color:var(--alerta)">pendente</span>`}</div></div>`;
  }
  const vazio=`<div class="vazio-g">${SVG.vazio}<b style="color:var(--txt);font-size:17px">Nada aqui</b><span>Nenhuma ${N.um} em ${nomeMes}.<br>Toque no <b style="color:${N.cor}">+</b> para cadastrar.</span></div>`;
  const fab = chave==="receitas"
    ? `<a class="fab" href="#nova-receita" style="background:var(--rec)" aria-label="Nova receita">${SVG.mais}</a>`
    : `${fabAberto?`<div class="veu" id="veu"></div><div class="fab-menu">
          <a href="#nova-despesa"><span class="r">Despesa</span><span class="b">${SVG.menos}</span></a>
          <a href="#nova-despesa-cartao"><span class="r">Despesa cartão</span><span class="b">${SVG.cartao}</span></a></div>`:""}
       <button class="fab ${fabAberto?"aberto":""}" id="fab" style="background:var(--desp)" aria-label="Nova despesa" aria-expanded="${fabAberto}">${SVG.mais}</button>`;
  document.getElementById("raiz").innerHTML=`
  <div class="app">
    <div class="top"><a class="icon" href="#inicio" aria-label="Voltar" style="color:var(--txt)">${SVG.voltar}</a>
      <b class="num" style="font-size:19px">${N.titulo}</b><span style="width:44px"></span></div>
    <div style="display:flex;align-items:center;justify-content:center;gap:4px">
      <button class="icon" id="ant" aria-label="Mês anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="mes"><b style="font-size:16px">${nomeMes}</b></div>
      <button class="icon" id="prox" aria-label="Próximo mês"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button></div>
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Total do mês</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${N.cor}">${brl(d.realizado+d.pendente)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">${N.ok} <b class="num">${brl0(d.realizado)}</b></span><span class="chip">${N.falta} <b class="num">${brl0(d.pendente)}</b></span></div></div>
    <div class="cards">${d.itens.length?`<section class="card" style="padding:8px 16px">${corpo}</section>`:vazio}</div>
  </div>${fab}${nav("inicio")}`;
  const q=id=>document.getElementById(id);
  q("ant").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()-1,1); telaMov(chave); };
  q("prox").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()+1,1); telaMov(chave); };
  if(q("fab")) q("fab").onclick=()=>{ fabAberto=!fabAberto; renderMov(); };
  if(q("veu")) q("veu").onclick=()=>{ fabAberto=false; renderMov(); };
  document.querySelectorAll("[data-ef]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await post(`/api/agendados/${b.dataset.ef}/efetivar`,{}); toast(r.ok?"Efetivado":"Não consegui: "+(r.erro||"erro")); telaMov(chave); });
  document.querySelectorAll("[data-ex]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await del(`/api/agendados/${b.dataset.ex}`); toast(r.ok?"Excluído":"Não consegui excluir"); telaMov(chave); });
  document.querySelectorAll("[data-exs]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await del(`/api/agendados/${b.dataset.exs}?serie=1`); toast(r.ok?`${r.apagados} excluído(s)`:"Não consegui excluir"); telaMov(chave); });
}

// ---------- formulário Nova receita / Nova despesa / Despesa cartão ----------
async function telaForm(tipo){
  const nat = tipo==="receita"?"RECEITA":"DESPESA", cartao = tipo==="despesa-cartao";
  esqueleto();
  let cart=null;
  try{
    const r = await Promise.all([api("/api/categorias?natureza="+nat), api("/api/contas"), cartao?api("/api/cartoes"):null]);
    CATS[nat]=r[0]; CONTAS_F=r[1]; cart=r[2];
  }catch(e){ return; }
  const h=new Date(), noMes = mesAtual.getFullYear()===h.getFullYear() && mesAtual.getMonth()===h.getMonth();
  const contas = cartao ? (cart||[]) : CONTAS_F.contas.filter(c=>c.tipo!=="CARTAO");
  const padrao = cartao ? (contas.find(c=>c.faturas&&c.faturas.length)||contas[0]) : (contas.find(c=>c.tipo==="CORRENTE"&&/nubank/i.test(c.banco))||contas.find(c=>c.tipo==="CORRENTE")||contas[0]);
  F = {tipo, nat, cartao, cart, contas, chave: nat==="RECEITA"?"receitas":"despesas",
       valor:"", desc:"", data: noMes?isoLocal(h):isoLocal(mesAtual), efet:true, cat:"", sub:"", conta: padrao?String(padrao.id):"", final:"",
       tags:"", cont:false, rec:"NAO", per:"MENSAL", parIni:"1", qtd:"2", aCada:"30", multi:false,
       partes:[{cat:"",valor:""},{cat:"",valor:""}], novaCat:false, novaSub:false, novaNome:"", novaPote:"DES", erro:"", salvando:false};
  renderForm();
  const v=document.getElementById("fValor"); if(v) v.focus();
}
function lerForm(){
  if(!F) return;
  const g=id=>{ const e=document.getElementById(id); return e ? (e.type==="checkbox"?e.checked:e.value) : undefined; };
  const m={valor:"fValor",desc:"fDesc",data:"fData",efet:"fEfet",cat:"fCat",sub:"fSub",conta:"fConta",tags:"fTags",cont:"fCont",
           per:"fPer",parIni:"fParIni",qtd:"fQtd",aCada:"fACada",multi:"fMulti",novaNome:"fNovaNome",novaPote:"fNovaPote"};
  for(const k in m){ const x=g(m[k]); if(x!==undefined) F[k]=x; }
  F.partes.forEach((p,i)=>{ const c=g("pc"+i), x=g("pv"+i); if(c!==undefined) p.cat=c; if(x!==undefined) p.valor=x; });
}
function faturaDaCompra(){
  const c=F.cart&&F.cart.find(c=>String(c.id)===String(F.conta)); if(!c) return null;
  return (c.faturas||[]).filter(f=>f.fechamento && f.fechamento>F.data).sort((a,b)=>a.fechamento.localeCompare(b.fechamento))[0]||null;
}
function renderForm(){
  const N=NAT[F.chave], cats=CATS[F.nat]||[], cat=cats.find(c=>String(c.id)===String(F.cat));
  const titulo = F.cartao ? "Despesa no cartão" : F.nat==="RECEITA" ? "Nova receita" : "Nova despesa";
  const optCats = `<option value="">Selecione…</option>`+cats.map(c=>`<option value="${c.id}" ${String(c.id)===String(F.cat)?"selected":""}>${esc(c.nome)}</option>`).join("");
  const optSubs = `<option value="">${cat?(cat.subcategorias.length?"Selecione…":"Nenhuma — toque no +"):"Escolha a categoria antes"}</option>`+
    (cat?cat.subcategorias.map(s=>`<option value="${s.id}" ${String(s.id)===String(F.sub)?"selected":""}>${esc(s.nome)}</option>`).join(""):"");
  const optContas = F.contas.map(c=>`<option value="${c.id}" ${String(c.id)===String(F.conta)?"selected":""}>${esc(c.banco)} · ${esc(F.cartao?("Cartão "+(c.numero||c.nome||"")):rotuloConta(c))}</option>`).join("");
  const ontem=isoLocal(new Date(Date.now()-864e5)), hj=isoLocal(new Date());
  const totalMulti = F.partes.reduce((s,p)=>s+numBR(p.valor),0);
  const per = `<select id="fPer">${[["MENSAL","Mensal"],["DIARIO","Diário"],["SEMANAL","Semanal"],["TRIMESTRAL","Trimestral"],["ANUAL","Anual"],["PERSONALIZADO","Personalizar"]]
      .map(([k,t])=>`<option value="${k}" ${F.per===k?"selected":""}>${t}</option>`).join("")}</select>`;
  const qtdFixa={MENSAL:12,TRIMESTRAL:4,ANUAL:2,SEMANAL:26,DIARIO:31,PERSONALIZADO:12}[F.per];
  let recCfg="";
  if(F.rec!=="NAO") recCfg=`<div style="padding:0 16px 12px 52px;display:flex;flex-direction:column;gap:8px">
    ${F.rec==="PARCELADA"?`<div class="grade2">
      <div class="campo" style="padding:0;border:0;min-height:0"><div class="c"><label for="fParIni">Parcela inicial</label><input id="fParIni" type="number" min="1" inputmode="numeric" value="${esc(F.parIni)}" style="border-bottom:1px solid var(--line)"></div></div>
      <div class="campo" style="padding:0;border:0;min-height:0"><div class="c"><label for="fQtd">Quantidade de parcelas</label><input id="fQtd" type="number" min="2" inputmode="numeric" value="${esc(F.qtd)}" style="border-bottom:1px solid var(--line)"></div></div></div>`:""}
    <div class="campo" style="padding:0;border:0;min-height:0"><div class="c"><label for="fPer">Periodicidade</label>${per}</div></div>
    ${F.per==="PERSONALIZADO"?`<div class="campo" style="padding:0;border:0;min-height:0"><div class="c"><label for="fACada">A cada quantos dias</label><input id="fACada" type="number" min="1" inputmode="numeric" value="${esc(F.aCada)}"></div></div>`:""}
    <small style="color:var(--mut)">${F.rec==="FIXA"?`Cria as próximas ${qtdFixa} ocorrências como pendentes — cada uma liga sozinha ao extrato quando o banco trouxer.`
      :`O valor acima é de <b>cada parcela</b>. A 1ª ${F.cartao?"entra no cartão":"segue o “Efetivada”"}; as demais ficam pendentes e ligam sozinhas ao extrato.`}</small></div>`;
  const novaCat = F.novaCat?`<div class="sub-in"><input id="fNovaNome" placeholder="Nome da nova categoria" value="${esc(F.novaNome)}">
      ${F.nat==="DESPESA"?`<select id="fNovaPote" aria-label="Pote 50/30/20" style="flex-grow:0;min-width:0"><option value="NEC" ${F.novaPote==="NEC"?"selected":""}>Necessidade 50%</option><option value="DES" ${F.novaPote==="DES"?"selected":""}>Desejo 30%</option><option value="INV" ${F.novaPote==="INV"?"selected":""}>Investimento 20%</option></select>`:""}
      <button id="addCat">Adicionar</button></div>`:"";
  const novaSub = F.novaSub?`<div class="sub-in"><input id="fNovaNome" placeholder="Nova subcategoria de ${esc(cat?cat.nome:"")}" value="${esc(F.novaNome)}"><button id="addSub">Adicionar</button></div>`:"";
  const fat = F.cartao ? faturaDaCompra() : null;
  const cartSel = F.cartao && F.cart ? F.cart.find(c=>String(c.id)===String(F.conta)) : null;
  const finais = cartSel ? (cartSel.finais||[]).filter(x=>x.ativo) : [];
  const corpoCat = F.multi ? `<div style="padding:4px 16px 12px 52px">
      ${F.partes.map((p,i)=>`<div class="parte"><select id="pc${i}" aria-label="Categoria ${i+1}"><option value="">Categoria…</option>${cats.map(c=>`<option value="${c.id}" ${String(c.id)===String(p.cat)?"selected":""}>${esc(c.nome)}</option>`).join("")}</select>
        <input id="pv${i}" inputmode="decimal" placeholder="0,00" value="${esc(p.valor)}" aria-label="Valor ${i+1}">
        ${F.partes.length>2?`<button class="mais" data-rm="${i}" aria-label="Remover">${SVG.fechar}</button>`:""}</div>`).join("")}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><button class="mini-b" id="addParte">+ categoria</button>
        <span style="font-size:13px;color:var(--mut)">total <b class="num" style="color:var(--cor-f)">${brl(totalMulti)}</b></span></div></div>`
    : `<div class="campo"><span class="ico">${SVG.pasta}</span><div class="c"><label for="fCat">Categoria</label><select id="fCat">${optCats}</select></div>
        <button class="mais" id="maisCat" aria-label="Nova categoria">${SVG.maisP}</button></div>${novaCat}
      <div class="campo"><span class="ico">${SVG.sub}</span><div class="c"><label for="fSub">Subcategoria</label><select id="fSub" ${cat?"":"disabled"}>${optSubs}</select></div>
        <button class="mais" id="maisSub" aria-label="Nova subcategoria" ${cat?"":"disabled"} style="${cat?"":"opacity:.4"}">${SVG.maisP}</button></div>${novaSub}`;

  document.getElementById("raiz").innerHTML=`
  <div class="fm" style="--cor-f:${N.hex}">
    <div class="top"><button class="icon" id="fechar" aria-label="Fechar">${SVG.fechar}</button>
      <b class="num" style="font-size:18px">${titulo}</b>
      <button id="salvarTopo" style="height:40px;padding:0 12px;font-weight:700;color:var(--cor-f)">Salvar</button></div>
    <div style="padding:14px 16px 10px;text-align:center">
      <label for="fValor" style="font-size:12px;color:var(--mut)">${F.rec==="PARCELADA"?"Valor de cada parcela":"Valor"}</label>
      <input id="fValor" class="valor-in" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" value="${F.multi?esc(totalMulti?totalMulti.toFixed(2).replace(".",","):""):esc(F.valor)}" ${F.multi?"readonly":""}></div>
    <div class="cards" style="padding-top:4px">
      ${F.erro?`<div class="alerta" style="margin:0;background:#3D2023;color:#FFB4AE">${esc(F.erro)}</div>`:""}
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${SVG.texto}</span><div class="c"><label for="fDesc">Descrição</label><input id="fDesc" placeholder="${F.nat==="RECEITA"?"Ex.: Salário, aluguel recebido":"Ex.: Mercado, conta de luz"}" value="${esc(F.desc)}" autocomplete="off"></div></div>
        <div class="campo" style="flex-wrap:wrap"><span class="ico">${SVG.repetir}</span><div class="c"><span class="rot">Repetição</span>
          <div class="pilulas">${[["NAO","Não recorrente"],["FIXA","Fixa"],["PARCELADA","Parcelada"]].map(([k,t])=>`<button class="pil ${F.rec===k?"on":""}" data-rec="${k}">${t}</button>`).join("")}</div></div></div>
        ${recCfg}
        ${F.nat==="DESPESA"?`<div class="campo"><span class="ico">${SVG.camadas}</span><div class="c"><span class="rot">Multicategorias</span><span style="font-size:14px">Dividir o valor entre categorias</span></div>
          <label class="sw"><input type="checkbox" id="fMulti" ${F.multi?"checked":""}><span></span></label></div>`:""}
        <div class="campo"><span class="ico">${SVG.cal}</span><div class="c"><label for="fData">${F.cartao?"Data da compra":F.nat==="RECEITA"?"Data do recebimento":"Data do vencimento"}</label>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><button class="pil ${F.data===hj?"on":""}" data-dia="${hj}">Hoje</button><button class="pil ${F.data===ontem?"on":""}" data-dia="${ontem}">Ontem</button>
          <input id="fData" type="date" value="${esc(F.data)}" style="width:auto;flex-grow:1"></div></div></div>
        ${F.cartao?"":`<div class="campo"><span class="ico">${SVG.check}</span><div class="c"><span class="rot">Efetivada</span><span style="font-size:14px">${F.nat==="RECEITA"?"Já caiu na conta":"Já saiu da conta"}</span></div>
          <label class="sw"><input type="checkbox" id="fEfet" ${F.efet?"checked":""}><span></span></label></div>`}
      </section>
      <section class="card" style="padding:0">
        ${corpoCat}
        <div class="campo"><span class="ico">${F.cartao?SVG.cartao:SVG.conta}</span><div class="c"><label for="fConta">${F.cartao?"Cartão":"Conta"}</label><select id="fConta">${optContas||'<option value="">Nenhuma conta</option>'}</select></div></div>
        ${F.cartao?`${finais.length>1?`<div style="padding:0 16px 12px 52px"><span style="font-size:11px;color:var(--mut)">Final do cartão</span><div class="pilulas">
            <button class="pil ${!F.final?"on":""}" data-final="">Não sei</button>${finais.map(x=>`<button class="pil ${F.final===x.final?"on":""}" data-final="${esc(x.final)}">•${esc(x.final)}${x.uso==="GM"?" GM":""}</button>`).join("")}</div></div>`:""}
          <div style="padding:0 16px 14px 52px;font-size:13px;color:var(--mut)">${fat?`Entra na fatura de <b style="color:var(--txt)">${MESES[+fat.mes.slice(5)-1].toLowerCase()}</b> · fecha ${dm(fat.fechamento)} · vence ${dm(fat.vencimento)}`:"A fatura é definida pela data da compra na próxima sincronização."}</div>`:""}
        <div class="campo"><span class="ico">${SVG.tag}</span><div class="c"><label for="fTags">Tags</label><input id="fTags" placeholder="viagem, audi, presente" value="${esc(F.tags)}" autocomplete="off"></div></div>
      </section>
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${SVG.seguir}</span><div class="c"><span class="rot">Salvar e continuar</span><span style="font-size:14px">Mantém o formulário aberto para o próximo</span></div>
          <label class="sw"><input type="checkbox" id="fCont" ${F.cont?"checked":""}><span></span></label></div>
      </section>
      <button class="btn" id="salvar" style="background:var(--cor-f);color:#0D0E12" ${F.salvando?"disabled":""}>${F.salvando?"Salvando…":"Salvar"}</button>
    </div>
  </div>`;

  const q=id=>document.getElementById(id), re=()=>{ lerForm(); renderForm(); };
  q("fechar").onclick=fecharForm;
  q("salvar").onclick=salvarForm; q("salvarTopo").onclick=salvarForm;
  document.querySelectorAll("[data-rec]").forEach(b=>b.onclick=()=>{ lerForm(); F.rec=b.dataset.rec; renderForm(); });
  document.querySelectorAll("[data-dia]").forEach(b=>b.onclick=()=>{ lerForm(); F.data=b.dataset.dia; renderForm(); });
  document.querySelectorAll("[data-final]").forEach(b=>b.onclick=()=>{ lerForm(); F.final=b.dataset.final; renderForm(); });
  document.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{ lerForm(); F.partes.splice(+b.dataset.rm,1); renderForm(); });
  ["fPer","fData","fConta","fMulti"].forEach(id=>{ if(q(id)) q(id).onchange=re; });
  if(q("fCat")) q("fCat").onchange=()=>{ lerForm(); F.sub=""; F.novaSub=false; renderForm(); };
  F.partes.forEach((p,i)=>{ if(q("pv"+i)) q("pv"+i).oninput=()=>{ lerForm(); const t=F.partes.reduce((s,p)=>s+numBR(p.valor),0); q("fValor").value=t?t.toFixed(2).replace(".",","):""; }; });
  if(q("addParte")) q("addParte").onclick=()=>{ lerForm(); F.partes.push({cat:"",valor:""}); renderForm(); };
  if(q("maisCat")) q("maisCat").onclick=()=>{ lerForm(); F.novaCat=!F.novaCat; F.novaSub=false; F.novaNome=""; renderForm(); if(q("fNovaNome")) q("fNovaNome").focus(); };
  if(q("maisSub")) q("maisSub").onclick=()=>{ lerForm(); F.novaSub=!F.novaSub; F.novaCat=false; F.novaNome=""; renderForm(); if(q("fNovaNome")) q("fNovaNome").focus(); };
  if(q("addCat")) q("addCat").onclick=async()=>{
    lerForm(); const nome=(F.novaNome||"").trim(); if(!nome) return;
    const r=await post("/api/categorias",{nome, natureza:F.nat, pote:F.novaPote});
    if(!r.ok){ F.erro=r.erro||"Não consegui criar a categoria"; return renderForm(); }
    CATS[F.nat]=await api("/api/categorias?natureza="+F.nat); F.cat=String(r.id); F.sub=""; F.novaCat=false; F.novaNome=""; renderForm(); toast("Categoria criada");
  };
  if(q("addSub")) q("addSub").onclick=async()=>{
    lerForm(); const nome=(F.novaNome||"").trim(); if(!nome||!F.cat) return;
    const r=await post("/api/subcategorias",{categoria_id:+F.cat, nome});
    if(!r.ok){ F.erro=r.erro||"Não consegui criar a subcategoria"; return renderForm(); }
    CATS[F.nat]=await api("/api/categorias?natureza="+F.nat); F.sub=String(r.id); F.novaSub=false; F.novaNome=""; renderForm(); toast("Subcategoria criada");
  };
}
function fecharForm(){
  const lista="#"+F.chave;
  if(rotaAnterior===lista) history.back(); else location.hash=lista;
}
async function salvarForm(){
  if(F.salvando) return;
  lerForm(); F.erro="";
  const desc=(F.desc||"").trim();
  const base={natureza:F.nat, descricao:desc, data:F.data, efetivada:F.cartao?true:!!F.efet, conta_id:+F.conta||null,
    tags:String(F.tags||"").split(",").map(t=>t.trim().replace(/^#/,"")).filter(Boolean), cartao_final:F.cartao?(F.final||null):null};
  if(F.rec!=="NAO") base.recorrencia={tipo:F.rec, periodicidade:F.per, a_cada_dias:+F.aCada||null, parcela_inicial:+F.parIni||1, quantidade:+F.qtd||2};
  let envios;
  if(F.multi) envios=F.partes.filter(p=>numBR(p.valor)>0).map(p=>({...base, valor:numBR(p.valor), categoria_id:+p.cat||null}));
  else envios=[{...base, valor:numBR(F.valor), categoria_id:+F.cat||null, subcategoria_id:+F.sub||null}];
  if(!desc) F.erro="Preencha a descrição.";
  else if(!envios.length || envios.some(e=>!(e.valor>0))) F.erro=F.multi?"Informe o valor de pelo menos uma categoria.":"Informe o valor.";
  else if(F.multi && F.partes.some(p=>numBR(p.valor)>0 && !p.cat)) F.erro="Escolha a categoria de cada parte.";
  else if(!F.data) F.erro="Escolha a data.";
  else if(F.rec==="PARCELADA" && (+F.qtd||0) < (+F.parIni||1)) F.erro="A quantidade de parcelas precisa ser maior ou igual à parcela inicial.";
  else if(!base.conta_id) F.erro=F.cartao?"Escolha o cartão.":"Escolha a conta.";
  if(F.erro) return renderForm();
  F.salvando=true; renderForm();
  let criados=0;
  for(const e of envios){
    let r; try{ r=await post("/api/lancamentos",e); }catch(err){ r={ok:false,erro:err.message}; }
    if(!r.ok){ F.salvando=false; F.erro=(criados?`${criados} parte(s) salvas, mas a seguinte falhou: `:"")+(r.erro||"não consegui salvar"); return renderForm(); }
    criados+=r.criados||1;
  }
  F.salvando=false;
  const msg = criados>1 ? `${NAT[F.chave].um[0].toUpperCase()+NAT[F.chave].um.slice(1)} salva · ${criados} lançamentos` : `${NAT[F.chave].um[0].toUpperCase()+NAT[F.chave].um.slice(1)} salva`;
  toast(msg);
  if(F.cont){ F.valor=""; F.desc=""; F.tags=""; F.partes=[{cat:"",valor:""},{cat:"",valor:""}]; F.rec="NAO"; renderForm(); document.getElementById("fValor").focus(); }
  else fecharForm();
}

function rota(){
  rotaAnterior=rotaAtual; rotaAtual=location.hash||"#inicio";
  const h=rotaAtual.slice(1);
  if(h==="cartoes") telaCartoes();
  else if(h==="contas") telaContas();
  else if(h==="receitas"||h==="despesas") telaMov(h);
  else if(h==="nova-receita") telaForm("receita");
  else if(h==="nova-despesa") telaForm("despesa");
  else if(h==="nova-despesa-cartao") telaForm("despesa-cartao");
  else carregar();
}
