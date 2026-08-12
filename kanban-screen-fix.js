/* VerOS Flow — Kanban: uma única rolagem horizontal na tela principal */
(function(){
  'use strict';

  const STYLE_ID = 'vfKanbanScreenScrollFix';

  function install(){
    if(!document.head) return;
    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent=`
      /* O container da página é o único responsável pela rolagem horizontal. */
      #appShell .main-area{
        min-width:0 !important;
        width:100% !important;
        max-width:none !important;
        overflow-x:auto !important;
        overflow-y:auto !important;
      }

      /* O board nunca cria uma segunda barra horizontal. */
      #appShell .kanban-board{
        display:flex !important;
        flex-wrap:nowrap !important;
        width:max-content !important;
        min-width:100% !important;
        max-width:none !important;
        overflow:visible !important;
        overflow-x:visible !important;
        overflow-y:visible !important;
        gap:16px !important;
        padding-bottom:8px !important;
      }

      #appShell .kanban-board > *,
      #appShell .kanban-col{
        flex:0 0 310px !important;
        width:310px !important;
        min-width:310px !important;
        max-width:310px !important;
        overflow-x:visible !important;
      }

      /* Cards e corpos das colunas não possuem rolagem horizontal própria. */
      #appShell .kanban-col-body,
      #appShell .kanban-card{
        overflow-x:visible !important;
        max-width:none !important;
      }
    `;
  }

  function apply(){
    install();
    document.querySelectorAll('#appShell .main-area').forEach(main=>{
      main.style.minWidth='0';
      main.style.width='100%';
      main.style.maxWidth='none';
      main.style.overflowX='auto';
      main.style.overflowY='auto';
    });
    document.querySelectorAll('#appShell .kanban-board').forEach(board=>{
      board.style.display='flex';
      board.style.flexWrap='nowrap';
      board.style.width='max-content';
      board.style.minWidth='100%';
      board.style.maxWidth='none';
      board.style.overflow='visible';
      board.style.overflowX='visible';
      board.style.overflowY='visible';
      Array.from(board.children).forEach(col=>{
        col.style.flex='0 0 310px';
        col.style.width='310px';
        col.style.minWidth='310px';
        col.style.maxWidth='310px';
        col.style.overflowX='visible';
      });
    });
  }

  function start(){
    apply();
    const observer=new MutationObserver(apply);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',apply);
    window.addEventListener('load',apply);
    window.addEventListener('verosflow:render',apply);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
