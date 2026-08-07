/* VerOS Flow — Controle de acesso e filas operacionais V2 */
(function(){
  'use strict';

  const RULES = {
    RC:           { views:['dashboard','solicitacoes','nova','perfil'], actions:['create','timeline'] },
    COORD_FIN:    { views:['dashboard','solicitacoes','perfil'], actions:['finance'] },
    COORD_LOG:    { views:['dashboard','solicitacoes','perfil'], actions:['logistics'] },
    ADM_UBS:      { views:['dashboard','solicitacoes','perfil'], actions:['ubs'] },
    OPERACOES:    { views:['dashboard','solicitacoes','perfil'], actions:['billing'] },
    COMERCIAL_ADM:{ views:['dashboard','solicitacoes','nova','cadastros','indicadores','relatorios','configuracoes','perfil'], actions:['all'] }
  };

  const role = () => STATE.currentProfile || '';
  const isAdmin = () => role() === 'COMERCIAL_ADM';
  const hasAction = a => isAdmin() || (RULES[role()]?.actions || []).includes(a);
  const solById = id => DB.solicitacoes.find(s => s.id === id);

  // REGRA DEFINITIVA DE VISUALIZAÇÃO:
  // RC = somente próprias
  // ADM UBS = somente própria UBS
  // Financeiro, Logística e Operações = TODAS as unidades
  // Comercial ADM = tudo
  function canSee(sol){
    if(!sol) return false;
    if(isAdmin()) return true;
    if(role()==='RC') return sol.rcUsuarioId === STATE.currentUser?.id || sol.nomeRC === STATE.currentUser?.nome;
    if(role()==='ADM_UBS') return sol.unidade === STATE.currentUser?.unidade;
    if(role()==='COORD_FIN' || role()==='COORD_LOG' || role()==='OPERACOES') return true;
    return false;
  }

  function deny(msg='Você não possui permissão para executar esta ação.'){
    if(window.App?.toast) App.toast('Acesso restrito', msg, 'warn');
    return false;
  }

  const FIN_STATUSES = ['Aguardando Aprovação Financeira','Aguardando Crédito e Logística'];
  const LOG_QUOTE_STATUSES = ['Aguardando Crédito e Logística','Produção','Aguardando Frete'];
  const LOG_CONTRACT_STATUSES = ['Aguardando Frete','Produção'];
  const BILLING_STATUSES = ['Aguardando Frete','Frete contratado'];

  // Reforça a carga dos dados após a aplicação original já ter iniciado.
  // O index.html chama App.init() antes deste arquivo; sem este refresh
  // o Dashboard poderia permanecer com o filtro antigo (por unidade).
  async function refreshViewAfterPatch(){
    try{
      if(!STATE.currentUser || !window.Render) return;
      await Data.loadSolicitacoes();
      if(window.App?.buildSidebar) App.buildSidebar();
      if(STATE.view === 'detail' && STATE.detailId){ Render.detail(); }
      else if(STATE.view === 'solicitacoes'){ Render.solicitacoes(); }
      else { Render.dispatch(STATE.view || 'dashboard'); }
    }catch(err){
      console.warn('[VerOS Flow] Não foi possível atualizar a visão após aplicar controle de acesso:', err);
    }
  }

  if(window.Render){
    // Nunca restringir Financeiro/Logística/Operações por unidade no frontend.
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

      // Operações NÃO conclui produção. Produção é somente visualização para este perfil.
      if(role()==='OPERACOES'){
        root.querySelectorAll('button').forEach(btn=>{
          if((btn.textContent||'').includes('Marcar produção concluída')) btn.remove();
        });

        // Após produção concluída, Operações pode faturar em Aguardando Frete
        // ou Frete contratado.
        if(BILLING_STATUSES.includes(sol.status) && !sol.faturamento?.concluido){
          const stage = stageByTitle(root,'Faturamento');
          if(stage && !stage.querySelector('[data-vf-billing-action]')){
            const lock = stage.querySelector('.lock-note');
            if(lock) lock.remove();
            const p = document.createElement('p');
            p.style.cssText='font-size:12.5px;color:var(--v-ink-500);margin-bottom:10px;';
            p.textContent='Produção concluída. Emita a NF para concluir o faturamento.';
            const btn = document.createElement('button');
            btn.className='btn btn-primary btn-sm';
            btn.dataset.vfBillingAction='1';
            btn.textContent='Emitir NF';
            btn.onclick=()=>Render.abrirFaturamentoModal(sol.id);
            stage.appendChild(p); stage.appendChild(btn);
          }
        }
      }

      // Financeiro visualiza tudo, mas só recebe ação nas etapas financeiras.
      if(role()==='COORD_FIN' && FIN_STATUSES.includes(sol.status) && !sol.financeiro?.decisao){
        const stage = stageByTitle(root,'Financeiro');
        if(stage){
          stage.classList.remove('locked');
          const lock = stage.querySelector('.lock-note');
          if(lock) lock.remove();
        }
      }

      // Financeiro pode baixar anexos financeiros das solicitações que consegue ver.
      if(role()==='COORD_FIN'){
        root.querySelectorAll('.upload-tag').forEach(tag=>{
          if(tag.dataset.downloadBound==='1') return;
          const name = tag.textContent.trim();
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

      if(role()==='COORD_LOG' && LOG_QUOTE_STATUSES.includes(sol.status) && !sol.logistica?.transportadora){
        const stage=stageByTitle(root,'Logística');
        if(stage && !stage.querySelector('[data-vf-quote-action]')){
          const lock=stage.querySelector('.lock-note'); if(lock) lock.remove();
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

      if(role()==='ADM_UBS'){
        root.querySelectorAll('button').forEach(btn=>{
          if((btn.textContent||'').includes('Saldo disponível')) btn.textContent='Liberar produção';
          if((btn.textContent||'').includes('Sem saldo')) btn.textContent='Sem saldo / informar prazo';
        });
      }
    }
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

  if(window.Render){
    const originalFin=Render.financeiroAction;
    if(originalFin) Render.financeiroAction=async function(id,decisao){
      if(!hasAction('finance')) return deny('Somente o Coordenador Financeiro pode aprovar ou recusar crédito.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!FIN_STATUSES.includes(sol.status)) return deny('Esta solicitação não está pendente de decisão financeira.');
      return originalFin.apply(Render,arguments);
    };

    const originalFinRec=Render.financeiroReprovar;
    if(originalFinRec) Render.financeiroReprovar=function(id){
      if(!hasAction('finance')) return deny('Somente o Coordenador Financeiro pode recusar crédito.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!FIN_STATUSES.includes(sol.status)) return deny('Esta solicitação não está pendente de decisão financeira.');
      return originalFinRec.apply(Render,arguments);
    };

    const originalCot=Render.abrirCotacaoModal;
    if(originalCot) Render.abrirCotacaoModal=function(id){
      if(!hasAction('logistics')) return deny('Somente a Logística pode cotar frete.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!LOG_QUOTE_STATUSES.includes(sol.status)) return deny('A cotação não está pendente para esta solicitação.');
      return originalCot.apply(Render,arguments);
    };

    const originalContr=Render.contratarFrete;
    if(originalContr) Render.contratarFrete=async function(id){
      if(!hasAction('logistics')) return deny('Somente a Logística pode contratar frete.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!LOG_CONTRACT_STATUSES.includes(sol.status)) return deny('A contratação de frete só pode ocorrer após a etapa de produção.');
      if(sol.financeiro?.decisao==='Recusado') return deny('O frete não pode ser contratado com crédito recusado.');
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

    const originalFat=Render.abrirFaturamentoModal;
    if(originalFat) Render.abrirFaturamentoModal=function(id){
      if(!hasAction('billing')) return deny('Somente Operações de Negócio pode emitir a NF e concluir o faturamento.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(!BILLING_STATUSES.includes(sol.status)) return deny('O faturamento fica disponível após a produção ser concluída.');
      return originalFat.apply(Render,arguments);
    };

    // Operações não pode concluir produção.
    Render.concluirProducao=async function(){ return deny('A conclusão da produção não é uma ação do perfil Operações de Negócio.'); };

    const originalCancelar=Render.cancelarSolicitacao;
    if(originalCancelar) Render.cancelarSolicitacao=function(id){
      if(!isAdmin()) return deny('Somente o Comercial ADM pode editar qualquer etapa ou cancelar solicitações.');
      return originalCancelar.apply(Render,arguments);
    };
  }

  // Reaplica permissões e re-renderiza a tela que já pode ter sido montada
  // antes deste arquivo carregar.
  setTimeout(refreshViewAfterPatch, 250);
  setTimeout(refreshViewAfterPatch, 1200);
})();
