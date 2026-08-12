/* VerOS Flow — melhorias finais aprovadas
   1) ADM UBS: saldo + tempo de produção e também conclusão da produção.
   2) Kanban: layout controlado exclusivamente por kanban-screen-fix.js.
   3) Estimativa de entrega por pedido.
*/
(function(){
  'use strict';
  const norm=v=>String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s-]+/g,'_');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numDays=v=>{if(v===null||v===undefined||v==='')return null;const m=String(v).replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null;};
  const addDays=(date,days)=>{const d=new Date(date);d.setDate(d.getDate()+days);return d;};
  const fmtDate=d=>d instanceof Date&&!isNaN(d)?d.toLocaleDateString('pt-BR'):'—';
  function role(){return norm(window.STATE?.currentUser?.perfil||window.STATE?.currentProfile||'');}
  function currentSol(){const id=window.STATE?.detailId;return id&&Array.isArray(window.DB?.solicitacoes)?window.DB.solicitacoes.find(s=>s.id===id):null;}
  function canAdmForSol(s){if(role()!=='ADM_UBS'||!s)return false;const u=window.STATE?.currentUser||{};const pu=s.unidade??s.unidade_id;const uu=u.unidade??u.unidade_id;return!!pu&&!!uu&&String(pu)===String(uu);}
  function ensureStyles(){
    if(document.getElementById('vfFinalEnhancementStyles'))return;
    const st=document.createElement('style');st.id='vfFinalEnhancementStyles';st.textContent=`
      .vf-delivery-estimate{margin:0 0 16px;border:1px solid var(--v-line);border-left:4px solid var(--v-green-600);border-radius:10px;background:#fff;padding:15px 17px;box-shadow:var(--v-shadow-sm);}
      .vf-delivery-estimate .vf-est-title{font-family:var(--font-display);font-weight:700;font-size:14px;color:var(--v-ink-900);}
      .vf-delivery-estimate .vf-est-main{margin-top:7px;font-size:13px;color:var(--v-ink-700);}
      .vf-delivery-estimate .vf-est-main strong{color:var(--v-green-700);}
      .vf-delivery-estimate .vf-est-breakdown{margin-top:8px;display:flex;flex-wrap:wrap;gap:7px;font-size:11px;color:var(--v-ink-500);}
      .vf-delivery-estimate .vf-est-chip{background:var(--v-green-050);border:1px solid var(--v-line);border-radius:999px;padding:4px 8px;}
      .vf-adm-production{margin:0 0 16px;border:1px solid var(--v-line);border-radius:10px;background:#fff;padding:14px 17px;box-shadow:var(--v-shadow-sm);}
      .vf-adm-production h4{font-family:var(--font-display);font-size:13px;margin-bottom:6px;}
      .vf-adm-production p{font-size:12px;color:var(--v-ink-500);margin-bottom:10px;line-height:1.45;}
      .vf-adm-production .btn{margin-right:7px;margin-top:5px;}
    `;document.head.appendChild(st);
  }
  function estimate(s){const adm=s.admUbs||{},log=s.logistica||{},producao=numDays(adm.tempoProducao),entrega=numDays(log.prazo),credito=s.solicitaCredito?1:0,folga=1,total=(producao??0)+(entrega??0)+credito+folga,complete=producao!==null&&entrega!==null,base=s.createdAt||s.created_at||new Date().toISOString(),data=complete?addDays(base,total):null;return{producao,entrega,credito,folga,total,complete,data};}
  function renderEstimate(){
    const old=document.getElementById('vfDeliveryEstimate');if(old)old.remove();const s=currentSol();if(!s)return;ensureStyles();const e=estimate(s),box=document.createElement('section');box.id='vfDeliveryEstimate';box.className='vf-delivery-estimate';
    if(e.complete)box.innerHTML=`<div class="vf-est-title">Estimativa de entrega final</div><div class="vf-est-main">Prazo estimado: <strong>${e.total} dias</strong> · previsão até <strong>${fmtDate(e.data)}</strong></div><div class="vf-est-breakdown"><span class="vf-est-chip">Produção: ${e.producao} dia(s)</span><span class="vf-est-chip">Entrega: ${e.entrega} dia(s)</span><span class="vf-est-chip">Análise de crédito: ${e.credito} dia</span><span class="vf-est-chip">Folga do processo: 1 dia</span></div>`;
    else{const faltam=[];if(e.producao===null)faltam.push('tempo de produção');if(e.entrega===null)faltam.push('prazo de entrega');box.innerHTML=`<div class="vf-est-title">Estimativa de entrega final</div><div class="vf-est-main">Aguardando definição de <strong>${esc(faltam.join(' e '))}</strong> para calcular a data final.</div><div class="vf-est-breakdown"><span class="vf-est-chip">Análise de crédito: ${e.credito} dia</span><span class="vf-est-chip">Folga do processo: 1 dia</span></div>`;}
    const main=document.querySelector('#appShell .main-area');if(!main)return;const top=main.querySelector('.topbar');if(top&&top.parentNode)top.parentNode.insertBefore(box,top.nextSibling);else main.prepend(box);
  }
  async function concluirProducao(){
    const s=currentSol();if(!s||!canAdmForSol(s))return;const status=norm(s.status);if(!status.includes('PRODUCAO'))return;if(!confirm('Confirmar produção finalizada para este pedido?'))return;const nextStatus='Faturamento disponível';const{error}=await window.supabaseClient.from('solicitacoes').update({status:nextStatus}).eq('id',s.id);if(error){console.error('[VerOS Flow] erro ao concluir produção:',error);if(window.App?.toast)App.toast('Erro ao concluir produção',error.message||'Tente novamente.','err');return;}s.status=nextStatus;if(window.Data?.refreshSolicitacoesData)await Data.refreshSolicitacoesData();if(window.Render?.detail)Render.detail();if(window.App?.toast)App.toast('Produção finalizada','O faturamento agora está disponível para Operações de Negócio.','ok');
  }
  function renderAdmProductionAction(){
    const old=document.getElementById('vfAdmProductionAction');if(old)old.remove();const s=currentSol();if(!s||!canAdmForSol(s))return;const st=norm(s.status);if(!st.includes('PRODUCAO')||st.includes('FATURAMENTO'))return;ensureStyles();const box=document.createElement('section');box.id='vfAdmProductionAction';box.className='vf-adm-production';box.innerHTML='<h4>Operação da produção</h4><p>O ADM UBS desta unidade também pode informar que a produção foi finalizada. Essa ação libera a etapa de faturamento conforme o fluxo aprovado.</p><button type="button" class="btn btn-primary" id="vfAdmFinishProduction">Informar produção finalizada →</button>';box.querySelector('#vfAdmFinishProduction').addEventListener('click',concluirProducao);const est=document.getElementById('vfDeliveryEstimate'),main=document.querySelector('#appShell .main-area');if(est&&est.parentNode)est.parentNode.insertBefore(box,est.nextSibling);else if(main)main.prepend(box);
  }
  function refresh(){ensureStyles();renderEstimate();renderAdmProductionAction();}
  let timer=null;function start(){refresh();if(timer)clearInterval(timer);timer=setInterval(refresh,800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();window.addEventListener('load',refresh);window.addEventListener('verosflow:render',refresh);window.VEROS_FINAL_ENHANCEMENTS={version:'1.2',estimate};
})();
