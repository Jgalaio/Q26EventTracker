-- Optional support tables for CSV files exported from the original Excel workbook.
-- Import the matching CSV files from the Supabase Table Editor after creating these tables.

create table if not exists public.historico_excel (
  id bigserial primary key,
  data_hora date,
  utilizador text,
  folha text,
  celula text,
  valor_anterior text,
  novo_valor text,
  created_at timestamptz not null default now()
);

create table if not exists public.db_resumo_excel (
  id bigserial primary key,
  data_confecao date,
  despesas numeric(12,2),
  vendas numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.utilizadores_legacy (
  id bigserial primary key,
  utilizador text not null unique,
  permissao text,
  created_at timestamptz not null default now()
);

alter table public.historico_excel enable row level security;
alter table public.db_resumo_excel enable row level security;
alter table public.utilizadores_legacy enable row level security;
