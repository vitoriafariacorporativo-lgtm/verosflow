/* VerOS Flow — Kanban: preservar o layout original + UMA única rolagem horizontal */
(function(){
  'use strict';
  const STYLE_ID='vfKanbanScreenScrollFix';

  function install(){
    if(!document.head)return;
    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent=`
      /* A única área que pode rolar horizontalmente é a tela principal. */
      html,body{overflow-x:hidden !important;}
      #appShell{min-width:0 !important;}
      #appShell .main-area{
        min-width:0 !important;
        max-width:none !important;
        overflow-x:auto !important;
        overflow-y:auto !important;
        scrollbar-gutter:stable;
      }

      /* NÃO alterar display, largura, flex ou posicionamento do Kanban.
         Isso preserva exatamente o layout original das colunas. */
      #appShell .main-area [class*="kanban"]{
        scrollbar-width:none !important;
      }
      #appShell .main-area [class*="kanban"]::-webkit-scrollbar:horizontal,
      #appShell .main-area [class*="kanban"] *::-webkit-scrollbar:horizontal{
        height:0 !important;
        display:none !important;
      }

      /* Remove somente barras horizontais internas, sem mexer nas dimensões. */
      #appShell .main-area [class*="kanban"] *{
        scrollbar-width:none !important;
      }
    `;
  }

  function apply(){
    install();
    const app=document.getElementById('appShell');
    if(app)app.style.minWidth='0';

    document.querySelectorAll('#appShell .main-area').forEach(main=>{
      main.style.minWidth='0';
      main.style.maxWidth='none';
      main.style.overflowX='auto';
      main.style.overflowY='auto';
    });

    /* Apenas esconde a barra horizontal interna. Não altera o layout do Kanban. */
    document.querySelectorAll('#appShell .main-area [class*="kanban"] *').forEach(el=>{
      el.style.scrollbarWidth='none';
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

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
