-- Assinaturas recorrentes do Clubinho (banho e tosa semanal/quinzenal), pra substituir a planilha separada que o
-- proprietário mantinha à parte da agenda. Só o Worker acessa (chave de serviço); só a equipe cria/edita/renova —
-- o cliente, quando o pet dele já estiver vinculado à conta, só pode LER a própria assinatura.
create table if not exists public.clubinho_subscriptions (
  id            text primary key default gen_random_uuid()::text,
  pet_id        text not null,
  pet_name      text not null default '',   -- cópia pro caso do pet ser removido depois; nunca usado pra decidir nada
  tutor_name    text not null default '',   -- nome do tutor (texto livre, como na planilha) — não é conta de cliente
  plan_type     text not null default 'semanal', -- 'semanal' | 'quinzenal'
  weekday       smallint,                   -- 0=domingo .. 6=sábado
  time_of_day   text not null default '',   -- 'HH:MM'
  price         numeric(10,2) not null default 0,
  taxi_dog_fee  numeric(10,2) not null default 0,
  started_at    date not null,
  renews_at     date not null,              -- próxima data de renovação/pagamento
  -- Quando preenchido ('a_confirmar' | 'debito' | 'pago'), vale mais que o cálculo por data: é informação real que
  -- a equipe confirmou (ex.: trazida dos calendários "Confirmar"/"Débitos" do Google Agenda antigo, ou um
  -- pagamento registrado à mão em clubinho_payments). Null = deixa o status seguir pela data de renovação normalmente.
  payment_flag  text,
  is_active     boolean not null default true,
  created_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists clubinho_pet_idx on public.clubinho_subscriptions (pet_id);
create index if not exists clubinho_renews_idx on public.clubinho_subscriptions (renews_at) where is_active;
drop trigger if exists clubinho_touch on public.clubinho_subscriptions;
create trigger clubinho_touch before update on public.clubinho_subscriptions for each row execute function public.touch_updated_at();
alter table public.clubinho_subscriptions enable row level security;
revoke all on public.clubinho_subscriptions from anon, authenticated;

-- Histórico de pagamentos registrados à mão pela equipe ("Marcar: Pagamento realizado"): data, hora, forma de
-- pagamento e quem recebeu. Fica guardado pra consulta futura; o último registro também marca a assinatura.
create table if not exists public.clubinho_payments (
  id              text primary key default gen_random_uuid()::text,
  subscription_id text not null references public.clubinho_subscriptions(id) on delete cascade,
  paid_date       date not null,
  paid_time       text not null default '',   -- 'HH:MM'
  payment_method  text not null default '',   -- 'pix' | 'debito' | 'credito' | 'especie'
  received_by     text not null default '',   -- quem recebeu (ex.: André, Paloma, ou o nome de quem está logado)
  created_by      text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists clubinho_payments_subscription_idx on public.clubinho_payments (subscription_id, paid_date desc);
alter table public.clubinho_payments enable row level security;
revoke all on public.clubinho_payments from anon, authenticated;
