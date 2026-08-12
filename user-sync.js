(function(){
  function install(){
    if(typeof Data==='undefined' || typeof Render==='undefined') return false;

    if(typeof Data.loadCadastros==='function' && !Data.__usersLoadWrapped){
      const loadCadastros=Data.loadCadastros.bind(Data);
      Data.loadCadastros=async function(){ await loadCadastros(); await Data.loadUsuarios(); };
      Data.__usersLoadWrapped=true;
    }

    Data.saveUsuarioPerfil=async function(id,data){
      if(typeof supabase==='undefined'||!supabase) throw new Error('Supabase não configurado.');
      const {data:result,error}=await supabase.functions.invoke('manage-user-v3',{body:{action:id?'update':'create',user_id:id||null,data:{nome:data.nome,email:data.email,perfil:data.perfil,unidade:data.unidade||null,telefone:data.telefone||null,status:data.status||'Ativo',senha:data.senha||''}}});
      if(error) throw new Error(error.message||'Falha ao chamar o serviço de usuários.');
      if(result&&result.error) throw new Error(result.error);
      await Data.loadUsuarios(); return result;
    };

    const norm=v=>String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const field=(obj,...keys)=>{for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return null;};
    const role=()=>{
      const raw=norm(STATE?.currentUser?.perfil||STATE?.currentUser?.role||STATE?.currentProfile||'');
      const map={RC:'RC',SOLICITANTE:'RC',REQUISITANTE:'RC',ADM_UBS:'ADM_UBS','ADM UBS':'ADM_UBS','ADMINISTRADOR UBS':'ADM_UBS','ADMINISTRADOR DA UBS':'ADM_UBS',COORD_FIN:'COORD_FIN','COORDENADOR FINANCEIRO':'COORD_FIN','COORDENADOR FINANCEIRO ADM':'COORD_FIN',COORD_LOG:'COORD_LOG','COORDENADOR LOGISTICA':'COORD_LOG','COORDENADOR LOGISTICA ADM':'COORD_LOG',OPERACOES:'OPERACOES','OPERACOES DE NEGOCIO':'OPERACOES','OPERACOES NEGOCIO':'OPERACOES',COMERCIAL_ADM:'COMERCIAL_ADM','COMERCIAL ADM':'COMERCIAL_ADM',ADMINISTRADOR:'COMERCIAL_ADM'};
      return map[raw]||raw.replace(/[\s-]+/g,'_');
    };
    const currentUser=()=>{
      const u=STATE?.currentUser||{};
      if(Array.isArray(DB?.usuarios)){
        const uid=field(u,'id','user_id'), email=field(u,'email');
        const found=DB.usuarios.find(x=>(uid&&norm(field(x,'id','user_id'))===norm(uid))||(email&&norm(x.email)===norm(email)));
        if(found) return {...u,...found};
      }
      return u;
    };
    const unitMatches=(sol,user)=>{
      const pedido=field(sol,'unidade','unidade_id','unidadeId');
      const unidadeUser=field(user,'unidade','unidade_id','unidadeId');
      return !!pedido&&!!unidadeUser&&norm(pedido)===norm(unidadeUser);
    };
    const own=sol=>{
      const u=currentUser(),uid=field(u,'id','user_id');
      return !!uid&&(norm(field(sol,'rcUsuarioId','rc_usuario_id'))===norm(uid)||norm(field(sol,'criadoPor','criado_por'))===norm(uid)||norm(field(sol,'nomeRC','nome_rc'))===norm(u.nome));
    };
    const canSee=sol=>{
      const r=role(),u=currentUser(); if(!sol)return false;
      if(r==='COMERCIAL_ADM')return true;
      if(r==='RC')return own(sol);
      if(r==='ADM_UBS')return unitMatches(sol,u);
      if(r==='COORD_FIN'||r==='COORD_LOG'||r==='OPERACOES')return true;
      return false;
    };
    const visible=()=>Array.isArray(DB?.solicitacoes)?DB.solicitacoes.filter(canSee):[];

    window.VerOSRequestVisibility={version:'7.0',role,canSee,visible,unitMatches,currentUser};
    window.VEROS_FLOW_RULES=window.VEROS_FLOW_RULES||{};
    window.VEROS_FLOW_RULES.canSee=canSee;
    window.VEROS_FLOW_RULES.roles=role;

    Render.visibleSolicitacoes=function(){
      const r=role(), all=Array.isArray(DB?.solicitacoes)?DB.solicitacoes:[], result=visible();
      console.info('[VerOS Flow] visibleSolicitacoes', {perfil:r,total:all.length,visiveis:result.length});
      return result;
    };

    if(Render.solicitacoes&&!Render.__visibilityWrapped){
      const original=Render.solicitacoes.bind(Render);
      Render.solicitacoes=function(){return original();};
      Render.__visibilityWrapped=true;
    }

    if(typeof Data.loadSolicitacoes==='function'&&!Data.__requestLoadWrapped){
      const load=Data.loadSolicitacoes.bind(Data);
      Data.loadSolicitacoes=async function(){const result=await load();DB.__allSolicitacoes=Array.isArray(DB.solicitacoes)?DB.solicitacoes.slice():[];return result;};
      Data.__requestLoadWrapped=true;
    }

    // Exibe nomes dos usuários nos logs/timelines, nunca UUIDs de usuário.
    // Mantém os IDs técnicos no banco para rastreabilidade, mas a interface mostra o nome cadastrado.
    if(!window.__verosUserNameDisplay){
      window.__verosUserNameDisplay=true;
      const userNameById=id=>{
        const key=norm(id);
        if(!key||!Array.isArray(DB?.usuarios)) return null;
        const u=DB.usuarios.find(x=>norm(field(x,'id','user_id'))===key);
        return u?.nome||null;
      };
      window.VerOSUserName=userNameById;

      const replaceUserIdsInText=()=>{
        if(!Array.isArray(DB?.usuarios)||!document.body)return;
        const ids=DB.usuarios.map(u=>({id:String(field(u,'id','user_id')||''),nome:String(u.nome||'').trim()})).filter(x=>x.id&&x.nome);
        if(!ids.length)return;
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        const nodes=[]; let n; while(n=walker.nextNode()) nodes.push(n);
        for(const node of nodes){
          let text=node.nodeValue;
          let changed=false;
          for(const item of ids){
            const re=new RegExp(item.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
            if(re.test(text)){ text=text.replace(re,item.nome); changed=true; }
          }
          if(changed) node.nodeValue=text;
        }
      };
      const scheduleUserNames=()=>setTimeout(replaceUserIdsInText,80);
      const observer=new MutationObserver(scheduleUserNames);
      observer.observe(document.body,{childList:true,subtree:true});
      window.addEventListener('verosflow:render',scheduleUserNames);
      window.addEventListener('load',scheduleUserNames);
      scheduleUserNames();
    }

    console.info('[VerOS Flow] distribuição de solicitações v7 carregada:',role());
    return true;
  }
  function sync(){if(!install())return setTimeout(sync,300);setTimeout(()=>{try{if(STATE?.currentUser&&STATE.view==='solicitacoes')Render.solicitacoes();}catch(e){console.warn('VerOS Flow: erro ao atualizar solicitações',e);}},300);}
  sync();
})();
