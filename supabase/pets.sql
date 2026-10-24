-- Fotos e documentos dos pets (foto, pedigree, documento de identidade do pet etc.).
-- Mesma regra do projeto: só o Worker acessa (chave de serviço), nunca o navegador direto.
insert into storage.buckets (id, name, public) values ('pets', 'pets', false) on conflict (id) do nothing;
