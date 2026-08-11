# 🐾 La Viola Petshop — Sistema de Gestão

Sistema completo de gestão para petshop, desenvolvido com React + TypeScript + Vite.

## 🌐 Acesso

- **Produção:** [laviolapetstore.web.app](https://laviolapetstore.web.app)
- **Repositório:** [github.com/rafaeldesj/laviolapetstore](https://github.com/rafaeldesj/laviolapetstore)

## 🛠️ Stack Tecnológico

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Autenticação | Firebase Authentication |
| Banco de Dados | Firebase Firestore (dados gerais) |
| Financeiro | Supabase (transações financeiras) |
| Hospedagem | Firebase Hosting |
| CI/CD | GitHub Actions |

## 🚀 Como rodar localmente

```bash
npm install
npm run dev
```

## 📦 Deploy

O deploy é **automático**: qualquer push para `main` dispara o GitHub Actions que faz o build e publica no Firebase Hosting.

```bash
git add .
git commit -m "sua mensagem"
git push
```

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz com:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 📋 Módulos do Sistema

- **Dashboard** — Visão geral do negócio
- **Agendamentos** — Gestão de banho, tosa e consultas
- **Pets** — Cadastro e prontuário de animais
- **Estoque / Produtos** — Controle de mercadorias
- **Venda Avulsa PDV** — Ponto de venda com leitor de código de barras
- **Financeiro / Caixa** — Controle financeiro
- **Delivery** — Gestão de entregas
- **Relatórios** — Análises e exportações
- **Usuários** — Gestão de equipe com controle de cargos (RBAC)

---

© 2025 La Viola Petshop — Todos os direitos reservados
