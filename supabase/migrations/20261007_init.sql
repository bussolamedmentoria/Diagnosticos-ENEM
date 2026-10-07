-- Natureza 40+ · esquema inicial
-- Perfis (dados de cadastro), progresso (estado da trilha), respostas (análises), uso e cache da IA.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  whatsapp text check (whatsapp is null or char_length(whatsapp) between 8 and 20),
  cidade text,
  uf text check (uf is null or char_length(uf) = 2),
  escolaridade text,
  curso text,
  fez_enem boolean,
  aceite_termos boolean not null default false,
  aceite_contato boolean not null default false,
  origem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  trilha text,
  diag_score smallint,
  pct smallint,
  updated_at timestamptz not null default now()
);

create table public.answers (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  qid text not null,
  source text not null check (source in ('diag', 'banco', 'treino', 'simulado')),
  letter text check (letter is null or letter in ('A','B','C','D','E')),
  correct boolean,
  doubt boolean not null default false,
  created_at timestamptz not null default now()
);
create index answers_user_idx on public.answers (user_id);
create index answers_qid_idx on public.answers (qid);

-- Usada só pela função de IA (service role): limite diário por aluno
create table public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  n integer not null default 0,
  primary key (user_id, day)
);

-- Cache de explicações de questões, compartilhado entre alunos (escrito só pela função)
create table public.ai_cache (
  key text primary key,
  text text not null,
  model text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.answers enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_cache enable row level security;

create policy "perfil: ler o próprio" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "perfil: criar o próprio" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "perfil: editar o próprio" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "progresso: ler o próprio" on public.progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "progresso: criar o próprio" on public.progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progresso: editar o próprio" on public.progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "respostas: ler as próprias" on public.answers for select to authenticated using ((select auth.uid()) = user_id);
create policy "respostas: registrar as próprias" on public.answers for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "uso de IA: ver o próprio" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- Incremento atômico do uso (chamado pela função com service role)
create or replace function public.ai_bump(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v integer;
begin
  insert into public.ai_usage (user_id, day, n)
  values (p_user, (now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1
  returning n into v;
  return v;
end $$;
revoke execute on function public.ai_bump(uuid, integer) from public, anon, authenticated;

-- Painel de leads para o dono (schema fora da API pública)
create schema if not exists admin;
revoke all on schema admin from anon, authenticated;
create or replace view admin.leads as
select p.id, p.nome, u.email, p.whatsapp, p.cidade, p.uf, p.escolaridade, p.curso, p.fez_enem,
       p.aceite_contato, p.origem, p.created_at as cadastro_em,
       g.trilha, g.diag_score, g.pct as progresso_pct, g.updated_at as ultima_atividade
from public.profiles p
join auth.users u on u.id = p.id
left join public.progress g on g.user_id = p.id;
