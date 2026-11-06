// ===================== DETALHAMENTO (tudo no Início abre o que está por trás) =====================
const POTE_NOME={NEC:"Necessidades",DES:"Desejos",INV:"Investir"};
let PT=null, CT=null, IV=null;
const ehMesAtual=()=>{ const h=new Date(); return mesAtual.getFullYear()===h.getFullYear() && mesAtual.getMonth()===h.getMonth(); };
function mesTitulo(){
  const nomeMes=MESES[mesAtual.getMonth()]+" "+mesAtual.getFullYear();
  return `<button class="mes" id="mesHoje" aria-label="${ehMesAtual()?nomeMes:"Voltar para o mês atual"}"><b style="font-size:16px">${nomeMes}</b>${ehMesAtual()?"":`<small style="color:var(--nec)">↺ voltar ao mês atual</small>`}</button>`;
}
function navMes(fn){   // setas + titulo clicavel (volta pro mes atual)
  const q=id=>document.getElementById(id);
  if(q("ant")) q("ant").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()-1,1); fn(); };
  if(q("prox")) q("prox").onclick=()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()+1,1); fn(); };
  if(q("mesHoje")) q("mesHoje").onclick=()=>{ if(ehMesAtual()) return; const h=new Date(); mesAtual=new Date(h.getFullYear(),h.getMonth(),1); fn(); };
}
const barraMes=()=>`<div style="display:flex;align-items:center;justify-content:center;gap:4px">
  <button class="icon" id="ant" aria-label="Mês anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
  ${mesTitulo()}
  <button class="icon" id="prox" aria-label="Próximo mês"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button></div>`;
function voltar(padrao){ if(rotaAnterior && rotaAnterior!==rotaAtual) history.back(); else location.hash=padrao; }
const topoVoltar=(titulo,sub,direita)=>`<div class="top"><button class="icon" id="voltar" aria-label="Voltar">${SVG.voltar}</button>
  <div class="mes" style="min-width:0"><b style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">${esc(titulo)}</b>${sub?`<small>${sub}</small>`:""}</div>${direita||'<span style="width:44px"></span>'}</div>`;
function listaLanc(itens){
  let ult="", out="";
  for(const i of itens){
    if(i.data!==ult){ out+=`<div class="dia">${rotDia(i.data)}</div>`; ult=i.data; }
    ED["L"+i.id]=edItem(i,"L");
    const det=[catTxt(i)||"sem categoria", (i.banco||"")+(i.conta_tipo==="CARTAO"?" · cartão"+(i.cartao_final?" •"+i.cartao_final:""):"")].filter(Boolean).map(esc).join(" · ");
    out+=`<div class="mov" data-ed="L${i.id}"><div class="bola" style="background:#1C1D25;color:var(--mut)">${esc((i.descricao||"?").trim().slice(0,2).toUpperCase())}</div>
      <div class="d"><span>${esc(i.descricao)}</span><small>${det}</small></div>
      <span class="num" style="font-weight:600;white-space:nowrap;color:${i.valor>0?"var(--rec)":"var(--txt)"}">${brl(i.valor)}</span></div>`;
  }
  return out;
}

// ---------- pote (Necessidades / Desejos / Investir) -> categorias ----------
async function telaPote(p){
  esqueleto();
  let r,l; try{ [r,l]=await Promise.all([api("/api/resumo?mes="+ym(mesAtual)), api(`/api/lancamentos?mes=${ym(mesAtual)}&pote=${p}`)]); }catch(e){ return; }
  PT={p,r,l}; renderPote();
}
function renderPote(){
  const {p,r,l}=PT, info=r.potes.find(x=>x.pote===p)||{teto:0,usado:0,pct:0}, cor=COR[p];
  const g={}; for(const x of l){ const k=x.categoria_id||0; g[k]=g[k]||{id:x.categoria_id,nome:x.categoria||"Sem categoria",valor:0,n:0}; g[k].valor+=-x.valor; g[k].n++; }
  const cats=Object.values(g).sort((a,b)=>b.valor-a.valor), tot=cats.reduce((s,c)=>s+Math.max(c.valor,0),0)||1, cmax=Math.max(...cats.map(c=>c.valor),1);
  const ratio=info.teto>0?info.usado/info.teto:0;
  const lista=cats.map(c=>`<${c.id?`a href="#categoria-${c.id}"`:"div"} class="cat" style="display:flex;flex-direction:column;gap:5px;color:inherit;text-decoration:none;padding:6px 0">
      <div class="t"><span>${esc(c.nome)} <small style="color:var(--mut)">· ${c.n} lanç.</small></span><span>${brl(c.valor)}${c.id?' <span style="color:var(--dim)">›</span>':""}</span></div>
      <div class="barra"><i style="width:${Math.max(c.valor/cmax*100,0).toFixed(0)}%;background:${cor}"></i></div>
      <small style="color:var(--mut);font-size:11px">${Math.round(Math.max(c.valor,0)/tot*100)}% do pote</small></${c.id?"a":"div"}>`).join("");
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar(POTE_NOME[p]+" "+Math.round(info.pct||0)+"%","regra 50/30/20")}
    ${barraMes()}
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">${p==="INV"?"Investido (líquido) no mês":"Gasto no mês"}</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${cor}">${brl(info.usado)}</div>
      <div style="font-size:13px;color:var(--mut)">teto ${brl0(info.teto)} · renda ${brl0(r.renda)} · ${Math.round(ratio*100)}% do teto</div>
      <div class="barra" style="height:8px;margin:10px 20px 0"><i style="width:${Math.min(Math.max(ratio,0)*100,100).toFixed(0)}%;background:${ratio>1&&p!=="INV"?"var(--desp)":cor}"></i></div></div>
    <div class="cards">
      ${ratio>1&&p!=="INV"?`<div class="alerta" style="margin:0"><span>Passou ${brl0(info.usado-info.teto)} do teto deste pote.</span></div>`:""}
      ${p==="INV"?`<a class="card linha" href="#investimentos" style="padding:14px 18px"><div class="nm">Contas de investimento<small>aplicações, resgates e onde está guardado</small></div><span class="chev">›</span></a>`:""}
      <section class="card"><h2>Categorias</h2>${lista||'<div class="vazio">Nada neste pote no mês.</div>'}</section>
      <a href="#categorias" style="font-size:13px;text-align:center;padding:4px">O pote de cada categoria se ajusta em Categorias ›</a>
    </div></div>${nav("inicio")}`;
  document.getElementById("voltar").onclick=()=>voltar("#inicio");
  navMes(()=>telaPote(p));
}

// ---------- categoria -> lançamentos (com filtro por subcategoria) ----------
async function telaCategoria(id){
  esqueleto();
  let l; try{ if(!CATS_ALL) await carregarCats(); l=await api(`/api/lancamentos?mes=${ym(mesAtual)}&categoria_id=${id}`); }catch(e){ return; }
  CT={id, l, sub:(CT&&CT.id===id)?CT.sub:null}; renderCategoria();
}
function renderCategoria(){
  const c=CATS_ALL.find(x=>x.id===CT.id)||{nome:(CT.l[0]||{}).categoria||"Categoria",natureza:"DESPESA",pote:"NENHUM"};
  const sinal=c.natureza==="RECEITA"?1:-1;
  const g={}; for(const x of CT.l){ const k=x.subcategoria||"Sem subcategoria"; g[k]=(g[k]||0)+sinal*x.valor; }
  const subs=Object.entries(g).sort((a,b)=>b[1]-a[1]);
  const itens=CT.sub?CT.l.filter(x=>(x.subcategoria||"Sem subcategoria")===CT.sub):CT.l;
  const total=itens.reduce((s,x)=>s+sinal*x.valor,0);
  const pc=POTE_COR[c.natureza==="DESPESA"?c.pote:"NENHUM"]||POTE_COR.NENHUM;
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar(c.nome, c.natureza==="DESPESA"&&POTE_COR[c.pote]?`<span style="color:${pc[1]}">${POTE_COR[c.pote][2]}</span>`:(c.natureza==="RECEITA"?"receita":"transferência"),
      `<a class="icon" href="#categorias" aria-label="Editar categorias" style="color:var(--txt)">${ICO_CART.lapis}</a>`)}
    ${barraMes()}
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">${CT.sub?esc(CT.sub):"Total no mês"} · ${itens.length} lançamento(s)</div>
      <div class="num" style="font-size:32px;font-weight:700">${brl(total)}</div></div>
    ${subs.length>1||(subs[0]&&subs[0][0]!=="Sem subcategoria")?`<div class="chips" style="padding-top:12px"><button class="chip-b ${!CT.sub?"on":""}" data-sf="">Todas</button>${subs.map(([n,v])=>`<button class="chip-b ${CT.sub===n?"on":""}" data-sf="${esc(n)}">${esc(n)} · ${brl0(v)}</button>`).join("")}</div>`:""}
    <div class="cards">${itens.length?`<section class="card" style="padding:8px 16px">${listaLanc(itens)}</section>`:`<div class="vazio-g">${SVG.vazio}<b style="color:var(--txt);font-size:17px">Nada aqui</b><span>Sem lançamentos nesta categoria no mês.</span></div>`}
      ${itens.length?`<small style="color:var(--mut);text-align:center">Toque num lançamento para trocar a categoria ou subcategoria.</small>`:""}</div>
  </div>${nav("inicio")}`;
  document.getElementById("voltar").onclick=()=>voltar("#inicio");
  document.querySelectorAll("[data-sf]").forEach(b=>b.onclick=()=>{ CT.sub=b.dataset.sf||null; renderCategoria(); });
  navMes(()=>telaCategoria(CT.id));
  ligarEdicao();
}

// ---------- investimentos ----------
async function telaInvest(){
  esqueleto();
  try{ IV=await api("/api/investimentos?mes="+ym(mesAtual)); }catch(e){ return; }
  const d=IV;
  const bancos=d.bancos.map(b=>`<div class="linha" style="min-height:62px">${logo(b,40)}
      <div class="nm">${esc(b.banco)}<small>${b.aplicado_mes||b.resgatado_mes?`no mês: +${brl0(b.aplicado_mes)} aplicado · −${brl0(b.resgatado_mes)} resgatado`:"sem movimento no mês"}</small></div>
      <span class="vl num" style="color:${b.saldo<0?"var(--desp)":"var(--inv)"}">${brl(b.saldo)}</span></div>`).join("");
  const cxs=d.caixinhas.map(c=>`<div class="linha"><div class="mini" style="background:#13261C;color:var(--inv)">◆</div>
      <div class="nm">${esc(c.nome)}<small>${esc(c.banco)}${c.meta?` · meta ${brl0(c.meta)} · ${Math.round(c.saldo/c.meta*100)}%`:""}</small></div><span class="vl num">${brl(c.saldo)}</span></div>`).join("");
  let ult="", movs="";
  for(const m of d.movimentos){
    if(m.data!==ult){ movs+=`<div class="dia">${rotDia(m.data)}</div>`; ult=m.data; }
    ED["L"+m.id]=edItem(m,"L");
    const ap=m.valor<0;
    movs+=`<div class="mov" data-ed="L${m.id}"><div class="bola" style="background:${ap?"#13261C":"#3A2E1A"};color:${ap?"var(--inv)":"var(--des)"}">${ap?"↓":"↑"}</div>
      <div class="d"><span>${esc(m.descricao)}</span><small>${esc(m.banco)} · ${ap?"guardado":"resgatado"}${m.categoria?" · "+esc(catTxt(m)):""}</small></div>
      <span class="num" style="font-weight:600;white-space:nowrap;color:${ap?"var(--inv)":"var(--des)"}">${ap?"+ ":"− "}${brl(Math.abs(m.valor))}</span></div>`;
  }
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar("Investimentos","aplicações e resgates")}
    ${barraMes()}
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Investido no mês (líquido)</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${d.liquido<0?"var(--des)":"var(--inv)"}">${brl(d.liquido)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">aplicado <b class="num" style="color:var(--inv)">${brl0(d.aplicado)}</b></span><span class="chip">resgatado <b class="num" style="color:var(--des)">${brl0(d.resgatado)}</b></span></div>
      ${d.liquido<0?`<div style="font-size:12px;color:var(--mut);margin-top:8px">Resgatou mais do que aplicou: saíram ${brl0(-d.liquido)} dos investimentos neste mês.</div>`:""}</div>
    <div class="cards">
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Onde está guardado</h2><small style="color:var(--mut)">${brl0(d.guardado)}</small></div>
        ${bancos||'<div class="vazio">Nenhuma aplicação encontrada no extrato.</div>'}
        <small style="display:block;color:var(--mut);font-size:11px;margin-top:6px">Saldo estimado pelo extrato até o fim do mês (aplicações − resgates, sem rendimentos). O Pluggy não envia o saldo dos investimentos.</small></section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Caixinhas</h2><a href="#contas" style="font-size:13px">contas ›</a></div>
        ${cxs||'<div class="vazio">Nenhuma caixinha cadastrada. Cadastre em Contas → + Caixinha com o saldo de hoje para acompanhar cada meta.</div>'}</section>
      <section class="card" style="padding:8px 16px"><h2 style="margin:10px 0 0">Movimentações do mês</h2>${movs||'<div class="vazio" style="padding:10px 0">Nenhuma aplicação ou resgate no mês.</div>'}</section>
    </div></div>${nav("inicio")}`;
  document.getElementById("voltar").onclick=()=>voltar("#inicio");
  navMes(telaInvest);
  ligarEdicao();
}

// ---------- "Previsto": de onde vem o número ----------
function abrirPrevisto(d){
  const p=d.previsto_det; if(!p) return;
  let el=document.getElementById("sheet"); if(!el){ el=document.createElement("div"); el.id="sheet"; document.body.appendChild(el); }
  const kv=(t,v,cor)=>`<div class="kv"><span>${t}</span><span class="num" style="${cor?`color:${cor}`:""}">${v}</span></div>`;
  el.innerHTML=`<div class="veu" style="z-index:25" id="shVeu"></div><div class="sheet" role="dialog" aria-label="Como o previsto é calculado"><div class="alca"></div>
    <div style="padding:0 18px 8px"><b style="font-size:17px">Previsto para o fim do mês</b>
      ${kv("Saldo hoje (contas e carteira)",brl(p.saldo))}
      ${kv("+ Falta receber",brl(p.falta_receber),"var(--rec)")}
      ${kv("− Fatura do cartão a pagar",brl(-p.fatura),"var(--desp)")}
      ${kv(`− Gasto do dia a dia (${brl0(p.gasto_diario)}/dia × ${p.dias} dias)`,brl(-p.gasto_diario*p.dias),"var(--desp)")}
      ${kv("− Despesas agendadas",brl(-p.agendados),"var(--desp)")}
      <div class="kv" style="font-weight:700"><span>= Previsto</span><span class="num">${brl(d.previsto)}</span></div>
      <small style="color:var(--mut);display:block;margin-top:8px">O gasto do dia a dia é a média dos últimos 60 dias (sem compras acima de R$ 1.000).</small>
      <button class="btn sec" id="shFechar" style="width:100%;margin-top:14px">Fechar</button></div></div>`;
  document.getElementById("shVeu").onclick=fecharSheet; document.getElementById("shFechar").onclick=fecharSheet;
}

