## 11. Guia de Uso (Passo a Passo)

> Referência prática para subir o painel Next.js, provisionar o Supabase e operar o agente Java.

### 11.0 Panorama rápido

1. Preparar ambiente (Node 20+, npm 10+, JDK 21, Maven 3.9+).
2. Criar projeto Supabase com Auth + Postgres + Storage `backups` e chaves `anon/service_role`.
3. Preencher `.env.local` do frontend e `.env` do agente usando as tabelas abaixo.
4. Rodar `npm install && npm run dev` em `Front/` e validar http://localhost:3000.
5. Rodar `mvn clean package && java -jar target/backup-agent-1.0.0.jar` em `Agente/`.
6. Registrar o dispositivo via painel (`Área pessoal → Dispositivos → Registrar`) usando o `activation_code` do agente.
7. Disparar um backup pelo dashboard e acompanhar o job em tempo real.

### 11.1 Estrutura da monorepo

* `Front/` – aplicativo Next.js + API Routes + hooks Supabase.
* `Agente/` – agente Java 21 com Maven, empacotador `.tar.zst` e tarefas headless.
* `README.MD` – visão geral; `Front/docs` – notas de arquitetura; `Agente/readme.md` – guia técnico do agente.

### 11.2 Pré-requisitos detalhados

| Item | Versão recomendada | Observações |
| --- | --- | --- |
| Node.js / npm | 20.x / 10.x | Use `nvm use 20` para alinhar com o projeto Next.js. |
| JDK / Maven | JDK 21 / Maven ≥ 3.9 | `java -version` e `mvn -version` devem apontar para o JDK 21. |
| Supabase | Projeto com Auth + Postgres + Storage | Plano gratuito atende desenvolvimento. |
| Storage S3 (opcional) | AWS, Supabase S3 compatível, MinIO | Necessário apenas se `BACKUP_STORAGE=s3`. |

### 11.3 Preparar Supabase e Storage

1. **Auth/URLs** – em *Project Settings → Auth → URL Configuration*, defina `http://localhost:3000` em *Site URL* e *Redirect URLs* para permitir login/reset durante o desenvolvimento.
2. **Banco** – rode seus scripts no SQL Editor para criar as tabelas descritas na Seção 6 (`agents`, `agent_tasks`, `backup_jobs`, `snapshots`, `snapshot_files`, `snapshot_file_chunks`, `agent_api_keys`). Habilite RLS e adicione policies por `user_id` para cada tabela.
3. **Storage** – em *Storage → Create bucket*, crie `backups` como privado. Caso use AWS/MinIO, replique nome/região e gere credenciais IAM com permissão de leitura/escrita.
4. **Chaves e URLs** – em *Project Settings → API*, copie `Project URL`, `anon key` e `service_role key`. A primeira alimenta `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL`, a segunda vai para o client (Next.js), e a terceira fica somente no backend/API Routes.

### 11.4 Variáveis de ambiente essenciais

**Frontend (`Front/.env.local` ou variáveis do deploy)**

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL base do Supabase (`https://<project>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública usada pelo browser e hooks (`supabase-js`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role usada apenas nas API Routes para consultar Postgres/Storage. |
| `NEXT_PUBLIC_BACKEND_URL` | URL onde o Next.js roda (dev: `http://localhost:3000`). |
| `NEXT_PUBLIC_SITE_URL` | URL publicada para redirecionamentos do Supabase Auth (use a mesma do backend em dev). |
| `DEVICE_API_BASE_URL` | Endereço que o agente usará para chamar `/api/devices` e `/api/agent-tasks` (ex.: `http://localhost:3000`). |

<details>
<summary>Exemplo de <code>Front/.env.local</code></summary>

```ini
NEXT_PUBLIC_SUPABASE_URL=https://seuprojeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-key
SUPABASE_SERVICE_ROLE_KEY=service-role-key
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DEVICE_API_BASE_URL=http://localhost:3000
```
</details>

**Agente (`Agente/.env` ou variáveis do host)**

| Variável | Descrição |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Mesmos valores usados no frontend. |
| `SUPABASE_EMAIL` / `SUPABASE_PASSWORD` **ou** `SUPABASE_REFRESH_TOKEN` | Credenciais usadas pelo agente headless para abrir sessão; o refresh é armazenado criptografado. |
| `KEEPLY_AGENT_KEY` | Chave simétrica usada para criptografar/armazenar o refresh token em disco. |
| `DEVICE_API_BASE_URL` | URL do frontend para o agente consumir `/api/devices` e `/api/agent-tasks`. |
| `BACKUP_STORAGE` | `s3` (padrão) ou `local`. Define onde os contêineres são enviados. |
| `LOCAL_STORAGE_DIR` | Diretório local para contêineres quando `BACKUP_STORAGE=local` (default: `~/keeply-local`). |
| `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_S3_PREFIX` | Bucket e prefixo usados quando `BACKUP_STORAGE=s3`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Credenciais para acessar o bucket (dispensável se estiver usando profile local). |
| `AGENT_API_KEY` | Opcional, para rotas protegidas adicionais. |

<details>
<summary>Exemplo de <code>Agente/.env</code></summary>

```ini
SUPABASE_URL=https://seuprojeto.supabase.co
SUPABASE_ANON_KEY=anon-key
SUPABASE_EMAIL=you@example.com
SUPABASE_PASSWORD=senha-super-secreta
KEEPLY_AGENT_KEY=chave-hexadecimal
DEVICE_API_BASE_URL=http://localhost:3000
BACKUP_STORAGE=local
LOCAL_STORAGE_DIR=/home/user/keeply-local
# Configurações S3 (ignore se usar storage local)
AWS_S3_BUCKET=keeply-backups
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```
</details>

Considere versionar apenas `*.env.example` e copiar para `.env`/`.env.local` em cada ambiente.

### 11.5 Subindo o frontend

```bash
cd Keeply-Front/Front
cp .env .env.local   # ou monte um .env.local do zero usando a tabela acima
npm install
npm run dev
# acesse http://localhost:3000
```

* `npm run dev` usa Next.js App Router com Hot Reload; o script `scripts/validate-env.mjs` roda antes do build para garantir que todas as variáveis estejam definidas.
* Para produção: `npm run build && npm run start` (ou deploy direto na Vercel). Replique as mesmas variáveis no provedor.

### 11.6 Executando o agente headless

```bash
cd Keeply-Front/Agente
cp .env.example .env   # se não existir, crie manualmente
mvn clean package
java -jar target/backup-agent-1.0.0.jar
```

Na primeira execução o agente:

1. Lê o `.env`, resolve credenciais Supabase e tenta restaurar o refresh token criptografado.
2. Se não encontrar sessão válida, solicitará `SUPABASE_EMAIL`/`SUPABASE_PASSWORD` no terminal (ou usará `SUPABASE_REFRESH_TOKEN` se definido).
3. Faz o *device registration* e mostra um `activation_code`. Copie-o para concluir a ativação no painel web.
4. Começa o polling de tarefas (`/api/agent-tasks/claim`) a cada 15s, enviando heartbeats para `/api/devices`.

Os logs aparecem no console. Finalize com `Ctrl+C` para acionar o shutdown hook que encerra uploads e libera recursos.

### 11.7 Fluxo ponta a ponta

1. **Criar conta** – com o frontend rodando, acesse `http://localhost:3000`, clique em “Começar” e finalize o cadastro Supabase Auth. Confirme o e-mail se necessário.
2. **Ativar dispositivo** – no painel vá para `Área pessoal → Dispositivos → Registrar` e informe o `activation_code` exibido pelo agente. Adicione um nome amigável.
3. **Configurar diretórios** – defina no `.env` do agente os caminhos monitorados (ex.: `BACKUP_ROOTS=/home/joao/Documentos,/home/joao/Fotos`) ou ajuste perfis/paths na UI. Reinicie o agente quando alterar configurações relevantes.
4. **Disparar backup** – em `Área pessoal → Dashboard`, use o card “Ações”. Escolha o dispositivo, selecione a origem (rápida ou manual), mantenha `mode=auto` (primeiro FULL, demais INCREMENTAL) e clique em “Executar backup”. Uma tarefa `PENDING` será criada em `agent_tasks`.
5. **Agente executa** – o poller consome a tarefa, o scanner gera o plano e o packager envia contêineres para o destino (`LOCAL_STORAGE_DIR` e/ou bucket S3). O status (`RUNNING`, `COMPLETED`, `FAILED`) aparece em tempo real via Supabase Realtime (`backup_jobs`).
6. **Validar resultado** – após `COMPLETED`, abra `Área pessoal → Meus arquivos` para checar os artefatos. Filtros e busca ajudam a localizar itens. Use o botão de download (que faz `POST /api/backups/download` e retorna uma signed URL) ou delete itens indesejados.
7. **Restaurar** – ainda no card “Ações”, alterne para a aba de restauração, selecione `manifest_id`/`root_path` e o destino local. O frontend cria uma tarefa `RESTORE`; o agente faz download dos contêineres e reconstroi os arquivos validando hashes.

### 11.8 Checklist de validação rápida

- [ ] Variáveis críticas (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `KEEPLY_AGENT_KEY`) definidas.
- [ ] Bucket `backups` criado e acessível.
- [ ] Agente registrado e com status online no painel (`último contato < 5 min`).
- [ ] Pelo menos um job `COMPLETED` aparece em `/api/backup_jobs`/dashboard.
- [ ] Download via `/api/backups/download` retorna signed URL válida.

### 11.9 Problemas comuns

| Sintoma | Causa provável | Como resolver |
| --- | --- | --- |
| `Env SUPABASE_SERVICE_ROLE_KEY não definida` ao rodar o frontend | Variável ausente no ambiente/serverless | Configure a chave em `.env.local` (dev) ou nas variáveis do provedor (Vercel/Render). |
| Agente imprime `storage_backend 's3' desabilitado` | `BACKUP_STORAGE=local`, mas foi criada tarefa pedindo S3 | Ajuste `BACKUP_STORAGE` para `s3` ou mantenha os uploads locais. |
| Tarefa fica em `PENDING` indefinidamente | Agente não reclamou a tarefa (offline) | Verifique logs do agente, credenciais Supabase e conectividade com `/api/agent-tasks/claim`. |
| Download falha com 404 | Registro não pertence ao usuário ou Storage sem objeto | Confirme `user_id` no banco e se o contêiner foi enviado ao bucket/local store. |
| Login redireciona para URL incorreta | `NEXT_PUBLIC_SITE_URL`/config Auth desatualizados | Alinhe o valor nas variáveis e em *Auth → URL Configuration*. |

### 11.10 Dicas rápidas

* `npm run dev -- --turbo` acelera o Fast Refresh se estiver iterando somente na UI.
* Com `BACKUP_STORAGE=local`, os contêineres ficam em `LOCAL_STORAGE_DIR` – ótimo para desenvolvimento sem AWS.
* Para depurar jobs, abra `agent_tasks` no Supabase Studio e observe `status`, `claimed_by` e `error`.
* Considere habilitar logging estruturado no agente para cruzar `backup_id` entre logs e entries no Postgres.

---

[1]: https://supabase.com/docs/guides/storage?utm_source=chatgpt.com "Storage | Supabase Docs"
[2]: https://www.permit.io/blog/supabase-authentication-and-authorization-in-nextjs-implementation-guide?utm_source=chatgpt.com "Supabase Authentication and Authorization in Next.js"
[3]: https://en.wikipedia.org/wiki/Supabase?utm_source=chatgpt.com "Supabase"
