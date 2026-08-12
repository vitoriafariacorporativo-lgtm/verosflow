/* VerOS Flow — Kanban: rolagem horizontal da área principal, não das colunas/cards */
(function(){
  'use strict';

  const STYLE_ID = 'vfKanbanScreenScrollFix';

  function install(){
    if(!document.head) return;
    let style = document.getElementById(STYLE_ID);
    if(!style){
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      /* A tela principal é o único container horizontal do Kanban. */
      #appShell .main-area{
        overflow-x:auto !important;
        overflow-y:auto !important;
        min-width:0 !important;
      }

      #appShell .kanban-board{
        display:flex !important;
        flex-wrap:nowrap !important;
        width:max-content !important;
        min-width:100% !important;
        max-width:none !important;
        overflow:visible !important;
        overflow-x:visible !important;
        overflow-y:visible !important;
        padding-bottom:14px !important;
      }

      #appShell .kanban-col,
      #appShell .kanban-board > *{
        flex:0 0 310px !important;
        width:310px !important;
        min-width:310px !important;
      }

      #appShell .kanban-col-body,
      #appShell .kanban-card{
        overflow-x:visible !important;
      }
    `;
  }

  function apply(){
    install();
    document.querySelectorAll('#appShell .kanban-board').forEach(board=>{
      board.style.overflow='visible';
      board.style.overflowX='visible';
      board.style.width='max-content';
      board.style.minWidth='100%';
      board.style.maxWidth='none';
      board.style.display='flex';
      board.style.flexWrap='nowrap';
      Array.from(board.children).forEach(col=>{
        col.style.flex='0 0 310px';
        col.style.width='310px';
        col.style.minWidth='310px';
      });
    });
  }

  function start(){
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',apply);
    window.addEventListener('load',apply);
    window.addEventListener('verosflow:render',apply);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
