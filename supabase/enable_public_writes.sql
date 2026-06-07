-- Enables the app menu to create/edit events and add/edit/delete movements using the publishable key.
-- Warning: with these policies, anyone who can access the deployed app can write to these tables.
-- For private production use, replace anon policies with authenticated-only policies and add Supabase Auth.

alter table public.eventos
add column if not exists isento boolean not null default false;

update public.eventos
set isento = isento or lower(coalesce(isento_texto, '')) = 'sim';

update public.eventos
set isento_texto = case when isento then 'Sim' else 'Não' end;

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

grant insert, update on public.eventos to anon, authenticated;
grant insert, update, delete on public.movimentos to anon, authenticated;
grant select on public.eventos_resumo to anon, authenticated;

drop policy if exists "Escrita publica eventos insert" on public.eventos;
drop policy if exists "Escrita publica eventos update" on public.eventos;
drop policy if exists "Escrita publica movimentos insert" on public.movimentos;
drop policy if exists "Escrita publica movimentos update" on public.movimentos;
drop policy if exists "Escrita publica movimentos delete" on public.movimentos;

create policy "Escrita publica eventos insert"
on public.eventos for insert
to anon, authenticated
with check (true);

create policy "Escrita publica eventos update"
on public.eventos for update
to anon, authenticated
using (true)
with check (true);

create policy "Escrita publica movimentos insert"
on public.movimentos for insert
to anon, authenticated
with check (true);

create policy "Escrita publica movimentos update"
on public.movimentos for update
to anon, authenticated
using (true)
with check (true);

create policy "Escrita publica movimentos delete"
on public.movimentos for delete
to anon, authenticated
using (true);
