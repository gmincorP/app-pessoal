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
    const ab=catAberta===c.id, cor=PALETA[i%PALETA.length], subs=c.subcategorias||[], temSub=subs.some(s=>s.nome!=="Sem subcategoria");
    return `<div class="cat" ${temSub?`data-catab="${c.id}" role="button" style="cursor:pointer"`:""}>
      <div class="t"><span>${esc(c.nome)}${temSub?` <span style="color:var(--dim)">${ab?"▾":"▸"}</span>`:""}</span><span>${brl(+c.valor)}</span></div>
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
    const subs=c.subcategorias.map(s=>`<div class="parte"><input id="sg${s.id}" value="${esc(s.nome)}" aria-label="Nome da subcategoria" style="flex:1 1 auto">
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
        <div class="parte"><input id="sgNova" placeholder="Nova subcategoria" style="flex:1 1 auto"><button class="mini-b" id="sgAdd" style="color:var(--inv);border-color:var(--inv)">Adicionar</button></div>
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

