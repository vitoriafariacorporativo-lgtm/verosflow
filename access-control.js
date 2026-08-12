/* VerOS Flow — Controle de acesso e VISIBILIDADE v9
   Regra aprovada do fluxo:
   - RC: somente seus próprios pedidos.
   - ADM UBS: somente pedidos cuja UNIDADE DO PEDIDO seja igual à unidade do ADM UBS.
     Pode existir N ADM UBS para a mesma unidade; todos visualizam.
   - Financeiro: TODOS os pedidos, independentemente da unidade e do crédito.
   - Logística: TODOS os pedidos, independentemente da unidade e do status.
   - Operações de Negócio: TODOS os pedidos, independentemente da unidade e do status.
   - Comercial ADM: TODOS os pedidos.

   IMPORTANTE: visibilidade não libera ações. As ações continuam obedecendo ao
   fluxo aprovado: produção/contratação/faturamento permanecem bloqueados até
   seus respectivos pré-requisitos.
 */
(function(){
  'use strict';

  function norm(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[\s-]+/g,'_');
  }

  function profile(){
    return norm(window.STATE?.currentProfile || window.STATE?.currentUser?.perfil || '');
  }

  function user(){ return window.STATE?.currentUser || {}; }

  function isRC(){
    return ['RC','SOLICITANTE','REQUISITANTE','SOLICITANTE_RC'].includes(profile());
  }

  function isAdmUbs(){
    return ['ADM_UBS','ADMINISTRADOR_UBS','ADMINISTRADOR_DA_UBS'].includes(profile());
  }

  // Não usar unidade para esses perfis.
  // Aceita as nomenclaturas usadas no cadastro atual do VerOS Flow.
  function isFinanceiro(){
    const p = profile();
    return p === 'COORD_FIN' || p === 'COORDENADOR_FINANCEIRO' ||
           p.includes('FINANCEIRO') || p.includes('COORD_FIN');
  }

  function isLogistica(){
    const p = profile();
    return p === 'COORD_LOG' || p === 'COORDENADOR_LOGISTICA' ||
           p.includes('LOGISTICA') || p.includes('COORD_LOG');
  }

  function isOperacoes(){
    const p = profile();
    return p === 'OPERACOES' || p === 'OPERACOES_DE_NEGOCIO' ||
           p === 'OPERACOES_NEGOCIO' || p.includes('OPERACOES') ||
           p.includes('OPERACAO') || p.includes('NEGOCIO');
  }

  function isComercialAdm(){
    return profile().includes('COMERCIAL_ADM') || profile().includes('COMERCIAL') && profile().includes('ADM');
  }

  function isGlobal(){
    return isFinanceiro() || isLogistica() || isOperacoes() || isComercialAdm();
  }

  function allRequests(){
    return Array.isArray(window.DB?.solicitacoes) ? window.DB.solicitacoes.slice() : [];
  }

  function same(a,b){
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  }

  function visibleSolicitacoes(){
    const all = allRequests();
    const p = profile();
    const u = user();

    // 1. ÁREAS GLOBAIS: todos os pedidos desde a criação.
    // A etapa/status NÃO pode esconder o pedido. Somente as ações são bloqueadas.
    if(isGlobal()) return all;

    // 2. RC: somente seus próprios pedidos.
    if(isRC()){
      const uid = String(u.id || '').toLowerCase();
      const nome = norm(u.nome);
      return all.filter(sol => {
        const sid = String(sol.id_solicitante || '').toLowerCase();
        return sid === uid || norm(sol.nome_solicitante) === nome;
      });
    }

    // 3. ADM UBS: usa SOMENTE a unidade informada no pedido.
    // A unidade cadastrada do RC jamais participa desta decisão.
    if(isAdmUbs()){
      const unidadeAdm = u.unidade ?? u.unidade_id;
      if(!unidadeAdm) return [];
      return all.filter(sol => same(sol.unidade_pedido, unidadeAdm));
    }

    return [];
  }

  function install(){
    if(!window.Render || typeof window.Render.visibleSolicitacoes !== 'function') return false;

    // Esta é a função realmente consumida por Dashboard e Solicitações.
    window.Render.visibleSolicitacoes = visibleSolicitacoes;

    window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
    window.VEROS_FLOW_RULES.version = '9.0';
    window.VEROS_FLOW_RULES.roles = profile;
    window.VEROS_FLOW_RULES.canSee = sol => visibleSolicitacoes().some(x => x.id === sol?.id);
    window.VEROS_FLOW_RULES.visible = visibleSolicitacoes;

    console.info('[VerOS Flow] controle de acesso v9 instalado:', {
      perfil: profile(),
      totalPedidos: all.length,
      pedidosVisiveis: visibleSolicitacoes().length,
      regra: isFinanceiro() ? 'FINANCEIRO — TODOS OS PEDIDOS' :
             isLogistica() ? 'LOGÍSTICA — TODOS OS PEDIDOS' :
             isOperacoes() ? 'OPERAÇÕES — TODOS OS PEDIDOS' :
             isComercialAdm() ? 'COMERCIAL ADM — TODOS OS PEDIDOS' :
             isAdmUbs() ? 'ADM UBS — PEDIDOS DA UNIDADE' :
             isRC() ? 'RC — PEDIDOS PRÓPRIOS' : 'DESCONHECIDO'
    });
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    install();
    if(attempts >= 200) clearInterval(timer);
  }, 100);

  // Também tenta após o carregamento inicial, caso Render seja definido depois.
  window.addEventListener('load', install);
})();
