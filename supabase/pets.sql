-- Fotos e documentos dos pets (foto, pedigree, documento de identidade do pet etc.).
-- Mesma regra do projeto: só o Worker acessa (chave de serviço), nunca o navegador direto.
insert into storage.buckets (id, name, public) values ('pets', 'pets', false) on conflict (id) do nothing;

-- Cadastro dos pets. Saiu do Firestore porque o plano gratuito tem limite diário de leituras (50 mil), e isso
-- já travou o sistema duas vezes. Aqui não há esse limite. Só o Worker acessa esta tabela (chave de serviço).
create table if not exists public.pets (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  species     text not null default 'Outro',
  breed       text not null default '',
  age         integer not null default 0,
  -- uid do Firebase do tutor; vazio = ainda sem dono vinculado (pets trazidos da agenda antiga, por exemplo).
  owner_id    text not null default '',
  -- Nome do tutor (texto solto, não é uma conta) — ajuda a equipe a achar quem vincular quando o cliente se cadastrar.
  tutor_hint  text not null default '',
  imported_from_agenda boolean not null default false,
  -- [{ id, label, content_type, uploaded_at }] — pedigree, documento de identidade, carteira de vacinação etc.
  documents   jsonb not null default '[]'::jsonb,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pets_owner_idx on public.pets (owner_id);
create index if not exists pets_name_idx on public.pets (lower(name));
drop trigger if exists pets_touch on public.pets;
create trigger pets_touch before update on public.pets for each row execute function public.touch_updated_at();
alter table public.pets enable row level security;
revoke all on public.pets from anon, authenticated;
