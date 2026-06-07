-- Tesouraria Q26 - Supabase schema
-- Run this first in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'movimento_tipo') then
    create type public.movimento_tipo as enum ('entrada', 'saida', 'a_pagamento');
  end if;
end $$;

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  folha_excel text not null unique,
  ordem_folha integer not null,
  data_texto text,
  data_inicio date,
  data_fim date,
  isento boolean not null default false,
  isento_texto text,
  tipo text not null check (tipo in ('evento', 'categoria')),
  created_at timestamptz not null default now()
);

alter table public.eventos
add column if not exists isento boolean not null default false;

create table if not exists public.movimentos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  tipo public.movimento_tipo not null,
  item text not null,
  data_pagamento date,
  montante numeric(12,2),
  numero_fatura text,
  fatura_com_nif boolean,
  tipo_pagamento text,
  pago boolean,
  origem_tabela text not null,
  origem_linha integer not null,
  formula_montante text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (evento_id, tipo, origem_tabela, origem_linha)
);

create index if not exists movimentos_evento_id_idx on public.movimentos(evento_id);
create index if not exists movimentos_tipo_idx on public.movimentos(tipo);
create index if not exists movimentos_data_pagamento_idx on public.movimentos(data_pagamento);

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

create or replace view public.movimentos_detalhe as
select
  m.id,
  e.slug as evento_slug,
  e.nome as evento_nome,
  e.tipo as evento_tipo,
  e.data_inicio as evento_data_inicio,
  m.tipo,
  m.item,
  m.data_pagamento,
  m.montante,
  m.numero_fatura,
  m.fatura_com_nif,
  m.tipo_pagamento,
  m.pago,
  m.origem_tabela,
  m.origem_linha,
  m.formula_montante,
  m.raw,
  m.created_at
from public.movimentos m
join public.eventos e on e.id = m.evento_id;

alter view public.eventos_resumo set (security_invoker = true);
alter view public.movimentos_detalhe set (security_invoker = true);

alter table public.eventos enable row level security;
alter table public.movimentos enable row level security;

drop policy if exists "Leitura publica eventos" on public.eventos;
drop policy if exists "Leitura publica movimentos" on public.movimentos;

create policy "Leitura publica eventos"
on public.eventos for select
to anon, authenticated
using (true);

create policy "Leitura publica movimentos"
on public.movimentos for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select on public.eventos to anon, authenticated;
grant select on public.movimentos to anon, authenticated;
grant select on public.eventos_resumo to anon, authenticated;
grant select on public.movimentos_detalhe to anon, authenticated;
