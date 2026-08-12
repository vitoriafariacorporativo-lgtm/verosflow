/* VerOS Flow — Controle de acesso e VISIBILIDADE v10
   REGRA APROVADA DO FLUXO

   - RC: somente seus próprios pedidos.
   - ADM UBS: somente pedidos cuja UNIDADE DO PEDIDO seja igual à unidade do ADM UBS.
     Pode existir N ADM UBS para a mesma unidade; todos visualizam.
   - Financeiro: TODOS os pedidos, independentemente da unidade, crédito ou status.
   - Logística: TODOS os pedidos, independentemente da unidade ou status.
   - Operações de Negócio: TODOS os pedidos, independentemente da unidade ou status.
   - Comercial ADM: TODOS os pedidos.

   IMPORTANTE:
   VISIBILIDADE NÃO LIBERA AÇÃO.
   As ações continuam obedecendo ao fluxo aprovado.

   CORREÇÃO V10:
   STATE, DB e Render são declarações globais `const` do index.html e, portanto,
   NÃO ficam disponíveis como window.STATE/window.DB/window.Render.
   As versões anteriores usavam window.* e nunca conseguiam instalar o filtro.
*/
(function(){
  'use strict';

  const norm = v => String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[\s-]+/g,'_');

  function getState(){
    try { return typeof STATE !== 'undefined' ? STATE : null; } catch(e) { return null; }
  }
  function getDB(){
    try { return typeof DB !== 'undefined' ? DB : null; } catch(e) { return null; }
  }
  function getRender(){
    try { return typeof Render !== 'undefined' ? Render : null; } catch(e) { return null; }
  }

  function profile(){
    const s = getState();
    const u = s?.currentUser || {};
    return norm(u.perfil || u.role || s?.currentProfile || '');
  }

  function user(){
    return getState()?.currentUser || {};
  }

  function isRC(){
    return ['RC','SOLICITANTE','REQUISITANTE','SOLICITANTE_RC'].includes(profile());
  }

  function isAdmUbs(){
    return ['ADM_UBS','ADMINISTRADOR_UBS','ADMINISTRADOR_DA_UBS'].includes(profile());
  }

  function isFinanceiro(){
    const p = profile();
    return p === 'COORD_FIN' || p === 'COORDENADOR_FINANCEIRO' ||
           p.includes('FINANCEIRO');
  }

  function isLogistica(){
    const p = profile();
    return p === 'COORD_LOG' || p === 'COORDENADOR_LOGISTICA' ||
           p.includes('LOGISTICA');
  }

  function isOperacoes(){
    const p = profile();
    return p === 'OPERACOES' || p === 'OPERACOES_DE_NEGOCIO' ||
           p === 'OPERACOES_NEGOCIO' || p.includes('OPERACOES') ||
           p.includes('OPERACAO');
  }

  function isComercialAdm(){
    const p = profile();
    return p === 'COMERCIAL_ADM' || p === 'COMERCIAL_ADMIN' || p === 'ADMINISTRADOR';
  }

  function isGlobal(){
    return isFinanceiro() || isLogistica() || isOperacoes() || isComercialAdm();
  }

  function allRequests(){
    const db = getDB();
    return Array.isArray(db?.solicitacoes) ? db.solicitacoes.slice() : [];
  }

  function same(a,b){
    return norm(a) === norm(b);
  }

  function visibleSolicitacoes(){
    const all = allRequests();
    const p = profile();
    const u = user();

    // Áreas globais: o pedido aparece desde sua criação.
    // Crédito/status NÃO remove o pedido da lista; somente controla ações.
    if(isGlobal()) return all;

    // RC: somente pedidos próprios.
    if(isRC()){
      const uid = String(u.id || '').toLowerCase();
      const nome = norm(u.nome);
      return all.filter(sol => {
        const solUid = String(sol.rcUsuarioId ?? sol.rc_usuario_id ?? '').toLowerCase();
        const solNome = norm(sol.nomeRC ?? sol.nome_rc);
        return (uid && solUid === uid) || (nome && solNome === nome);
      });
    }

    // ADM UBS: somente a unidade selecionada NO PEDIDO.
    // A unidade cadastrada no RC não participa desta decisão.
    if(isAdmUbs()){
      const unidadeAdm = u.unidade ?? u.unidade_id;
      if(!unidadeAdm) return [];
      return all.filter(sol => same(sol.unidade ?? sol.unidade_id, unidadeAdm));
    }

    return [];
  }

  function install(){
    const render = getRender();
    if(!render || typeof render.visibleSolicitacoes !== 'function') return false;

    // Esta é a função realmente usada pelo index.html em Dashboard e Solicitações.
    render.visibleSolicitacoes = visibleSolicitacoes;

    // Expor somente o serviço de regras; não dependemos de window.STATE/DB/Render.
    window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
    window.VEROS_FLOW_RULES.version = '10.0';
    window.VEROS_FLOW_RULES.roles = profile;
    window.VEROS_FLOW_RULES.canSee = sol => visibleSolicitacoes().some(x => x.id === sol?.id);
    window.VEROS_FLOW_RULES.visible = visibleSolicitacoes;

    const all = allRequests();
    const visible = visibleSolicitacoes();
    console.info('[VerOS Flow] controle de acesso v10 instalado:', {
      perfil: profile(),
      totalPedidos: all.length,
      pedidosVisiveis: visible.length,
      regra: isFinanceiro() ? 'FINANCEIRO — TODOS OS PEDIDOS' :
             isLogistica() ? 'LOGÍSTICA — TODOS OS PEDIDOS' :
             isOperacoes() ? 'OPERAÇÕES — TODOS OS PEDIDOS' :
             isComercialAdm() ? 'COMERCIAL ADM — TODOS OS PEDIDOS' :
             isAdmUbs() ? 'ADM UBS — UNIDADE DO PEDIDO' :
             isRC() ? 'RC — PRÓPRIOS PEDIDOS' : 'SEM ACESSO'
    });
    return true;
  }

  // O arquivo é carregado depois que Render é declarado no index.html.
  // Mesmo assim, aguardamos caso a inicialização esteja ocorrendo no mesmo tick.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if(install()){
      clearInterval(timer);
      try {
        const s = getState();
        if(s?.view === 'solicitacoes' && getRender()) getRender().solicitacoes();
      } catch(e) { console.warn('[VerOS Flow] Não foi possível redesenhar solicitações:', e); }
    } else if(attempts >= 200){
      clearInterval(timer);
      console.warn('[VerOS Flow] Controle de acesso v10 não conseguiu instalar.');
    }
  }, 100);

  window.addEventListener('load', () => {
    install();
  });
})();
