/* VerOS Flow — Controle de acesso e fluxo operacional v4
   Regra central: existe UMA solicitação de Pedido de Venda.
   Todos os perfis relevantes visualizam o mesmo pedido desde a criação;
   cada ação fica disponível somente quando seus pré-requisitos forem atendidos.
*/
(function(){
  'use strict';

  const ROLE = () => String(STATE.currentUser?.perfil || STATE.currentUser?.role || '').toUpperCase();
  const ADMIN = () => ROLE() === 'COMERCIAL_ADM';
  const ALL_ROLES = ['COORD_FIN','COORD_LOG','OPERACOES','COMERCIAL_ADM'];
  const creditApproved = s => !s?.solicitaCredito || ['Aprovado','Aprovado com ressalvas'].includes(s?.financeiro?.decisao);
  const creditPending = s => !!s?.solicitaCredito && !s?.financeiro?.decisao && s?.status !== 'Crédito recusado';
  const creditRejected = s => s?.financeiro?.decisao === 'Recusado' || s?.status === 'Crédito recusado';
  const admDone = s => s?.admUbs?.saldoDisponivel !== undefined && s?.admUbs?.saldoDisponivel !== null;
  const productionReady = s => admDone(s) && creditApproved(s) && !creditRejected(s);
  const productionFinished = s => ['Aguardando Frete','Frete contratado','Faturado','Em transporte','Entregue'].includes(s?.status) || !!s?.faturamento?.concluido;
  const freightQuoted = s => !!s?.logistica?.transportadora && Number(s?.logistica?.valorFrete || 0) > 0 && !!s?.logistica?.prazo;

  window.VEROS_FLOW_RULES = {
    version:'4.0',
    roles:ROLE,
    canSee(s){
      if(!s || !STATE.currentUser) return false;
      const r=ROLE();
      if(ADMIN()) return true;
      if(r==='RC') return s.rcUsuarioId===STATE.currentUser.id || s.nomeRC===STATE.currentUser.nome;
      if(r==='ADM_UBS') return String(s.unidade_id || s.unidadeId || '').trim().toLowerCase() === String(STATE.currentUser.unidade_id || '').trim().toLowerCase();
      return ALL_ROLES.includes(r);
    },
    creditApproved, creditPending, creditRejected, admDone, productionReady, productionFinished, freightQuoted
  };

  // Sidebar/permissões: mantém navegação normal e garante acesso às solicitações.
  window.RULES = window.RULES || {};
  ['COORD_FIN','COORD_LOG','OPERACOES','COMERCIAL_ADM'].forEach(r=>{
    window.RULES[r] = window.RULES[r] || {views:['dashboard','solicitacoes','relatorios','perfil']};
  });

  // 1) VISUALIZAÇÃO: todos os perfis de área veem o mesmo pedido desde a criação.
  if(window.Render){
    Render.visibleSolicitacoes = function(){
      return (DB.solicitacoes||[]).filter(VEROS_FLOW_RULES.canSee);
    };
  }

  async function refresh(){
    try{
      if(window.Data?.loadSolicitacoes) await Data.loadSolicitacoes();
      else if(window.Data?.refreshSolicitacoesData) await Data.refreshSolicitacoesData();
      if(window.App?.buildSidebar) App.buildSidebar();
      if(window.STATE?.view==='detail' && window.Render?.detail) Render.detail();
      else if(window.STATE?.view==='solicitacoes' && window.Render?.solicitacoes) Render.solicitacoes();
    }catch(e){ console.error('[VerOS Flow] refresh',e); }
  }

  // 2) ADM UBS: SIM exige prazo em dias; NÃO não exige justificativa.
  if(window.Render && Render.admUbsAction){
    Render.admUbsAction = async function(id, disponivel){
      const sol=DB.solicitacoes.find(s=>s.id===id);
      if(!sol) return;
      if(ROLE()!=='ADM_UBS' && !ADMIN()){ App.toast('Ação bloqueada','Somente o ADM UBS da unidade pode avaliar o saldo.','err'); return; }
      if(ROLE()==='ADM_UBS' && String(sol.unidade_id || sol.unidadeId || '').trim().toLowerCase() !== String(STATE.currentUser.unidade_id || '').trim().toLowerCase()){ App.toast('Ação bloqueada','Este pedido pertence a outra UBS.','err'); return; }
      let tempo=null;
      if(disponivel){
        tempo=prompt('Informe o tempo estimado para produção (em dias):','');
        if(tempo===null) return;
        tempo=String(tempo).trim();
        if(!/^\d+(?:[,.]\d+)?$/.test(tempo)){ App.toast('Prazo inválido','Informe apenas o número de dias.','err'); return; }
        tempo=tempo.replace(',','.');
      }
      try{
        const {error}=await supabaseClient.from('adm_ubs_avaliacoes').upsert({
          solicitacao_id:id,
          saldo_disponivel:!!disponivel,
          tempo_producao:tempo,
          avaliado_por:STATE.currentUser.id,
          avaliado_em:new Date().toISOString()
        });
        if(error) throw error;
        const nextStatus = sol.solicitaCredito ? 'Aguardando Aprovação Financeira' : 'Produção';
        const {error:e2}=await supabaseClient.from('solicitacoes').update({status:nextStatus}).eq('id',id);
        if(e2) throw e2;
        await Data.logAcao(id,'Avaliação ADM UBS','—',disponivel?'Saldo disponível'+(tempo?' / '+tempo+' dias':''):'Sem saldo');
        await Data.addTimeline(id,disponivel?'Saldo disponível para produção':'Sem saldo para produção');
        await refresh();
        App.toast('Avaliação registrada',disponivel?'Saldo disponível. Prazo de produção informado.':'Sem saldo. Nenhuma justificativa é necessária.','ok');
      }catch(e){ App.toast('Erro ao avaliar saldo',e.message||'Não foi possível salvar.','err'); }
    };
  }

  // 3) FINANCEIRO: ação somente se o pedido realmente solicitou crédito e está pendente.
  if(window.Render && Render.financeiroAction){
    const originalFinanceiroAction=Render.financeiroAction.bind(Render);
    Render.financeiroAction=async function(id,decisao){
      const sol=DB.solicitacoes.find(s=>s.id===id);
      if(ROLE()!=='COORD_FIN' && !ADMIN()){ App.toast('Ação bloqueada','Somente o Coordenador Financeiro pode decidir o crédito.','err'); return; }
      if(!sol?.solicitaCredito){ App.toast('Sem análise de crédito','Este pedido não solicitou análise de crédito.','warn'); return; }
      if(!admDone(sol)){ App.toast('Ação bloqueada','Aguardando avaliação do ADM UBS.','warn'); return; }
      if(creditRejected(sol) || sol.financeiro?.decisao){ App.toast('Ação bloqueada','A decisão financeira deste pedido já foi registrada.','warn'); return; }
      return originalFinanceiroAction(id,decisao);
    };
  }

  // 4) LOGÍSTICA: cotação pode ser feita desde a criação; contratação só quando o pedido estiver liberado.
  if(window.FLOW){
    FLOW.contratarFrete=async function(sol){
      sol=typeof sol==='string' ? DB.solicitacoes.find(s=>s.id===sol) : sol;
      if(!sol) return;
      if(ROLE()!=='COORD_LOG' && !ADMIN()){ App.toast('Ação bloqueada','Somente a Logística pode contratar o frete.','err'); return; }
      if(!freightQuoted(sol)){ App.toast('Ação bloqueada','Registre primeiro a cotação com valor e prazo.','warn'); return; }
      if(!admDone(sol)){ App.toast('Ação bloqueada','Aguardando avaliação do ADM UBS.','warn'); return; }
      if(!creditApproved(sol) || creditRejected(sol)){ App.toast('Ação bloqueada','A contratação depende da aprovação do crédito quando houver análise.','warn'); return; }
      const {error}=await supabaseClient.from('logistica_fretes').update({contratado:true,contratado_em:new Date().toISOString()}).eq('solicitacao_id',sol.id);
      if(error) throw error;
      await Data.logAcao(sol.id,'Contratação de frete','—',sol.logistica.transportadora||'Frete contratado');
      await refresh();
    };
  }
  if(window.Render && Render.contratarFrete){
    Render.contratarFrete=function(id){
      const sol=DB.solicitacoes.find(s=>s.id===id);
      return FLOW.contratarFrete(sol).catch(e=>App.toast('Erro ao contratar frete',e.message||'Tente novamente.','err'));
    };
  }

  // 5) PRODUÇÃO: só pode ser concluída depois que ADM UBS avaliou e crédito, quando exigido, foi aprovado.
  if(window.FLOW){
    FLOW.concluirProducao=async function(solId){
      const sol=DB.solicitacoes.find(s=>s.id===solId);
      if(!sol) return;
      if(ROLE()!=='OPERACOES' && !ADMIN()){ App.toast('Ação bloqueada','A conclusão da produção deve ser informada pela Operação.','err'); return; }
      if(!productionReady(sol)){ App.toast('Ação bloqueada','O pedido ainda não cumpriu os pré-requisitos para produção.','warn'); return; }
      const {error}=await supabaseClient.from('solicitacoes').update({status:'Aguardando Frete'}).eq('id',solId);
      if(error) throw error;
      await Data.addTimeline(solId,'Produção finalizada');
      await Data.logAcao(solId,'Produção finalizada','Produção','Aguardando Faturamento');
      await refresh();
    };
  }

  // 6) FATURAMENTO: fica visível desde a criação, mas a ação só libera após produção finalizada.
  if(window.Render && Render.abrirFaturamentoModal){
    const originalFaturamento=Render.abrirFaturamentoModal.bind(Render);
    Render.abrirFaturamentoModal=function(id){
      const sol=DB.solicitacoes.find(s=>s.id===id);
      if(ROLE()!=='OPERACOES' && !ADMIN()){ App.toast('Ação bloqueada','Somente Operações pode faturar o pedido.','err'); return; }
      if(!productionFinished(sol)){ App.toast('Faturamento bloqueado','Aguardando a informação de produção finalizada.','warn'); return; }
      return originalFaturamento(id);
    };
  }

  // 7) Bloqueios visuais: o pedido aparece para todos, mas os botões mostram claramente o motivo do bloqueio.
  function lockButton(btn,msg){
    if(!btn) return;
    btn.disabled=true;
    btn.title=msg;
    btn.style.opacity='.55';
    btn.style.cursor='not-allowed';
  }

  function applyLocks(){
    try{
      const id=STATE.detailId;
      const sol=DB.solicitacoes.find(s=>s.id===id);
      if(!sol) return;
      const root=document.getElementById('view-detail');
      if(!root) return;
      const r=ROLE();
      const ready=productionReady(sol);
      const pFinished=productionFinished(sol);
      const cReady=creditApproved(sol)&&!creditRejected(sol)&&admDone(sol);

      // Financeiro: se não há crédito, mantém o pedido visível e ações bloqueadas.
      root.querySelectorAll('button').forEach(btn=>{
        const t=(btn.textContent||'').trim().toLowerCase();
        if(['aprovar','aprovar com ressalvas','recusar'].includes(t)){
          if(!sol.solicitaCredito) lockButton(btn,'Este pedido não solicitou análise de crédito.');
          else if(!admDone(sol)) lockButton(btn,'Aguardando avaliação do ADM UBS.');
          else if(sol.financeiro?.decisao || creditRejected(sol)) lockButton(btn,'Decisão financeira já registrada.');
        }
        if(t==='contratar frete'){
          if(!freightQuoted(sol)) lockButton(btn,'Faça a cotação do frete primeiro.');
          else if(!admDone(sol)) lockButton(btn,'Aguardando avaliação do ADM UBS.');
          else if(!cReady) lockButton(btn,'Aguardando aprovação do crédito.');
        }
        if(t.includes('concluir produção') || t.includes('informar produção')){
          if(!ready) lockButton(btn,'Aguardando saldo e/ou aprovação do crédito.');
        }
      });

      // Faturamento: nunca esconder o estágio; deixa a ação explícita e travada até produção finalizada.
      const blocks=[...root.querySelectorAll('.stage-block')];
      const fat=blocks.find(b=>(b.querySelector('h4')?.textContent||'').toLowerCase().includes('faturamento'));
      if(fat && !sol.faturamento?.concluido){
        const existing=[...fat.querySelectorAll('button')].find(b=>(b.textContent||'').toLowerCase().includes('emitir nf'));
        if(existing){
          if(!pFinished) lockButton(existing,'Aguardando informação de produção finalizada.');
        }else if(r==='OPERACOES' || ADMIN()){
          const wrap=document.createElement('div');
          wrap.className='mini-actions';
          wrap.style.marginTop='10px';
          const b=document.createElement('button');
          b.className='btn btn-primary btn-sm';
          b.textContent='Emitir NF';
          b.onclick=()=>Render.abrirFaturamentoModal(sol.id);
          if(!pFinished) lockButton(b,'Aguardando informação de produção finalizada.');
          wrap.appendChild(b); fat.appendChild(wrap);
        }
        const note=fat.querySelector('.lock-note');
        if(note && !pFinished) note.textContent='Faturamento disponível após informar a produção finalizada.';
      }

      // Contratação não depende de produção concluída: depende da cotação + pré-requisitos do pedido.
      const contract=[...root.querySelectorAll('button')].find(b=>(b.textContent||'').trim().toLowerCase()==='contratar frete');
      if(contract && freightQuoted(sol) && cReady) contract.disabled=false;

      // Comercial ADM: mantém a edição administrativa já implementada pelo admin-editor.js.
      if(ADMIN()){
        root.querySelectorAll('button').forEach(btn=>{
          const t=(btn.textContent||'').trim().toLowerCase();
          if(t.includes('editar pedido') || t.includes('editar solicitação')){
            btn.disabled=false; btn.style.opacity=''; btn.style.cursor='';
          }
        });
      }
    }catch(e){ console.warn('[VerOS Flow] applyLocks',e); }
  }

  if(window.Render && Render.detail){
    const originalDetail=Render.detail.bind(Render);
    Render.detail=function(){
      const out=originalDetail();
      setTimeout(applyLocks,0);
      setTimeout(applyLocks,120);
      return out;
    };
  }

  // Reaplica o filtro quando a lista for renderizada e após refresh de dados.
  if(window.Render){
    const originalSolic=Render.solicitacoes?.bind(Render);
    if(originalSolic) Render.solicitacoes=function(){ const r=originalSolic(); setTimeout(()=>{},0); return r; };
  }

  // Exposição para testes no console.
  window.VerOSFlowDebug={
    role:ROLE,
    canSee:VEROS_FLOW_RULES.canSee,
    admDone,creditApproved,productionReady,productionFinished,freightQuoted
  };

  console.info('[VerOS Flow] fluxo v4 carregado — pedido único, visibilidade simultânea e ações condicionais.');
})();