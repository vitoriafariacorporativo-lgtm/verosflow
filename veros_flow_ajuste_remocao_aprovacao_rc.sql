-- ============================================================================
-- VerOS Flow — AJUSTE: remoção da etapa "Aprovação do RC"
-- ----------------------------------------------------------------------------
-- A partir desta versão, o crédito aprovado libera SAP e frete em paralelo —
-- não existe mais uma etapa intermediária de aprovação do RC entre eles.
--
-- Rode este script SÓ SE você já tem pedidos parados em
-- 'Aguardando aprovação do RC' ou 'Aguardando frete' (status que deixaram de
-- existir). Ele apenas recalcula o status desses pedidos para o valor
-- correto do novo fluxo — não apaga nada e não mexe em pedidos que já
-- estão em outros status.
-- ============================================================================

update public.solicitacoes s
set status = case
  when exists (
    select 1 from public.logistica_fretes l
    where l.solicitacao_id = s.id and l.email_enviado_em is not null
  ) then 'Aguardando transportadora'
  else 'Aguardando faturamento'
end
where s.status in ('Aguardando aprovação do RC', 'Aguardando frete');

-- Confira quantos pedidos foram ajustados:
-- select status, count(*) from public.solicitacoes group by status order by 1;
