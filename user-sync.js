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
    return true;
  }

  function sync(){
    if(!install()) return setTimeout(sync,300);
    setTimeout(async function(){
      try{
        if(typeof STATE!=='undefined' && STATE.currentUser){
          await Data.loadUsuarios();
          if(STATE.cadTab==='usuarios' && document.getElementById('cadContent')) Render.renderCadTable();
        }
      }catch(err){console.warn('VerOS Flow: falha ao sincronizar usuários:',err);}
    },300);
  }
  sync();
})();
