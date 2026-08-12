/* VerOS Flow — Controle de acesso e VISIBILIDADE v10
   REGRA APROVADA DO FLUXO
   - RC: somente seus próprios pedidos.
   - ADM UBS: pedidos cuja UNIDADE DO PEDIDO seja igual à unidade do ADM UBS.
     Pode existir mais de um ADM UBS para a mesma unidade; todos visualizam.
   - Financeiro: TODOS os pedidos, independentemente da unidade, crédito ou status.
   - Logística: TODOS os pedidos, independentemente da unidade ou status.
   - Operações de Negócio: TODOS os pedidos, independentemente da unidade ou status.
   - Comercial ADM: TODOS os pedidos.

   IMPORTANTE: visibilidade não libera ação. As ações continuam obedecendo
   ao fluxo aprovado e aos pré-requisitos de cada etapa.
*/
(function(){
  'use strict';

  const norm = v => String(v ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[\s-]+/g,'_');

  const field = (obj,...keys) => {
    for(const k of keys){
      const v = obj?.[k];
      if(v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return null;
  };

  function role(){
    const raw = norm(
      STATE?.currentUser?.perfil ||
      STATE?.currentUser?.role ||
      STATE?.currentProfile || ''
    );
    const map = {
      RC:'RC', SOLICITANTE:'RC', REQUISITANTE:'RC',
      ADM_UBS:'ADM_UBS', ADM_UBS_:'ADM_UBS', ADMINISTRADOR_UBS:'ADM_UBS', ADMINISTRADOR_DA_UBS:'ADM_UBS',
      COORD_FIN:'COORD_FIN', COORDENADOR_FINANCEIRO:'COORD_FIN', COORDENADOR_FINANCEIRO_ADM:'COORD_FIN',
      COORD_LOG:'COORD_LOG', COORDENADOR_LOGISTICA:'COORD_LOG', COORDENADOR_LOGISTICA_ADM:'COORD_LOG',
      OPERACOES:'OPERACOES', OPERACOES_DE_NEGOCIO:'OPERACOES', OPERACOES_NEGOCIO:'OPERACOES',
      COMERCIAL_ADM:'COMERCIAL_ADM', ADMINISTRADOR:'COMERCIAL_ADM'
    };
    return map[raw] || raw;
  }

  function currentUser(){
    const u = STATE?.currentUser || {};
    if(Array.isArray(DB?.usuarios)){
      const uid = field(u,'id','user_id');
      const email = field(u,'email');
      const found = DB.usuarios.find(x =>
        (uid && norm(field(x,'id','user_id')) === norm(uid)) ||
        (email && norm(x.email) === norm(email))
      );
      if(found) return {...u,...found};
    }
    return u;
  }

  function unitMatches(sol,user){
    const pedido = field(sol,'unidade','unidade_id','unidadeId');
    const unidadeUser = field(user,'unidade','unidade_id','unidadeId');
    return !!pedido && !!unidadeUser && norm(pedido) === norm(unidadeUser);
  }

  function own(sol){
    const u = currentUser();
    const uid = field(u,'id','user_id');
    if(!uid) return false;
    return norm(field(sol,'rcUsuarioId','rc_usuario_id')) === norm(uid) ||
           norm(field(sol,'criadoPor','criado_por')) === norm(uid) ||
           norm(field(sol,'nomeRC','nome_rc')) === norm(u.nome);
  }

  function canSee(sol){
    const r = role();
    const u = currentUser();
    if(!sol) return false;
    if(r === 'COMERCIAL_ADM') return true;
    if(r === 'RC') return own(sol);
    if(r === 'ADM_UBS') return unitMatches(sol,u);
    if(r === 'COORD_FIN' || r === 'COORD_LOG' || r === 'OPERACOES') return true;
    return false;
  }

  function visible(){
    return Array.isArray(DB?.solicitacoes) ? DB.solicitacoes.filter(canSee) : [];
  }

  function loadFinalEnhancements(){
    if(window.__vfFinalEnhancementsLoaded) return;
    window.__vfFinalEnhancementsLoaded = true;
    const s=document.createElement('script');
    s.src='final-enhancements.js?v=1.0';
    s.async=false;
    s.onload=()=>{
      console.info('[VerOS Flow] melhorias finais v1 carregadas');
      loadKanbanScreenFix();
    };
    s.onerror=e=>console.error('[VerOS Flow] erro ao carregar melhorias finais:',e);
    document.head.appendChild(s);
  }

  function loadKanbanScreenFix(){
    if(window.__vfKanbanScreenFixLoaded) return;
    window.__vfKanbanScreenFixLoaded = true;
    const s=document.createElement('script');
    s.src='kanban-screen-fix.js?v=20260812';
    s.async=false;
    s.onload=()=>console.info('[VerOS Flow] correção de rolagem do Kanban carregada');
    s.onerror=e=>console.error('[VerOS Flow] erro ao carregar correção do Kanban:',e);
    document.head.appendChild(s);
  }

  function install(){
    if(typeof STATE === 'undefined' || typeof DB === 'undefined' || typeof Render === 'undefined') return false;
    if(typeof Render.visibleSolicitacoes !== 'function') return false;

    window.VerOSRequestVisibility = {version:'10.0', role, canSee, visible, unitMatches, currentUser};
    window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
    window.VEROS_FLOW_RULES.version = '10.0';
    window.VEROS_FLOW_RULES.canSee = canSee;
    window.VEROS_FLOW_RULES.roles = role;
    window.VEROS_FLOW_RULES.visible = visible;

    Render.visibleSolicitacoes = function(){
      const all = Array.isArray(DB.solicitacoes) ? DB.solicitacoes : [];
      const result = visible();
      console.info('[VerOS Flow] visibleSolicitacoes', {
        perfil: role(), totalPedidos: all.length, pedidosVisiveis: result.length,
        regra: role()==='COORD_FIN' ? 'FINANCEIRO — TODOS OS PEDIDOS' :
               role()==='COORD_LOG' ? 'LOGÍSTICA — TODOS OS PEDIDOS' :
               role()==='OPERACOES' ? 'OPERAÇÕES — TODOS OS PEDIDOS' :
               role()==='ADM_UBS' ? 'ADM UBS — UNIDADE DO PEDIDO' :
               role()==='RC' ? 'RC — PRÓPRIOS' :
               role()==='COMERCIAL_ADM' ? 'COMERCIAL ADM — TODOS' : 'SEM REGRA'
      });
      return result;
    };

    loadFinalEnhancements();
    console.info('[VerOS Flow] controle de acesso v10 instalado:', {
      perfil: STATE.currentUser?.email || STATE.currentUser?.nome || '',
      usuario: STATE.currentUser?.email || STATE.currentUser?.nome || '',
      totalPedidos: DB.solicitacoes?.length || 0, pedidosVisiveis: visible().length
    });
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { attempts++; if(install() || attempts >= 200) clearInterval(timer); },100);
  window.addEventListener('load', install);
})();
