-- ============================================================================
-- VerOS Flow — CORREÇÃO: notificações da UBS não chegavam por unidade
-- ----------------------------------------------------------------------------
-- Causa raiz: a notificação da UBS era resolvida procurando, no navegador de
-- quem cria o pedido (o RC), quais usuários têm perfil ADM_UBS na mesma
-- unidade. Isso só funciona se a política de segurança (RLS) da tabela
-- `usuarios` permitir que o RC leia o cadastro de outras contas — o que
-- normalmente NÃO é permitido, por segurança. Sem conseguir ler, a busca
-- não encontrava ninguém e a notificação nunca era criada.
--
-- A correção muda a notificação para carregar a UNIDADE do pedido junto
-- com ela (destino_perfil='ADM_UBS' + unidade_id=<unidade do pedido>). Cada
-- usuário UBS, ao abrir sua tela, filtra as notificações usando a PRÓPRIA
-- unidade (que ele sempre pode ler) — sem precisar consultar o cadastro de
-- mais ninguém.
--
-- Rode este script uma vez no SQL Editor do Supabase.
-- ============================================================================

alter table public.notificacoes
  add column if not exists unidade_id uuid references public.unidades(id);

comment on column public.notificacoes.unidade_id is
  'Preenchida quando destino_perfil = ADM_UBS: a unidade do pedido, para o'
  ' usuário UBS filtrar as notificações relevantes à própria unidade sem'
  ' depender de ler o cadastro de outros usuários.';

create index if not exists idx_notificacoes_unidade on public.notificacoes(unidade_id);

-- ============================================================================
-- Se você quiser conferir se a política de segurança da tabela `usuarios`
-- realmente bloqueava a leitura entre contas (a causa raiz descrita acima),
-- rode como um usuário RC comum (não administrador):
--
--   select id, nome, perfil, unidade_id from public.usuarios;
--
-- Se retornar só a própria linha do RC (ou nenhuma), a política confirma
-- o problema — e a correção acima resolve, pois deixou de depender disso.
-- ============================================================================
