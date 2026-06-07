-- Enables the app menu to create/edit events and add movements using the publishable key.
-- Warning: with these policies, anyone who can access the deployed app can write to these tables.
-- For private production use, replace anon policies with authenticated-only policies and add Supabase Auth.

grant insert, update on public.eventos to anon, authenticated;
grant insert, update on public.movimentos to anon, authenticated;

drop policy if exists "Escrita publica eventos insert" on public.eventos;
drop policy if exists "Escrita publica eventos update" on public.eventos;
drop policy if exists "Escrita publica movimentos insert" on public.movimentos;
drop policy if exists "Escrita publica movimentos update" on public.movimentos;

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
