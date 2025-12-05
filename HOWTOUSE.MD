--
## 11. Guia de Uso (Passo a Passo)

### 11.1 Estrutura da monorepo

* `Front/` – aplicativo Next.js + API Routes + hooks Supabase.
* `Agente/` – agente Java 21 com Maven, empacotador `.tar.zst` e tarefas headless.
* `README.MD` – visão geral (este arquivo); `Front/docs` – notas de arquitetura; `Agente/readme.md` – guia técnico do agente.

### 11.2 Pré-requisitos

* Node.js 20+ e npm 10+.
* JDK 21 e Maven 3.9+.
* Conta Supabase com Auth (email/senha), Postgres e Storage habilitados.
* Opcional: bucket S3 compatível (AWS, Supabase Storage, MinIO) caso queira enviar contêineres para a nuvem.

### 11.3 Preparar Supabase e Storage

1. Crie um projeto no Supabase e configure Auth > Settings > URLs com `http://localhost:3000` em *Site URL* e *Redirect URL* para testes locais.
2. No SQL Editor, crie as tabelas listadas na Seção 6 (ou importe seu script). Habilite RLS e policies por `user_id` em `agents`, `agent_tasks`, `backup_jobs`, `snapshots`, `snapshot_files` e `snapshot_file_chunks`.
3. Em Storage, crie o bucket `backups` (privado). Se for usar AWS/MinIO, crie também o bucket e as credenciais IAM conforme o nome/região definidos nas variáveis do agente.
4. Gere as chaves `anon` e `service_role` em Project Settings > API; elas serão usadas pelo frontend (`anon`) e pelas API Routes (`service_role`). Nunca exponha o service role no browser.

### 11.4 Variáveis de ambiente essenciais

**Frontend (`Front/.env.local` ou variáveis do deploy)**

| Variável | Descrição |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL base do seu projeto Supabase (ex.: `https://xyzcompany.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase usada no client. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (usada apenas server-side nas API Routes). |
| `NEXT_PUBLIC_BACKEND_URL` | URL onde o Next.js roda (dev: `http://localhost:3000`). |
| `NEXT_PUBLIC_SITE_URL` | URL pública usada pelo Supabase Auth para redirecionar reset/login mágico. |
| `DEVICE_API_BASE_URL` | URL do mesmo Next.js para que o agente chame `/api/devices` e `/api/agent-tasks`. |

**Agente (`Agente/.env` ou variáveis do host)**

| Variável | Descrição |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Endereço e chave pública para conversar com Supabase. |
| `SUPABASE_EMAIL` / `SUPABASE_PASSWORD` **ou** `SUPABASE_REFRESH_TOKEN` | Credenciais usadas pelo agente headless para abrir sessão. |
| `KEEPLY_AGENT_KEY` | Chave simétrica usada para criptografar/armazenar o refresh token local. |
| `DEVICE_API_BASE_URL` | Mesma URL do frontend para que o agente chame `/api/devices` e `/api/agent-tasks`. |
| `BACKUP_STORAGE` | `s3` (padrão) ou `local`. Define se o agente envia contêineres ao cloud storage. |
| `LOCAL_STORAGE_DIR` | Diretório onde o agente guarda contêineres locais (default: `~/keeply-local`). |
| `AWS_S3_BUCKET`, `AWS_S3_REGION`, `AWS_S3_PREFIX` | Identificação do bucket remoto. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Credenciais, caso não use perfis locais. |
| `AGENT_API_KEY` | Chave opcional para autenticar em APIs internas (deixe em branco se não usar). |

Considere versionar apenas um `.env.example` e copiar para `.env`/`.env.local` em cada ambiente.

### 11.5 Subindo o frontend

```bash
cd Keeply-Front/Front
cp .env .env.local   # ou crie .env.local com os valores listados acima
npm install
npm run dev
# Acesse http://localhost:3000
```

Para produção, faça `npm run build && npm run start`, definindo as mesmas variáveis no provedor (Vercel, Render etc.). O script `scripts/validate-env.mjs` roda antes do build e falha se algum segredo obrigatório estiver ausente.

### 11.6 Executando o agente headless

```bash
cd Keeply-Front/Agente
cp .env.example .env   # se houver; caso contrário crie um .env seguindo a tabela acima
mvn clean package
java -jar target/backup-agent-1.0.0.jar
```

Na primeira execução o agente:

1. Lê o `.env`, resolve credenciais Supabase e tenta restaurar o refresh token criptografado.
2. Se não encontrar sessão válida, solicitará `SUPABASE_EMAIL`/`SUPABASE_PASSWORD` no terminal (ou usará `SUPABASE_REFRESH_TOKEN` se definido).
3. Faz o *device registration* e mostra um `activation_code`. Copie-o para concluir a ativação no painel web.
4. Começa o polling de tarefas (`/api/agent-tasks/claim`) a cada 15s, enviando heartbeats para `/api/devices`.

Logs aparecem diretamente no console; finalize com `Ctrl+C` para disparar o shutdown hook que encerra uploads e fecha conexões.

### 11.7 Fluxo ponta a ponta

1. **Criar conta** – com o frontend rodando, acesse `http://localhost:3000`, clique em “Começar” e use “Criar conta” (Supabase Auth). Confirme o e-mail se necessário.
2. **Ativar dispositivo** – abra `Área pessoal → Dispositivos → Registrar` e cole o `activation_code` mostrado pelo agente. Dê um nome amigável (ex.: “Notebook João”) e confirme.
3. **Configurar diretórios** – defina no `.env` do agente os caminhos monitorados (ex.: `BACKUP_ROOTS=/home/joao/Documentos,/home/joao/Fotos`) ou utilize perfis cadastrados na UI. Reinicie o agente após mudanças relevantes.
4. **Disparar backup** – em `Área pessoal → Dashboard` localize o card “Ações”. Escolha o dispositivo, selecione a origem (rápida ou personalizada), mantenha `mode=auto` (primeiro FULL, próximos INCREMENTAL) e clique em “Executar backup”. Isso cria um registro em `agent_tasks` com status `PENDING`.
5. **Agente executa** – o poller consome a tarefa, o scanner gera o plano e o packager envia contêineres para o destino (`LOCAL_STORAGE_DIR` e/ou bucket S3). O status do job aparece em tempo real na UI via Supabase Realtime (`backup_jobs`).
6. **Validar resultado** – após `COMPLETED`, abra `Área pessoal → Meus arquivos` para ver os artefatos. Utilize filtros/busca, exclua itens indesejados ou clique na ação de download (que dispara `/api/backups/download` e retorna uma signed URL).
7. **Restaurar** – no mesmo card “Ações” alterne para a aba de restauração, selecione o `manifest_id` (snapshot) e um destino local. O frontend criará uma tarefa `RESTORE`, o agente fará download dos contêineres e reconstituirá os arquivos, validando hashes.

Dicas rápidas:

* Use `npm run dev -- --turbo` para habilitar Fast Refresh adicional quando estiver iterando apenas no frontend.
* Com `BACKUP_STORAGE=local`, o agente mantém todos os contêineres em disco – útil para desenvolvimento sem credenciais AWS.
* Para depurar jobs, consulte a tabela `agent_tasks` no Supabase Studio e verifique os campos `error` e `claimed_by`.

---

[1]: https://supabase.com/docs/guides/storage?utm_source=chatgpt.com "Storage | Supabase Docs"
[2]: https://www.permit.io/blog/supabase-authentication-and-authorization-in-nextjs-implementation-guide?utm_source=chatgpt.com "Supabase Authentication and Authorization in Next.js"
[3]: https://en.wikipedia.org/wiki/Supabase?utm_source=chatgpt.com "Supabase"
