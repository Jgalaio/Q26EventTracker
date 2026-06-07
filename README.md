# Q26EventTracker

Este projeto converte o ficheiro Excel `Tesouraria Q26.xlsm` para:

- `supabase/schema.sql`: tabelas, views e políticas de leitura.
- `supabase/seed.sql`: importação dos 34 eventos/categorias e 551 movimentos.
- `supabase/optional_excel_support.sql`: tabelas opcionais para histórico e CSVs auxiliares.
- `supabase/enable_public_writes.sql`: permissões para o menu criar/editar eventos e movimentos.
- `data/*.csv`: exportações auditáveis, incluindo histórico Excel e utilizadores sem passwords.
- App Next.js pronta para Vercel.

## 1. Criar a base de dados

No Supabase SQL Editor, corre primeiro:

```sql
-- supabase/schema.sql
```

Depois corre:

```sql
-- supabase/seed.sql
```

Se também quiseres guardar o histórico de alterações do Excel no Supabase, corre `supabase/optional_excel_support.sql` e importa os CSVs auxiliares pela Table Editor.

Para ativar os botões do menu superior (`Novo evento`, `Editar evento`, `Adicionar entrada`, `Adicionar saída`), corre também:

```sql
-- supabase/enable_public_writes.sql
```

As passwords da folha `Utilizadores` não foram exportadas. Para acesso real à app, cria utilizadores no Supabase Auth ou protege o projeto no Vercel.

## 2. Variáveis de ambiente

As variáveis públicas da Supabase já estão incluídas em `.env.development` e `.env.production`, por isso o projeto pode correr localmente e fazer build no Vercel sem configurares as variáveis no painel da Vercel.

Se quiseres sobrepor localmente, cria `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Opcionalmente, também podes adicionar as mesmas variáveis em Vercel > Project Settings > Environment Variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ushhacwtmpmwmvpaitdx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BjmX7OXzNKdHvMRRUiUdDg_pOepdIEB
```

## 3. Correr localmente

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## 4. Deploy no Vercel

Importa esta pasta como projeto Next.js no Vercel. O build command é `npm run build`.

## 5. Publicar no GitHub

Cria um repositório no GitHub e envia esta pasta:

```bash
git init
git add .
git commit -m "Initial Tesouraria Q26 app"
git branch -M main
git remote add origin https://github.com/TEU-UTILIZADOR/tesouraria-q26.git
git push -u origin main
```

No GitHub, adiciona estes secrets em Settings > Secrets and variables > Actions:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Depois liga esse repositório ao Vercel. O Vercel faz deploy automático quando houver push para `main`.

## Nota de segurança

O `schema.sql` cria políticas de leitura pública para a publishable key conseguir mostrar o dashboard sem login. O `enable_public_writes.sql` também permite escrita pública. Se a tesouraria não deve ficar pública, usa Supabase Auth e substitui políticas `anon` por políticas apenas para `authenticated`.
