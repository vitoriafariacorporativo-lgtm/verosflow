/* VerOS Flow — Controle de acesso e visibilidade v8 */
(function(){
  'use strict';

  const norm = v => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const profile = () => norm(window.STATE?.currentProfile || window.STATE?.currentUser?.perfil || '').replace(/[\s-]+/g,'_');
  const user = () => window.STATE?.currentUser || {};

  function isRC(){
    const p = profile();
    return ['RC','SOLICITANTE','REQUISITANTE','SOLICITANTE_RC'].includes(p);
  }

  function isAdmUbs(){
    const p = profile();
    return ['ADM_UBS','ADM_UBS_','ADM UBS','ADMINISTRADOR_UBS','ADMINISTRADOR_DA_UBS'].includes(p);
  }

  // Financeiro, Logística e Operações são áreas globais:
  // NÃO existe filtro por unidade para esses perfis.
  function isGlobal(){
    const p = profile();
    return p.includes('FINANCEIRO') ||
           p === 'COORD_FIN' ||
           p.includes('LOGISTICA') ||
           p === 'COORD_LOG' ||
           p.includes('OPERACOES') ||
           p.includes('OPERACOES_NEGOCIO') ||
           p === 'COMERCIAL_ADM' ||
           p === 'ADMINISTRADOR';
  }

  function allRequests(){
    return Array.isArray(window.DB?.solicitacoes) ? window.DB.solicitacoes.slice() : [];
  }

  function visibleSolicitacoes(){
    const all = allRequests();
    const p = profile();
    const u = user();

    // REGRA 1 — ÁREAS GLOBAIS: TODOS OS PEDIDOS, SEM FILTRO DE UNIDADE.
    if(isGlobal()) return all;

    // REGRA 2 — RC: somente pedidos criados pelo próprio RC.
    if(isRC()){
      const uid = String(u.id || '').toLowerCase();
      const nome = norm(u.nome);
      return all.filter(sol =>
        (uid && String(sol.rcUsuarioId || sol.rc_usuario_id || '').toLowerCase() === uid) ||
        (nome && norm(sol.nomeRC || sol.nome_rc) === nome)
      );
    }

    // REGRA 3 — ADM UBS: unidade do PEDIDO, nunca a unidade do RC.
    if(isAdmUbs()){
      const unidadeAdm = String(u.unidade || u.unidade_id || '').trim().toLowerCase();
      if(!unidadeAdm) return [];
      return all.filter(sol => String(sol.unidade || sol.unidade_id || '').trim().toLowerCase() === unidadeAdm);
    }

    return [];
  }

  function install(){
    if(!window.Render || typeof window.Render.visibleSolicitacoes !== 'function') return false;

    // Sobrescreve a função REALMENTE usada pelo index.html.
    window.Render.visibleSolicitacoes = visibleSolicitacoes;

    window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
    window.VEROS_FLOW_RULES.version = '8.0';
    window.VEROS_FLOW_RULES.roles = profile;
    window.VEROS_FLOW_RULES.canSee = canSee;
    window.VEROS_FLOW_RULES.visible = visibleSolicitacoes;

    console.info('[VerOS Flow] controle de acesso v8 instalado:', {
      perfil: profile(),
      totalPedidos: allRequests().length,
      pedidosVisiveis: visibleSolicitacoes().length,
      regra: isGlobal() ? 'GLOBAL — TODOS OS PEDIDOS' : isAdmUbs() ? 'ADM UBS — UNIDADE DO PEDIDO' : isRC() ? 'RC — PRÓPRIOS PEDIDOS' : 'SEM ACESSO'
    });
    return true;
  }

  function canSee(sol){
    if(!sol) return false;
    return visibleSolicitacoes().some(x => x.id === sol.id);
  }

  // O index.html define Render depois de alguns scripts. Por isso não dependemos
  // da ordem dos <script>: instalamos assim que Render existir e reaplicamos após
  // navegações que possam redefinir a função.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    install();
    if(attempts >= 100) clearInterval(timer);
  }, 100);

  window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
  window.VEROS_FLOW_RULES.canSee = canSee;
  window.VEROS_FLOW_RULES.visible = visibleSolicitacoes;

  console.info('[VerOS Flow] controle de acesso v8 carregado. Aguardando Render.');
})();
