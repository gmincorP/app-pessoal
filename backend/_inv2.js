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
function abrirAlocar(m){
  const ap=m.valor<0;
  folha(`<b style="font-size:16px">${esc(m.descricao)} · ${brl(Math.abs(m.valor))}</b>
    <div style="color:var(--mut);font-size:13px;margin:2px 0 12px">${dm(m.data)} · ${esc(m.banco)} · ${ap?"guardado em":"resgatado de"} qual caixinha?</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${IV.caixinhas.map(c=>`<button class="btn sec" data-al="${c.id}" style="text-align:left;padding:0 14px;${m.caixinha_id===c.id?"border-color:var(--inv);color:var(--inv)":""}">${esc(c.nome)}${c.economia?"":' <small style="color:var(--mut)">· fora da economia</small>'}</button>`).join("")}
      ${m.caixinha_id?'<button class="btn sec" data-al="" style="color:var(--mut)">Tirar da caixinha</button>':""}
      <button class="btn sec" id="alNova" style="color:var(--nec)">+ Nova caixinha</button>
      <button class="btn sec" id="alFechar">Cancelar</button></div>`);
  document.querySelectorAll("[data-al]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
    const r=await post("/api/caixinhas/alocar",{lancamento_id:m.id, caixinha_id:+b.dataset.al||null});
    fecharSheet(); toast(r.ok?"Movimento atualizado":"Não consegui salvar"); telaInvest(); });
  document.getElementById("alNova").onclick=()=>abrirCaixinha(null, m);
  document.getElementById("alFechar").onclick=fecharSheet;
}
function abrirCaixinha(c, alocar){
  const novo=!c, bancos=[...new Set(["Nubank",...IV.bancos.map(b=>b.banco)])];
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
  if(q("cxArq")) q("cxArq").onclick=async()=>{ await patch(`/api/caixinhas/${c.id}`,{ativa:false}); fecharSheet(); toast("Caixinha arquivada"); telaInvest(); };
  q("cxSalvar").onclick=async()=>{
    const nome=q("cxN").value.trim(); if(!nome){ q("cxErro").textContent="Informe o nome."; return; }
    const eco=q("cxE").checked, meta=numBR(q("cxM").value)||null;
    let r = novo ? await post("/api/caixinhas",{nome, banco:q("cxB").value, saldo_atual:numBR(q("cxS").value), meta, economia:eco})
                 : await patch(`/api/caixinhas/${c.id}`,{nome, meta, economia:eco});
    if(!r.ok){ q("cxErro").textContent=r.erro||"Não consegui salvar"; return; }
    if(alocar && r.id) await post("/api/caixinhas/alocar",{lancamento_id:alocar.id, caixinha_id:r.id});
    fecharSheet(); toast(novo?"Caixinha criada":(r.reclassificados?`Salvo · ${r.reclassificados} movimento(s) reclassificados`:"Salvo")); telaInvest();
  };
}

