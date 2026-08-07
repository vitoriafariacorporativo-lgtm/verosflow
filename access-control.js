/* VerOS Flow — Controle de acesso e fluxo operacional V3
   Regra central: existe UMA solicitação de pedido de venda.
   A análise de crédito é uma etapa opcional da mesma solicitação,
   nunca um tipo diferente de solicitação.
*/
(function(){
  'use strict';

  const RULES = {
    RC:            { views:['dashboard','solicitacoes','nova','perfil'], actions:['create','timeline'] },
    COORD_FIN:     { views:['dashboard','solicitacoes','perfil'], actions:['finance'] },
    COORD_LOG:     { views:['dashboard','solicitacoes','perfil'], actions:['logistics'] },
    ADM_UBS:       { views:['dashboard','solicitacoes','perfil'], actions:['ubs'] },
    OPERACOES:     { views:['dashboard','solicitacoes','perfil'], actions:['billing'] },
    COMERCIAL_ADM: { views:['dashboard','solicitacoes','nova','cadastros','indicadores','relatorios','configuracoes','perfil'], actions:['all'] }
  };

  const role = () => STATE.currentProfile || '';
  const isAdmin = () => role() === 'COMERCIAL_ADM';
  const hasAction = a => isAdmin() || (RULES[role()]?.actions || []).includes(a);
  const solById = id => DB.solicitacoes.find(s => s.id === id);

  function canSee(sol){
    if(!sol) return false;
    if(isAdmin()) return true;
    if(role()==='RC') return sol.rcUsuarioId === STATE.currentUser?.id || sol.nomeRC === STATE.currentUser?.nome;
    if(role()==='ADM_UBS') return sol.unidade === STATE.currentUser?.unidade;
    // Financeiro, Logística e Operações enxergam a MESMA solicitação,
    // independentemente da unidade. O que muda é somente a ação permitida.
    if(['COORD_FIN','COORD_LOG','OPERACOES'].includes(role())) return true;
    return false;
  }

  function deny(msg='Você não possui permissão para executar esta ação.'){
    if(window.App?.toast) App.toast('Acesso restrito', msg, 'warn');
    return false;
  }

  // Uma solicitação pode passar por crédito ou não. Os perfis continuam
  // trabalhando sobre a mesma solicitação, nunca sobre "tipos" diferentes.
  const FIN_STATUSES = ['Aguardando Aprovação Financeira'];
  const LOG_QUOTE_STATUSES = ['Novo','Aguardando Saldo','Aguardando Aprovação Financeira','Aguardando Crédito e Logística','Produção','Aguardando Frete'];
  const LOG_CONTRACT_STATUSES = ['Aguardando Frete'];
  const BILLING_STATUSES = ['Aguardando Frete','Frete contratado'];

  async function refreshViewAfterPatch(){
    try{
      if(!STATE.currentUser || !window.Render) return;
      await Data.loadSolicitacoes();
      if(window.App?.buildSidebar) App.buildSidebar();
      if(STATE.view === 'detail' && STATE.detailId) Render.detail();
      else if(STATE.view === 'solicitacoes') Render.solicitacoes();
      else Render.dispatch(STATE.view || 'dashboard');
    }catch(err){
      console.warn('[VerOS Flow] refresh após controle de acesso:', err);
    }
  }

  /* ----------------------------------------------------------------------
     FLUXO DA SOLICITAÇÃO
     ----------------------------------------------------------------------
     Pedido novo
        ↓
     ADM UBS verifica saldo
        ↓
     ├─ sem crédito solicitado → Produção
     └─ com crédito solicitado → Aguardando Aprovação Financeira
                                            ↓ aprovado
                                          Produção
        ↓
     Produção concluída → Aguardando Frete
        ↓
     Logística contrata frete → Frete contratado
        ↓
     Operações emite NF → Faturado

     A cotação de frete pode ser feita antecipadamente e fica gravada
     na MESMA solicitação, sem criar uma nova solicitação.
  */

  if(window.Data){
    const originalDefinirSaldo = Data.definirSaldo;
    Data.definirSaldo = async function(solId, disponivel, tempoProducao){
      const sol = solById(solId);
      if(!sol) throw new Error('Solicitação não encontrada.');

      const tempo = tempoProducao ? String(tempoProducao).trim() : null;
      if(!disponivel && !tempo){
        throw new Error('Informe o tempo estimado para produção quando não houver saldo disponível.');
      }

      // Mantém a informação de saldo/tempo na tabela própria da UBS.
      const { error } = await supabaseClient.from('adm_ubs_avaliacoes').upsert({
        solicitacao_id: solId,
        saldo_disponivel: !!disponivel,
        tempo_producao: tempo,
        avaliado_por: STATE.currentUser.id,
        avaliado_em: new Date().toISOString()
      });
      if(error) throw error;

      // Crédito é uma etapa opcional da MESMA solicitação.
      // Sem crédito: libera produção imediatamente.
      // Com crédito: aguarda somente a decisão financeira.
      const novoStatus = sol.solicitaCredito ? 'Aguardando Aprovação Financeira' : 'Produção';
      await Data._setStatus(solId, novoStatus);
      await Data.addTimeline(solId,
        disponivel
          ? (sol.solicitaCredito ? 'Saldo disponível — aguardando análise de crédito' : 'Saldo disponível — produção liberada')
          : (sol.solicitaCredito ? `Sem saldo — produção estimada em ${tempo}; aguardando análise de crédito` : `Sem saldo — produção estimada em ${tempo}; produção liberada`)
      );
      await Data.logAcao(solId, 'Avaliação UBS', '—', disponivel ? 'Saldo disponível' : `Sem saldo · prazo: ${tempo}`);
    };

    // Se a decisão financeira existir, ela afeta apenas pedidos que
    // realmente solicitaram crédito.
    const originalDecidirCredito = Data.decidirCredito;
    Data.decidirCredito = async function(solId, decisao, motivo){
      const sol = solById(solId);
      if(!sol) throw new Error('Solicitação não encontrada.');
      if(!sol.solicitaCredito) throw new Error('Esta solicitação não possui análise de crédito.');
      return originalDecidirCredito.call(Data, solId, decisao, motivo);
    };
  }

  if(window.Render){
    Render.visibleSolicitacoes = function(){
      return DB.solicitacoes.filter(canSee);
    };

    const originalDetail = Render.detail;
    Render.detail = function(){
      const sol = solById(STATE.detailId);
      if(!canSee(sol)){
        deny('Esta solicitação não está disponível para o seu perfil.');
        return App.navigate('solicitacoes');
      }
      originalDetail.apply(Render, arguments);
      setTimeout(() => enhanceDetail(sol), 0);
    };

    function stageByTitle(root,title){
      return [...root.querySelectorAll('.stage-block')].find(el => (el.querySelector('h4')?.textContent || '').includes(title));
    }

    function enhanceDetail(sol){
      const root = document.getElementById('view-detail');
      if(!root) return;

      // ---------------------------------------------------------------
      // FINANCEIRO: só é uma etapa se o próprio pedido solicitou crédito.
      // ---------------------------------------------------------------
      const financeStage = stageByTitle(root,'Financeiro');
      if(financeStage && !sol.solicitaCredito){
        financeStage.classList.add('locked');
        const note = financeStage.querySelector('.lock-note');
        if(note) note.textContent = 'Análise de crédito não solicitada para este pedido.';
        else {
          financeStage.querySelectorAll('button').forEach(b=>b.remove());
          const p=document.createElement('span');
          p.className='lock-note';
          p.textContent='Análise de crédito não solicitada para este pedido.';
          financeStage.appendChild(p);
        }
      }

      // ---------------------------------------------------------------
      // ADM UBS: saldo é avaliação da mesma solicitação.
      // "Sem saldo" pede prazo de produção, mas NÃO transforma o pedido
      // em outro tipo nem cria uma fila financeira artificial.
      // ---------------------------------------------------------------
      if(role()==='ADM_UBS'){
        root.querySelectorAll('button').forEach(btn=>{
          if((btn.textContent||'').includes('Saldo disponível')) btn.textContent='Liberar produção';
          if((btn.textContent||'').includes('Sem saldo')) btn.textContent='Sem saldo / informar prazo';
        });
      }

      // ---------------------------------------------------------------
      // FINANCEIRO: vê todas as solicitações, mas só age quando crédito
      // foi solicitado e ainda não existe decisão.
      // ---------------------------------------------------------------
      if(role()==='COORD_FIN' && sol.solicitaCredito && FIN_STATUSES.includes(sol.status) && !sol.financeiro?.decisao){
        const stage=financeStage;
        if(stage){
          stage.classList.remove('locked');
          stage.querySelector('.lock-note')?.remove();
        }
      }

      if(role()==='COORD_FIN'){
        root.querySelectorAll('.upload-tag').forEach(tag=>{
          if(tag.dataset.downloadBound==='1') return;
          const name=tag.textContent.trim();
          if(!name) return;
          tag.dataset.downloadBound='1';
          tag.style.cursor='pointer';
          tag.title='Baixar anexo';
          tag.onclick=async e=>{
            e.preventDefault(); e.stopPropagation();
            try{
              const {data,error}=await supabaseClient.from('anexos_credito').select('storage_path').eq('solicitacao_id',sol.id).eq('nome_arquivo',name).limit(1).maybeSingle();
              if(error) throw error;
              if(!data?.storage_path) throw new Error('Caminho do anexo não encontrado.');
              const {data:urlData,error:urlError}=await supabaseClient.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(data.storage_path,300);
              if(urlError) throw urlError;
              if(!urlData?.signedUrl) throw new Error('Não foi possível gerar o link do anexo.');
              window.open(urlData.signedUrl,'_blank','noopener');
            }catch(err){ App.toast('Erro ao baixar anexo',err.message||'Tente novamente.','err'); }
          };
        });
      }

      // ---------------------------------------------------------------
      // LOGÍSTICA: cotação pertence ao mesmo pedido e pode ser registrada
      // enquanto o pedido estiver em andamento, inclusive antes da análise
      // de crédito terminar.
      // ---------------------------------------------------------------
      if(role()==='COORD_LOG' && LOG_QUOTE_STATUSES.includes(sol.status) && !sol.logistica?.transportadora){
        const stage=stageByTitle(root,'Logística');
        if(stage && !stage.querySelector('[data-vf-quote-action]')){
          stage.querySelector('.lock-note')?.remove();
          const p=document.createElement('p');
          p.style.cssText='font-size:12.5px;color:var(--v-ink-500);margin-bottom:10px;';
          p.textContent='Registre a cotação de frete para esta solicitação.';
          const btn=document.createElement('button');
          btn.className='btn btn-secondary btn-sm';
          btn.dataset.vfQuoteAction='1';
          btn.textContent='Registrar cotação';
          btn.onclick=()=>Render.abrirCotacaoModal(sol.id);
          stage.appendChild(p); stage.appendChild(btn);
        }
      }

      // ---------------------------------------------------------------
      // OPERAÇÕES: faturamento depende de produção concluída, não de
      // existência de crédito nem de contratação do frete.
      // ---------------------------------------------------------------
      if(role()==='OPERACOES'){
        root.querySelectorAll('button').forEach(btn=>{
          if((btn.textContent||'').includes('Marcar produção concluída')) btn.remove();
        });
        if(BILLING_STATUSES.includes(sol.status) && !sol.faturamento?.concluido){
          const stage=stageByTitle(root,'Faturamento');
          if(stage && !stage.querySelector('[data-vf-billing-action]')){
            stage.querySelector('.lock-note')?.remove();
            const p=document.createElement('p');
            p.style.cssText='font-size:12.5px;color:var(--v-ink-500);margin-bottom:10px;';
            p.textContent='Produção concluída. Emita a NF para concluir o faturamento.';
            const btn=document.createElement('button');
            btn.className='btn btn-primary btn-sm';
            btn.dataset.vfBillingAction='1';
            btn.textContent='Emitir NF';
            btn.onclick=()=>Render.abrirFaturamentoModal(sol.id);
            stage.appendChild(p); stage.appendChild(btn);
          }
        }
      }
    }

    // Ações financeiras.
    const originalFin=Render.financeiroAction;
    if(originalFin) Render.financeiroAction=async function(id,decisao){
      if(!hasAction('finance')) return deny('Somente o Coordenador Financeiro pode aprovar ou recusar crédito.');
      const sol=solById(id);
      if(!canSee(sol)) return deny();
      if(!sol?.solicitaCredito) return deny('Este pedido não solicitou análise de crédito.');
      if(!FIN_STATUSES.includes(sol.status)) return deny('Este pedido não está pendente de decisão financeira.');
      return originalFin.apply(Render,arguments);
    };

    const originalFinRec=Render.financeiroReprovar;
    if(originalFinRec) Render.financeiroReprovar=function(id){
      if(!hasAction('finance')) return deny('Somente o Coordenador Financeiro pode recusar crédito.');
      const sol=solById(id);
      if(!canSee(sol)) return deny();
      if(!sol?.solicitaCredito) return deny('Este pedido não solicitou análise de crédito.');
      if(!FIN_STATUSES.includes(sol.status)) return deny('Este pedido não está pendente de decisão financeira.');
      return originalFinRec.apply(Render,arguments);
    };

    // ADM UBS: quando não houver saldo, solicitar prazo antes de liberar.
    const originalUbs=Render.admUbsAction;
    if(originalUbs) Render.admUbsAction=function(id,disponivel){
      if(!hasAction('ubs')) return deny('Somente o ADM UBS pode avaliar o saldo da unidade.');
      const sol=solById(id);
      if(!canSee(sol)) return deny();
      if(disponivel) return originalUbs.apply(Render,arguments);
      Modal.open('Sem saldo disponível',`
        <div class="field"><label>Tempo estimado para produção *</label><input id="m_tempo_producao" placeholder="Ex.: 15 dias úteis"></div>
        <p style="font-size:12px;color:var(--v-ink-500);margin-top:8px;">O prazo ficará registrado na avaliação da UBS e o pedido continuará sendo a mesma solicitação.</p>
      `,[
        {label:'Cancelar',cls:'btn-ghost',onClick:()=>Modal.close()},
        {label:'Liberar produção',cls:'btn-primary',onClick:async()=>{
          const tempo=document.getElementById('m_tempo_producao')?.value.trim();
          if(!tempo){ App.toast('Campo obrigatório','Informe o tempo estimado para produção.','err'); return; }
          try{
            await Data.definirSaldo(id,false,tempo);
            Modal.close();
            await Data.refreshSolicitacoesData();
            App.toast('Produção liberada','Prazo registrado: '+tempo,'ok');
            Render.detail();
          }catch(err){ App.toast('Erro ao salvar',err.message||'Tente novamente.','err'); }
        }}
      ]);
    };

    // Logística: cotação é independente da análise de crédito.
    const originalCot=Render.abrirCotacaoModal;
    if(originalCot) Render.abrirCotacaoModal=function(id){
      if(!hasAction('logistics')) return deny('Somente a Logística pode cotar frete.');
      const sol=solById(id);
      if(!canSee(sol)) return deny();
      if(!LOG_QUOTE_STATUSES.includes(sol.status)) return deny('A cotação não está disponível nesta etapa do pedido.');
      return originalCot.apply(Render,arguments);
    };

    const originalContr=Render.contratarFrete;
    if(originalContr) Render.contratarFrete=async function(id){
      if(!hasAction('logistics')) return deny('Somente a Logística pode contratar frete.');
      const sol=solById(id);
      if(!canSee(sol)) return deny();
      if(!LOG_CONTRACT_STATUSES.includes(sol.status)) return deny('A contratação do frete ocorre após a conclusão da produção.');
      if(sol.solicitaCredito && sol.financeiro?.decisao!=='Aprovado' && sol.financeiro?.decisao!=='Aprovado com ressalvas') return deny('Este pedido solicitou crédito e precisa estar aprovado antes da contratação do frete.');
      return originalContr.apply(Render,arguments);
    };

    const originalEntrega=Render.atualizarEntregaAction;
    if(originalEntrega) Render.atualizarEntregaAction=async function(id,status){
      if(!hasAction('logistics')) return deny('Somente a Logística pode atualizar o status de entrega.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!sol.logistica?.contratado) return deny('A entrega só pode ser atualizada após a contratação do frete.');
      return originalEntrega.apply(Render,arguments);
    };

    const originalEntregaModal=Render.abrirEntregaModal;
    if(originalEntregaModal) Render.abrirEntregaModal=function(id){
      if(!hasAction('logistics')) return deny('Somente a Logística pode registrar a entrega.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!sol.logistica?.contratado) return deny('A entrega só pode ser registrada após a contratação do frete.');
      return originalEntregaModal.apply(Render,arguments);
    };

    // Operações: produção é visualização; faturamento é ação após produção.
    const originalFat=Render.abrirFaturamentoModal;
    if(originalFat) Render.abrirFaturamentoModal=function(id){
      if(!hasAction('billing')) return deny('Somente Operações de Negócio pode emitir a NF e concluir o faturamento.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!BILLING_STATUSES.includes(sol.status)) return deny('O faturamento fica disponível após a produção ser concluída.');
      return originalFat.apply(Render,arguments);
    };

    Render.concluirProducao=async function(){ return deny('A conclusão da produção não é uma ação do perfil Operações de Negócio.'); };

    const originalCancelar=Render.cancelarSolicitacao;
    if(originalCancelar) Render.cancelarSolicitacao=function(id){
      if(!isAdmin()) return deny('Somente o Comercial ADM pode cancelar solicitações.');
      return originalCancelar.apply(Render,arguments);
    };
  }

  if(window.App){
    App.buildSidebar=function(){
      const nav=document.getElementById('sideNav');
      const items=[
        {id:'dashboard',label:'Dashboard',icon:'grid'},
        {id:'solicitacoes',label:'Solicitações',icon:'list'},
        {id:'nova',label:'Nova Solicitação',icon:'plus'},
        {id:'cadastros',label:'Cadastros',icon:'folder'},
        {id:'indicadores',label:'Indicadores',icon:'barChart'},
        {id:'relatorios',label:'Relatórios',icon:'fileText'},
        {id:'configuracoes',label:'Configurações',icon:'settings'},
        {id:'perfil',label:'Meu Perfil',icon:'user'}
      ];
      nav.innerHTML='<div class="nav-label">Menu</div>'+items.filter(i=>(RULES[role()]?.views||[]).includes(i.id)).map(i=>`<div class="nav-item" data-view="${i.id}" onclick="App.navigate('${i.id}')"><span class="nic">${Ic(i.icon,16)}</span><span>${i.label}</span></div>`).join('');
      document.getElementById('sideAvatar').textContent=U.initials(STATE.currentUser?.nome);
      document.getElementById('sideUserName').textContent=STATE.currentUser?.nome||'—';
      document.getElementById('sideUserRole').textContent=U.perfilNome(role());
      const top=document.getElementById('btnNovaTopbar');
      if(top) top.style.display=(role()==='RC'||isAdmin())?'flex':'none';
    };

    const originalNavigate=App.navigate;
    App.navigate=function(view,params){
      if(view==='detail'){
        const sol=solById(params?.id);
        if(!canSee(sol)) return deny('Esta solicitação não está disponível para o seu perfil.');
      }else if(!(RULES[role()]?.views||[]).includes(view)){
        return deny('Seu perfil não possui acesso a esta área.');
      }
      return originalNavigate.call(App,view,params);
    };
  }

  if(window.FLOW){
    FLOW.podeEditarEtapa=function(etapa){
      if(isAdmin()) return true;
      return (etapa==='financeiro'&&role()==='COORD_FIN') ||
             (etapa==='logistica'&&role()==='COORD_LOG') ||
             (etapa==='admUbs'&&role()==='ADM_UBS') ||
             (etapa==='faturamento'&&role()==='OPERACOES');
    };
  }

  setTimeout(refreshViewAfterPatch,250);
  setTimeout(refreshViewAfterPatch,1200);
})();
