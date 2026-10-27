-- La Viola Petshop: produtos e agenda (Banho e Tosa / Clubinho) no Supabase.
-- O navegador NÃO fala com o Supabase: tudo passa pelo Worker (worker/index.js), que confere quem é o usuário
-- e usa a chave de serviço. Por isso as tabelas têm RLS ligado e nenhuma política (a chave pública não lê nada).

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- produtos
create table if not exists public.products (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  category    text not null default 'Outros',
  brand       text not null default '',
  price       numeric(12,2) not null default 0,
  cost_price  numeric(12,2) not null default 0,
  quantity    numeric(14,3) not null default 0,   -- aceita fração (KG / LT)
  min_stock   numeric(14,3) not null default 0,
  sku         text not null default '',
  unit        text not null default 'UN',
  ncm         text not null default '',
  origin      text not null default '0',
  legacy_code text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_updated_at_idx on public.products (updated_at);
create index if not exists products_sku_idx on public.products (sku);
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
alter table public.products enable row level security;

-- ---------------------------------------------------------------- agenda
-- Cada atendimento é uma linha. Os que se repetem toda semana compartilham o mesmo series_id.
create table if not exists public.appointments (
  id           text primary key default gen_random_uuid()::text,
  series_id    text,
  pet_id       text not null default '',
  pet_name     text not null,
  tutor_name   text not null default '',
  owner_id     text not null default '',
  service_type text not null default 'Banho & Tosa',
  status       text not null default 'Agendado',
  starts_at    timestamptz not null,
  duration_min integer not null default 60,
  notes        text not null default '',
  -- Marca uma dívida/confirmação pendente num atendimento específico (avulso ou não), independente de o pet ser
  -- assinante do Clubinho ou não. 'a_confirmar' | 'debito' | null (null = sem marcação, nada a destacar).
  payment_flag text,
  created_by   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists appointments_starts_at_idx on public.appointments (starts_at);
create index if not exists appointments_series_idx on public.appointments (series_id);
create index if not exists appointments_owner_idx on public.appointments (owner_id);
drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
alter table public.appointments enable row level security;

-- ---------------------------------------------------------------- funções usadas pelo Worker
-- Baixa/devolve estoque de vários produtos de uma vez, tudo ou nada.
-- items: [{"id": "...", "delta": -1.5}, ...]. Com enforce, não deixa o estoque ficar negativo.
create or replace function public.adjust_stock(items jsonb, enforce boolean default true, ignore_missing boolean default false)
returns jsonb language plpgsql as $$
declare
  it jsonb;
  p public.products%rowtype;
  d numeric;
  errs jsonb := '[]'::jsonb;
begin
  -- trava as linhas em ordem fixa (evita impasse entre duas vendas ao mesmo tempo)
  for it in select value from jsonb_array_elements(items) order by value->>'id' loop
    select * into p from public.products where id = it->>'id' and not deleted for update;
    if not found then
      if not ignore_missing then
        errs := errs || jsonb_build_array(jsonb_build_object('id', it->>'id', 'error', 'not_found'));
      end if;
      continue;
    end if;
    d := (it->>'delta')::numeric;
    if enforce and d < 0 and p.quantity + d < 0 then
      errs := errs || jsonb_build_array(jsonb_build_object('id', p.id, 'error', 'insufficient', 'name', p.name, 'available', p.quantity));
    end if;
  end loop;

  if jsonb_array_length(errs) > 0 then
    return jsonb_build_object('ok', false, 'errors', errs);
  end if;

  for it in select value from jsonb_array_elements(items) loop
    update public.products set quantity = round(quantity + (it->>'delta')::numeric, 3)
     where id = it->>'id' and not deleted;
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Preenche NCM e origem de vários produtos (importação por planilha).
create or replace function public.set_ncm_batch(items jsonb) returns integer language plpgsql as $$
declare n integer;
begin
  update public.products p
     set ncm = coalesce(x.ncm, p.ncm), origin = coalesce(x.origin, p.origin)
    from jsonb_to_recordset(items) as x(id text, ncm text, origin text)
   where p.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Move toda a série pelo mesmo intervalo (reagendar "todos os dias da série").
create or replace function public.shift_series(sid text, delta_seconds bigint) returns integer language plpgsql as $$
declare n integer;
begin
  update public.appointments set starts_at = starts_at + make_interval(secs => delta_seconds) where series_id = sid;
  get diagnostics n = row_count;
  return n;
end $$;

-- Só o Worker (chave de serviço) chama estas funções.
revoke all on function public.adjust_stock(jsonb, boolean, boolean) from public, anon, authenticated;
revoke all on function public.set_ncm_batch(jsonb) from public, anon, authenticated;
revoke all on function public.shift_series(text, bigint) from public, anon, authenticated;

-- Defesa extra: o acesso publico (chave anon/authenticated) nao pode nem tentar ler estas tabelas.
revoke all on public.products, public.appointments from anon, authenticated;
