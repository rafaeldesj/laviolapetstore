-- Cadastro de usuários (quem loga: cliente, equipe, contador). Saiu do Firestore pelo mesmo motivo de produtos,
-- agenda e pets: o plano gratuito tem limite diário de leituras, e esta é a tabela MAIS lida de todas (o Worker
-- confere o cargo em praticamente toda chamada). Só o Worker acessa (chave de serviço) — nunca o navegador direto.
-- O id é sempre o uid do Firebase Authentication (o login em si continua no Firebase Auth, só o PERFIL mudou de lugar).
create table if not exists public.profiles (
  id          text primary key,
  email       text not null default '',
  full_name   text not null default '',
  username    text,
  phone       text,
  role        text not null default 'client',
  collaborator_category_id text,
  collaborator_specialty   text not null default '',
  is_active   boolean not null default true,
  -- A senha foi definida por outra pessoa (equipe criando a conta): força trocar no primeiro login.
  must_change_password boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists profiles_phone_idx on public.profiles (phone);
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
