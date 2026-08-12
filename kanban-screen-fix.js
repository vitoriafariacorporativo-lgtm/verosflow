/* VerOS Flow — Kanban: layout original + UMA única rolagem horizontal na tela */
(function(){
  'use strict';
  const STYLE_ID='vfKanbanScreenScrollFix';
  const BOARD='[class*="kanban-board"],[class*="kanban-container"],[class*="kanban-grid"]';
  const COL_WIDTH='380px';

  function install(){
    if(!document.head)return;
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style);}
    style.textContent=`
      html,body{overflow-x:hidden !important;}
      #appShell{min-width:0 !important;width:100% !important;}
      #appShell .main-area{
        flex:1 1 auto !important;
        min-width:0 !important;
        width:auto !important;
        max-width:none !important;
        overflow-x:auto !important;
        overflow-y:auto !important;
        scrollbar-gutter:stable;
      }

      /* O conteúdo volta a ter o aspecto original: colunas alinhadas, mesma largura e topo. */
      #appShell .main-area ${BOARD}{
        display:flex !important;
        flex-direction:row !important;
        flex-wrap:nowrap !important;
        align-items:flex-start !important;
        justify-content:flex-start !important;
        width:max-content !important;
        min-width:100% !important;
        max-width:none !important;
        gap:16px !important;
        padding-bottom:16px !important;
        padding-right:24px !important;
        overflow:visible !important;
        overflow-x:visible !important;
        overflow-y:visible !important;
        box-sizing:border-box !important;
      }

      /* Todas as colunas têm exatamente a mesma caixa. */
      #appShell .main-area ${BOARD} > *{
        flex:0 0 ${COL_WIDTH} !important;
        width:${COL_WIDTH} !important;
        min-width:${COL_WIDTH} !important;
        max-width:${COL_WIDTH} !important;
        align-self:flex-start !important;
        box-sizing:border-box !important;
        overflow-x:visible !important;
        overflow-y:visible !important;
      }

      /* Cards ocupam somente a largura interna da coluna, sem transbordar. */
      #appShell .main-area ${BOARD} > * *{
        box-sizing:border-box !important;
      }

      /* Nenhum elemento interno pode criar uma barra horizontal. */
      #appShell .main-area ${BOARD} *{
        scrollbar-width:none !important;
        overflow-x:visible !important;
      }
      #appShell .main-area ${BOARD} *::-webkit-scrollbar:horizontal{
        width:0 !important;
        height:0 !important;
        display:none !important;
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

    document.querySelectorAll('#appShell .main-area '+BOARD).forEach(board=>{
      Object.assign(board.style,{
        display:'flex',flexDirection:'row',flexWrap:'nowrap',alignItems:'flex-start',justifyContent:'flex-start',
        width:'max-content',minWidth:'100%',maxWidth:'none',gap:'16px',paddingBottom:'16px',paddingRight:'24px',
        overflow:'visible',overflowX:'visible',overflowY:'visible',boxSizing:'border-box'
      });
      Array.from(board.children).forEach(col=>{
        Object.assign(col.style,{flex:'0 0 '+COL_WIDTH,width:COL_WIDTH,minWidth:COL_WIDTH,maxWidth:COL_WIDTH,alignSelf:'flex-start',boxSizing:'border-box',overflowX:'visible',overflowY:'visible'});
        col.querySelectorAll('*').forEach(el=>{
          el.style.boxSizing='border-box';
          el.style.overflowX='visible';
          el.style.scrollbarWidth='none';
        });
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
