/* VerOS Flow — Controle de acesso e visibilidade v7 */
(function(){
  'use strict';

  const norm = v => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const profile = () => norm(STATE?.currentProfile || STATE?.currentUser?.perfil || '').replace(/[\s-]+/g,'_');
  const user = () => STATE?.currentUser || {};

  function isRC(){
    return ['RC','SOLICITANTE','REQUISITANTE'].includes(profile());
  }
  function isAdmUbs(){
    return ['ADM_UBS','ADM UBS','ADMINISTRADOR UBS','ADMINISTRADOR DA UBS'].includes(profile());
  }
  function isGlobal(){
    return ['COORD_FIN','COORDENADOR_FINANCEIRO','COORD_LOG','COORDENADOR_LOGISTICA','OPERACOES','OPERACOES_DE_NEGOCIO','COMERCIAL_ADM','ADMINISTRADOR'].includes(profile());
  }

  // REGRA OFICIAL DE VISIBILIDADE
  // RC: somente seus próprios pedidos.
  // ADM UBS: somente pedidos cuja unidade DO PEDIDO seja igual à unidade do ADM.
  // Financeiro, Logística, Operações e Comercial ADM: TODOS os pedidos.
  function visibleSolicitacoes(){
    const all = Array.isArray(DB?.solicitacoes) ? DB.solicitacoes.slice() : [];
    const p = profile();
    const u = user();

    if(['COORD_FIN','COORDENADOR_FINANCEIRO','COORD_LOG','COORDENADOR_LOGISTICA','OPERACOES','OPERACOES_DE_NEGOCIO','COMERCIAL_ADM','ADMINISTRADOR'].includes(p)){
      return all;
    }

    if(isRC()){
      const uid = String(u.id || '').toLowerCase();
      const nome = norm(u.nome);
      return all.filter(sol =>
        (uid && String(sol.rcUsuarioId || sol.rc_usuario_id || '').toLowerCase() === uid) ||
        norm(sol.nomeRC || sol.nome_rc) === nome
      );
    }

    if(isAdmUbs()){
      const unidadeAdm = String(u.unidade || u.unidade_id || '').trim().toLowerCase();
      return all.filter(sol => String(sol.unidade || sol.unidade_id || '').trim().toLowerCase() === unidadeAdm);
    }

    return [];
  }

  function canSee(sol){
    if(!sol) return false;
    return visibleSolicitacoes().some(x => x.id === sol.id);
  }

  // Sobrescreve a FUNÇÃO QUE A PRÓPRIA index.html USA.
  // Este é o ponto crítico: alterar apenas Render.solicitacoes() não bastava,
  // porque dashboard, exportação e outras telas chamam visibleSolicitacoes().
  if(window.Render){
    Render.visibleSolicitacoes = visibleSolicitacoes;
  }

  window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
  window.VEROS_FLOW_RULES.version = '7.0';
  window.VEROS_FLOW_RULES.roles = profile;
  window.VEROS_FLOW_RULES.canSee = canSee;
  window.VEROS_FLOW_RULES.visible = visibleSolicitacoes;

  window.VerOSRequestVisibility = {
    version:'7.0',
    role:profile,
    canSee,
    visible:visibleSolicitacoes
  };

  console.info('[VerOS Flow] controle de acesso v7 carregado:', {
    perfil: profile(),
    totalPedidos: Array.isArray(DB?.solicitacoes) ? DB.solicitacoes.length : 0,
    pedidosVisiveis: visibleSolicitacoes().length
  });
})();
