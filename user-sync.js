(function(){
  function install(){
    if(typeof Data==='undefined' || typeof Render==='undefined') return false;

    if(typeof Data.loadCadastros==='function' && !Data.__usersLoadWrapped){
      const loadCadastros=Data.loadCadastros.bind(Data);
      Data.loadCadastros=async function(){
        await loadCadastros();
        await Data.loadUsuarios();
      };
      Data.__usersLoadWrapped=true;
    }

    Data.saveUsuarioPerfil=async function(id,data){
      if(typeof supabase==='undefined' || !supabase) throw new Error('Supabase não configurado.');
      const {data:result,error}=await supabase.functions.invoke('manage-user-v3',{body:{action:id?'update':'create',user_id:id||null,data:{nome:data.nome,email:data.email,perfil:data.perfil,unidade:data.unidade||null,telefone:data.telefone||null,status:data.status||'Ativo',senha:data.senha||''}}});
      if(error) throw new Error(error.message||'Falha ao chamar o serviço de usuários.');
      if(result&&result.error) throw new Error(result.error);
      await Data.loadUsuarios();
      return result;
    };

    if(!Data.__userModalPatched){
      const original=Render.openCadModal;
      Render.openCadModal=function(tab,id){
        if(tab!=='usuarios') return original.call(Render,tab,id);
        const u=id?DB.usuarios.find(x=>x.id===id):{nome:'',email:'',perfil:'RC',unidade:DB.unidades[0]?.id||'',telefone:'',status:'Ativo'};
        Modal.open(id?'Editar usuário':'Novo usuário',`<div class="form-grid">
          <div class="field full"><label>Nome *</label><input id="cm_nome" value="${U.esc(u.nome||'')}"></div>
          <div class="field full"><label>E-mail *</label><input id="cm_email" type="email" value="${U.esc(u.email||'')}"></div>
          <div class="field"><label>Perfil *</label><select id="cm_perfil">${DB.perfis.map(p=>`<option value="${p.id}" ${p.id===u.perfil?'selected':''}>${p.nome}</option>`).join('')}</select></div>
          <div class="field"><label>Unidade *</label><select id="cm_unidade"><option value="">Selecione</option>${DB.unidades.map(un=>`<option value="${un.id}" ${un.id===u.unidade?'selected':''}>${U.esc(un.nome)}</option>`).join('')}</select></div>
          <div class="field"><label>Telefone</label><input id="cm_tel" value="${U.esc(u.telefone||'')}"></div>
          <div class="field"><label>Status</label><select id="cm_status"><option ${u.status==='Ativo'?'selected':''}>Ativo</option><option ${u.status==='Inativo'?'selected':''}>Inativo</option></select></div>
          <div class="field full"><label>${id?'Nova senha (opcional)':'Senha inicial *'}</label><input id="cm_senha" type="password" autocomplete="new-password"></div>
        </div>`,[
          {label:'Cancelar',cls:'btn-ghost',onClick:()=>Modal.close()},
          {label:'Salvar',cls:'btn-primary',onClick:async function(){
            const btn=this;
            const data={nome:document.getElementById('cm_nome').value.trim(),email:document.getElementById('cm_email').value.trim(),perfil:document.getElementById('cm_perfil').value,unidade:document.getElementById('cm_unidade').value||null,telefone:document.getElementById('cm_tel').value.trim(),status:document.getElementById('cm_status').value,senha:document.getElementById('cm_senha').value};
            if(!data.nome||!data.email){App.toast('Campos obrigatórios','Preencha nome e e-mail.','err');return;}
            if(!id&&data.senha.length<6){App.toast('Senha inválida','A senha inicial deve ter pelo menos 6 caracteres.','err');return;}
            if(!data.unidade){App.toast('Unidade obrigatória','Selecione a unidade do usuário.','err');return;}
            btn.disabled=true;btn.textContent='Salvando...';
            try{await Data.saveUsuarioPerfil(id,data);Modal.close();App.toast('Usuário salvo','Cadastro persistido no Supabase.','ok');Render.renderCadTable();}
            catch(err){btn.disabled=false;btn.textContent='Salvar';App.toast('Erro ao salvar usuário',err.message||'Tente novamente.','err');console.error(err);}
          }}
        ]);
      };
      Data.__userModalPatched=true;
    }

    /*
      DISTRIBUIÇÃO DAS SOLICITAÇÕES
      Regra: um único Pedido de Venda fica visível simultaneamente para
      Financeiro, Logística e Operações desde a criação. O ADM UBS vê os
      pedidos da sua própria UBS. O RC vê apenas os próprios pedidos.
      A visibilidade não depende do status da solicitação.
    */
    if(!Data.__requestVisibilityPatched){
      const norm=v=>String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const role=()=>{
        const raw=norm(STATE?.currentUser?.perfil||STATE?.currentUser?.role||STATE?.currentProfile||'');
        const map={
          'RC':'RC','SOLICITANTE':'RC','REQUISITANTE':'RC',
          'ADM_UBS':'ADM_UBS','ADM UBS':'ADM_UBS','ADMINISTRADOR UBS':'ADM_UBS','ADMINISTRADOR DA UBS':'ADM_UBS',
          'COORD_FIN':'COORD_FIN','COORDENADOR FINANCEIRO':'COORD_FIN','COORDENADOR FINANCEIRO ADM':'COORD_FIN',
          'COORD_LOG':'COORD_LOG','COORDENADOR LOGISTICA':'COORD_LOG','COORDENADOR LOGISTICA ADM':'COORD_LOG',
          'OPERACOES':'OPERACOES','OPERACOES DE NEGOCIO':'OPERACOES','OPERACOES NEGOCIO':'OPERACOES',
          'COMERCIAL_ADM':'COMERCIAL_ADM','COMERCIAL ADM':'COMERCIAL_ADM','ADMINISTRADOR':'COMERCIAL_ADM'
        };
        return map[raw]||raw.replace(/[\s-]+/g,'_');
      };
      const admin=()=>role()==='COMERCIAL_ADM';
      const field=(obj,...keys)=>{
        for(const k of keys){ const v=obj?.[k]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return v; }
        return null;
      };
      const unitKey=value=>norm(value);
      const unitMatches=(sol,user)=>{
        const solVals=[
          field(sol,'unidadeId','unidade_id','unidadeID'),
          typeof sol?.unidade==='object' ? field(sol.unidade,'id','codigo','nome') : sol?.unidade,
          sol?.unidadeNome,
          sol?.nomeUnidade
        ].filter(v=>v!==null);
        const userVals=[
          field(user,'unidadeId','unidade_id','unidadeID'),
          typeof user?.unidade==='object' ? field(user.unidade,'id','codigo','nome') : user?.unidade,
          user?.unidadeNome,
          user?.nomeUnidade
        ].filter(v=>v!==null);
        const a=new Set(solVals.map(unitKey));
        const b=new Set(userVals.map(unitKey));
        for(const x of a) if(b.has(x)) return true;
        // Quando um lado traz UUID e o outro nome/código, tenta resolver pela tabela de unidades.
        const unidades=Array.isArray(DB?.unidades)?DB.unidades:[];
        const expand=v=>{
          const k=unitKey(v), u=unidades.find(x=>[x?.id,x?.codigo,x?.nome].filter(Boolean).map(unitKey).includes(k));
          return u?[u.id,u.codigo,u.nome].filter(Boolean).map(unitKey):[k];
        };
        const ea=new Set(solVals.flatMap(expand)), eb=new Set(userVals.flatMap(expand));
        for(const x of ea) if(eb.has(x)) return true;
        return false;
      };
      const canSee=sol=>{
        if(!sol||!STATE?.currentUser) return false;
        const r=role(), u=STATE.currentUser;
        if(admin()) return true;
        if(r==='RC'){
          const uid=field(u,'id','user_id');
          return field(sol,'rcUsuarioId','rc_usuario_id')===uid || norm(field(sol,'nomeRC','nome_rc'))===norm(u.nome);
        }
        if(r==='ADM_UBS') return unitMatches(sol,u);
        // Financeiro, Logística e Operações: todos os pedidos, de todas as UBS,
        // desde o momento da criação.
        return ['COORD_FIN','COORD_LOG','OPERACOES'].includes(r);
      };
      const visible=()=> (Array.isArray(DB?.solicitacoes)?DB.solicitacoes:[]).filter(canSee);

      window.VerOSRequestVisibility={version:'5.0',role,canSee,visible,unitMatches};
      window.VEROS_FLOW_RULES=window.VEROS_FLOW_RULES||{};
      window.VEROS_FLOW_RULES.canSee=canSee;
      window.VEROS_FLOW_RULES.roles=role;

      // O renderer original usa DB.solicitacoes diretamente. Durante a renderização
      // da lista substituímos temporariamente pela visão permitida ao usuário.
      const originalSolic=Render.solicitacoes?.bind(Render);
      if(originalSolic){
        Render.solicitacoes=function(){
          const all=DB.solicitacoes;
          DB.solicitacoes=visible();
          try{
            const result=originalSolic();
            if(result&&typeof result.finally==='function') return result.finally(()=>{DB.solicitacoes=all;});
            DB.solicitacoes=all;
            return result;
          }catch(e){ DB.solicitacoes=all; throw e; }
        };
      }

      // Impede acesso direto a um pedido de outra UBS pelo ADM UBS.
      const originalDetail=Render.detail?.bind(Render);
      if(originalDetail){
        Render.detail=function(){
          const id=STATE?.detailId||STATE?.selectedSolicitacaoId;
          const sol=Array.isArray(DB?.solicitacoes)?DB.solicitacoes.find(s=>s.id===id):null;
          if(sol && !canSee(sol)){
            App.toast('Acesso restrito','Este pedido não pertence à sua UBS.','warn');
            if(typeof App?.navigate==='function') return App.navigate('solicitacoes');
            if(typeof App?.go==='function') return App.go('solicitacoes');
            return;
          }
          return originalDetail();
        };
      }

      // Garante que toda atualização de dados redesenhe a fila correta.
      if(typeof Data.loadSolicitacoes==='function' && !Data.__requestLoadWrapped){
        const load=Data.loadSolicitacoes.bind(Data);
        Data.loadSolicitacoes=async function(){
          const result=await load();
          DB.__allSolicitacoes=Array.isArray(DB.solicitacoes)?DB.solicitacoes.slice():[];
          return result;
        };
        Data.__requestLoadWrapped=true;
      }

      console.info('[VerOS Flow] distribuição de solicitações v5 carregada:',role());
    }

    return true;
  }

  function sync(){
    if(!install()) return setTimeout(sync,300);
    setTimeout(async function(){
      try{
        if(typeof STATE!=='undefined' && STATE.currentUser){
          await Data.loadUsuarios();
          if(STATE.cadTab==='usuarios' && document.getElementById('cadContent')) Render.renderCadTable();
          if(STATE.view==='solicitacoes' && window.Render?.solicitacoes) Render.solicitacoes();
        }
      }catch(err){console.warn('VerOS Flow: falha ao sincronizar usuários:',err);}
    },300);
  }
  sync();
})();
