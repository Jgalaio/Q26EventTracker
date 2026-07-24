# Q26EventTracker

Este projeto converte o ficheiro Excel `Tesouraria Q26.xlsm` para:

- `supabase/schema.sql`: tabelas, views e políticas de leitura.
- `supabase/seed.sql`: importação dos 34 eventos/categorias e 551 movimentos.
- `supabase/optional_excel_support.sql`: tabelas opcionais para histórico e CSVs auxiliares.
- `supabase/enable_public_writes.sql`: adiciona os campos `isento` e `contabilizar_totais`, ativa a edição de eventos/movimentos e cria as tabelas de definições do Admin.
- `data/*.csv`: exportações auditáveis, incluindo histórico Excel e utilizadores sem passwords.
- App Next.js pronta para Vercel.

A interface tem duas áreas principais: `Eventos`, onde escolhes cada evento e geres entradas/saídas, e `Contas`, onde entram os movimentos da folha Contas e as saídas são somadas automaticamente a partir das despesas dos eventos pagas por Transferencia ou Conta Bancaria.

A página `/overview` mostra o panorama geral da tesouraria, com cartões de totais, gráfico de barras e resumo por evento. Clicar num evento abre os movimentos desse evento em cascata.

Cada evento pode ser marcado como `Contabilizar nos totais: Sim/Não`. Eventos marcados como `Não`, como `Decoração`, continuam visíveis para registo, mas não entram nos totais gerais, OverView ou relatório geral.

Na janela de cada evento, o botão `+` no cabeçalho da tabela cria uma linha rápida para adicionar entradas ou saídas sem abrir modal. A página `/reports` mostra logo a pré-visualização do relatório, permitindo alternar entre relatório geral e evento selecionado e usar `Imprimir / PDF` no browser.

O sistema de login tem três roles:

- `Admin`: acesso total, incluindo apagar registos e abrir `/admin`.
- `Operator`: pode adicionar e alterar; ao alterar tem de indicar uma justificação.
- `View`: pode apenas consultar `/overview`.

As passwords não ficam gravadas em texto claro no projeto. Para sessões mais seguras em produção, define também `Q26_AUTH_SECRET` nas variáveis de ambiente do Vercel.

No painel `/admin`, um Admin pode alterar a sua própria password, gerir utilizadores, trocar roles e trocar o logo usado na capa do relatório. Essas alterações ficam guardadas no Supabase depois de correres `supabase/enable_public_writes.sql`.

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

Para ativar os formulários (`Novo evento`, `Editar evento`, `Adicionar entrada`, `Adicionar saída`), guardar a descrição das saídas, apagar eventos por Admin, guardar o log de alterações, guardar as opções `Isento: Sim/Não` e `Contabilizar nos totais: Sim/Não`, permitir alteração de password e trocar o logo do relatório, corre também:

```sql
-- supabase/enable_public_writes.sql
```

Se já tinhas corrido este ficheiro antes, volta a corrê-lo para criar as tabelas `app_users`, `app_settings` e `app_audit_logs`, ativar as funções `app_verify_login` / `app_change_password`, adicionar a coluna `descricao`, marcar `Decoração` como só registo e manter a edição/eliminação de eventos e movimentos ativa.

O painel `Admin` permite alterar a password do utilizador atual, criar/editar/apagar utilizadores, alterar roles, guardar/remover o logo personalizado do relatório e definir o `Montante deixado pelos Q25` usado nos cartões de totais. As passwords base são criadas no Supabase com hash e a app valida o login através de funções SQL, sem expor a coluna `password_hash` pela API pública.

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
Q26_AUTH_SECRET=troca-este-valor-por-um-segredo-longo
Q26_INSTALLER_SECRET=troca-este-valor-por-um-segredo-so-do-instalador
SUPABASE_SERVICE_ROLE_KEY=chave-service-role-do-supabase
SUPABASE_BACKUP_BUCKET=q26-backups
```

`SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas em variáveis de servidor. É necessária para a zona Admin conseguir criar, editar e apagar utilizadores sem abrir a tabela `app_users` ao público, e para guardar os backups no bucket privado do Supabase Storage.

`SUPABASE_BACKUP_BUCKET` é opcional. Se não existir, os backups automáticos e manuais usam o bucket privado `q26-backups`, criado automaticamente quando for necessário.

Os backups automáticos mantêm apenas os últimos 30 dias. Os backups manuais ficam guardados sem limite de tempo e só são removidos quando um Admin os apaga na zona de backups.

## First run / instalador

Para uma instalação nova, define também `Q26_INSTALLER_SECRET` no Vercel. Depois abre `/instalar`.

O instalador confirma as variáveis de ambiente, dá o SQL limpo para criar a base de dados sem utilizadores pré-definidos e, depois do SQL estar corrido no Supabase, cria o primeiro utilizador `Admin`. A app cria ainda as áreas técnicas mínimas `Conta Bancaria`, `Patrocínios` e `Peditório`, para o painel arrancar do zero sem dados antigos.

Por segurança, o site não cria um projeto Supabase novo sozinho. Primeiro crias o projeto Supabase e colocas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no Vercel; o instalador trata da ligação e do primeiro arranque da aplicação.

### Tutorial rápido de instalação

1. Cria um projeto novo no Supabase.
2. No Vercel, adiciona as variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `Q26_AUTH_SECRET`, `Q26_INSTALLER_SECRET` e, se usares backups, `SUPABASE_BACKUP_BUCKET`.
3. Faz deploy do site no Vercel e abre `https://teu-site.vercel.app/instalar`.
4. Confirma se o bloco `Ambiente` aparece todo com `OK`.
5. No bloco `Base de dados`, copia ou descarrega o SQL e corre-o no Supabase SQL Editor do projeto novo.
6. Volta ao `/instalar` e clica em `Verificar`.
7. Quando o schema estiver pronto, escreve a `Chave do instalador`, cria o primeiro utilizador Admin e entra no painel.
8. Depois de entrares, cria logo um backup manual na zona Admin para ficares com um ponto inicial limpo.

Não corras o SQL do instalador numa base de dados que já esteja em produção com dados importantes. Para instalações existentes, faz apenas deploy do código mantendo as mesmas variáveis do Supabase.

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
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BACKUP_BUCKET
```

Depois liga esse repositório ao Vercel. O Vercel faz deploy automático quando houver push para `main`.

## Nota de segurança

O `schema.sql` cria políticas de leitura pública para a publishable key conseguir mostrar o dashboard sem login. O `enable_public_writes.sql` também permite escrita pública. Se a tesouraria não deve ficar pública, usa Supabase Auth e substitui políticas `anon` por políticas apenas para `authenticated`.
