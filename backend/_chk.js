
// ===================== estado =====================
const TOKEN_KEY = "app_pessoal_token";
let token = (()=>{ try{ return localStorage.getItem(TOKEN_KEY) }catch(e){ return null } })();
const hoje = new Date();
let mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const COR = {NEC:"var(--nec)", DES:"var(--des)", INV:"var(--inv)", NENHUM:"var(--mut)"};
const PALETA = ["#5B9DFF","#8A7BFF","#4CC38A","#F2A65A","#FF7A70","#5FC9D6","#C58AF2","#E3C35B"];
const brl = v => (v<0?"− ":"") + "R$ " + Math.abs(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const brl0 = v => (v<0?"− ":"") + "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR");
const ym = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

async function api(caminho){
  const r = await fetch(caminho, {headers:{"X-Token":token||""}});
  if (r.status === 401) { pedirToken("Token inválido."); throw new Error("401"); }
  if (!r.ok) throw new Error((await r.json().catch(()=>({}))).erro || ("HTTP "+r.status));
  return r.json();
}

// ===================== login simples (token do .env) =====================
function pedirToken(msg){
  document.getElementById("raiz").innerHTML = `
    <div class="login">
      <b class="num" style="font-size:22px">Minhas contas</b>
      <label for="tk" style="font-size:13px;color:var(--mut)">Token de acesso (APP_TOKEN do .env)</label>
      <input id="tk" type="password" autocomplete="current-password">
      <button id="ok">Entrar</button>
      ${msg?`<span class="erro">${esc(msg)}</span>`:""}
    </div>`;
  document.getElementById("ok").onclick = () => {
    token = document.getElementById("tk").value.trim();
    try{ localStorage.setItem(TOKEN_KEY, token) }catch(e){}
    carregar();
  };
}

// ===================== gráfico de saldo =====================
function graficoSaldo(d){
  const W=350, H=128, serie=d.serie.map(p=>p.saldo);
  if (!serie.length) return "";
  const pts = serie.slice();
  const alvo = d.aberto ? d.previsto : null;
  const todos = alvo!==null ? pts.concat([alvo,0]) : pts.concat([0]);
  const mn=Math.min(...todos), mx=Math.max(...todos);
  const X=k=>4+(k/(d.dias-1))*W, Y=v=>6+(1-(v-mn)/((mx-mn)||1))*(H-12);
  let real=""; pts.forEach((v,k)=>{ real+=(k?" L":"M")+X(k).toFixed(1)+" "+Y(v).toFixed(1) });
  const hx=X(pts.length-1), hy=Y(pts[pts.length-1]);
  const area = real+` L${hx.toFixed(1)} ${Y(mn).toFixed(1)} L4 ${Y(mn).toFixed(1)} Z`;
  const prev = alvo!==null && pts.length<d.dias ? `<path d="M${hx.toFixed(1)} ${hy.toFixed(1)} L${X(d.dias-1).toFixed(1)} ${Y(alvo).toFixed(1)}" fill="none" stroke="var(--nec)" stroke-width="2" stroke-dasharray="4 5" stroke-opacity=".7"/>` : "";
  return `<svg viewBox="0 0 358 150" role="img" aria-label="Saldo das contas ao longo do mês">
    <line x1="4" y1="${Y(0).toFixed(1)}" x2="354" y2="${Y(0).toFixed(1)}" stroke="var(--line)"/>
    <path d="${area}" fill="var(--nec)" fill-opacity=".12"/>
    <path d="${real}" fill="none" stroke="var(--nec)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${prev}
    <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="5" fill="var(--bg)" stroke="var(--nec)" stroke-width="2.5"/>
    <text x="4" y="146" fill="var(--mut)" font-size="10">01</text>
    <text x="170" y="146" fill="var(--mut)" font-size="10">15</text>
    <text x="338" y="146" fill="var(--mut)" font-size="10">${d.dias}</text>
  </svg>`;
}

// ===================== rosca 50/30/20 =====================
function rosca(potes, renda){
  const C=2*Math.PI*52; let acc=0, usado=0;
  const arcos = potes.map(p=>{
    const u=Math.max(p.usado,0); usado+=u;
    const len = renda>0 ? C*Math.min(u/renda,1) : 0;
    const s=`<circle cx="64" cy="64" r="52" fill="none" stroke="${COR[p.pote]}" stroke-width="14"
      stroke-dasharray="${Math.max(len-3,0).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 64 64)"/>`;
    acc+=len; return s;
  }).join("");
  const pct = renda>0 ? Math.round(usado/renda*100)+"%" : "—";
  return `<svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="Uso da renda por pote" style="flex-shrink:0">
    <circle cx="64" cy="64" r="52" fill="none" stroke="var(--line)" stroke-width="14"/>${arcos}
    <text x="64" y="62" text-anchor="middle" fill="var(--txt)" font-size="22" font-weight="700" font-family="Space Grotesk">${pct}</text>
    <text x="64" y="80" text-anchor="middle" fill="var(--mut)" font-size="10">da renda usada</text></svg>`;
}

// ===================== tela =====================
function render(d, lancs){
  INICIO=[d,lancs];
  const nomeMes = MESES[mesAtual.getMonth()]+" "+mesAtual.getFullYear();
  const status = d.aberto ? `mês em andamento · dia ${d.hoje}` : (new Date(d.mes+"-01") > hoje ? "mês futuro" : "mês fechado");
  const fracMes = d.hoje/d.dias;
  let alerta = "";
  const baldes = d.potes.map(p=>{
    const r = p.teto>0 ? p.usado/p.teto : 0;
    const estourou = p.pote!=="INV" && d.aberto && r > fracMes+0.25;
    if (estourou && !alerta) alerta = `${p.nome} já usou ${Math.round(r*100)}% do teto e o mês está em ${Math.round(fracMes*100)}%.`;
    if (!d.aberto && p.pote!=="INV" && r>1 && !alerta) alerta = `${p.nome} passou ${brl0(p.usado-p.teto)} do teto neste mês.`;
    return `<a class="balde" href="#pote-${p.pote}" style="color:inherit;text-decoration:none">
      <div class="t"><b style="color:${COR[p.pote]}">${esc(p.nome)} ${Math.round(p.pct)}%</b><span style="color:${estourou||r>1?"var(--alerta)":"#C9C8C2"}">${Math.round(r*100)}%</span></div>
      <div class="barra"><i style="width:${Math.min(r*100,100).toFixed(0)}%;background:${COR[p.pote]}"></i></div>
      <small>${brl0(p.usado)} de ${brl0(p.teto)} ›</small></a>`;
  }).join("");
  const cats = catsInicio(d);
  const contas = d.contas.map(c=>`
    <div class="linha"><div class="ic" style="background:#F3F2EE;color:#0D0E12;font-size:11px;font-weight:700">${esc(c.banco.slice(0,2).toUpperCase())}</div>
    <div class="nm">${esc(c.banco)}<small>${rotuloConta(c)}</small></div>
    <span class="vl num">${c.tipo==="CARTAO"?brl(-Math.abs(c.fatura_valor ?? c.saldo)):brl(c.saldo)}</span></div>`).join("");
  const ult = lancs.filter(l=>l.tipo!=="PAG_FATURA").slice(0,8).map(l=>{ ED["L"+l.id]=edItem(l,"L"); return `
    <div class="lanc" data-ed="L${l.id}"><div class="d"><span>${esc(l.descricao)}</span>
      <small>${l.data.slice(8,10)}/${l.data.slice(5,7)} · ${esc(l.banco||"")} · ${esc(catTxt(l)||"sem categoria — toque para classificar")}${l.placa?" · "+esc(l.placa):""}</small></div>
      <span class="v num" style="color:${l.valor>0?"var(--rec)":"var(--txt)"}">${brl(l.valor)}</span></div>`; }).join("") || `<div class="vazio">Nenhum lançamento.</div>`;

  const lim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1);
  document.getElementById("raiz").innerHTML = `
  <div class="app">
    <div class="top">
      <a class="icon" href="#categorias" aria-label="Categorias" style="color:var(--txt)"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg></a>
      <div style="display:flex;align-items:center;gap:4px">
        <button class="icon" id="ant" aria-label="Mês anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button class="mes" id="mesHoje" aria-label="Voltar para o mês atual"><b>${nomeMes}</b><small style="${ehMesAtual()?"":"color:var(--nec)"}">${ehMesAtual()?status:status+" · ↺ mês atual"}</small></button>
        <button class="icon" id="prox" aria-label="Próximo mês" ${mesAtual>=lim?"disabled":""}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <button class="icon" id="sync" aria-label="Sincronizar bancos agora"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></button>
    </div>
    <div class="trio">
      <div><div class="lbl">Inicial</div><span class="chip num">${brl0(d.inicial)}</span></div>
      <a href="#contas" style="color:inherit;text-decoration:none"><div class="lbl">${d.aberto?"Saldo hoje":"Saldo final"}</div><div class="saldo">${brl0(d.saldo)}</div></a>
      <div ${d.previsto_det?'id="prevBtn" role="button" style="cursor:pointer"':""}><div class="lbl">Previsto${d.previsto_det?" ⓘ":""}</div><span class="chip num">${brl0(d.previsto)}</span></div>
    </div>
    <div class="grafico">${graficoSaldo(d)}</div>
    <div class="cards">
      <section class="card"><h2>Visão geral</h2>
        <a class="linha" href="#receitas"><div class="ic" style="background:#1E3A2C;color:var(--rec)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg></div><div class="nm">Receitas${d.falta_receber>0?`<small>falta receber ~${brl0(d.falta_receber)}</small>`:""}</div><span class="vl num">${brl(d.receitas)}</span><span class="chev">›</span></a>
        <a class="linha" href="#despesas"><div class="ic" style="background:#3D2023;color:var(--desp)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg></div><div class="nm">Despesas<small>fora do cartão</small></div><span class="vl num">${brl(d.despesas)}</span><span class="chev">›</span></a>
        <a class="linha" href="#cartoes"><div class="ic" style="background:#1C2A42;color:var(--nec)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg></div><div class="nm">Cartões de crédito<small>${d.aberto?"fatura a pagar no mês":"faturas que vencem no mês"}${d.despesas_cartao?` · compras ${brl0(d.despesas_cartao)}`:""}</small></div><span class="vl num">${brl(d.fatura_cartao)}</span><span class="chev">›</span></a>
        <a class="linha" href="#investimentos"><div class="ic" style="background:#3A2E1A;color:var(--des)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 17l5-5 4 4 7-7"/><path d="M15 9h5v5"/></svg></div><div class="nm">Investido no mês${d.aplicado||d.resgatado?`<small>aplicado ${brl0(d.aplicado)} · resgatado ${brl0(d.resgatado)}</small>`:""}</div><span class="vl num" style="color:${d.investido<0?"var(--des)":"var(--txt)"}">${brl(d.investido)}</span><span class="chev">›</span></a>
      </section>
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Regra 50/30/20</h2><a href="#receitas" style="color:var(--mut);font-size:13px;text-decoration:none">renda ${brl0(d.renda)} ›</a></div>
        <div class="potes">${rosca(d.potes,d.renda)}<div style="flex-grow:1;display:flex;flex-direction:column;gap:12px">${baldes}</div></div>
        ${alerta?`<div class="alerta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg><span>${esc(alerta)}</span></div>`:""}
      </section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Despesas por categoria</h2><a href="#categorias" style="font-size:13px">categorias ›</a></div>${cats}</section>
      <section class="card"><h2>Últimos lançamentos</h2>${ult}</section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Contas</h2><a href="#contas" style="font-size:13px">ver em cascata ›</a></div>${contas}</section>
    </div>
  </div>
  ${nav('inicio')}`;
  document.getElementById("ant").onclick = ()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()-1,1); carregar(); };
  document.getElementById("prox").onclick = ()=>{ mesAtual=new Date(mesAtual.getFullYear(),mesAtual.getMonth()+1,1); carregar(); };
  document.getElementById("sync").onclick = sincronizar;
  ligarEdicao();
  document.getElementById("mesHoje").onclick=()=>{ if(ehMesAtual()) return; const h=new Date(); mesAtual=new Date(h.getFullYear(),h.getMonth(),1); carregar(); };
  if(document.getElementById("prevBtn")) document.getElementById("prevBtn").onclick=()=>abrirPrevisto(d);
  document.querySelectorAll("[data-catab]").forEach(el=>el.onclick=()=>{ location.hash="#categoria-"+el.dataset.catab; });
}

function esqueleto(){
  document.getElementById("raiz").innerHTML = `<div class="app" style="padding:16px;gap:12px;display:flex;flex-direction:column">
    <div class="sk" style="height:44px"></div><div class="sk" style="height:60px"></div><div class="sk" style="height:150px"></div>
    <div class="sk" style="height:220px;border-radius:22px"></div><div class="sk" style="height:200px;border-radius:22px"></div></div>`;
}

function rotuloConta(c){
  if (c.tipo==="CARTAO") return `Cartão ${c.numero||""} · fatura ${c.fatura_vencimento?"vence "+c.fatura_vencimento.slice(8,10)+"/"+c.fatura_vencimento.slice(5,7):"atual"}`;
  const sub = {CHECKING_ACCOUNT:"Conta corrente", SAVINGS_ACCOUNT:"Poupança"}[c.subtipo] || (c.tipo==="INVESTIMENTO"?"Aplicação":c.tipo==="CARTEIRA"?"Carteira":"Conta");
  return sub + (c.numero?` · ${c.numero}`:"");
}

function nav(ativo){
  const it=(id,rot,svg,ok=true)=>`<a class="${ativo===id?"on":""} ${ok?"":"off"}" ${ok?`href="#${id}"`:'aria-disabled="true"'}>${svg}${rot}</a>`;
  return `<nav>
    ${it("inicio","Início",'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>')}
    ${it("cartoes","Cartões",'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>')}
    ${it("contas","Contas",'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/></svg>')}
    ${it("carros","Carros",'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/></svg>',false)}
    ${it("listas","Listas",'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/></svg>',false)}
  </nav>`;
}

// ===================== CARTÕES / FATURAS =====================
let CART=null, cartSel=null, mesSel=null;
const STATUS = {
  "ABERTA":["Aberta","#1C2A42","var(--nec)"], "FECHADA":["Fechada · a pagar","#3A2E1A","var(--des)"],
  "PAGA":["Paga","#1E3A2C","var(--inv)"], "PAGA PARCIAL":["Paga parcial","#3D2023","var(--desp)"],
  "VENCIDA":["Vencida","#3D2023","var(--desp)"], "ZERADA":["Sem gastos","#1C1D25","var(--mut)"],
  "PREVISTA":["Prevista (parcelas)","#1C1D25","var(--mut)"]};
const dm = iso => iso ? iso.slice(8,10)+"/"+iso.slice(5,7) : "—";
const MES3 = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

async function telaCartoes(){
  esqueleto();
  try{ CART = await api("/api/cartoes"); }catch(e){ return; }
  if (!CART.length){ document.getElementById("raiz").innerHTML=`<div class="app"><div class="cards"><div class="vazio">Nenhum cartão sincronizado.</div></div></div>${nav("cartoes")}`; return; }
  if (!cartSel || !CART.find(c=>c.id===cartSel)) cartSel = CART.find(c=>c.faturas.some(f=>f.total>0))?.id || CART[0].id;
  const c = CART.find(c=>c.id===cartSel);
  if (!mesSel || !c.faturas.find(f=>f.mes===mesSel)){
    const hojeIso = new Date().toISOString().slice(0,10);
    const proximas = c.faturas.filter(f=>f.vencimento>=hojeIso && f.status!=="PREVISTA").sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
    mesSel = (proximas[0]||c.faturas[0]||{}).mes;
  }
  const f = c.faturas.find(f=>f.mes===mesSel);
  let itens=[]; if (f) { try{ itens = await api(`/api/cartoes/${c.id}/fatura/${f.mes}`) }catch(e){} }
  renderCartoes(c, f, itens);
}

function renderCartoes(c, f, itens){
  const usado = c.usado ?? ((c.limite||0)-(c.disponivel||0)), pctLim = c.limite? Math.min(usado/c.limite*100,100):0;
  const chipsCart = CART.map(k=>`<button class="chip-b ${k.id===c.id?"on":""}" data-cart="${k.id}">${esc(k.banco)} · ${esc(k.numero||"")}</button>`).join("");
  const meses = c.faturas.slice().sort((a,b)=>a.mes.localeCompare(b.mes)).map(x=>{
    const st=STATUS[x.status]||["",""," var(--mut)"];
    return `<button class="mesbtn ${x.mes===mesSel?"on":""}" data-mes="${x.mes}">
      <b>${MES3[+x.mes.slice(5,7)-1]}/${x.mes.slice(2,4)}</b><small style="color:${st[2]}">${x.total>0?brl0(x.total):"—"}</small></button>`;
  }).join("");
  let corpo = `<div class="vazio">Sem fatura neste mês.</div>`;
  if (f){
    const st = STATUS[f.status]||[f.status,"#1C1D25","var(--mut)"];
    const falta = Math.max(f.total-f.pago,0);
    corpo = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="badge" style="background:${st[1]};color:${st[2]}">${st[0].toUpperCase()}</span>
        ${f.estimada?`<small style="color:var(--mut)">valor pelas compras lançadas</small>`:""}
      </div>
      <div class="num" style="font-size:34px;font-weight:700;margin:10px 0 2px">${brl(f.total)}</div>
      ${falta>0.01 && !["ABERTA","PREVISTA"].includes(f.status)?`<div style="color:var(--des);font-size:13px">Falta pagar ${brl(falta)}</div>`:""}
      <div style="margin-top:10px">
        <div class="kv"><span>Fechamento</span><span>${dm(f.fechamento)}${f.estimada?" (previsto)":""}</span></div>
        <div class="kv"><span>Vencimento</span><span>${dm(f.vencimento)}</span></div>
        <div class="kv"><span>Pagamento</span><span>${f.pago>0?`${brl(f.pago)} em ${dm(f.data_pagamento)}`:"—"}</span></div>
        ${f.minimo?`<div class="kv"><span>Pagamento mínimo</span><span>${brl(f.minimo)}</span></div>`:""}
        ${f.saldo_anterior>0?`<div class="kv"><span>Saldo da fatura anterior (não pago)</span><span style="color:var(--des)">${brl(f.saldo_anterior)}</span></div>`:""}
        ${f.encargos>0?`<div class="kv"><span>Juros, multa e IOF</span><span style="color:var(--desp);font-weight:700">${brl(f.encargos)}</span></div>`:""}
        ${(f.encargos_detalhe||[]).map(e=>`<div class="kv" style="padding-left:12px;font-size:13px"><span>${esc(e.descricao||e.tipo)}</span><span>${brl(e.valor)}</span></div>`).join("")}
        ${f.saldo_inicial>0?`<div class="kv"><span>Fatura atual informada no cadastro</span><span>${brl(f.saldo_inicial)}</span></div>`:""}
        <div class="kv"><span>Compras pessoais</span><span>${brl(f.pessoal)}</span></div>
        ${f.gm>0?`<div class="kv"><span>Compras da GM</span><span style="color:var(--des)">${brl(f.gm)}</span></div>`:""}
      </div>
      ${f.encargos>0?`<div class="alerta"><span>${brl(f.encargos)} de juros/multa/IOF nesta fatura${f.saldo_anterior>0?` — a fatura anterior não foi paga inteira (${brl(f.saldo_anterior)} carregados)`:""}.</span></div>`:""}`;
  }
  const finais = c.finais.filter(x=>x.final!=="0000").map(x=>`
    <div class="linha" style="min-height:56px;${x.ativo?"":"opacity:.55"}">
      <div class="nm">Final ${esc(x.final)}${x.final===c.numero?" · titular":""}${x.apelido?` · ${esc(x.apelido)}`:""}${x.ativo?"":'<span class="tag" style="background:#3D2023;color:var(--desp)">CANCELADO</span>'}
        <small>${x.n?`${x.n} compras · ${brl0(+x.total)}${x.ultima?` · última ${dm(String(x.ultima).slice(0,10))}`:""}`:"sem compras no período"}</small></div>
      <div class="seg"><button class="${x.uso!=="GM"?"on":""}" data-final="${esc(x.final)}" data-uso="PESSOAL">Pessoal</button><button class="${x.uso==="GM"?"on":""}" data-final="${esc(x.final)}" data-uso="GM">GM</button></div>
    </div>`).join("") || `<div class="vazio">Nenhum final identificado ainda.</div>`;
  const lista = itens.filter(l=>l.tipo!=="PAG_FATURA").map(l=>{ ED["L"+l.id]=edItem(l,"L"); return `
    <div class="lanc" data-ed="L${l.id}"><div class="d"><span>${esc(l.descricao)}${l.uso==="GM"?'<span class="tag">GM</span>':""}</span>
      <small>${dm(l.data)} · final ${esc(l.cartao_final||"—")}${l.obs?" · "+esc(l.obs):""} · ${esc(catTxt(l)||"sem categoria")}</small></div>
      <span class="v num" style="color:${l.valor>0?"var(--rec)":"var(--txt)"}">${brl(l.valor)}</span></div>`; }).join("") || `<div class="vazio">Nenhuma compra nesta fatura.</div>`;
  document.getElementById("raiz").innerHTML = `
  <div class="app">
    <div class="top"><a class="icon" href="#cartoes" aria-label="Voltar" style="color:var(--txt)">${SVG.voltar}</a>
      <div class="mes" style="min-width:0"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px">${esc(c.nome)}</b><small style="${c.responsavel==="GM"?"color:var(--des)":""}">${c.responsavel==="GM"?"cartão da GM · fora das suas despesas":esc(c.banco)+(c.numero?" · •"+esc(c.numero):"")}</small></div>
      <a class="icon" href="#editar-cartao-${c.id}" aria-label="Editar cartão" style="color:var(--txt)">${ICO_CART.lapis}</a></div>
    <div class="cards" style="padding-bottom:0">
      <section class="card">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mut)"><span>Limite usado</span><span>${brl0(usado)} de ${brl0(c.limite||0)}</span></div>
        <div class="barra" style="height:10px;margin:8px 0 6px"><i style="width:${pctLim.toFixed(0)}%;background:${pctLim>85?"var(--desp)":"var(--nec)"}"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:13px"><span>Disponível <b class="num">${brl(c.disponivel||0)}</b></span>
          ${c.limite_aprovado && c.limite_aprovado>c.limite?`<span style="color:var(--mut)">limite configurado · aprovado ${brl0(c.limite_aprovado)}</span>`:""}</div>
      </section>
    </div>
    <div class="chips" style="padding-top:14px" id="meses">${meses}</div>
    <div class="cards">
      <section class="card">${corpo}${botaoPagar(c,f)}</section>
      <section class="card"><h2>Compras da fatura</h2>${lista}</section>
      <section class="card"><h2>Finais do cartão</h2><small style="color:var(--mut);display:block;margin-bottom:6px">Marque como GM o cartão de uso da empresa: as compras dele saem dos seus potes.</small>${finais}</section>
    </div>
  </div>${nav("cartoes")}`;
  document.querySelectorAll("[data-cart]").forEach(b=>b.onclick=()=>{cartSel=+b.dataset.cart; mesSel=null; telaCartoes();});
  document.querySelectorAll("[data-mes]").forEach(b=>b.onclick=()=>{mesSel=b.dataset.mes; telaCartoes();});
  document.querySelectorAll("[data-uso]").forEach(b=>b.onclick=async()=>{
    await fetch(`/api/cartoes/${c.id}/finais/${encodeURIComponent(b.dataset.final)}`,{method:"POST",headers:{"X-Token":token||"","Content-Type":"application/json"},body:JSON.stringify({uso:b.dataset.uso})});
    telaCartoes();
  });
  ligarEdicao();
  if(document.getElementById("pagarFat")) document.getElementById("pagarFat").onclick=async()=>{
    const r=await post(`/api/cartoes/${c.id}/fatura/${f.mes}/pagar`,{}); toast(r.ok?`Fatura marcada como paga (${brl(r.valor)})`:(r.erro||"Não consegui")); telaCartoes(); };
  const m=document.getElementById("meses"), on=m.querySelector(".on"); if(on) m.scrollLeft = on.offsetLeft - m.clientWidth/2 + on.clientWidth/2;
}

// ===================== CONTAS EM CASCATA =====================
let CONTAS=null, abertos={Nubank:true}, painel=null;
function logo(b, tam=40){
  return `<div class="logo" style="width:${tam}px;height:${tam}px;background:${b.cor}">${b.emoji?`<span style="font-size:${Math.round(tam*.55)}px;line-height:1">${esc(b.emoji)}</span>`:`${esc(b.sigla)}<img src="/static/logos/${b.slug}.svg" alt="" onerror="this.remove()">`}</div>`;
}
async function telaContas(){
  esqueleto();
  try{ CONTAS = await api("/api/contas"); }catch(e){ return; }
  renderContas();
}
function renderContas(){
  const d=CONTAS, P=d.patrimonio;
  const MINI={CORRENTE:["CC","#262833","var(--txt)"],CARTEIRA:["R$","#1E3A2C","var(--inv)"],POUPANCA:["PO","#13261C","var(--inv)"],
    INVESTIMENTO:["CX","#13261C","var(--inv)"],CAIXINHA:["◆","#13261C","var(--inv)"],NAO_ALOCADO:["?","#3A2E1A","var(--des)"],CARTAO:["CT","#2A1F3D","#C9B6FF"]};
  const bancos = d.bancos.map(b=>{
    const ab=!!abertos[b.banco];
    const res=[b.guardado>0?`guardado ${brl0(b.guardado)}`:"", b.fatura>0?`fatura ${brl0(b.fatura)}`:""].filter(Boolean).join(" · ")||"conta";
    const itens = b.itens.map(i=>{
      const m=MINI[i.tipo]||["·","#262833","var(--txt)"], n2=i.nivel===2;
      return `<div class="sub-i" data-it="${i.tipo}:${i.id}" role="button" style="cursor:pointer;padding-left:${n2?44:22}px">
        <div class="trilho" style="background:${n2?"#2D5A40":"var(--line)"}"></div>
        <div class="mini" style="background:${m[1]};color:${m[2]}">${m[0]}</div>
        <div style="flex-grow:1;display:flex;flex-direction:column;min-width:0">
          <span style="font-size:${n2?14:15}px;font-weight:${n2?500:600}">${esc(i.nome)}</span>
          <span style="font-size:11px;color:var(--mut)">${esc(i.sub||"")}</span>
          ${i.pct!=null?`<div class="barra" style="height:5px;margin-top:5px"><i style="width:${i.pct}%;background:var(--inv)"></i></div>`:""}
        </div>
        <span class="num" style="font-size:14px;font-weight:600;white-space:nowrap;color:${i.valor<0?"var(--desp)":n2?"#C9C8C2":"var(--txt)"}">${brl(i.valor)}</span></div>`;
    }).join("");
    return `<section class="card" style="padding:0;overflow:hidden">
      <div class="banco-h"><button data-bcfg="${esc(b.banco)}" aria-label="Configurar ${esc(b.banco)}" style="padding:0;flex-shrink:0">${logo(b)}</button>
        <button data-banco="${esc(b.banco)}" style="flex-grow:1;display:flex;align-items:center;gap:12px;text-align:left;padding:0;min-width:0">
        <div style="flex-grow:1;display:flex;flex-direction:column;min-width:0"><b style="font-size:16px">${esc(b.apelido||b.banco)}</b><small style="color:var(--mut);font-size:12px">${res}</small></div>
        <span class="num" style="font-weight:700;font-size:16px;color:${b.total<0?"var(--desp)":"var(--txt)"}">${brl0(b.total)}</span>
        <span style="color:var(--mut);width:14px">${ab?"▾":"▸"}</span></button></div>
      ${ab?`<div style="border-top:1px solid var(--line);padding:4px 0 8px">${itens}
        <div style="display:flex;gap:8px;padding:8px 16px 4px 22px;flex-wrap:wrap"><button class="mini-b" data-cxnova="${esc(b.banco)}" style="color:var(--inv);border-color:#2D5A40">+ Caixinha</button>
        <button class="mini-b" data-bcfg="${esc(b.banco)}">⚙ Configurar ${esc(b.apelido||b.banco)}</button></div></div>`:""}</section>`;
  }).join("");
  const pend = d.pendentes.slice(0,5).map(p=>`
    <div style="display:flex;flex-direction:column;gap:6px;padding:8px 0;border-bottom:1px solid var(--line)">
      <span style="font-size:13px"><b>${brl(Math.abs(p.valor))}</b> · ${p.valor<0?"aplicado":"resgatado"} em ${dm(p.data)}. Qual caixinha?</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${d.caixinhas.map(c=>`<button class="chip-b" style="height:34px" data-alocar="${p.id}" data-cx="${c.id}">${esc(c.nome)}</button>`).join("")}</div>
    </div>`).join("");
  document.getElementById("raiz").innerHTML = `
  <div class="app">
    <div class="top"><span style="width:44px"></span><div class="mes"><b>Contas</b><small>bancos, caixinhas e cartões</small></div>
      <button class="icon" id="sync" aria-label="Sincronizar bancos agora"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg></button></div>
    <div style="padding:8px 20px 4px">
      <div class="lbl" style="font-size:12px;color:var(--mut)">Patrimônio líquido</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${P.liquido<0?"var(--desp)":"var(--txt)"}">${brl0(P.liquido)}</div>
      <div style="display:flex;gap:14px;font-size:12px;color:var(--mut);flex-wrap:wrap">
        <span>em contas <b style="color:var(--txt)">${brl0(P.contas)}</b></span><span>guardado <b style="color:var(--inv)">${brl0(P.guardado)}</b></span>
        <span>cartões <b style="color:var(--desp)">${brl0(P.dividas)}</b></span></div>
    </div>
    <div class="cards">
      ${bancos}
      ${d.pendentes.length&&d.caixinhas.length?`<section class="card" style="border:1px dashed #333542;background:var(--card2)"><h2 style="font-size:15px">${d.pendentes.length} movimento(s) de caixinha sem destino</h2>${pend}</section>`:""}
      ${painel==="caixinha"?formCaixinha():painel==="transferir"?formTransferir():`
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <button class="btn pri" id="abrirTransf">⇄ Transferir</button><button class="btn sec" id="abrirCx">+ Caixinha</button></div>`}
    </div>
  </div>${nav("contas")}`;
  document.querySelectorAll("[data-banco]").forEach(b=>b.onclick=()=>{abertos[b.dataset.banco]=!abertos[b.dataset.banco]; renderContas();});
  document.querySelectorAll("[data-bcfg]").forEach(b=>b.onclick=()=>{ location.hash=urlBanco(b.dataset.bcfg); });
  document.querySelectorAll("[data-it]").forEach(el=>el.onclick=()=>{ const [t,id]=el.dataset.it.split(":"); irItemConta(t,id); });
  document.querySelectorAll("[data-cxnova]").forEach(b=>b.onclick=()=>abrirCaixinha(null,null,b.dataset.cxnova));
  document.querySelectorAll("[data-alocar]").forEach(b=>b.onclick=async()=>{await post("/api/caixinhas/alocar",{lancamento_id:+b.dataset.alocar,caixinha_id:+b.dataset.cx}); telaContas();});
  const q=id=>document.getElementById(id);
  if(q("abrirTransf")) q("abrirTransf").onclick=()=>{painel="transferir"; renderContas();};
  if(q("abrirCx")) q("abrirCx").onclick=()=>abrirCaixinha(null);
  if(q("cancelar")) q("cancelar").onclick=()=>{painel=null; renderContas();};
  if(q("salvarCx")) q("salvarCx").onclick=async()=>{
    const r=await post("/api/caixinhas",{nome:q("cxNome").value,saldo_atual:num(q("cxSaldo").value),meta:num(q("cxMeta").value)||null,prazo:q("cxPrazo").value||null});
    if(r.ok){painel=null; telaContas();} else alert(r.erro);
  };
  if(q("salvarTr")) q("salvarTr").onclick=async()=>{
    const r=await post("/api/transferencias",{tipo:q("trTipo").value,valor:num(q("trValor").value),data:q("trData").value,
      de_conta_id:+q("trDe").value||null,caixinha_id:+q("trCx").value||null,obs:q("trObs").value});
    if(r.ok){painel=null; telaContas();} else alert(r.erro);
  };
  if(q("sync")) q("sync").onclick = sincronizar;
}
const num = v => parseFloat(String(v||"").replace(/\./g,"").replace(",","."))||0;
async function post(url,body){ return fetch(url,{method:"POST",headers:{"X-Token":token||"","Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()); }
function formCaixinha(){
  return `<section class="card form"><h2>Nova caixinha</h2>
    <label for="cxNome">Nome (igual ao app do Nubank)</label><input id="cxNome" placeholder="Reserva de emergência">
    <label for="cxSaldo">Saldo HOJE na caixinha</label><input id="cxSaldo" inputmode="decimal" placeholder="0,00">
    <label for="cxMeta">Meta (opcional)</label><input id="cxMeta" inputmode="decimal" placeholder="18.000,00">
    <label for="cxPrazo">Prazo da meta (opcional)</label><input id="cxPrazo" type="date">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px"><button class="btn sec" id="cancelar">Cancelar</button><button class="btn pri" id="salvarCx">Salvar</button></div>
  </section>`;
}
function formTransferir(){
  const contas=CONTAS.contas.map(c=>`<option value="${c.id}">${esc(c.banco)} · ${esc(c.nome)}</option>`).join("");
  const cxs=CONTAS.caixinhas.map(c=>`<option value="${c.id}">${esc(c.nome)} (${brl0(c.saldo)})</option>`).join("");
  return `<section class="card form"><h2>Transferir</h2>
    <label for="trTipo">Tipo</label><select id="trTipo"><option value="APLICACAO">Guardar na caixinha</option><option value="RESGATE">Resgatar da caixinha</option><option value="SAQUE">Saque para a carteira</option><option value="ENTRE_BANCOS">Entre bancos</option></select>
    <label for="trValor">Valor</label><input id="trValor" inputmode="decimal" placeholder="500,00">
    <label for="trDe">Conta</label><select id="trDe">${contas}</select>
    <label for="trCx">Caixinha</label><select id="trCx"><option value="">—</option>${cxs}</select>
    <label for="trData">Data</label><input id="trData" type="date" value="${new Date().toISOString().slice(0,10)}">
    <label for="trObs">Observação</label><input id="trObs" placeholder="Sobra de outubro">
    <small style="color:var(--mut)">Quando o movimento aparecer no extrato do banco, o app liga a este registro — nada é contado duas vezes.</small>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px"><button class="btn sec" id="cancelar">Cancelar</button><button class="btn pri" id="salvarTr">Registrar</button></div>
  </section>`;
}

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
    const det=[catTxt(i)||"sem categoria",i.banco].filter(Boolean).map(esc).join(" · ");
    const tags=(i.tags&&i.tags.length)?" · #"+i.tags.map(esc).join(" #"):"";
    ED[i.fonte+i.id]=edItem(i,i.fonte);
    corpo+=`<div class="mov" data-ed="${i.fonte}${i.id}"><div class="bola" style="background:${N.fundo};color:${N.cor}">${esc(ini)}</div>
      <div class="d"><span>${esc(i.descricao)}</span><small>${det}${tags}</small>
        ${i.efetivada?"":`<div class="acoes"><button class="mini-b" data-ef="${i.id}" style="color:${N.cor};border-color:${N.cor}">✓ ${N.feito}</button>
          <button class="mini-b" data-ex="${i.id}">Excluir</button><button class="mini-b" data-exs="${i.id}">Excluir série</button></div>`}</div>
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
      ${mesTitulo()}
      <button class="icon" id="prox" aria-label="Próximo mês"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button></div>
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Total do mês</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${N.cor}">${brl(d.realizado+d.pendente)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">${N.ok} <b class="num">${brl0(d.realizado)}</b></span><span class="chip">${N.falta} <b class="num">${brl0(d.pendente)}</b></span></div></div>
    <div class="cards">${d.itens.length?`<section class="card" style="padding:8px 16px">${corpo}</section>`:vazio}</div>
  </div>${fab}${nav("inicio")}`;
  const q=id=>document.getElementById(id);
  navMes(()=>telaMov(chave));
  if(q("fab")) q("fab").onclick=()=>{ fabAberto=!fabAberto; renderMov(); };
  if(q("veu")) q("veu").onclick=()=>{ fabAberto=false; renderMov(); };
  ligarEdicao();
  document.querySelectorAll("[data-ef]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await post(`/api/agendados/${b.dataset.ef}/efetivar`,{}); toast(r.ok?"Efetivado":"Não consegui: "+(r.erro||"erro")); telaMov(chave); });
  document.querySelectorAll("[data-ex]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await del(`/api/agendados/${b.dataset.ex}`); toast(r.ok?"Excluído":"Não consegui excluir"); telaMov(chave); });
  document.querySelectorAll("[data-exs]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await del(`/api/agendados/${b.dataset.exs}?serie=1`); toast(r.ok?`${r.apagados} excluído(s)`:"Não consegui excluir"); telaMov(chave); });
}

// ---------- formulário Nova receita / Nova despesa / Despesa cartão ----------
async function telaForm(tipo){
  const nat = tipo==="receita"?"RECEITA":"DESPESA", cartao = tipo==="despesa-cartao"||tipo==="estorno", estorno = tipo==="estorno";
  esqueleto();
  let cart=null;
  try{
    const r = await Promise.all([api("/api/categorias?natureza="+nat), api("/api/contas"), cartao?api("/api/cartoes"):null]);
    CATS[nat]=r[0]; CONTAS_F=r[1]; cart=r[2];
  }catch(e){ return; }
  const h=new Date(), noMes = mesAtual.getFullYear()===h.getFullYear() && mesAtual.getMonth()===h.getMonth();
  const contas = cartao ? (cart||[]) : CONTAS_F.contas.filter(c=>c.tipo!=="CARTAO");
  const padrao = cartao ? (contas.find(c=>c.faturas&&c.faturas.length)||contas[0]) : (contas.find(c=>c.tipo==="CORRENTE"&&/nubank/i.test(c.banco))||contas.find(c=>c.tipo==="CORRENTE")||contas[0]);
  F = {tipo, nat, cartao, estorno, cart, contas, chave: nat==="RECEITA"?"receitas":"despesas",
       valor:"", desc:"", data: noMes?isoLocal(h):isoLocal(mesAtual), efet:true, cat:"", sub:"", conta: padrao?String(padrao.id):"", final:"",
       tags:"", cont:false, rec:"NAO", per:"MENSAL", parIni:"1", qtd:"2", aCada:"30", multi:false,
       partes:[{cat:"",valor:""},{cat:"",valor:""}], novaCat:false, novaSub:false, novaNome:"", novaPote:"DES", erro:"", salvando:false};
  renderForm();
  const v=document.getElementById("fValor"); if(v) v.focus();
}
function subParte(p,i,cats){
  const c=cats.find(c=>String(c.id)===String(p.cat));
  return c&&c.subcategorias.length?`<div class="parte" style="padding-left:14px"><select id="ps${i}" aria-label="Subcategoria ${i+1}" style="flex:1 1 100%"><option value="">› sem subcategoria</option>${c.subcategorias.map(s=>`<option value="${s.id}" ${String(s.id)===String(p.sub)?"selected":""}>› ${esc(s.nome)}</option>`).join("")}</select></div>`:"";
}
function lerForm(){
  if(!F) return;
  const g=id=>{ const e=document.getElementById(id); return e ? (e.type==="checkbox"?e.checked:e.value) : undefined; };
  const m={valor:"fValor",desc:"fDesc",data:"fData",efet:"fEfet",cat:"fCat",sub:"fSub",conta:"fConta",tags:"fTags",cont:"fCont",
           per:"fPer",parIni:"fParIni",qtd:"fQtd",aCada:"fACada",multi:"fMulti",novaNome:"fNovaNome",novaPote:"fNovaPote"};
  for(const k in m){ const x=g(m[k]); if(x!==undefined) F[k]=x; }
  F.partes.forEach((p,i)=>{ const c=g("pc"+i), x=g("pv"+i); if(c!==undefined) p.cat=c; if(x!==undefined) p.valor=x; const sb=g("ps"+i); if(sb!==undefined) p.sub=sb; });
}
function faturaDaCompra(){
  const c=F.cart&&F.cart.find(c=>String(c.id)===String(F.conta)); if(!c) return null;
  return (c.faturas||[]).filter(f=>f.fechamento && f.fechamento>F.data).sort((a,b)=>a.fechamento.localeCompare(b.fechamento))[0]||null;
}
function renderForm(){
  const N=NAT[F.chave], cats=CATS[F.nat]||[], cat=cats.find(c=>String(c.id)===String(F.cat));
  const titulo = F.estorno ? "Novo estorno" : F.cartao ? "Despesa no cartão" : F.nat==="RECEITA" ? "Nova receita" : "Nova despesa";
  const optCats = `<option value="">Selecione…</option>`+cats.map(c=>`<option value="${c.id}" ${String(c.id)===String(F.cat)?"selected":""}>${esc(c.nome)}</option>`).join("");
  const optSubs = `<option value="">${cat?(cat.subcategorias.length?"Selecione…":"Nenhuma — toque no +"):"Escolha a categoria antes"}</option>`+
    (cat?cat.subcategorias.map(s=>`<option value="${s.id}" ${String(s.id)===String(F.sub)?"selected":""}>${esc(s.nome)}</option>`).join(""):"");
  const optContas = F.contas.map(c=>`<option value="${c.id}" ${String(c.id)===String(F.conta)?"selected":""}>${esc(c.banco)} · ${esc(F.cartao?(c.nome+(c.numero?" •"+c.numero:"")+(c.responsavel==="GM"?" · GM":"")):rotuloConta(c))}</option>`).join("");
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
        ${F.partes.length>2?`<button class="mais" data-rm="${i}" aria-label="Remover">${SVG.fechar}</button>`:""}</div>${subParte(p,i,cats)}`).join("")}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><button class="mini-b" id="addParte">+ categoria</button>
        <span style="font-size:13px;color:var(--mut)">total <b class="num" style="color:var(--cor-f)">${brl(totalMulti)}</b></span></div></div>`
    : `<div class="campo"><span class="ico">${SVG.pasta}</span><div class="c"><label for="fCat">Categoria</label><select id="fCat">${optCats}</select></div>
        <button class="mais" id="maisCat" aria-label="Nova categoria">${SVG.maisP}</button></div>${novaCat}
      <div class="campo"><span class="ico">${SVG.sub}</span><div class="c"><label for="fSub">Subcategoria</label><select id="fSub" ${cat?"":"disabled"}>${optSubs}</select></div>
        <button class="mais" id="maisSub" aria-label="Nova subcategoria" ${cat?"":"disabled"} style="${cat?"":"opacity:.4"}">${SVG.maisP}</button></div>${novaSub}`;

  document.getElementById("raiz").innerHTML=`
  <div class="fm" style="--cor-f:${F.estorno?"#4CC38A":N.hex}">
    <div class="top"><button class="icon" id="fechar" aria-label="Fechar">${SVG.fechar}</button>
      <b class="num" style="font-size:18px">${titulo}</b>
      <button id="salvarTopo" style="height:40px;padding:0 12px;font-weight:700;color:var(--cor-f)">Salvar</button></div>
    <div style="padding:14px 16px 10px;text-align:center">
      <label for="fValor" style="font-size:12px;color:var(--mut)">${F.rec==="PARCELADA"?"Valor de cada parcela":"Valor"}</label>
      <input id="fValor" class="valor-in" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off" value="${F.multi?esc(totalMulti?totalMulti.toFixed(2).replace(".",","):""):esc(F.valor)}" ${F.multi?"readonly":""}></div>
    <div class="cards" style="padding-top:4px">
      ${F.erro?`<div class="alerta" style="margin:0;background:#3D2023;color:#FFB4AE">${esc(F.erro)}</div>`:""}
      <section class="card" style="padding:0">
        <div class="campo"><span class="ico">${SVG.texto}</span><div class="c"><label for="fDesc">Descrição</label><input id="fDesc" placeholder="${F.estorno?"Ex.: Devolução da compra na loja":F.nat==="RECEITA"?"Ex.: Salário, aluguel recebido":"Ex.: Mercado, conta de luz"}" value="${esc(F.desc)}" autocomplete="off"></div></div>
        ${F.estorno?"":`<div class="campo" style="flex-wrap:wrap"><span class="ico">${SVG.repetir}</span><div class="c"><span class="rot">Repetição</span>
          <div class="pilulas">${[["NAO","Não recorrente"],["FIXA","Fixa"],["PARCELADA","Parcelada"]].map(([k,t])=>`<button class="pil ${F.rec===k?"on":""}" data-rec="${k}">${t}</button>`).join("")}</div></div></div>`}
        ${F.estorno?"":recCfg}
        ${F.nat==="DESPESA"&&!F.estorno?`<div class="campo"><span class="ico">${SVG.camadas}</span><div class="c"><span class="rot">Multicategorias</span><span style="font-size:14px">Dividir o valor entre categorias</span></div>
          <label class="sw"><input type="checkbox" id="fMulti" ${F.multi?"checked":""}><span></span></label></div>`:""}
        <div class="campo"><span class="ico">${SVG.cal}</span><div class="c"><label for="fData">${F.estorno?"Data do estorno":F.cartao?"Data da compra":F.nat==="RECEITA"?"Data do recebimento":"Data do vencimento"}</label>
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
          <div style="padding:0 16px 14px 52px;font-size:13px;color:var(--mut)">${fat?`Entra na fatura de <b style="color:var(--txt)">${MESES[+fat.mes.slice(5)-1].toLowerCase()}</b> · fecha ${dm(fat.fechamento)} · vence ${dm(fat.vencimento)}`:"A fatura é definida pela data da compra na próxima sincronização."}</div>
          ${cartSel&&cartSel.responsavel==="GM"?`<div style="padding:0 16px 14px 52px;font-size:13px;color:var(--des)">Cartão da GM: ${F.estorno?"este estorno":"este gasto"} fica só na aba Cartões, fora das suas despesas.</div>`:""}`:""}
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
  F.partes.forEach((p,i)=>{ if(q("pc"+i)) q("pc"+i).onchange=()=>{ lerForm(); F.partes[i].sub=""; renderForm(); }; });
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
  const lista = F.cartao ? (rotaAnterior==="#despesas"?"#despesas":"#cartoes") : "#"+F.chave;
  if(rotaAnterior===lista) history.back(); else location.hash=lista;
}
async function salvarForm(){
  if(F.salvando) return;
  lerForm(); F.erro="";
  const desc=(F.desc||"").trim();
  const base={natureza:F.estorno?"ESTORNO":F.nat, descricao:desc, data:F.data, efetivada:F.cartao?true:!!F.efet, conta_id:+F.conta||null,
    tags:String(F.tags||"").split(",").map(t=>t.trim().replace(/^#/,"")).filter(Boolean), cartao_final:F.cartao?(F.final||null):null};
  if(F.rec!=="NAO") base.recorrencia={tipo:F.rec, periodicidade:F.per, a_cada_dias:+F.aCada||null, parcela_inicial:+F.parIni||1, quantidade:+F.qtd||2};
  let envios;
  if(F.multi) envios=F.partes.filter(p=>numBR(p.valor)>0).map(p=>({...base, valor:numBR(p.valor), categoria_id:+p.cat||null, subcategoria_id:+p.sub||null}));
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
  const msg = F.estorno ? "Estorno salvo" : criados>1 ? `${NAT[F.chave].um[0].toUpperCase()+NAT[F.chave].um.slice(1)} salva · ${criados} lançamentos` : `${NAT[F.chave].um[0].toUpperCase()+NAT[F.chave].um.slice(1)} salva`;
  toast(msg);
  if(F.cont){ F.valor=""; F.desc=""; F.tags=""; F.partes=[{cat:"",valor:""},{cat:"",valor:""}]; F.rec="NAO"; renderForm(); document.getElementById("fValor").focus(); }
  else fecharForm();
}

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
    <div class="cards">
      ${subs.length?`<section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Subcategorias</h2>${CT.sub?'<button class="mini-b" data-sf="">ver todas</button>':""}</div>
        ${subs.map(([n,v])=>{ const qt=CT.l.filter(x=>(x.subcategoria||"Sem subcategoria")===n).length, tt=subs.reduce((a,b)=>a+Math.max(b[1],0),0)||1;
          return `<div class="cat" data-sf="${esc(n)}" role="button" style="cursor:pointer;${CT.sub&&CT.sub!==n?"opacity:.45":""}">
            <div class="t"><span>${n==="Sem subcategoria"?`<i style="color:var(--mut)">${n}</i>`:esc(n)} <small style="color:var(--mut)">· ${qt} lanç.</small></span><span>${brl(v)} · ${Math.round(Math.max(v,0)/tt*100)}%</span></div>
            <div class="barra"><i style="width:${(Math.max(v,0)/tt*100).toFixed(0)}%;background:${pc[1]}"></i></div></div>`; }).join("")}
        ${subs.length===1&&subs[0][0]==="Sem subcategoria"?'<small style="display:block;color:var(--mut);margin-top:8px">Nenhuma subcategoria usada. Toque num lançamento para classificar, ou crie subcategorias pelo lápis.</small>':""}</section>`:""}
      ${itens.length?`<section class="card" style="padding:8px 16px"><h2 style="margin:10px 0 0">Lançamentos${CT.sub?" · "+esc(CT.sub):""}</h2>${listaLanc(itens)}</section>`:`<div class="vazio-g">${SVG.vazio}<b style="color:var(--txt);font-size:17px">Nada aqui</b><span>Sem lançamentos nesta categoria no mês.</span></div>`}
      ${itens.length?`<small style="color:var(--mut);text-align:center">Toque num lançamento para trocar a categoria ou subcategoria.</small>`:""}</div>
  </div>${nav("inicio")}`;
  document.getElementById("voltar").onclick=()=>voltar("#inicio");
  document.querySelectorAll("[data-sf]").forEach(b=>b.onclick=()=>{ const v=b.dataset.sf||null; CT.sub=(v&&CT.sub===v)?null:v; renderCategoria(); });
  navMes(()=>telaCategoria(CT.id));
  ligarEdicao();
}

// ---------- investimentos ----------
async function telaInvest(){
  esqueleto();
  try{ IV=await api("/api/investimentos?mes="+ym(mesAtual)); }catch(e){ return; }
  renderInvest();
}
function renderInvest(){
  const d=IV;
  const bancos=d.bancos.map(b=>`<div class="linha" style="min-height:62px">${logo(b,40)}
      <div class="nm">${esc(b.banco)}<small>${b.aplicado_mes||b.resgatado_mes?`no mês: +${brl0(b.aplicado_mes)} aplicado · −${brl0(b.resgatado_mes)} resgatado`:"sem movimento no mês"}</small></div>
      <span class="vl num" style="color:${b.saldo<0?"var(--desp)":"var(--inv)"}">${brl(b.saldo)}</span></div>`).join("");
  const cxs=d.caixinhas.map(c=>`<div class="linha" data-cx="${c.id}" role="button" style="cursor:pointer;min-height:60px">
      <div class="mini" style="background:${c.economia?"#13261C":"#1C1D25"};color:${c.economia?"var(--inv)":"var(--mut)"}">◆</div>
      <div class="nm">${esc(c.nome)}${c.economia?"":'<span class="tag" style="background:#1C1D25;color:var(--mut)">FORA DA ECONOMIA</span>'}
        <small>${esc(c.banco)}${c.meta?` · meta ${brl0(c.meta)} · ${Math.round(c.saldo/c.meta*100)}%`:""}${c.mes?` · no mês ${c.mes>0?"+":"−"}${brl0(Math.abs(c.mes))}`:""}</small></div>
      <span class="vl num">${brl(c.saldo)}</span><span class="chev">›</span></div>`).join("");
  let ult="", movs="";
  for(const m of d.movimentos){
    if(m.data!==ult){ movs+=`<div class="dia">${rotDia(m.data)}</div>`; ult=m.data; }
    const ap=m.valor<0;
    movs+=`<div class="mov" data-mv="${m.id}" role="button" style="cursor:pointer;${m.economia?"":"opacity:.75"}"><div class="bola" style="background:${ap?"#13261C":"#3A2E1A"};color:${ap?"var(--inv)":"var(--des)"}">${ap?"↓":"↑"}</div>
      <div class="d"><span>${esc(m.descricao)}</span><small>${esc(m.banco)} · ${m.caixinha?`<b style="color:var(--txt)">${esc(m.caixinha)}</b>`:"sem caixinha — toque para escolher"}${m.economia?"":" · fora da economia"}</small></div>
      <span class="num" style="font-weight:600;white-space:nowrap;color:${ap?"var(--inv)":"var(--des)"}">${ap?"+ ":"− "}${brl(Math.abs(m.valor))}</span></div>`;
  }
  const fora=d.fora_aplicado||d.fora_resgatado;
  document.getElementById("raiz").innerHTML=`<div class="app">
    ${topoVoltar("Investimentos","aplicações e resgates")}
    ${barraMes()}
    <div style="text-align:center;padding:4px 16px 0">
      <div style="font-size:12px;color:var(--mut)">Economia do mês (conta no pote Investir)</div>
      <div class="num" style="font-size:32px;font-weight:700;color:${d.liquido<0?"var(--des)":"var(--inv)"}">${brl(d.liquido)}</div>
      <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        <span class="chip">aplicado <b class="num" style="color:var(--inv)">${brl0(d.aplicado)}</b></span><span class="chip">resgatado <b class="num" style="color:var(--des)">${brl0(d.resgatado)}</b></span></div>
      ${fora?`<div style="font-size:12px;color:var(--mut);margin-top:8px">Fora da economia (só guardado): +${brl0(d.fora_aplicado)} aplicado · −${brl0(d.fora_resgatado)} resgatado</div>`:""}
      ${d.liquido<0?`<div style="font-size:12px;color:var(--mut);margin-top:6px">Resgatou mais do que aplicou: saíram ${brl0(-d.liquido)} da sua economia neste mês.</div>`:""}</div>
    <div class="cards">
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Caixinhas e contas de investimento</h2></div>
        ${cxs||'<div class="vazio">Nenhuma ainda. Crie uma para cada objetivo (ex.: Reserva, Aluguel Gaspar Silveira Martins) e diga se ela conta como economia sua.</div>'}
        <button class="btn sec" id="novaCx" style="width:100%;margin-top:10px">+ Nova caixinha / conta de investimento</button></section>
      <section class="card" style="padding:8px 16px"><h2 style="margin:10px 0 0">Movimentações do mês</h2>
        ${d.movimentos.length?'<small style="color:var(--mut)">Toque numa aplicação ou resgate para dizer de qual caixinha é.</small>':""}
        ${movs||'<div class="vazio" style="padding:10px 0">Nenhuma aplicação ou resgate no mês.</div>'}</section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h2>Guardado por banco</h2><small style="color:var(--mut)">${brl0(d.guardado)}</small></div>
        ${bancos||'<div class="vazio">Nenhuma aplicação encontrada no extrato.</div>'}
        <small style="display:block;color:var(--mut);font-size:11px;margin-top:6px">Estimado pelo extrato até o fim do mês (aplicações − resgates, sem rendimentos). O Pluggy não envia o saldo dos investimentos.</small></section>
    </div></div>${nav("inicio")}`;
  document.getElementById("voltar").onclick=()=>voltar("#inicio");
  navMes(telaInvest);
  document.getElementById("novaCx").onclick=()=>abrirCaixinha(null);
  document.querySelectorAll("[data-cx]").forEach(el=>el.onclick=()=>abrirCaixinha(IV.caixinhas.find(c=>c.id===+el.dataset.cx)));
  document.querySelectorAll("[data-mv]").forEach(el=>el.onclick=()=>abrirAlocar(IV.movimentos.find(m=>m.id===+el.dataset.mv)));
}
function folha(html){
  let el=document.getElementById("sheet"); if(!el){ el=document.createElement("div"); el.id="sheet"; document.body.appendChild(el); }
  el.innerHTML=`<div class="veu" style="z-index:25" id="shVeu"></div><div class="sheet" role="dialog"><div class="alca"></div><div style="padding:0 18px 4px">${html}</div></div>`;
  document.getElementById("shVeu").onclick=fecharSheet;
}
function abrirAlocar(m, lista){
  lista=lista||(IV&&IV.caixinhas)||[];
  const ap=m.valor<0;
  folha(`<b style="font-size:16px">${esc(m.descricao)} · ${brl(Math.abs(m.valor))}</b>
    <div style="color:var(--mut);font-size:13px;margin:2px 0 12px">${dm(m.data)} · ${esc(m.banco)} · ${ap?"guardado em":"resgatado de"} qual caixinha?</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${lista.map(c=>`<button class="btn sec" data-al="${c.id}" style="text-align:left;padding:0 14px;${m.caixinha_id===c.id?"border-color:var(--inv);color:var(--inv)":""}">${esc(c.nome)}${c.economia?"":' <small style="color:var(--mut)">· fora da economia</small>'}</button>`).join("")}
      ${m.caixinha_id?'<button class="btn sec" data-al="" style="color:var(--mut)">Tirar da caixinha</button>':""}
      <button class="btn sec" id="alNova" style="color:var(--nec)">+ Nova caixinha</button>
      <button class="btn sec" id="alFechar">Cancelar</button></div>`);
  document.querySelectorAll("[data-al]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await post("/api/caixinhas/alocar",{lancamento_id:m.id, caixinha_id:+b.dataset.al||null});
    fecharSheet(); toast(r.ok?"Movimento atualizado":"Não consegui salvar"); recarregar(); });
  document.getElementById("alNova").onclick=()=>abrirCaixinha(null, m);
  document.getElementById("alFechar").onclick=fecharSheet;
}
function abrirCaixinha(c, alocar, bancoFixo){
  const novo=!c, bancos=[...new Set([bancoFixo||(alocar&&alocar.banco)||"Nubank",...((CONTAS&&CONTAS.bancos)||[]).map(b=>b.banco),...((IV&&IV.bancos)||[]).map(b=>b.banco),"Nubank","Mercado Pago","Inter"])];
  folha(`<b style="font-size:17px">${novo?"Nova caixinha / conta de investimento":"Editar "+esc(c.nome)}</b>
    <div class="form" style="margin-top:12px">
      <label for="cxN">Nome</label><input id="cxN" value="${esc(c?c.nome:"")}" placeholder="Ex.: Reserva de emergência, Aluguel Gaspar Silveira Martins">
      ${novo?`<label for="cxB">Banco</label><select id="cxB">${bancos.map(b=>`<option>${esc(b)}</option>`).join("")}</select>
      <label for="cxS">Saldo HOJE nela</label><input id="cxS" inputmode="decimal" placeholder="0,00">`:""}
      <label for="cxM">Meta (opcional)</label><input id="cxM" inputmode="decimal" placeholder="0,00" value="${c&&c.meta?String(c.meta).replace(".",","):""}">
      <div class="campo" style="padding:6px 0;border:0"><div class="c"><span style="font-size:15px">Conta como economia minha</span>
        <span style="font-size:12px;color:var(--mut)">Desligado: aparece aqui em Investimentos, mas as aplicações e resgates não entram no pote Investir nem no "Investido no mês" (ex.: aluguel de terceiro que você só guarda).</span></div>
        <label class="sw" style="--cor-f:var(--inv)"><input type="checkbox" id="cxE" ${!c||c.economia?"checked":""}><span></span></label></div>
      <div id="cxErro" class="erro"></div>
      <div class="grade2"><button class="btn sec" id="cxCancelar">Cancelar</button><button class="btn pri" id="cxSalvar">Salvar</button></div>
      ${novo?"":`<button class="btn sec" id="cxArq" style="color:var(--mut)">Arquivar caixinha</button>`}
    </div>`);
  const q=id=>document.getElementById(id);
  q("cxCancelar").onclick=fecharSheet;
  if(q("cxArq")) q("cxArq").onclick=async()=>{ await patch(`/api/caixinhas/${c.id}`,{ativa:false}); fecharSheet(); toast("Caixinha arquivada"); if(rotaAtual.startsWith("#caixinha-")) location.hash="#contas"; else recarregar(); };
  q("cxSalvar").onclick=async()=>{
    const nome=q("cxN").value.trim(); if(!nome){ q("cxErro").textContent="Informe o nome."; return; }
    const eco=q("cxE").checked, meta=numBR(q("cxM").value)||null;
    let r = novo ? await post("/api/caixinhas",{nome, banco:q("cxB").value, saldo_atual:numBR(q("cxS").value), meta, economia:eco})
                 : await patch(`/api/caixinhas/${c.id}`,{nome, meta, economia:eco});
    if(!r.ok){ q("cxErro").textContent=r.erro||"Não consegui salvar"; return; }
    if(alocar && r.id) await post("/api/caixinhas/alocar",{lancamento_id:alocar.id, caixinha_id:r.id});
    fecharSheet(); toast(novo?"Caixinha criada":(r.reclassificados?`Salvo · ${r.reclassificados} movimento(s) reclassificados`:"Salvo")); recarregar();
  };
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
    if(i.data!==ult){ out+=`<div class="dia" style="display:flex;justify-content:space-between"><span>${rotDia(i.data)}</span><span class="num">saldo no fim do dia ${brl(i.saldo_apos)}</span></div>`; ult=i.data; }
    ED["L"+i.id]=edItem(i,"L");
    out+=`<div class="mov" data-ed="L${i.id}"><div class="d"><span>${esc(i.descricao)}</span><small>${esc(catTxt(i)||i.tipo)}${i.status==="PROVISORIO"?" · pendente":""}</small></div>
      <span class="num" style="font-weight:600;white-space:nowrap;color:${i.valor>0?"var(--rec)":"var(--txt)"}">${brl(i.valor)}</span></div>`;
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
        <small style="color:var(--mut);text-align:center">O saldo de cada dia é calculado para trás a partir do saldo ${c.manual?"informado":"que o banco envia"}. Toque num lançamento para mudar a categoria.</small>`
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
      ${mesTitulo()}
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
  navMes(renderCartoesLista);
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

// ===================== CATEGORIA / SUBCATEGORIA EM TODO O APP =====================
let CATS_ALL=null, ED={}, S=null, INICIO=null, catAberta=null, CG=null;
const POTE_COR={NEC:["#1C2A42","var(--nec)","Necessidade"],DES:["#3A2E1A","var(--des)","Desejo"],INV:["#13261C","var(--inv)","Investimento"],NENHUM:["#1E3A2C","var(--rec)",""]};
const NAT_ROT={DESPESA:"Despesas",RECEITA:"Receitas",TRANSFERENCIA:"Transferências e faturas"};
const CATS_SIS=["Outros","Pagamento de fatura","Transferência entre contas","Gasto da GM (reembolsável)","Salário / renda","Outras receitas"];
const catTxt = x => x.categoria ? x.categoria+(x.subcategoria?" › "+x.subcategoria:"") : "";
const edItem = (x,fonte) => ({id:x.id, fonte, descricao:x.descricao, valor:+x.valor, data:x.data, categoria_id:x.categoria_id, subcategoria_id:x.subcategoria_id, serie:!!x.serie});
const padraoDe = d => String(d||"").split("*")[0].trim().slice(0,40);
async function carregarCats(){ CATS_ALL = await api("/api/categorias"); for(const k in CATS) delete CATS[k]; return CATS_ALL; }
function recarregar(){ const a=rotaAnterior; rota(); rotaAnterior=a; }
function ligarEdicao(){ document.querySelectorAll("[data-ed]").forEach(el=>el.onclick=e=>{ if(e.target.closest("button,a")) return; const it=ED[el.dataset.ed]; if(it) abrirEdicao(it); }); }
async function patch(url,body){ return fetch(url,{method:"PATCH",headers:{"X-Token":token||"","Content-Type":"application/json"},body:JSON.stringify(body)}).then(r=>r.json()); }

// ---------- folha "categoria do lançamento" (Início, faturas, receitas, despesas) ----------
async function abrirEdicao(item){
  try{ if(!CATS_ALL) await carregarCats(); }catch(e){ return; }
  S={item, cat:item.categoria_id?String(item.categoria_id):"", sub:item.subcategoria_id?String(item.subcategoria_id):"", novaCat:false, novaSub:false,
     nome:"", pote:"DES", aprender:false, serie:false, erro:"", salvando:false};
  renderSheet();
}
function fecharSheet(){ S=null; const x=document.getElementById("sheet"); if(x) x.remove(); }
function lerSheet(){
  const g=id=>{ const e=document.getElementById(id); return e?(e.type==="checkbox"?e.checked:e.value):undefined; };
  const m={cat:"shCat",sub:"shSub",nome:"shNome",pote:"shPote",aprender:"shAprender",serie:"shSerie"};
  for(const k in m){ const v=g(m[k]); if(v!==undefined) S[k]=v; }
}
function renderSheet(){
  const it=S.item, saida=it.valor<0, natPadrao=saida?"DESPESA":"RECEITA";
  const ordem = saida?["DESPESA","TRANSFERENCIA","RECEITA"]:["RECEITA","TRANSFERENCIA","DESPESA"];
  const cat = CATS_ALL.find(c=>String(c.id)===S.cat), subs = cat?cat.subcategorias:[];
  const opt = ordem.map(n=>{ const cs=CATS_ALL.filter(c=>(c.natureza||"DESPESA")===n);
    return cs.length?`<optgroup label="${NAT_ROT[n]}">${cs.map(c=>`<option value="${c.id}" ${String(c.id)===S.cat?"selected":""}>${esc(c.nome)}</option>`).join("")}</optgroup>`:""; }).join("");
  const cor = saida?"#FF7A70":"#4CC38A", pad=padraoDe(it.descricao);
  let el=document.getElementById("sheet"); if(!el){ el=document.createElement("div"); el.id="sheet"; document.body.appendChild(el); }
  el.innerHTML=`<div class="veu" style="z-index:25" id="shVeu"></div>
  <div class="sheet" style="--cor-f:${cor}" role="dialog" aria-label="Categoria do lançamento">
    <div class="alca"></div>
    <div style="padding:0 16px 8px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div style="min-width:0"><b style="display:block;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.descricao)}</b>
        <small style="color:var(--mut)">${it.data?dm(it.data):""}${it.fonte==="A"?" · pendente":""}</small></div>
      <b class="num" style="color:${cor};white-space:nowrap">${brl(Math.abs(it.valor))}</b></div>
    ${S.erro?`<div class="alerta" style="margin:0 16px 8px;background:#3D2023;color:#FFB4AE">${esc(S.erro)}</div>`:""}
    <div class="campo"><span class="ico">${SVG.pasta}</span><div class="c"><label for="shCat">Categoria</label><select id="shCat"><option value="">Sem categoria</option>${opt}</select></div>
      <button class="mais" id="shMaisCat" aria-label="Nova categoria">${SVG.maisP}</button></div>
    ${S.novaCat?`<div class="sub-in"><input id="shNome" placeholder="Nova categoria de ${natPadrao==="DESPESA"?"despesa":"receita"}" value="${esc(S.nome)}">
      ${natPadrao==="DESPESA"?`<select id="shPote" style="flex-grow:0;min-width:0" aria-label="Pote 50/30/20">${["NEC","DES","INV"].map(p=>`<option value="${p}" ${S.pote===p?"selected":""}>${POTE_COR[p][2]}</option>`).join("")}</select>`:""}
      <button id="shAddCat">Adicionar</button></div>`:""}
    <div class="campo"><span class="ico">${SVG.sub}</span><div class="c"><label for="shSub">Subcategoria</label>
      <select id="shSub" ${cat?"":"disabled"}><option value="">${cat?(subs.length?"Nenhuma":"Nenhuma — toque no +"):"Escolha a categoria antes"}</option>${subs.map(s=>`<option value="${s.id}" ${String(s.id)===S.sub?"selected":""}>${esc(s.nome)}</option>`).join("")}</select></div>
      <button class="mais" id="shMaisSub" aria-label="Nova subcategoria" ${cat?"":'disabled style="opacity:.4"'}>${SVG.maisP}</button></div>
    ${S.novaSub?`<div class="sub-in"><input id="shNome" placeholder="Nova subcategoria de ${esc(cat?cat.nome:"")}" value="${esc(S.nome)}"><button id="shAddSub">Adicionar</button></div>`:""}
    ${it.fonte==="L"&&pad?`<div class="campo"><span class="ico">${SVG.repetir}</span><div class="c"><span class="rot">Lembrar</span><span style="font-size:14px">Sempre classificar “${esc(pad)}” assim (inclusive os já lançados)</span></div>
      <label class="sw"><input type="checkbox" id="shAprender" ${S.aprender?"checked":""}><span></span></label></div>`:""}
    ${it.fonte==="A"&&it.serie?`<div class="campo"><span class="ico">${SVG.repetir}</span><div class="c"><span class="rot">Série</span><span style="font-size:14px">Aplicar também aos próximos</span></div>
      <label class="sw"><input type="checkbox" id="shSerie" ${S.serie?"checked":""}><span></span></label></div>`:""}
    <div class="grade2" style="padding:14px 16px 0"><button class="btn sec" id="shCancelar">Cancelar</button>
      <button class="btn" id="shSalvar" style="background:var(--cor-f);color:#0D0E12" ${S.salvando?"disabled":""}>${S.salvando?"Salvando…":"Salvar"}</button></div>
  </div>`;
  const q=id=>document.getElementById(id);
  q("shVeu").onclick=fecharSheet; q("shCancelar").onclick=fecharSheet; q("shSalvar").onclick=salvarSheet;
  q("shCat").onchange=()=>{ lerSheet(); S.sub=""; S.novaSub=false; renderSheet(); };
  q("shMaisCat").onclick=()=>{ lerSheet(); S.novaCat=!S.novaCat; S.novaSub=false; S.nome=""; renderSheet(); if(q("shNome")) q("shNome").focus(); };
  q("shMaisSub").onclick=()=>{ lerSheet(); if(!S.cat) return; S.novaSub=!S.novaSub; S.novaCat=false; S.nome=""; renderSheet(); if(q("shNome")) q("shNome").focus(); };
  if(q("shAddCat")) q("shAddCat").onclick=async()=>{ lerSheet(); const nome=S.nome.trim(); if(!nome) return;
    const r=await post("/api/categorias",{nome, natureza:natPadrao, pote:S.pote}); if(!r.ok){ S.erro=r.erro||"Não consegui criar"; return renderSheet(); }
    await carregarCats(); S.cat=String(r.id); S.sub=""; S.novaCat=false; S.nome=""; renderSheet(); toast("Categoria criada"); };
  if(q("shAddSub")) q("shAddSub").onclick=async()=>{ lerSheet(); const nome=S.nome.trim(); if(!nome) return;
    const r=await post("/api/subcategorias",{categoria_id:+S.cat, nome}); if(!r.ok){ S.erro=r.erro||"Não consegui criar"; return renderSheet(); }
    await carregarCats(); S.sub=String(r.id); S.novaSub=false; S.nome=""; renderSheet(); toast("Subcategoria criada"); };
}
async function salvarSheet(){
  if(S.salvando) return;
  lerSheet(); S.erro="";
  const it=S.item;
  if(it.fonte==="L" && !S.cat){ S.erro="Escolha a categoria."; return renderSheet(); }
  S.salvando=true; renderSheet();
  let r;
  try{
    r = it.fonte==="L" ? await patch(`/api/lancamentos/${it.id}`,{categoria_id:+S.cat, subcategoria_id:+S.sub||null, aprender:!!S.aprender})
                       : await patch(`/api/agendados/${it.id}`,{categoria_id:+S.cat||null, subcategoria_id:+S.sub||null, serie:!!S.serie});
  }catch(e){ r={ok:false, erro:e.message}; }
  if(!r.ok){ S.salvando=false; S.erro=r.erro||"Não consegui salvar"; return renderSheet(); }
  fecharSheet();
  toast(r.aplicados?`Salvo · mais ${r.aplicados} parecido(s) ajustado(s)`:r.alterados>1?`Salvo · ${r.alterados} da série`:"Categoria salva");
  recarregar();
}

// ---------- Início: despesas por categoria abrindo as subcategorias ----------
function catsInicio(d){
  if(!d.categorias.length) return `<div class="vazio">Sem despesas neste mês.</div>`;
  const cmax=Math.max(...d.categorias.map(c=>+c.valor),1);
  return d.categorias.map((c,i)=>{
    const ab=false, cor=PALETA[i%PALETA.length], subs=c.subcategorias||[], temSub=subs.some(s=>s.nome!=="Sem subcategoria");
    return `<div class="cat" data-catab="${c.id}" role="button" style="cursor:pointer">
      <div class="t"><span>${esc(c.nome)}${temSub?` <small style="color:var(--mut)">· ${subs.filter(s=>s.nome!=="Sem subcategoria").length} sub</small>`:""}</span><span>${brl(+c.valor)} <span style="color:var(--dim)">›</span></span></div>
      <div class="barra"><i style="width:${(+c.valor/cmax*100).toFixed(0)}%;background:${cor}"></i></div>
      ${ab?subs.map(s=>`<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mut);padding:6px 0 0 14px"><span>› ${esc(s.nome)}</span><span>${brl(s.valor)} · ${Math.round(s.valor/(+c.valor||1)*100)}%</span></div>`).join(""):""}</div>`;
  }).join("");
}

// ---------- tela Categorias (gerenciar em um lugar só) ----------
async function telaCategorias(){
  esqueleto();
  let l; try{ l=await api("/api/categorias?todas=1"); }catch(e){ return; }
  CG=Object.assign(CG||{nat:"DESPESA",aberta:null,nova:false},{lista:l, erro:"", confirmar:null});
  renderCategorias();
}
async function recarregarCG(msg){ CG.lista=await api("/api/categorias?todas=1"); CATS_ALL=null; CG.confirmar=null; renderCategorias(); if(msg) toast(msg); }
function renderCategorias(){
  const daNat=c=>(c.natureza||"DESPESA")===CG.nat;
  const ativas=CG.lista.filter(c=>c.ativa&&daNat(c)), arq=CG.lista.filter(c=>!c.ativa&&daNat(c));
  const card=c=>{
    const pc=POTE_COR[c.natureza==="DESPESA"?c.pote:"NENHUM"]||POTE_COR.NENHUM, ab=CG.aberta===c.id, sis=CATS_SIS.includes(c.nome);
    const subs=c.subcategorias.map(s=>`<div class="parte"><input id="sg${s.id}" value="${esc(s.nome)}" aria-label="Nome da subcategoria" style="flex:1 1 auto;text-align:left">
        <span style="font-size:11px;color:var(--mut);white-space:nowrap">${s.uso} lanç.</span>
        <button class="mini-b" data-sgsal="${s.id}">Salvar</button>
        <button class="mini-b" data-sgdel="${s.id}" style="${CG.confirmar==="s"+s.id?"color:var(--desp);border-color:var(--desp)":""}">${CG.confirmar==="s"+s.id?"Confirmar":"Excluir"}</button></div>`).join("");
    return `<section class="card" style="padding:0;overflow:hidden">
      <button class="banco-h" data-cg="${c.id}"><div class="mini" style="background:${pc[0]};color:${pc[1]};width:36px;height:36px;border-radius:11px">${esc(c.natureza==="DESPESA"?c.pote:c.nome.slice(0,2).toUpperCase())}</div>
        <div style="flex-grow:1;display:flex;flex-direction:column;min-width:0"><b style="font-size:15px">${esc(c.nome)}</b>
          <small style="color:var(--mut);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.uso} lançamento(s) · ${c.subcategorias.length?c.subcategorias.map(s=>esc(s.nome)).join(", "):"sem subcategorias"}</small></div>
        <span style="color:var(--mut);width:14px">${ab?"▾":"▸"}</span></button>
      ${ab?`<div class="form" style="border-top:1px solid var(--line);padding:14px 16px 16px">
        <label for="cgNome">Nome</label><input id="cgNome" value="${esc(c.nome)}" ${sis?"disabled":""}>
        ${sis?`<small style="color:var(--mut)">Categoria usada pelo app: dá para mudar as subcategorias${c.natureza==="DESPESA"?" e o pote":""}, não o nome.</small>`:""}
        ${c.natureza==="DESPESA"?`<label>Pote na regra 50/30/20</label><div class="seg" style="align-self:flex-start">${["NEC","DES","INV"].map(p=>`<button class="${c.pote===p?"on":""}" data-pote="${p}">${POTE_COR[p][2]}</button>`).join("")}</div>`:""}
        <label style="margin-top:6px">Subcategorias</label>${subs||'<small style="color:var(--mut)">Nenhuma ainda.</small>'}
        <div class="parte"><input id="sgNova" placeholder="Nova subcategoria" style="flex:1 1 auto;text-align:left"><button class="mini-b" id="sgAdd" style="color:var(--inv);border-color:var(--inv)">Adicionar</button></div>
        <div class="grade2" style="margin-top:8px">${sis?"<span></span>":`<button class="btn sec" id="cgDel" style="${CG.confirmar==="c"+c.id?"color:var(--desp);border-color:var(--desp)":""}">${CG.confirmar==="c"+c.id?(c.uso?"Confirmar arquivar":"Confirmar excluir"):(c.uso?"Arquivar":"Excluir")}</button>`}
          <button class="btn pri" id="cgSalvar" ${sis?'disabled style="opacity:.4"':""}>Salvar nome</button></div>
      </div>`:""}</section>`;
  };
  document.getElementById("raiz").innerHTML=`<div class="app">
    <div class="top"><a class="icon" href="#inicio" aria-label="Voltar" style="color:var(--txt)">${SVG.voltar}</a><div class="mes"><b>Categorias</b><small>e subcategorias</small></div><span style="width:44px"></span></div>
    <div style="padding:6px 16px 0"><div class="seg">${[["DESPESA","Despesas"],["RECEITA","Receitas"],["TRANSFERENCIA","Transferências"]].map(([k,t])=>`<button class="${CG.nat===k?"on":""}" data-nat="${k}" style="flex:1">${t}</button>`).join("")}</div>
      ${CG.nat==="DESPESA"?`<small style="display:block;color:var(--mut);font-size:12px;margin-top:8px">O pote define onde a despesa conta no 50/30/20. Trocar o pote reclassifica as despesas já lançadas.</small>`:""}</div>
    <div class="cards">
      ${CG.erro?`<div class="alerta" style="margin:0;background:#3D2023;color:#FFB4AE">${esc(CG.erro)}</div>`:""}
      ${ativas.map(card).join("")||'<div class="vazio">Nenhuma categoria.</div>'}
      ${CG.nat!=="TRANSFERENCIA"?(CG.nova?`<section class="card form"><h2>Nova categoria de ${CG.nat==="DESPESA"?"despesa":"receita"}</h2>
          <label for="ncNome">Nome</label><input id="ncNome" placeholder="${CG.nat==="DESPESA"?"Ex.: Pets":"Ex.: Aluguéis recebidos"}">
          ${CG.nat==="DESPESA"?`<label for="ncPote">Pote</label><select id="ncPote">${["NEC","DES","INV"].map(p=>`<option value="${p}" ${p==="DES"?"selected":""}>${POTE_COR[p][2]}</option>`).join("")}</select>`:""}
          <div class="grade2" style="margin-top:6px"><button class="btn sec" id="ncCancelar">Cancelar</button><button class="btn pri" id="ncSalvar">Criar</button></div></section>`
        :`<button class="btn sec" id="ncAbrir">+ Nova categoria</button>`):""}
      ${arq.length?`<h2 style="font-size:14px;color:var(--mut);margin:10px 4px 0">Arquivadas</h2>${arq.map(c=>`<div class="linha" style="padding:0 6px"><div class="nm" style="color:var(--mut)">${esc(c.nome)}<small>${c.uso} lançamento(s) no histórico</small></div><button class="mini-b" data-reativar="${c.id}">Reativar</button></div>`).join("")}`:""}
    </div></div>${nav("inicio")}`;
  const q=id=>document.getElementById(id), c=CG.lista.find(x=>x.id===CG.aberta);
  const resp=async(pr,msg)=>{ let r; try{ r=await pr; }catch(e){ r={ok:false,erro:e.message}; }
    if(!r.ok){ CG.erro=r.erro||"Não consegui salvar"; return renderCategorias(); } CG.erro=""; await recarregarCG(msg); };
  document.querySelectorAll("[data-nat]").forEach(b=>b.onclick=()=>{ CG.nat=b.dataset.nat; CG.aberta=null; CG.nova=false; CG.confirmar=null; CG.erro=""; renderCategorias(); });
  document.querySelectorAll("[data-cg]").forEach(b=>b.onclick=()=>{ CG.aberta=CG.aberta===+b.dataset.cg?null:+b.dataset.cg; CG.confirmar=null; CG.erro=""; renderCategorias(); });
  document.querySelectorAll("[data-pote]").forEach(b=>b.onclick=()=>resp(patch(`/api/categorias/${c.id}`,{pote:b.dataset.pote}),"Pote alterado — despesas reclassificadas"));
  document.querySelectorAll("[data-sgsal]").forEach(b=>b.onclick=()=>resp(patch(`/api/subcategorias/${b.dataset.sgsal}`,{nome:q("sg"+b.dataset.sgsal).value}),"Subcategoria renomeada"));
  document.querySelectorAll("[data-sgdel]").forEach(b=>b.onclick=()=>{ const k="s"+b.dataset.sgdel; if(CG.confirmar!==k){ CG.confirmar=k; return renderCategorias(); } resp(del(`/api/subcategorias/${b.dataset.sgdel}`),"Subcategoria excluída"); });
  document.querySelectorAll("[data-reativar]").forEach(b=>b.onclick=()=>resp(patch(`/api/categorias/${b.dataset.reativar}`,{ativa:true}),"Categoria reativada"));
  if(q("sgAdd")) q("sgAdd").onclick=()=>{ const n=q("sgNova").value.trim(); if(n) resp(post("/api/subcategorias",{categoria_id:c.id, nome:n}),"Subcategoria criada"); };
  if(q("cgSalvar")) q("cgSalvar").onclick=()=>{ const n=q("cgNome").value.trim(); if(n) resp(patch(`/api/categorias/${c.id}`,{nome:n}),"Nome salvo"); };
  if(q("cgDel")) q("cgDel").onclick=async()=>{ const k="c"+c.id; if(CG.confirmar!==k){ CG.confirmar=k; return renderCategorias(); }
    const r=await del(`/api/categorias/${c.id}`); if(!r.ok){ CG.erro=r.erro||"Não consegui"; return renderCategorias(); }
    CG.aberta=null; await recarregarCG(r.arquivada?"Categoria arquivada (histórico mantido)":"Categoria excluída"); };
  if(q("ncAbrir")) q("ncAbrir").onclick=()=>{ CG.nova=true; renderCategorias(); q("ncNome").focus(); };
  if(q("ncCancelar")) q("ncCancelar").onclick=()=>{ CG.nova=false; renderCategorias(); };
  if(q("ncSalvar")) q("ncSalvar").onclick=async()=>{ const n=q("ncNome").value.trim(); if(!n) return;
    const r=await post("/api/categorias",{nome:n, natureza:CG.nat, pote:q("ncPote")?q("ncPote").value:"NENHUM"});
    if(!r.ok){ CG.erro=r.erro||"Não consegui criar"; return renderCategorias(); }
    CG.nova=false; CG.aberta=r.id; await recarregarCG("Categoria criada"); };
}

function rota(){
  fecharSheet();
  rotaAnterior=rotaAtual; rotaAtual=location.hash||"#inicio";
  const h=rotaAtual.slice(1);
  if(h==="cartoes") telaCartoesLista();
  else if(/^cartao-\d+$/.test(h)){ const id=+h.slice(7); if(cartSel!==id){ cartSel=id; } telaCartoes(); }
  else if(h==="novo-cartao") telaCartaoForm(null);
  else if(/^editar-cartao-\d+$/.test(h)) telaCartaoForm(+h.slice(14));
  else if(h==="novo-estorno") telaForm("estorno");
  else if(h==="contas") telaContas();
  else if(h==="receitas"||h==="despesas") telaMov(h);
  else if(h==="categorias") telaCategorias();
  else if(/^pote-(NEC|DES|INV)$/.test(h)) telaPote(h.slice(5));
  else if(/^categoria-\d+$/.test(h)) telaCategoria(+h.slice(10));
  else if(h==="investimentos") telaInvest();
  else if(/^conta-\d+$/.test(h)) telaExtrato(+h.slice(6));
  else if(/^caixinha-\d+$/.test(h)) telaCaixinha(+h.slice(9));
  else if(h.startsWith("banco-")) telaBanco(decodeURIComponent(h.slice(6)));
  else if(h==="nova-receita") telaForm("receita");
  else if(h==="nova-despesa") telaForm("despesa");
  else if(h==="nova-despesa-cartao") telaForm("despesa-cartao");
  else carregar();
}

window.addEventListener("hashchange", rota);

async function carregar(){
  esqueleto();
  try{
    const m = ym(mesAtual);
    const [d, l] = await Promise.all([api("/api/resumo?mes="+m), api("/api/lancamentos?mes="+m)]);
    render(d, l);
  }catch(e){
    if (e.message!=="401") document.getElementById("raiz").innerHTML =
      `<div class="login"><span class="erro">Não consegui carregar: ${esc(e.message)}</span><button onclick="carregar()">Tentar de novo</button></div>`;
  }
}

async function sincronizar(){
  const b=document.getElementById("sync"); b.disabled=true; b.style.opacity=.4;
  try{
    const r = await fetch("/api/pluggy/sync",{method:"POST",headers:{"X-Token":token}}).then(r=>r.json());
    if (!r.ok) alert("Sincronização com problema: "+(r.erro||r.erros?.join("; ")));
  }catch(e){ alert("Falha ao sincronizar: "+e.message) }
  rota();
}

rota();
