# VerOS Flow

Fluxo de pedidos de venda de sementes — **processo redesenhado para operar sem e-mail**.

**Escopo:** o fluxo começa no pedido **já emitido no Mobi**. Cadastro do cliente e validações
fiscais acontecem lá — o VerOS Flow cuida do que vem depois da emissão.

Toda a esteira (Comercial/RC, UBS, Financeiro, Logística e Operações de Negócio) acontece
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
| `veros_flow_ajuste_remocao_aprovacao_rc.sql` | Rode só se você já tinha pedidos parados em "Aguardando aprovação do RC" |
| `veros_flow_notificacoes_unidade.sql` | **Rode antes de publicar** — corrige a notificação da UBS |

---

## Antes de publicar: rode a migração

1. Supabase → **SQL Editor** → **New query**
2. Cole o conteúdo de `veros_flow_schema_v2.sql` e execute
3. Confirme no **Table Editor** que as 7 tabelas novas apareceram

O script é **aditivo e idempotente**: não apaga, não renomeia e não altera a view
`vw_solicitacoes_completas`. A conexão existente continua funcionando durante e depois.

---

## Perfis

| Perfil | Responsabilidade no fluxo |
|---|---|
| **RC · Comercial** | Traz o pedido do Mobi e reencaminha para outra unidade se faltar estoque |
| **UBS** | Consulta estoque, informa prazos, conclui tratamento, registra os lotes e controla o carregamento do caminhão (chegada, carregamento e liberação) |
| **Financeiro** | Analisa crédito e conduz o pós-venda (pagamento e renegociação) |
| **Logística** | Cota e contrata frete, aciona a transportadora e informa a entrega ao cliente |
| **Operações de Negócio** | Imputa no SAP, fatura e vincula a NF aos lotes |
| **Administrador** | Acesso total, cadastros, auditoria e edição de qualquer etapa |

> A UBS controla o carregamento porque é quem está fisicamente na planta recebendo e liberando o
> caminhão. A Logística permanece dona da cotação, contratação, contato com a transportadora e do
> aviso de entrega — mas não do pátio.

---

## O que substitui o e-mail e o WhatsApp

| Antes | Agora |
|---|---|
| Comunicar UBS por e-mail | Notificação automática ao registrar o pedido |
| Responder no WhatsApp sobre estoque | Consulta de estoque em 3 vias, publicada no pedido |
| **Envio obrigatório do e-mail com os lotes** | Aba **Lotes tratados** — entram sozinhos na NF |
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

`Novo` → `Consulta de estoque` → `Sem estoque` / `Em tratamento` →
`Aguardando crédito` → `Aguardando faturamento` → `Aguardando transportadora` → `Em carregamento` → `Faturado` →
`Em transporte` → `Finalizado` → `Pago` / `Em renegociação`

Não existe mais etapa de aprovação do RC entre o crédito e o faturamento: assim que o crédito é
aprovado (e o estoque está pronto), SAP e frete seguem **em paralelo** — Operações de Negócio já pode
imputar no SAP e a Logística já pode contratar o frete, sem esperar um pelo outro.

Se a UBS responde **sem estoque**, o pedido não é encerrado: ele volta para o RC escolher outra
unidade. A consulta de estoque é reaberta do zero na unidade nova.

Ao confirmar a entrega, o pedido é dado como **finalizado** e passa ao **pós-venda**, onde só
resta o acompanhamento do pagamento.

Os status antigos continuam reconhecidos, para que pedidos criados antes da v2 não quebrem.

---

## Notificações por unidade (UBS)

A UBS é o único perfil dividido por unidade — pode existir mais de um usuário ADM_UBS, um por
planta (Buritis, Formosa, etc.).

**Importante sobre como isso funciona:** a notificação da UBS **não** é resolvida procurando, no
navegador de quem cria o pedido, quais usuários pertencem àquela unidade — isso exigiria ler o
cadastro de outras contas na tabela `usuarios`, o que normalmente é bloqueado pela política de
segurança do banco (RLS) para qualquer perfil que não seja administrador. Se essa leitura falhar
em silêncio, a notificação nunca é criada — foi exatamente esse o bug relatado.

Em vez disso, a notificação é marcada com `destino_perfil='ADM_UBS'` **+** a unidade do pedido
(`unidade_id`). Cada usuário UBS, ao carregar suas notificações, filtra usando a **própria**
unidade — informação que ele sempre pode ler, porque é o cadastro dele mesmo. Ninguém precisa
enxergar o cadastro de mais ninguém.

Se um usuário UBS ainda assim relatar que não recebe notificação de pedidos da própria unidade,
confira em **Cadastros → Usuários** se a unidade dele está preenchida corretamente.

---

## Travas automáticas

- **Sem estoque** não encerra o pedido: o RC pode reencaminhá-lo para outra unidade, que reabre a consulta de estoque do zero.
- A **contratação do frete** e a **imputação no SAP** só habilitam com o crédito aprovado (e o estoque pronto) — em paralelo, sem depender uma da outra.
- O **e-mail à transportadora** só habilita depois do frete **contratado** (não mais do SAP).
- A **NF** só habilita depois do pedido imputado no SAP.
- A **liberação do caminhão** só habilita depois da NF emitida.
- O **pagamento** só habilita depois da entrega e é ação exclusiva do Financeiro e do Administrador.
