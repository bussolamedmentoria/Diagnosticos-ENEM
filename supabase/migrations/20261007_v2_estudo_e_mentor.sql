-- v2: tempo por questão, caderno de erros, revisão espaçada e painel do mentor

-- e-mail no perfil (facilita o painel e a exportação)
alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

-- tempo gasto em cada resposta e nova origem "revisao"
alter table public.answers add column if not exists seconds integer check (seconds is null or seconds between 0 and 7200);
alter table public.answers drop constraint if exists answers_source_check;
alter table public.answers add constraint answers_source_check check (source in ('diag', 'banco', 'treino', 'simulado', 'revisao'));

-- motivo de cada erro (caderno de erros)
create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid text not null,
  source text,
  motivo text not null check (motivo in ('padrao', 'conteudo', 'conta', 'atencao', 'chute')),
  created_at timestamptz not null default now()
);
create index if not exists error_log_user_idx on public.error_log (user_id);
alter table public.error_log enable row level security;
create policy "erros: ler os próprios" on public.error_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "erros: registrar os próprios" on public.error_log for insert to authenticated with check ((select auth.uid()) = user_id);

-- mentores (por e-mail da conta)
create table if not exists public.admins (email text primary key check (email = lower(email)));
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "mentor: ler perfis" on public.profiles for select to authenticated using ((select public.is_admin()));
create policy "mentor: ler progresso" on public.progress for select to authenticated using ((select public.is_admin()));
create policy "mentor: ler respostas" on public.answers for select to authenticated using ((select public.is_admin()));
create policy "mentor: ler erros" on public.error_log for select to authenticated using ((select public.is_admin()));

-- agregados para o painel (rodam no banco; só mentores)
create or replace function public.mentor_students()
returns table (id uuid, nome text, email text, whatsapp text, cidade text, uf text, escolaridade text, curso text,
               aceite_contato boolean, origem text, cadastro timestamptz, trilha text, diag_score smallint, pct smallint,
               ultima timestamptz, respostas_7d bigint, minutos_7d numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  return query
  select p.id, p.nome, coalesce(p.email, u.email)::text, p.whatsapp, p.cidade, p.uf, p.escolaridade, p.curso,
         p.aceite_contato, p.origem, p.created_at, g.trilha, g.diag_score, g.pct,
         greatest(g.updated_at, (select max(a.created_at) from public.answers a where a.user_id = p.id)),
         (select count(*) from public.answers a where a.user_id = p.id and a.created_at > now() - interval '7 days'),
         round(coalesce((select sum(a.seconds) from public.answers a where a.user_id = p.id and a.created_at > now() - interval '7 days'), 0) / 60.0, 0)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.progress g on g.user_id = p.id
  order by p.created_at desc;
end $$;

create or replace function public.mentor_questions()
returns table (qid text, n bigint, erros bigint, seg_medio numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  return query
  select a.qid, count(*), count(*) filter (where not coalesce(a.correct, false) or a.doubt), round(avg(a.seconds), 0)
  from public.answers a where a.source <> 'revisao' group by a.qid;
end $$;

create or replace function public.mentor_motivos()
returns table (motivo text, n bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'acesso restrito'; end if;
  return query select e.motivo, count(*) from public.error_log e group by e.motivo order by 2 desc;
end $$;

revoke execute on function public.mentor_students(), public.mentor_questions(), public.mentor_motivos() from public, anon;
grant execute on function public.mentor_students(), public.mentor_questions(), public.mentor_motivos() to authenticated;

-- mentor vinculado à conta: o e-mail só vale para a primeira conta criada com ele
alter table public.admins add column if not exists user_id uuid references auth.users(id) on delete set null;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins a
  where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (a.user_id is null or a.user_id = auth.uid())) $$;
create or replace function public.bind_admin_on_signup()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  update public.admins set user_id = new.id where email = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger bind_admin_on_signup after insert on auth.users for each row execute function public.bind_admin_on_signup();
