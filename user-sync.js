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

    if(!Data.__requestVisibilityPatched){
      const norm=v=>String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const role=()=>{
        const raw=norm(STATE?.currentUser?.perfil||STATE?.currentUser?.role||STATE?.currentProfile||'');
        const map={'RC':'RC','SOLICITANTE':'RC','REQUISITANTE':'RC','ADM_UBS':'ADM_UBS','ADM UBS':'ADM_UBS','ADMINISTRADOR UBS':'ADM_UBS','ADMINISTRADOR DA UBS':'ADM_UBS','COORD_FIN':'COORD_FIN','COORDENADOR FINANCEIRO':'COORD_FIN','COORDENADOR FINANCEIRO ADM':'COORD_FIN','COORD_LOG':'COORD_LOG','COORDENADOR LOGISTICA':'COORD_LOG','COORDENADOR LOGISTICA ADM':'COORD_LOG','OPERACOES':'OPERACOES','OPERACOES DE NEGOCIO':'OPERACOES','OPERACOES NEGOCIO':'OPERACOES','COMERCIAL_ADM':'COMERCIAL_ADM','COMERCIAL ADM':'COMERCIAL_ADM','ADMINISTRADOR':'COMERCIAL_ADM'};
        return map[raw]||raw.replace(/[\s-]+/g,'_');
      };
      const admin=()=>role()==='COMERCIAL_ADM';
      const field=(obj,...keys)=>{for(const k of keys){const v=obj?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return null;};
      const unitKey=value=>norm(value);

      // Regra oficial: para ADM UBS, a unidade vem EXCLUSIVAMENTE do pedido.
      // O usuário logado pode não ter unidade_id populado no STATE; nesse caso,
      // resolvemos o cadastro real em DB.usuarios pelo id/e-mail antes da comparação.
      const currentUser=()=>{
        const u=STATE?.currentUser||{};
        if((u.unidade_id||u.unidadeId||u.unidade) || !Array.isArray(DB?.usuarios)) return u;
        const uid=field(u,'id','user_id');
        const email=field(u,'email');
        return DB.usuarios.find(x=>norm(field(x,'id','user_id'))===norm(uid) || (email && norm(x.email)===norm(email))) || u;
      };

      const unitMatches=(sol,user)=>{
        if(!sol || !user) return false;
        // DISTRIBUIÇÃO: somente solicitacoes.unidade_id -> usuarios.unidade_id.
        // Não usa unidade do RC, nome do RC, criado_por ou qualquer outro campo.
        const pedidoUnidadeId=field(sol,'unidade_id');
        const usuarioUnidadeId=field(user,'unidade_id');
        if(!pedidoUnidadeId || !usuarioUnidadeId) return false;
        return unitKey(pedidoUnidadeId)===unitKey(usuarioUnidadeId);
      };

      const canSee=sol=>{
        if(!sol||!STATE?.currentUser)return false;
        const r=role(),u=currentUser();
        if(admin())return true;
        if(r==='RC'){
          const uid=field(u,'id','user_id');
          return field(sol,'rcUsuarioId','rc_usuario_id')===uid || norm(field(sol,'nomeRC','nome_rc'))===norm(u.nome);
        }
        if(r==='ADM_UBS')return unitMatches(sol,u);
        return ['COORD_FIN','COORD_LOG','OPERACOES'].includes(r);
      };
      const visible=()=> (Array.isArray(DB?.solicitacoes)?DB.solicitacoes:[]).filter(canSee);

      window.VerOSRequestVisibility={version:'6.0',role,canSee,visible,unitMatches,currentUser};
      window.VEROS_FLOW_RULES=window.VEROS_FLOW_RULES||{};
      window.VEROS_FLOW_RULES.canSee=canSee;
      window.VEROS_FLOW_RULES.roles=role;

      const originalSolic=Render.solicitacoes?.bind(Render);
      if(originalSolic){
        Render.solicitacoes=function(){
          const all=DB.solicitacoes;
          DB.solicitacoes=visible();
          try{
            const result=originalSolic();
            if(result&&typeof result.finally==='function')return result.finally(()=>{DB.solicitacoes=all;});
            DB.solicitacoes=all;
            return result;
          }catch(e){DB.solicitacoes=all;throw e;}
        };
      }

      const originalDetail=Render.detail?.bind(Render);
      if(originalDetail){
        Render.detail=function(){
          const id=STATE?.detailId||STATE?.selectedSolicitacaoId;
          const all=Array.isArray(DB?.solicitacoes)?DB.solicitacoes:[];
          const sol=all.find(s=>s.id===id);
          if(sol&&!canSee(sol)){
            App.toast('Acesso restrito','Este pedido não pertence à sua UBS.','warn');
            if(typeof App?.navigate==='function')return App.navigate('solicitacoes');
            if(typeof App?.go==='function')return App.go('solicitacoes');
            return;
          }
          return originalDetail();
        };
      }

      if(typeof Data.loadSolicitacoes==='function'&&!Data.__requestLoadWrapped){
        const load=Data.loadSolicitacoes.bind(Data);
        Data.loadSolicitacoes=async function(){
          const result=await load();
          DB.__allSolicitacoes=Array.isArray(DB.solicitacoes)?DB.solicitacoes.slice():[];
          return result;
        };
        Data.__requestLoadWrapped=true;
      }

      console.info('[VerOS Flow] distribuição de solicitações v6 carregada:',role());
    }
    return true;
  }

  function sync(){
    if(!install())return setTimeout(sync,300);
    setTimeout(async function(){
      try{
        if(typeof STATE!=='undefined'&&STATE.currentUser){
          await Data.loadUsuarios();
          if(STATE.cadTab==='usuarios'&&document.getElementById('cadContent'))Render.renderCadTable();
          if(STATE.view==='solicitacoes'&&window.Render?.solicitacoes)Render.solicitacoes();
        }
      }catch(err){console.warn('VerOS Flow: falha ao sincronizar usuários:',err);}
    },300);
  }
  sync();
})();
