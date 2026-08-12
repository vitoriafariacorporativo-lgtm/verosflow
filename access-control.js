/* VerOS Flow — Controle de acesso e fluxo operacional v6 */
(function(){
  'use strict';

  const norm = v => String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const rawRole = () => norm(STATE?.currentUser?.perfil || STATE?.currentUser?.role || STATE?.currentProfile || '');
  const ROLE = () => {
    const r=rawRole();
    const map={
      'RC':'RC','SOLICITANTE':'RC','REQUISITANTE':'RC',
      'ADM_UBS':'ADM_UBS','ADM UBS':'ADM_UBS','ADMINISTRADOR UBS':'ADM_UBS','ADMINISTRADOR DA UBS':'ADM_UBS',
      'COORD_FIN':'COORD_FIN','COORDENADOR FINANCEIRO':'COORD_FIN','COORDENADOR FINANCEIRO ADM':'COORD_FIN',
      'COORD_LOG':'COORD_LOG','COORDENADOR LOGISTICA':'COORD_LOG','COORDENADOR LOGISTICA ADM':'COORD_LOG',
      'OPERACOES':'OPERACOES','OPERACOES DE NEGOCIO':'OPERACOES','OPERACOES NEGOCIO':'OPERACOES',
      'COMERCIAL_ADM':'COMERCIAL_ADM','COMERCIAL ADM':'COMERCIAL_ADM','ADMINISTRADOR':'COMERCIAL_ADM'
    };
    return map[r] || r.replace(/[\s-]+/g,'_');
  };
  const ADMIN=()=>ROLE()==='COMERCIAL_ADM';
  const field=(obj,...keys)=>{for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return null;};

  const currentUser=()=>{
    const u=STATE?.currentUser||{};
    if(field(u,'unidade_id','unidadeId','unidade') || !Array.isArray(DB?.usuarios)) return u;
    const uid=field(u,'id','user_id'), email=field(u,'email');
    return DB.usuarios.find(x=>norm(field(x,'id','user_id'))===norm(uid) || (email && norm(x.email)===norm(email))) || u;
  };

  // Para ADM UBS, a única unidade considerada é a UNIDADE DO PEDIDO.
  const sameUnit=(sol,user)=>{
    const pedido=field(sol,'unidade_id','unidadeId','unidade');
    const usuario=field(user,'unidade_id','unidadeId','unidade');
    return !!pedido && !!usuario && norm(pedido)===norm(usuario);
  };

  const canSee=sol=>{
    if(!sol || !STATE?.currentUser) return false;
    const r=ROLE(), u=currentUser();
    if(ADMIN()) return true;
    if(r==='RC'){
      const uid=field(u,'id','user_id');
      return norm(field(sol,'rcUsuarioId','rc_usuario_id'))===norm(uid) || norm(field(sol,'nomeRC','nome_rc'))===norm(u.nome);
    }
    if(r==='ADM_UBS') return sameUnit(sol,u);
    // Regra definitiva: estes perfis visualizam TODOS os pedidos,
    // sem filtro por unidade, RC ou status.
    if(r==='COORD_FIN' || r==='COORD_LOG' || r==='OPERACOES') return true;
    return false;
  };

  const visible=()=>Array.isArray(DB?.solicitacoes) ? DB.solicitacoes.filter(canSee) : [];

  window.VEROS_FLOW_RULES=window.VEROS_FLOW_RULES||{};
  window.VEROS_FLOW_RULES.version='6.0';
  window.VEROS_FLOW_RULES.roles=ROLE;
  window.VEROS_FLOW_RULES.canSee=canSee;
  window.VEROS_FLOW_RULES.sameUnit=sameUnit;
  window.VerOSRequestVisibility={version:'6.0',role:ROLE,canSee,visible,sameUnit,currentUser};

  if(window.Render){
    Render.visibleSolicitacoes=visible;
    if(!Render.__globalVisibilityPatched){
      const original=Render.solicitacoes?.bind(Render);
      if(original){
        Render.solicitacoes=function(){
          const all=DB.solicitacoes;
          const filtered=visible();
          // O renderer original trabalha sobre DB.solicitacoes; para Financeiro,
          // Logística e Operações isso garante que a lista contenha TODOS os pedidos.
          DB.solicitacoes=filtered;
          try{return original();}
          finally{DB.solicitacoes=all;}
        };
      }
      Render.__globalVisibilityPatched=true;
    }
  }

  console.info('[VerOS Flow] controle de acesso v6 carregado — Financeiro/Logística/Operações veem todos os pedidos. Perfil:',ROLE());
})();
