/* VerOS Flow — Editor administrativo de pedidos
   Somente COMERCIAL_ADM pode editar qualquer campo/etapa de qualquer pedido,
   mesmo depois de uma área já ter executado sua ação.
*/
(function(){
  'use strict';

  const STATUS_OPTIONS = [
    'Novo','Aguardando Saldo','Aguardando Aprovação Financeira',
    'Aguardando Crédito e Logística','Crédito recusado','Produção',
    'Aguardando Frete','Frete contratado','Faturado','Em transporte',
    'Entregue','Cancelado'
  ];

  function admin(){ return typeof STATE!=='undefined' && STATE.currentProfile==='COMERCIAL_ADM'; }
  function sol(){ return typeof DB!=='undefined' ? DB.solicitacoes.find(s=>s.id===STATE.detailId) : null; }
  function esc(v){ return typeof U!=='undefined' ? U.esc(v==null?'':v) : String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function brl(v){ return typeof U!=='undefined' ? U.brl(v) : String(v||''); }
  function selected(a,b){ return String(a??'')===String(b??'')?'selected':''; }
  function checked(v){ return v ? 'checked' : ''; }

  function usuarioOptions(current){
    const users=(DB.usuarios||[]).filter(u=>u.status!=='Inativo');
    return users.map(u=>`<option value="${esc(u.id)}" ${selected(u.id,current)}>${esc(u.nome)} — ${esc(U.perfilNome(u.perfil))}</option>`).join('');
  }
  function unidadeOptions(current){
    return (DB.unidades||[]).map(u=>`<option value="${esc(u.id)}" ${selected(u.id,current)}>${esc(u.nome)}</option>`).join('');
  }
  function produtoOptions(current){
    return (DB.produtos||[]).map(p=>`<option value="${esc(p.id)}" ${selected(p.id,current)}>${esc(p.codigo)} — ${esc(p.cultura+' · '+p.variedade)}</option>`).join('');
  }

  function ensureStyles(){
    if(document.getElementById('vfAdminEditorStyles')) return;
    const s=document.createElement('style'); s.id='vfAdminEditorStyles';
    s.textContent=`
      .vf-admin-edit-btn{margin-left:auto;display:inline-flex;align-items:center;gap:7px}
      .vf-admin-section{border:1px solid var(--v-line);border-radius:10px;padding:14px;margin:0 0 12px;background:#fff}
      .vf-admin-section h4{font-family:var(--font-display);font-size:13px;margin-bottom:11px;color:var(--v-ink-900)}
      .vf-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .vf-admin-grid .full{grid-column:1/-1}
      .vf-admin-note{font-size:11.5px;color:var(--v-ink-500);line-height:1.45;margin-bottom:12px}
      .vf-admin-danger{background:var(--v-red-bg);border:1px solid var(--v-red);color:var(--v-red);padding:9px 11px;border-radius:8px;font-size:11.5px;margin-bottom:12px}
      @media(max-width:760px){.vf-admin-grid{grid-template-columns:1fr}.vf-admin-grid .full{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function field(label,id,value='',type='text',extra=''){
    return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
  }
  function selectField(label,id,html){ return `<div class="field"><label>${label}</label><select id="${id}">${html}</select></div>`; }
  function textField(label,id,value='',extra=''){ return `<div class="field full"><label>${label}</label><textarea id="${id}" rows="3" ${extra}>${esc(value)}</textarea></div>`; }

  function openEditor(id){
    if(!admin()) return App.toast('Acesso restrito','Somente o Comercial ADM pode editar pedidos.','warn');
    const s=DB.solicitacoes.find(x=>x.id===id);
    if(!s) return App.toast('Pedido não encontrado','Atualize a tela e tente novamente.','err');

    const fin=s.financeiro||{};
    const adm=s.admUbs||{};
    const log=s.logistica||{};
    const fat=s.faturamento||{};
    const credito=s.credito||{};

    const html=`
      <div class="vf-admin-danger"><b>Modo administrativo.</b> As alterações abaixo podem corrigir qualquer etapa do pedido, inclusive etapas já concluídas por outras áreas. Cada alteração será registrada no log de auditoria.</div>
      <div class="vf-admin-section">
        <h4>Pedido de venda</h4>
        <div class="vf-admin-grid">
          ${field('Número do pedido MOBI','ae_numero',s.numeroPedidoMobi)}
          ${field('Cliente','ae_cliente',s.cliente)}
          ${selectField('Solicitante / RC','ae_rc',usuarioOptions(s.rcUsuarioId))}
          ${selectField('Unidade / UBS','ae_unidade',unidadeOptions(s.unidade))}
          ${selectField('Produto','ae_produto',produtoOptions(s.produto))}
          ${field('Quantidade','ae_quantidade',s.quantidade,'number','min="0" step="any"')}
          ${field('Desconto (%)','ae_desconto',s.desconto,'number','min="0" step="0.01"')}
          ${field('Valor total','ae_valor',s.valorTotal,'number','min="0" step="0.01"')}
          ${field('Forma de pagamento','ae_pgto',s.formaPagamento)}
          ${selectField('Status do pedido','ae_status',STATUS_OPTIONS.map(x=>`<option value="${esc(x)}" ${selected(x,s.status)}>${esc(x)}</option>`).join(''))}
          <div class="field full"><label><input id="ae_credito" type="checkbox" ${checked(s.solicitaCredito)} style="width:auto;margin-right:7px;"> Solicita análise de crédito</label></div>
        </div>
      </div>

      <div class="vf-admin-section">
        <h4>Crédito / Financeiro</h4>
        <div class="vf-admin-grid">
          ${field('Limite solicitado','ae_limite',credito.limiteSolicitado,'number','min="0" step="0.01"')}
          ${selectField('Decisão financeira','ae_decisao',`<option value="">Sem decisão</option><option ${selected(fin.decisao,'Aprovado')}>Aprovado</option><option ${selected(fin.decisao,'Aprovado com ressalvas')}>Aprovado com ressalvas</option><option ${selected(fin.decisao,'Recusado')}>Recusado</option>`)}
          ${textField('Justificativa / observações do crédito','ae_justificativa',credito.justificativa||'')}
          ${textField('Motivo / justificativa da decisão financeira','ae_motivo',fin.motivoRecusa||'')}
          ${textField('Observações financeiras','ae_obs_fin',credito.observacoes||'')}
        </div>
      </div>

      <div class="vf-admin-section">
        <h4>ADM UBS / Produção</h4>
        <div class="vf-admin-grid">
          ${selectField('Saldo para produção','ae_saldo',`<option value="">Não informado</option><option value="true" ${selected(adm.saldoDisponivel,true)}>Sim</option><option value="false" ${selected(adm.saldoDisponivel,false)}>Não</option>`)}
          ${field('Tempo estimado para produção','ae_tempo',adm.tempoProducao||'')}
        </div>
      </div>

      <div class="vf-admin-section">
        <h4>Logística</h4>
        <div class="vf-admin-grid">
          ${field('Transportadora','ae_transportadora',log.transportadora||'')}
          ${field('Valor do frete','ae_valor_frete',log.valorFrete,'number','min="0" step="0.01"')}
          ${field('Prazo do frete','ae_prazo',log.prazo||'')}
          ${field('Data prevista','ae_data_prevista',log.dataPrevista||'','date')}
          <div class="field"><label><input id="ae_contratado" type="checkbox" ${checked(log.contratado)} style="width:auto;margin-right:7px;"> Frete contratado</label></div>
          ${selectField('Status da entrega','ae_entrega',`<option value="">Não informado</option><option ${selected(log.statusEntrega,'Em transporte')}>Em transporte</option><option ${selected(log.statusEntrega,'Entregue')}>Entregue</option>`)}
          ${field('Data da entrega','ae_data_entrega',log.dataEntrega||'','date')}
          ${textField('Ocorrências da entrega','ae_ocorrencias',log.ocorrencias||'')}
        </div>
      </div>

      <div class="vf-admin-section">
        <h4>Faturamento</h4>
        <div class="vf-admin-grid">
          ${field('Número da NF','ae_nf',fat.numeroNF||'')}
          ${field('Data da NF','ae_data_nf',fat.dataNF||'','date')}
          <div class="field"><label><input id="ae_fat_concluido" type="checkbox" ${checked(fat.concluido)} style="width:auto;margin-right:7px;"> Faturamento concluído</label></div>
          ${textField('Observações do faturamento','ae_obs_fat',fat.observacoes||'')}
        </div>
      </div>
      <p class="vf-admin-note">Ao salvar, o sistema mantém o mesmo ID do pedido e registra no log de auditoria os campos que foram alterados pelo Comercial ADM.</p>
    `;

    Modal.open('Editar pedido · '+(s.numeroPedidoMobi||'sem número'),html,[
      {label:'Cancelar',cls:'btn-ghost',onClick:()=>Modal.close()},
      {label:'Salvar alterações',cls:'btn-primary',onClick:async function(){
        const btn=this; btn.disabled=true; btn.textContent='Salvando...';
        try{
          await save(s);
          Modal.close();
          await Data.refreshSolicitacoesData();
          App.toast('Pedido atualizado','As alterações do Comercial ADM foram salvas.','ok');
          if(STATE.view==='detail') Render.detail(); else Render.solicitacoes();
        }catch(err){
          console.error('[VerOS Flow] erro no editor administrativo:',err);
          btn.disabled=false; btn.textContent='Salvar alterações';
          App.toast('Erro ao salvar pedido',err.message||'Tente novamente.','err');
        }
      }}
    ]);
  }

  async function save(old){
    if(!admin()) throw new Error('Somente o Comercial ADM pode editar pedidos.');
    const q=id=>document.getElementById(id);
    const novo={
      numero_pedido_mobi:q('ae_numero').value.trim()||null,
      cliente:q('ae_cliente').value.trim(),
      rc_usuario_id:q('ae_rc').value||old.rcUsuarioId,
      nome_rc:((DB.usuarios||[]).find(u=>u.id===q('ae_rc').value)||{}).nome || old.nomeRC,
      unidade_id:q('ae_unidade').value||null,
      produto_id:q('ae_produto').value||null,
      quantidade:Number(q('ae_quantidade').value)||0,
      desconto_pct:Number(q('ae_desconto').value)||0,
      valor_total:Number(q('ae_valor').value)||0,
      forma_pagamento:q('ae_pgto').value.trim()||null,
      solicita_credito:q('ae_credito').checked,
      status:q('ae_status').value
    };
    if(!novo.cliente) throw new Error('Informe o cliente.');
    if(!novo.unidade_id) throw new Error('Selecione a unidade/UBS.');
    if(!novo.produto_id) throw new Error('Selecione o produto.');

    const changes=[];
    const map=[
      ['numero_pedido_mobi','Número do pedido MOBI',old.numeroPedidoMobi,novo.numero_pedido_mobi],
      ['cliente','Cliente',old.cliente,novo.cliente],
      ['rc_usuario_id','Solicitante',old.nomeRC,novo.nome_rc],
      ['unidade_id','Unidade',U.unidadeNome(old.unidade),U.unidadeNome(novo.unidade_id)],
      ['produto_id','Produto',U.produtoLabel(old.produto),U.produtoLabel(novo.produto_id)],
      ['quantidade','Quantidade',old.quantidade,novo.quantidade],
      ['desconto_pct','Desconto (%)',old.desconto,novo.desconto_pct],
      ['valor_total','Valor total',old.valorTotal,novo.valor_total],
      ['forma_pagamento','Forma de pagamento',old.formaPagamento,novo.forma_pagamento],
      ['solicita_credito','Análise de crédito',old.solicitaCredito?'Sim':'Não',novo.solicita_credito?'Sim':'Não'],
      ['status','Status',old.status,novo.status]
    ];
    map.forEach(x=>{ if(String(x[2]??'')!==String(x[3]??'')) changes.push(x); });

    const {error:baseErr}=await supabaseClient.from('solicitacoes').update(novo).eq('id',old.id);
    if(baseErr) throw baseErr;

    const limite=q('ae_limite').value; const justificativa=q('ae_justificativa').value.trim(); const obsFin=q('ae_obs_fin').value.trim();
    if(novo.solicita_credito){
      const {error}=await supabaseClient.from('credito_solicitacoes').upsert({solicitacao_id:old.id,limite_solicitado:limite?Number(limite):null,justificativa:justificativa||null,observacoes:obsFin||null});
      if(error) throw error;
    }

    const saldoVal=q('ae_saldo').value;
    if(saldoVal!==''){
      const saldo=saldoVal==='true'; const tempo=q('ae_tempo').value.trim()||null;
      const {error}=await supabaseClient.from('adm_ubs_avaliacoes').upsert({solicitacao_id:old.id,saldo_disponivel:saldo,tempo_producao:tempo,avaliado_por:STATE.currentUser.id,avaliado_em:new Date().toISOString()});
      if(error) throw error;
    }

    const decisao=q('ae_decisao').value; const motivo=q('ae_motivo').value.trim();
    if(decisao){
      const {error}=await supabaseClient.from('financeiro_decisoes').upsert({solicitacao_id:old.id,decisao,motivo_recusa:motivo||null,decidido_por:STATE.currentUser.id,decidido_em:new Date().toISOString()});
      if(error) throw error;
    }

    const logPayload={
      solicitacao_id:old.id,transportadora:q('ae_transportadora').value.trim()||null,
      valor_frete:q('ae_valor_frete').value?Number(q('ae_valor_frete').value):null,
      prazo:q('ae_prazo').value.trim()||null,data_prevista:q('ae_data_prevista').value||null,
      contratado:q('ae_contratado').checked,status_entrega:q('ae_entrega').value||null,
      data_entrega:q('ae_data_entrega').value||null,ocorrencias:q('ae_ocorrencias').value.trim()||null
    };
    if(logPayload.transportadora||logPayload.valor_frete!==null||logPayload.prazo||logPayload.data_prevista||logPayload.contratado||logPayload.status_entrega||logPayload.data_entrega||logPayload.ocorrencias){
      const {error}=await supabaseClient.from('logistica_fretes').upsert(logPayload); if(error) throw error;
    }

    const nf=q('ae_nf').value.trim(); const dataNF=q('ae_data_nf').value||null; const obsFat=q('ae_obs_fat').value.trim(); const fatConcl=q('ae_fat_concluido').checked;
    if(nf||dataNF||obsFat||fatConcl){
      const {error}=await supabaseClient.from('faturamentos').upsert({solicitacao_id:old.id,numero_nf:nf||null,data_nf:dataNF,observacoes:obsFat||null,concluido:fatConcl,concluido_em:fatConcl?new Date().toISOString():null});
      if(error) throw error;
    }

    const newLabels={
      'Limite solicitado':limite||'—','Justificativa crédito':justificativa||'—','Observações financeiras':obsFin||'—',
      'Saldo produção':saldoVal===''?'—':(saldoVal==='true'?'Sim':'Não'),'Tempo produção':q('ae_tempo').value.trim()||'—',
      'Decisão financeira':decisao||'—','Motivo decisão':motivo||'—','Transportadora':logPayload.transportadora||'—',
      'Valor frete':logPayload.valor_frete===null?'—':brl(logPayload.valor_frete),'Prazo frete':logPayload.prazo||'—',
      'Frete contratado':logPayload.contratado?'Sim':'Não','Status entrega':logPayload.status_entrega||'—',
      'Número NF':nf||'—','Data NF':dataNF||'—','Faturamento concluído':fatConcl?'Sim':'Não'
    };
    Object.entries(newLabels).forEach(([k,v])=>changes.push(['admin_'+k,k,'(valor atual)',v]));

    for(const c of changes){
      try{ await Data.logAcao(old.id,c[1],c[2],c[3]); }catch(e){ console.warn('[VerOS Flow] log administrativo não gravado:',e); }
    }
    await Data.addTimeline(old.id,'Pedido ajustado pelo Comercial ADM');
  }

  function patchDetail(){
    if(!window.Render || !window.App || !admin()) return false;
    ensureStyles();
    const root=document.getElementById('view-detail');
    if(!root) return false;
    if(root.querySelector('[data-vf-admin-edit]')) return true;
    const head=root.querySelector('.page-head');
    if(!head) return false;
    const btn=document.createElement('button');
    btn.className='btn btn-primary btn-sm vf-admin-edit-btn';
    btn.dataset.vfAdminEdit='1';
    btn.innerHTML='Editar pedido';
    btn.onclick=()=>openEditor(STATE.detailId);
    head.appendChild(btn);
    return true;
  }

  function patchRender(){
    if(!window.Render || Render.__vfAdminEditorPatched) return !!window.Render;
    const original=Render.detail;
    Render.detail=function(){
      const r=original.apply(Render,arguments);
      setTimeout(patchDetail,0);
      setTimeout(patchDetail,250);
      return r;
    };
    Render.__vfAdminEditorPatched=true;
    return true;
  }

  function boot(){
    if(patchRender()){
      setTimeout(patchDetail,100);
      setTimeout(patchDetail,500);
      return;
    }
    setTimeout(boot,300);
  }
  boot();
  window.VFAdminEditor={open:openEditor,refresh:patchDetail};
})();
