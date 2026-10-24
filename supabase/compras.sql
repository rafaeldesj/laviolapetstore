-- Entrada de mercadoria pelo XML da nota fiscal de compra (NF-e) + PDF (DANFE) opcional.
-- Como em schema.sql: só o Worker (chave de serviço) acessa estas tabelas.

create table if not exists public.purchases (
  id            text primary key default gen_random_uuid()::text,
  access_key    text not null unique,            -- chave de acesso da NF-e (44 dígitos): impede lançar a mesma nota duas vezes
  number        text not null default '',
  series        text not null default '',
  issued_at     timestamptz,
  supplier_name text not null default '',
  supplier_cnpj text not null default '',
  total         numeric(14,2) not null default 0,
  items         jsonb not null default '[]'::jsonb,  -- o que entrou no estoque (foto do momento)
  xml           text not null default '',        -- XML original: é o documento fiscal da compra
  has_pdf       boolean not null default false,
  created_by    text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists purchases_issued_idx on public.purchases (issued_at desc);
create index if not exists purchases_supplier_idx on public.purchases (supplier_name);
alter table public.purchases enable row level security;

-- "Código do fornecedor X → produto Y": nas próximas notas o sistema já sabe qual é o produto.
create table if not exists public.purchase_links (
  supplier_cnpj text not null,
  supplier_code text not null,
  product_id    text not null references public.products(id) on delete cascade,
  updated_at    timestamptz not null default now(),
  primary key (supplier_cnpj, supplier_code)
);
alter table public.purchase_links enable row level security;

-- Lança a nota inteira de uma vez (tudo ou nada).
-- payload: { access_key, number, series, issued_at, supplier_name, supplier_cnpj, total, xml, created_by,
--            items: [{ action: 'link'|'new'|'skip', product_id?, supplier_code, name, ean, ncm, origin, unit,
--                      qty, cost, price?, category?, update_cost }] }
create or replace function public.register_purchase(payload jsonb) returns jsonb language plpgsql as $$
declare
  it jsonb;
  pid text;
  created integer := 0;
  updated integer := 0;
  skipped integer := 0;
  snapshot jsonb := '[]'::jsonb;
  pur_id text;
  cnpj text := coalesce(payload->>'supplier_cnpj', '');
begin
  if exists (select 1 from public.purchases where access_key = payload->>'access_key') then
    return jsonb_build_object('ok', false, 'error', 'duplicate',
      'at', (select created_at from public.purchases where access_key = payload->>'access_key'));
  end if;

  for it in select value from jsonb_array_elements(payload->'items') loop
    if it->>'action' = 'skip' then
      skipped := skipped + 1;
      snapshot := snapshot || jsonb_build_array(it || jsonb_build_object('result', 'skip'));
      continue;
    end if;

    if it->>'action' = 'new' then
      insert into public.products (name, category, price, cost_price, quantity, sku, unit, ncm, origin, legacy_code)
      values (left(it->>'name', 300), coalesce(nullif(it->>'category', ''), 'Outros'),
              coalesce((it->>'price')::numeric, 0), coalesce((it->>'cost')::numeric, 0),
              round((it->>'qty')::numeric, 3), coalesce(nullif(it->>'ean', ''), it->>'supplier_code', ''),
              coalesce(nullif(it->>'unit', ''), 'UN'), coalesce(it->>'ncm', ''), coalesce(nullif(it->>'origin', ''), '0'),
              it->>'supplier_code')
      returning id into pid;
      created := created + 1;
    else
      pid := it->>'product_id';
      update public.products set
        quantity   = round(quantity + (it->>'qty')::numeric, 3),
        cost_price = case when coalesce((it->>'update_cost')::boolean, true) then coalesce((it->>'cost')::numeric, cost_price) else cost_price end,
        ncm        = case when ncm = '' then coalesce(it->>'ncm', '') else ncm end,
        sku        = case when sku = '' then coalesce(it->>'ean', '') else sku end
      where id = pid and not deleted;
      if not found then
        raise exception 'produto % não existe mais', pid;
      end if;
      updated := updated + 1;
    end if;

    if cnpj <> '' and coalesce(it->>'supplier_code', '') <> '' then
      insert into public.purchase_links (supplier_cnpj, supplier_code, product_id)
      values (cnpj, it->>'supplier_code', pid)
      on conflict (supplier_cnpj, supplier_code) do update set product_id = excluded.product_id, updated_at = now();
    end if;
    snapshot := snapshot || jsonb_build_array(it || jsonb_build_object('product_id', pid, 'result', it->>'action'));
  end loop;

  insert into public.purchases (access_key, number, series, issued_at, supplier_name, supplier_cnpj, total, items, xml, created_by)
  values (payload->>'access_key', coalesce(payload->>'number', ''), coalesce(payload->>'series', ''),
          nullif(payload->>'issued_at', '')::timestamptz, coalesce(payload->>'supplier_name', ''), cnpj,
          coalesce((payload->>'total')::numeric, 0), snapshot, coalesce(payload->>'xml', ''), coalesce(payload->>'created_by', ''))
  returning id into pur_id;

  return jsonb_build_object('ok', true, 'purchase_id', pur_id, 'created', created, 'updated', updated, 'skipped', skipped);
end $$;

revoke all on function public.register_purchase(jsonb) from public, anon, authenticated;
revoke all on public.purchases, public.purchase_links from anon, authenticated;

-- Pasta privada para os PDFs (DANFE) das notas de compra.
insert into storage.buckets (id, name, public) values ('compras', 'compras', false) on conflict (id) do nothing;
