/* VerOS Flow — Controle de acesso e VISIBILIDADE v11 (processo sem e-mail)
   REGRA APROVADA DO FLUXO
   - RC: somente seus próprios pedidos.
   - UBS (ADM_UBS): pedidos cuja UNIDADE DO PEDIDO seja igual à unidade da UBS.
     Pode existir mais de um usuário UBS para a mesma unidade; todos visualizam.
   O escopo do sistema começa no pedido JÁ EMITIDO no Mobi — cadastro do cliente
   e validações fiscais acontecem lá, não aqui.
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
      UBS:'ADM_UBS', UNIDADE_DE_BENEFICIAMENTO:'ADM_UBS',
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
    s.src='final-enhancements.js?v=1.7';
    s.async=false;
    s.onload=()=>{
      console.info('[VerOS Flow] melhorias finais v1.7 carregadas');
      loadKanbanScreenFix();
    };
    // final-enhancements.js é opcional e pode não existir no repositório.
    // Sem ele, seguimos direto para a correção de rolagem do Kanban em vez de
    // deixar um 404 barulhento no console.
    s.onerror=()=>{ console.info('[VerOS Flow] melhorias finais não encontradas — seguindo sem elas'); loadKanbanScreenFix(); };
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

  function installUserNameDisplay(){
    if(window.__vfUserNameDisplayInstalled) return;
    window.__vfUserNameDisplayInstalled = true;
    const uuidRe=/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
    const escRe=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const buildMap=()=>{
      const map=new Map();
      const add=(id,name)=>{id=String(id||'').trim();name=String(name||'').trim();if(id&&name&&uuidRe.test(id)){uuidRe.lastIndex=0;map.set(id.toLowerCase(),name);}uuidRe.lastIndex=0;};
      if(Array.isArray(DB?.usuarios))for(const u of DB.usuarios)add(field(u,'id','user_id','usuario_id'),field(u,'nome','nome_usuario','name'));
      if(Array.isArray(DB?.solicitacoes))for(const s of DB.solicitacoes){const name=field(s,'nome_rc','nomeRC');add(field(s,'rc_usuario_id','rcUsuarioId'),name);add(field(s,'criado_por','criadoPor'),name);}
      const cu=currentUser();add(field(cu,'id','user_id'),field(cu,'nome','name'));return map;
    };
    const replaceVisibleUserIds=()=>{if(!document.body)return;const map=buildMap();if(!map.size)return;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];let node;while(node=walker.nextNode())nodes.push(node);for(const textNode of nodes){let text=textNode.nodeValue||'';if(!uuidRe.test(text)){uuidRe.lastIndex=0;continue;}uuidRe.lastIndex=0;let changed=false;for(const [id,name] of map){const re=new RegExp(escRe(id),'gi');if(re.test(text)){text=text.replace(re,name);changed=true;}}if(changed)textNode.nodeValue=text;}};
    let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(replaceVisibleUserIds,60);};
    const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('load',schedule);window.addEventListener('verosflow:render',schedule);window.addEventListener('popstate',schedule);window.VerOSUserName=key=>buildMap().get(String(key||'').toLowerCase())||null;schedule();
  }

  function install(){
    if(typeof STATE === 'undefined' || typeof DB === 'undefined' || typeof Render === 'undefined') return false;
    if(typeof Render.visibleSolicitacoes !== 'function') return false;
    window.VerOSRequestVisibility = {version:'11.0', role, canSee, visible, unitMatches, currentUser};
    window.VEROS_FLOW_RULES = window.VEROS_FLOW_RULES || {};
    window.VEROS_FLOW_RULES.version = '11.0';
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
               role()==='ADM_UBS' ? 'UBS — UNIDADE DO PEDIDO' :
               role()==='RC' ? 'RC — PRÓPRIOS' :
               role()==='COMERCIAL_ADM' ? 'COMERCIAL ADM — TODOS' : 'SEM REGRA'
      });
      return result;
    };
    installUserNameDisplay();
    loadFinalEnhancements();
    console.info('[VerOS Flow] controle de acesso v11 instalado:', {
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
