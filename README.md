# VerOS Flow

Fluxo de pedidos de venda de sementes — **processo redesenhado para operar sem e-mail**.

Toda a esteira (Comercial/RC, UBS, Fiscal, Financeiro, Logística e Comercial ADM) acontece
dentro do sistema. A **única** comunicação que continua por e-mail é
**Logística → Transportadora**, porque a transportadora é uma parte externa e não acessa a
ferramenta — e mesmo essa etapa é gerada e registrada dentro do VerOS Flow.

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Aplicação completa (UI + regras de negócio + acesso ao Supabase) |
| `access-control.js` | Visibilidade de pedidos por perfil |
| `admin-editor.js` | Edição administrativa de qualquer etapa (Comercial ADM) |
| `kanban-screen-fix.js` | Correção de rolagem do Kanban |
| `veros_flow_schema_v2.sql` | **Migração do banco** — rode antes de publicar |

---

## Antes de publicar: rode a migração

1. Supabase → **SQL Editor** → **New query**
2. Cole o conteúdo de `veros_flow_schema_v2.sql` e execute
3. Confirme no **Table Editor** que as 9 tabelas novas apareceram

O script é **aditivo e idempotente**: não apaga, não renomeia e não altera a view
`vw_solicitacoes_completas`. A conexão existente continua funcionando durante e depois.

Depois da migração, cadastre pelo menos um usuário com o perfil **Fiscal**
(Cadastros → Usuários), senão a etapa de cadastro do cliente fica sem responsável.

---

## Perfis

| Perfil | Responsabilidade no fluxo |
|---|---|
| **RC · Comercial** | Registra o pedido, anexa documentação e aprova faturamento + cotação de frete |
| **UBS** | Consulta estoque, informa prazos, conclui tratamento e registra os lotes |
| **Fiscal** *(novo)* | Verifica/cria o cadastro e devolve o código do cliente |
| **Financeiro** | Analisa crédito e acompanha pagamento/renegociação |
| **Logística** | Cota frete, aciona a transportadora, controla carregamento e entrega |
| **Comercial ADM** | Imputa no SAP, fatura e vincula a NF aos lotes |
| **Administrador** | Acesso total, cadastros, auditoria e edição de qualquer etapa |

---

## O que substitui o e-mail e o WhatsApp

| Antes | Agora |
|---|---|
| Comunicar UBS por e-mail | Notificação automática ao registrar o pedido |
| Responder no WhatsApp sobre estoque | Consulta de estoque em 3 vias, publicada no pedido |
| **Envio obrigatório do e-mail com os lotes** | Aba **Lotes tratados** — entram sozinhos na NF |
| Responder no Wpp + código do cliente | Etapa Fiscal grava o código direto no pedido |
| Grupo do WhatsApp do Financeiro | Decisão + justificativa no pedido, com notificação ao RC |
| Encaminhar NF por e-mail | NF anexada ao pedido, com lotes vinculados |
| Validação de saída por WhatsApp | Registro de chegada → carregamento → liberação |
| **Logística → Transportadora** | **Continua por e-mail**, gerado e auditado pelo sistema |

---

## Telas novas

- **Minhas pendências** — fila de trabalho calculada por perfil: mostra exatamente qual pedido
  está parado esperando você e qual ação executar.
- **Notificações** — central com contador no menu e no sino da barra superior.
- **Transportadora** *(Logística e Administrador)* — três filas: prontos para acionar,
  aguardando resposta e liberação confirmada. O e-mail é montado com os dados do pedido;
  dá para copiar ou abrir no cliente de e-mail, e a resposta (placa, motorista, MDF-e, CT-e)
  fica registrada no histórico.
- **Mensagens do pedido** — conversa por área dentro de cada pedido, com anexo e notificação.

---

## Status do pedido

`Novo` → `Documentos pendentes` → `Consulta de estoque` → `Sem estoque` / `Em tratamento` →
`Aguardando cadastro` → `Aguardando crédito` → `Aguardando aprovação do RC` →
`Aguardando faturamento` → `Aguardando transportadora` → `Em carregamento` → `Faturado` →
`Em transporte` → `Entregue` → `Aguardando pagamento` → `Pago` / `Em renegociação`

Os status antigos continuam reconhecidos, para que pedidos criados antes da v2 não quebrem.

---

## Travas automáticas

- Pedido de **cliente novo** sem documentação anexada não chega à UBS.
- A **aprovação do RC** só habilita com estoque/tratamento, código do cliente, crédito e cotação prontos.
- O **e-mail à transportadora** só habilita depois do pedido imputado no SAP.
- A **NF** só habilita depois da aprovação do RC.
- A **liberação do caminhão** só habilita depois da NF emitida.
