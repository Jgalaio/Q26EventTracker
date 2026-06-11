-- Enables the app menu to create/edit/delete events and add/edit/delete movements using the publishable key.
-- Warning: with these policies, anyone who can access the deployed app can write to these tables.
-- For private production use, replace anon policies with authenticated-only policies and add Supabase Auth.

create extension if not exists pgcrypto;

alter table public.eventos
add column if not exists isento boolean not null default false;

alter table public.eventos
add column if not exists contabilizar_totais boolean not null default true;

alter table public.movimentos
add column if not exists descricao text;

alter table public.movimentos
add column if not exists contabilizar_totais boolean not null default true;

update public.eventos
set isento = isento or lower(coalesce(isento_texto, '')) = 'sim';

update public.eventos
set isento_texto = case when isento then 'Sim' else 'Não' end;

update public.eventos
set contabilizar_totais = false
where slug = 'decoracao';

create table if not exists public.app_users (
  username text primary key,
  role text not null check (role in ('admin', 'operator', 'view')),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null,
  role text not null check (role in ('admin', 'operator', 'view')),
  action text not null,
  resource text not null,
  resource_id text,
  summary text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists app_audit_logs_created_at_idx on public.app_audit_logs(created_at desc);
create index if not exists app_audit_logs_resource_idx on public.app_audit_logs(resource, resource_id);

create table if not exists public.faturas_relatorios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null,
  evento_id uuid references public.eventos(id) on delete set null,
  evento_slug text not null,
  evento_nome text not null,
  valor_fatura numeric(12,2) not null default 0,
  total_despesas numeric(12,2) not null default 0,
  total_itens_acrescentados numeric(12,2) not null default 0,
  total_faturado numeric(12,2) not null default 0,
  diferenca numeric(12,2) not null default 0,
  movimentos_ids uuid[] not null default '{}'::uuid[],
  payload jsonb not null default '{}'::jsonb
);

create index if not exists faturas_relatorios_created_at_idx on public.faturas_relatorios(created_at desc);
create index if not exists faturas_relatorios_evento_slug_idx on public.faturas_relatorios(evento_slug);

insert into public.app_users (username, role, password_hash)
values
  ('J.Galaio', 'admin', '325cb2800043914c9e9d09f6006aff8c90b55eeb4928d13aa4a3385003bcea26'),
  ('A.Lopes', 'admin', 'b5b1ad0508150fece4e94ce08996eef647319ded8abb712c8c6b63c51f745825'),
  ('M.Amendoeira', 'operator', 'b78ecebe0a0c3e78c06b12ff45018eef3cab88c0119531d72d4b362c612b9303'),
  ('Q26', 'view', 'a6c71bf69ece63be7e9fec6791203c7a1d444a8b32303bc1147b326772b62993')
on conflict (username) do nothing;

create or replace function public.app_verify_login(p_username text, p_password text)
returns table (username text, role text, password_valid boolean, has_override boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
begin
  select *
  into v_user
  from public.app_users
  where public.app_users.username = btrim(p_username);

  if found then
    return query
    select
      v_user.username,
      v_user.role,
      v_user.password_hash = encode(digest(v_user.username || ':' || p_password, 'sha256'), 'hex'),
      true;
    return;
  end if;

  return query select btrim(p_username), null::text, false, false;
end;
$$;

create or replace function public.app_change_password(p_username text, p_current_password text, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
begin
  if length(p_new_password) < 6 then
    return false;
  end if;

  select *
  into v_user
  from public.app_users
  where public.app_users.username = btrim(p_username);

  if not found then
    return false;
  end if;

  if v_user.password_hash <> encode(digest(v_user.username || ':' || p_current_password, 'sha256'), 'hex') then
    return false;
  end if;

  update public.app_users
  set password_hash = encode(digest(v_user.username || ':' || p_new_password, 'sha256'), 'hex'),
      updated_at = now()
  where public.app_users.username = v_user.username;

  return true;
end;
$$;

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

drop view if exists public.movimentos_detalhe;

create view public.movimentos_detalhe as
select
  m.id,
  e.slug as evento_slug,
  e.nome as evento_nome,
  e.tipo as evento_tipo,
  e.data_inicio as evento_data_inicio,
  m.tipo,
  m.item,
  m.descricao,
  m.data_pagamento,
  m.montante,
  m.numero_fatura,
  m.fatura_com_nif,
  m.tipo_pagamento,
  m.pago,
  m.contabilizar_totais,
  m.origem_tabela,
  m.origem_linha,
  m.formula_montante,
  m.raw,
  m.created_at
from public.movimentos m
join public.eventos e on e.id = m.evento_id;

alter view public.eventos_resumo set (security_invoker = true);
alter view public.movimentos_detalhe set (security_invoker = true);

grant insert, update on public.eventos to anon, authenticated;
grant delete on public.eventos to anon, authenticated;
grant insert, update, delete on public.movimentos to anon, authenticated;
grant select on public.eventos_resumo to anon, authenticated;
grant select on public.movimentos_detalhe to anon, authenticated;
grant select, insert on public.faturas_relatorios to anon, authenticated;
revoke all on public.app_users from anon, authenticated;
grant select, insert, update, delete on public.app_settings to anon, authenticated;
grant select, insert on public.app_audit_logs to anon, authenticated;
grant execute on function public.app_verify_login(text, text) to anon, authenticated;
grant execute on function public.app_change_password(text, text, text) to anon, authenticated;

drop policy if exists "Escrita publica eventos insert" on public.eventos;
drop policy if exists "Escrita publica eventos update" on public.eventos;
drop policy if exists "Escrita publica eventos delete" on public.eventos;
drop policy if exists "Escrita publica movimentos insert" on public.movimentos;
drop policy if exists "Escrita publica movimentos update" on public.movimentos;
drop policy if exists "Escrita publica movimentos delete" on public.movimentos;
drop policy if exists "Escrita publica app users" on public.app_users;
drop policy if exists "Escrita publica app settings" on public.app_settings;
drop policy if exists "Escrita publica app audit logs" on public.app_audit_logs;
drop policy if exists "Escrita publica faturas relatorios insert" on public.faturas_relatorios;
drop policy if exists "Leitura publica app users" on public.app_users;
drop policy if exists "Leitura publica app settings" on public.app_settings;
drop policy if exists "Leitura publica app audit logs" on public.app_audit_logs;
drop policy if exists "Leitura publica faturas relatorios" on public.faturas_relatorios;

create policy "Escrita publica eventos insert"
on public.eventos for insert
to anon, authenticated
with check (true);

create policy "Escrita publica eventos update"
on public.eventos for update
to anon, authenticated
using (true)
with check (true);

create policy "Escrita publica eventos delete"
on public.eventos for delete
to anon, authenticated
using (true);

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

alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_audit_logs enable row level security;
alter table public.faturas_relatorios enable row level security;

create policy "Leitura publica app settings"
on public.app_settings for select
to anon, authenticated
using (true);

create policy "Escrita publica app settings"
on public.app_settings for all
to anon, authenticated
using (true)
with check (true);

create policy "Leitura publica app audit logs"
on public.app_audit_logs for select
to anon, authenticated
using (true);

create policy "Leitura publica faturas relatorios"
on public.faturas_relatorios for select
to anon, authenticated
using (true);

create policy "Escrita publica app audit logs"
on public.app_audit_logs for insert
to anon, authenticated
with check (true);

create policy "Escrita publica faturas relatorios insert"
on public.faturas_relatorios for insert
to anon, authenticated
with check (true);
