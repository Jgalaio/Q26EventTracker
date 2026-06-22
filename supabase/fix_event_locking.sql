-- Correção para a funcionalidade "Fechar evento".
-- Corre este ficheiro no Supabase SQL Editor se a página Admin mostrar:
-- column eventos_resumo.fechado does not exist

alter table public.eventos
add column if not exists fechado boolean not null default false;

drop view if exists public.eventos_resumo;

create view public.eventos_resumo as
select
  e.id,
  e.slug,
  e.nome,
  e.folha_excel,
  e.ordem_folha,
  e.data_texto,
  e.data_inicio,
  e.data_fim,
  e.isento,
  e.isento_texto,
  e.contabilizar_totais,
  e.cor,
  e.fechado,
  e.tipo,
  coalesce(sum(m.montante) filter (where m.tipo = 'entrada'), 0)::numeric(12,2) as total_entradas,
  coalesce(sum(m.montante) filter (where m.tipo = 'saida'), 0)::numeric(12,2) as total_saidas,
  coalesce(sum(m.montante) filter (where m.tipo = 'a_pagamento'), 0)::numeric(12,2) as total_a_pagamento,
  (
    coalesce(sum(m.montante) filter (where m.tipo = 'entrada'), 0)
    - coalesce(sum(m.montante) filter (where m.tipo = 'saida'), 0)
  )::numeric(12,2) as saldo,
  count(m.id)::integer as total_movimentos
from public.eventos e
left join public.movimentos m on m.evento_id = e.id
group by e.id;

alter view public.eventos_resumo set (security_invoker = true);

grant select on public.eventos_resumo to anon, authenticated;
