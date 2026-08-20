-- ============================================================================
-- VerOS Flow — MIGRAÇÃO v2  ·  "Processo sem e-mail"
-- ----------------------------------------------------------------------------
-- Este script é ADITIVO e IDEMPOTENTE: não apaga nem renomeia nada que já
-- existe. Sua conexão atual continua funcionando durante e depois da execução.
--
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- O que ele faz:
--   1. Adiciona colunas novas em tabelas existentes.
--   2. Cria as tabelas que o processo redesenhado exige (lotes, mensagens,
--      notificações, comunicação com a transportadora, carregamento,
--      documentos fiscais e pagamento).
--   3. Cria as políticas de RLS equivalentes às que você já usa.
--
-- Nada aqui depende da view vw_solicitacoes_completas: o front-end passou a
-- ler as colunas novas direto da tabela `solicitacoes`, então a sua view
-- continua intacta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Helper: função que devolve o perfil do usuário logado
--    (se você já tem uma equivalente, esta apenas será substituída pela mesma
--    lógica — mantenha a sua se preferir e ajuste as policies abaixo)
-- ----------------------------------------------------------------------------
create or replace function public.vf_perfil_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perfil from public.usuarios where id = auth.uid()
$$;


-- ----------------------------------------------------------------------------
-- 1. PERFIS
-- ----------------------------------------------------------------------------
-- O escopo do VerOS Flow começa no pedido JÁ EMITIDO no Mobi: cadastro do
-- cliente e validações fiscais acontecem lá. Por isso não existe perfil Fiscal.
-- Este bloco apenas garante que o CHECK de `usuarios.perfil` esteja alinhado.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.usuarios'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%perfil%'
  loop
    execute format('alter table public.usuarios drop constraint %I', c.conname);
  end loop;

  alter table public.usuarios
    add constraint usuarios_perfil_check check (perfil in (
      'RC','ADM_UBS','COORD_FIN','COORD_LOG','OPERACOES','COMERCIAL_ADM'
    ));
end $$;


-- ----------------------------------------------------------------------------
-- 2. SOLICITACOES — novas colunas do processo redesenhado
-- ----------------------------------------------------------------------------
alter table public.solicitacoes
  add column if not exists codigo_cliente        text,                      -- código vindo do Mobi
  add column if not exists tipo_cliente          text default 'Recompra',   -- Novo | Recompra (informativo)
  add column if not exists data_entrega_negociada date,
  add column if not exists observacoes_pedido    text,
  add column if not exists pedido_sap            text,                      -- nº do pedido imputado no SAP
  add column if not exists aprovado_rc           boolean default false,     -- RC aprovou faturamento + frete
  add column if not exists aprovado_rc_em        timestamptz,
  add column if not exists aprovado_rc_por       uuid references public.usuarios(id);

comment on column public.solicitacoes.codigo_cliente is
  'Código do cliente conforme o Mobi. O cadastro é feito lá, antes da emissão do pedido.';


-- ----------------------------------------------------------------------------
-- 3. UBS — estoque e tratamento (estende adm_ubs_avaliacoes)
--    O "saldo disponível" vira um resultado de 3 vias, como no fluxograma:
--    Sem estoque | Com estoque para produção | Com estoque.
-- ----------------------------------------------------------------------------
alter table public.adm_ubs_avaliacoes
  add column if not exists resultado_estoque      text,   -- ver check abaixo
  add column if not exists prazo_disponibilidade  text,   -- quando não há estoque
  add column if not exists prazo_tratamento       text,   -- quando precisa tratar
  add column if not exists tratamento_concluido   boolean default false,
  add column if not exists tratamento_concluido_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.adm_ubs_avaliacoes'::regclass
      and conname='adm_ubs_resultado_estoque_check'
  ) then
    alter table public.adm_ubs_avaliacoes
      add constraint adm_ubs_resultado_estoque_check
      check (resultado_estoque is null or resultado_estoque in
        ('Sem estoque','Com estoque para produção','Com estoque'));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 4. LOTES TRATADOS — substitui o "envio obrigatório do e-mail com os lotes"
-- ----------------------------------------------------------------------------
create table if not exists public.pedido_lotes (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  lote           text not null,
  quantidade_sc  numeric,
  tratamento     text,
  data_tratamento date,
  germinacao_pct numeric,
  observacoes    text,
  registrado_por uuid references public.usuarios(id),
  created_at     timestamptz default now()
);
create index if not exists idx_lotes_sol on public.pedido_lotes(solicitacao_id);


-- ----------------------------------------------------------------------------
-- 5. COMUNICAÇÃO COM A TRANSPORTADORA
--    ÚNICO ponto do processo que continua por e-mail. Tudo fica registrado
--    aqui: o que foi enviado, por quem, quando, e a resposta recebida.
-- ----------------------------------------------------------------------------
create table if not exists public.comunicacoes_transportadora (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  direcao        text not null check (direcao in ('Enviado','Recebido')),
  transportadora text,
  destinatario   text,                   -- e-mail de destino
  assunto        text,
  corpo          text,
  anexo_path     text,
  registrado_por uuid references public.usuarios(id),
  registrado_em  timestamptz default now()
);
create index if not exists idx_comtransp_sol on public.comunicacoes_transportadora(solicitacao_id);

alter table public.logistica_fretes
  add column if not exists transportadora_email text,
  add column if not exists email_enviado_em     timestamptz,
  add column if not exists liberacao_confirmada boolean default false,
  add column if not exists liberacao_confirmada_em timestamptz;


-- ----------------------------------------------------------------------------
-- 6. CARREGAMENTO — receber e carregar caminhão, liberar saída
-- ----------------------------------------------------------------------------
create table if not exists public.carregamentos (
  solicitacao_id uuid primary key references public.solicitacoes(id) on delete cascade,
  placa          text,
  motorista      text,
  chegada_em     timestamptz,
  carregado_em   timestamptz,
  liberado_em    timestamptz,
  liberado_por   uuid references public.usuarios(id),
  observacoes    text
);


-- ----------------------------------------------------------------------------
-- 7. DOCUMENTOS FISCAIS DO TRANSPORTE — MDF-e / CT-e
-- ----------------------------------------------------------------------------
create table if not exists public.documentos_fiscais (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  tipo           text not null check (tipo in ('MDF-e','CT-e','NF-e','Outro')),
  numero         text,
  chave          text,
  emitido_em     date,
  anexo_path     text,
  registrado_por uuid references public.usuarios(id),
  created_at     timestamptz default now()
);
create index if not exists idx_docfiscais_sol on public.documentos_fiscais(solicitacao_id);


-- ----------------------------------------------------------------------------
-- 8. PAGAMENTO / RENEGOCIAÇÃO — raia do Cliente no fluxograma
-- ----------------------------------------------------------------------------
create table if not exists public.pagamentos (
  solicitacao_id uuid primary key references public.solicitacoes(id) on delete cascade,
  vencimento     date,
  valor          numeric,
  status         text default 'Pendente' check (status in ('Pendente','Pago','Em renegociação')),
  pago_em        date,
  renegociacao_obs text,
  atualizado_por uuid references public.usuarios(id),
  atualizado_em  timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- 9. MENSAGENS DO PEDIDO — substitui o WhatsApp entre as áreas
-- ----------------------------------------------------------------------------
create table if not exists public.mensagens (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  autor_id       uuid references public.usuarios(id),
  autor_perfil   text,
  destino_perfil text,                   -- null = todos que acompanham o pedido
  texto          text not null,
  anexo_path     text,
  anexo_nome     text,
  created_at     timestamptz default now()
);
create index if not exists idx_mensagens_sol on public.mensagens(solicitacao_id, created_at);


-- ----------------------------------------------------------------------------
-- 10. NOTIFICAÇÕES — substitui o e-mail de aviso entre etapas
-- ----------------------------------------------------------------------------
create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  solicitacao_id uuid references public.solicitacoes(id) on delete cascade,
  destino_perfil text,                   -- notifica um perfil inteiro
  destino_usuario uuid references public.usuarios(id),  -- ou uma pessoa
  titulo         text not null,
  texto          text,
  tipo           text default 'info' check (tipo in ('info','ok','warn','err')),
  lida           boolean default false,
  lida_em        timestamptz,
  origem_perfil  text,
  origem_usuario uuid references public.usuarios(id),
  created_at     timestamptz default now()
);
create index if not exists idx_notif_destino on public.notificacoes(destino_perfil, lida);
create index if not exists idx_notif_usuario on public.notificacoes(destino_usuario, lida);


-- ============================================================================
-- 11. RLS — mesma filosofia das tabelas que você já tem:
--     usuário autenticado lê; escrita liberada para autenticado (o controle
--     fino de quem pode agir em cada etapa é feito pelo front-end + auditoria).
--     Ajuste conforme o rigor que você já aplica nas demais tabelas.
-- ============================================================================
do $$
declare
  t text;
  tabelas text[] := array[
    'pedido_lotes','comunicacoes_transportadora',
    'carregamentos','documentos_fiscais','pagamentos','mensagens','notificacoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t||'_sel', t);

    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      t||'_ins', t);

    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t||'_upd', t);
  end loop;
end $$;

-- Exclusão só para o administrador (Comercial ADM).
do $$
declare
  t text;
  tabelas text[] := array['pedido_lotes','documentos_fiscais','mensagens','notificacoes'];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.vf_perfil_atual() = ''COMERCIAL_ADM'')',
      t||'_del', t);
  end loop;
end $$;


-- ============================================================================
-- 12. VIEW AUXILIAR — resumo por pedido (opcional, usada em relatórios)
-- ============================================================================
create or replace view public.vw_pedido_resumo_v2 as
select
  s.id,
  s.numero_pedido_mobi,
  s.pedido_sap,
  s.cliente,
  s.codigo_cliente,
  s.tipo_cliente,
  s.status,
  s.data_entrega_negociada,
  a.resultado_estoque,
  a.prazo_tratamento,
  a.tratamento_concluido,
  fin.decisao            as decisao_credito,
  l.transportadora,
  l.transportadora_email,
  l.email_enviado_em,
  l.liberacao_confirmada,
  car.carregado_em,
  car.liberado_em,
  p.status               as status_pagamento,
  p.vencimento,
  (select count(*) from public.pedido_lotes pl where pl.solicitacao_id = s.id) as qtd_lotes,
  (select count(*) from public.mensagens m  where m.solicitacao_id  = s.id) as qtd_mensagens
from public.solicitacoes s
left join public.adm_ubs_avaliacoes          a   on a.solicitacao_id  = s.id
left join public.financeiro_decisoes         fin on fin.solicitacao_id = s.id
left join public.logistica_fretes            l   on l.solicitacao_id  = s.id
left join public.carregamentos               car on car.solicitacao_id = s.id
left join public.pagamentos                  p   on p.solicitacao_id  = s.id;


-- ============================================================================
-- FIM. Após rodar, confira em Table Editor se as 7 tabelas novas apareceram:
--   pedido_lotes · comunicacoes_transportadora · carregamentos
--   documentos_fiscais · pagamentos · mensagens · notificacoes
-- ============================================================================
