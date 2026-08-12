/* VerOS Flow — Kanban: rolagem horizontal SOMENTE na área da tela */
(function(){
  'use strict';
  const STYLE_ID='vfKanbanScreenScrollFix';

  function install(){
    if(!document.head) return;
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style);}
    style.textContent=`
      /* A página fica estável; o conteúdo do Kanban é quem pode crescer horizontalmente. */
      html,body{overflow-x:hidden !important;}

      #appShell.show{min-width:0 !important;width:100% !important;}

      #appShell .main-area{
        flex:1 1 auto !important;
        min-width:0 !important;
        width:auto !important;
        max-width:none !important;
        overflow-x:auto !important;
        overflow-y:auto !important;
        scrollbar-gutter:stable;
      }

      /* Qualquer wrapper imediato do conteúdo não pode criar outra rolagem. */
      #appShell .main-area .page,
      #appShell .main-area .page-content,
      #appShell .main-area .content,
      #appShell .main-area .content-area{
        min-width:0 !important;
        max-width:none !important;
        overflow-x:visible !important;
      }

      /* O board tem a largura real de todas as colunas e fica dentro do main-area. */
      #appShell .kanban-board{
        display:flex !important;
        flex-wrap:nowrap !important;
        align-items:flex-start !important;
        width:max-content !important;
        min-width:100% !important;
        max-width:none !important;
        overflow:visible !important;
        overflow-x:visible !important;
        overflow-y:visible !important;
        gap:16px !important;
        padding-right:24px !important;
        padding-bottom:16px !important;
      }

      #appShell .kanban-board > *,
      #appShell .kanban-col{
        flex:0 0 310px !important;
        width:310px !important;
        min-width:310px !important;
        max-width:310px !important;
        overflow-x:visible !important;
      }

      /* Remove barras horizontais internas de QUALQUER elemento do Kanban. */
      #appShell .kanban-board *{
        scrollbar-width:none !important;
      }
      #appShell .kanban-board *::-webkit-scrollbar:horizontal{
        display:none !important;
        height:0 !important;
      }
      #appShell .kanban-board,
      #appShell .kanban-board > *,
      #appShell .kanban-board .kanban-col,
      #appShell .kanban-board .kanban-col-body,
      #appShell .kanban-board .kanban-card{
        overflow-x:visible !important;
      }
    `;
  }

  function apply(){
    install();
    const app=document.getElementById('appShell');
    if(app){app.style.minWidth='0';app.style.width='100%';}

    document.querySelectorAll('#appShell .main-area').forEach(main=>{
      main.style.flex='1 1 auto';
      main.style.minWidth='0';
      main.style.width='auto';
      main.style.maxWidth='none';
      main.style.overflowX='auto';
      main.style.overflowY='auto';
    });

    document.querySelectorAll('#appShell .kanban-board').forEach(board=>{
      board.style.display='flex';
      board.style.flexWrap='nowrap';
      board.style.alignItems='flex-start';
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
    const observer=new MutationObserver(()=>apply());
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',apply);
    window.addEventListener('load',apply);
    window.addEventListener('verosflow:render',apply);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
