/* VerOS Flow — Controle de acesso por perfil + roteamento operacional */
(function(){
  'use strict';

  const RULES = {
    RC:          { ownOnly:true,  views:['dashboard','solicitacoes','nova','perfil'], actions:['create','timeline'] },
    COORD_FIN:   { all:true,      views:['dashboard','solicitacoes','perfil'], actions:['finance'] },
    COORD_LOG:   { all:true,      views:['dashboard','solicitacoes','perfil'], actions:['logistics'] },
    ADM_UBS:     { ownUnit:true,  views:['dashboard','solicitacoes','perfil'], actions:['ubs'] },
    OPERACOES:   { all:true,      views:['dashboard','solicitacoes','perfil'], actions:['billing'] },
    COMERCIAL_ADM:{ all:true,     views:['dashboard','solicitacoes','nova','cadastros','indicadores','relatorios','configuracoes','perfil'], actions:['all'] }
  };

  const role = () => STATE.currentProfile || '';
  const rule = () => RULES[role()] || {views:['perfil'],actions:[]};
  const isAdmin = () => role() === 'COMERCIAL_ADM';
  const hasAction = a => isAdmin() || rule().actions.includes('all') || rule().actions.includes(a);
  const solById = id => DB.solicitacoes.find(s => s.id === id);

  function canSee(sol){
    if(!sol) return false;
    if(isAdmin() || role()==='COORD_FIN' || role()==='COORD_LOG' || role()==='OPERACOES') return true;
    if(role()==='ADM_UBS') return sol.unidade === STATE.currentUser?.unidade;
    if(role()==='RC') return sol.rcUsuarioId === STATE.currentUser?.id || sol.nomeRC === STATE.currentUser?.nome;
    return false;
  }

  function deny(msg='Você não possui permissão para executar esta ação.'){
    if(window.App?.toast) App.toast('Acesso restrito', msg, 'warn');
    return false;
  }

  const FIN_STATUSES = ['Aguardando Aprovação Financeira','Aguardando Crédito e Logística'];
  const LOG_QUOTE_STATUSES = ['Aguardando Crédito e Logística','Produção','Aguardando Frete'];
  const LOG_CONTRACT_STATUSES = ['Aguardando Frete','Produção'];
  const BILLING_STATUS = 'Frete contratado';

  if(window.Render){
    Render.visibleSolicitacoes = () => DB.solicitacoes.filter(canSee);

    const originalDetail = Render.detail;
    Render.detail = function(){
      const sol = solById(STATE.detailId);
      if(!canSee(sol)){
        deny('Você só pode visualizar as solicitações permitidas ao seu perfil e unidade.');
        return App.navigate('solicitacoes');
      }
      originalDetail.apply(Render, arguments);
      setTimeout(enhanceDetail, 0);
    };

    async function downloadAttachment(name){
      try{
        const sol = solById(STATE.detailId);
        if(!sol || !canSee(sol)) return deny('Você não possui acesso a esta solicitação.');
        const {data,error} = await supabaseClient.from('anexos_credito').select('storage_path').eq('solicitacao_id',sol.id).eq('nome_arquivo',name).limit(1).maybeSingle();
        if(error) throw error;
        if(!data?.storage_path) throw new Error('Caminho do anexo não encontrado.');
        const {data:urlData,error:urlError} = await supabaseClient.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(data.storage_path,300);
        if(urlError) throw urlError;
        if(!urlData?.signedUrl) throw new Error('Não foi possível gerar o link do anexo.');
        window.open(urlData.signedUrl,'_blank','noopener');
      }catch(err){ App.toast('Erro ao baixar anexo',err.message||'Tente novamente.','err'); }
    }

    function enhanceDetail(){
      const root=document.getElementById('view-detail');
      if(!root) return;
      if(role()==='OPERACOES') root.querySelectorAll('button').forEach(btn=>{ if((btn.textContent||'').includes('Marcar produção concluída')) btn.remove(); });
      if(role()==='ADM_UBS') root.querySelectorAll('button').forEach(btn=>{ if((btn.textContent||'').includes('Saldo disponível')) btn.textContent='Liberar produção'; if((btn.textContent||'').includes('Sem saldo')) btn.textContent='Sem saldo / informar prazo'; });
      if(hasAction('finance')) root.querySelectorAll('.upload-tag').forEach(tag=>{
        if(tag.dataset.downloadBound==='1') return;
        const name=tag.textContent.trim(); if(!name) return;
        tag.dataset.downloadBound='1'; tag.style.cursor='pointer'; tag.title='Baixar anexo';
        tag.onclick=e=>{e.preventDefault();e.stopPropagation();downloadAttachment(name);};
      });
    }
  }

  if(window.App){
    App.buildSidebar=function(){
      const nav=document.getElementById('sideNav');
      const items=[{id:'dashboard',label:'Dashboard',icon:'grid'},{id:'solicitacoes',label:'Solicitações',icon:'list'},{id:'nova',label:'Nova Solicitação',icon:'plus'},{id:'cadastros',label:'Cadastros',icon:'folder'},{id:'indicadores',label:'Indicadores',icon:'barChart'},{id:'relatorios',label:'Relatórios',icon:'fileText'},{id:'configuracoes',label:'Configurações',icon:'settings'},{id:'perfil',label:'Meu Perfil',icon:'user'}];
      nav.innerHTML='<div class="nav-label">Menu</div>'+items.filter(i=>rule().views.includes(i.id)).map(i=>`<div class="nav-item" data-view="${i.id}" onclick="App.navigate('${i.id}')"><span class="nic">${Ic(i.icon,16)}</span><span>${i.label}</span></div>`).join('');
      document.getElementById('sideAvatar').textContent=U.initials(STATE.currentUser?.nome);
      document.getElementById('sideUserName').textContent=STATE.currentUser?.nome||'—';
      document.getElementById('sideUserRole').textContent=U.perfilNome(role());
      const top=document.getElementById('btnNovaTopbar'); if(top) top.style.display=(role()==='RC'||isAdmin())?'flex':'none';
    };

    const originalNavigate=App.navigate;
    App.navigate=function(view,params){
      if(view==='detail'){
        const sol=solById(params?.id);
        if(!canSee(sol)){ deny('Esta solicitação não está disponível para o seu perfil.'); return; }
      }else if(!rule().views.includes(view)){ deny('Seu perfil não possui acesso a esta área.'); return; }
      return originalNavigate.call(App,view,params);
    };
  }

  if(window.FLOW){
    FLOW.podeEditarEtapa=function(etapa){
      if(isAdmin()) return true;
      return (etapa==='financeiro'&&role()==='COORD_FIN') || (etapa==='logistica'&&role()==='COORD_LOG') || (etapa==='admUbs'&&role()==='ADM_UBS') || (etapa==='faturamento'&&role()==='OPERACOES');
    };
  }

  if(window.Render){
    const originalAdm=Render.admUbsAction;
    if(originalAdm) Render.admUbsAction=async function(id,disponivel){
      if(!hasAction('ubs')) return deny('Somente o ADM UBS da unidade da solicitação pode verificar saldo e liberar produção.');
      const sol=solById(id); if(!canSee(sol)) return deny();
      if(disponivel||role()!=='ADM_UBS') return originalAdm.apply(Render,arguments);
      Modal.open('Sem saldo disponível',`<div class="field"><label>Tempo estimado para produção *</label><input id="m_tempo_producao" placeholder="Ex.: 15 dias úteis"></div>`,[
        {label:'Cancelar',cls:'btn-ghost',onClick:()=>Modal.close()},
        {label:'Registrar',cls:'btn-danger',onClick:async()=>{
          const tempo=(document.getElementById('m_tempo_producao')?.value||'').trim();
          if(!tempo) return App.toast('Campo obrigatório','Informe o tempo estimado para produção.','err');
          try{
            await Data.definirSaldo(sol.id,false);
            const {error}=await supabaseClient.from('adm_ubs_avaliacoes').update({tempo_producao:tempo}).eq('solicitacao_id',sol.id);
            if(error) throw error;
            await Data.addTimeline(sol.id,'ADM UBS informou tempo de produção: '+tempo);
            Modal.close(); App.toast('Avaliação registrada','Sem saldo. Tempo estimado: '+tempo,'warn'); await Data.refreshSolicitacoesData(); Render.detail();
          }catch(err){ App.toast('Erro ao salvar',err.message||'Tente novamente.','err'); }
        }}
      ]);
    };

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
      if(sol.status!==BILLING_STATUS) return deny('O faturamento fica disponível após a contratação do frete.');
      return originalFat.apply(Render,arguments);
    };

    Render.concluirProducao=async function(){ return deny('A conclusão da produção não é uma ação do perfil Operações de Negócio.'); };

    const originalCancelar=Render.cancelarSolicitacao;
    if(originalCancelar) Render.cancelarSolicitacao=function(id){
      if(!isAdmin()) return deny('Somente o Comercial ADM pode editar qualquer etapa ou cancelar solicitações.');
      return originalCancelar.apply(Render,arguments);
    };
  }

  if(window.DB?.perfis){
    const perms={
      RC:['Criar solicitação','Visualizar próprias solicitações','Acompanhar timeline'],
      COORD_FIN:['Visualizar todas as solicitações','Aprovar / Recusar crédito','Acessar e baixar anexos financeiros'],
      COORD_LOG:['Visualizar todas as solicitações','Cotar frete','Contratar frete','Atualizar status de entrega'],
      ADM_UBS:['Visualizar solicitações da própria UBS','Verificar saldo','Informar tempo para produção quando necessário','Liberar produção'],
      OPERACOES:['Visualizar todas as solicitações','Emitir NF','Concluir faturamento após contratação do frete'],
      COMERCIAL_ADM:['Acesso total','Gerenciar cadastros','Editar qualquer etapa','Gerenciar usuários','Indicadores e configurações']
    };
    Object.entries(perms).forEach(([id,p])=>{ const x=DB.perfis.find(v=>v.id===id); if(x) x.permissoes=p; });
  }

  if(window.supabaseClient?.auth && window.App){
    supabaseClient.auth.onAuthStateChange((_event,session)=>{
      if(session && STATE.currentUser) setTimeout(()=>{
        App.buildSidebar();
        if(STATE.view==='solicitacoes'||STATE.view==='dashboard') Render.dispatch(STATE.view);
      },0);
    });
  }

  setTimeout(()=>{
    if(STATE.currentUser && window.App){
      App.buildSidebar();
      if(STATE.view==='solicitacoes'||STATE.view==='dashboard') Render.dispatch(STATE.view);
    }
  },250);
})();