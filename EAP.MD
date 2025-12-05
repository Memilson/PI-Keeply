# EAP – Sistema Keeply de Backup Distribuído

> Estrutura Analítica do Projeto (EAP) consolidando as entregas necessárias para disponibilizar o agente de backup, o painel web e a infraestrutura de suporte.

## 1.0 Projeto Keeply
### 1.1 Planejamento e Governança
- **1.1.1** Levantamento e consolidação de requisitos funcionais e não funcionais.
- **1.1.2** Definição da arquitetura (agente, backend relacional, storage, frontend).
- **1.1.3** Elaboração do TAP, análise de riscos e aprovação do escopo.
- **1.1.4** Definição de cronograma, marcos e plano de comunicação.

### 1.2 Desenvolvimento do Agente
- **1.2.1** Scanner e geração de planos FULL/INCREMENTAL.
- **1.2.2** Packager com deduplicação, compressão ZSTD e cabeçalho KBC.
- **1.2.3** Camada de persistência (backups, versões, chunks, contêineres).
- **1.2.4** Provedores de storage (filesystem local, S3 ou compatível).
- **1.2.5** Serviços de restauração completa e parcial.
- **1.2.6** Interface de controle (CLI e opcional JavaFX).
- **1.2.7** Scheduler e mecanismos de bloqueio/concorrência.

### 1.3 Desenvolvimento do Frontend Web
- **1.3.1** Landing pages, fluxos de login, registro e recuperação.
- **1.3.2** AuthContext/hooks de sessão integrados ao Supabase Auth.
- **1.3.3** APIs internas (`/api/backups`, `/api/jobs`, `/api/metrics`, `/api/backups/download`).
- **1.3.4** Componentes de UI (cards, tabelas, gráficos, modais e layouts responsivos).
- **1.3.5** Integração Realtime para atualização de jobs e métricas em tempo quase real.

### 1.4 Testes e Qualidade
- **1.4.1** Testes unitários do agente (scanner, packager, storage, restauração).
- **1.4.2** Testes integrados de upload/download, deduplicação e restauração.
- **1.4.3** Testes de carga e simulações de falhas de rede/storage.
- **1.4.4** Testes manuais e automatizados no frontend (login, listas, downloads, remoções).
- **1.4.5** Validação de Realtime, observabilidade (logs/métricas) e segurança (RLS, credenciais).

### 1.5 Implantação e Operação
- **1.5.1** Empacotamento do agente (fat-JAR, scripts de instalação e serviços).
- **1.5.2** Build/deploy do frontend (dev, homologação e produção).
- **1.5.3** Configuração de variáveis de ambiente, credenciais e secrets.
- **1.5.4** Configuração de observabilidade (health checks, métricas, logs centralizados).
- **1.5.5** Criação de guia de instalação, operação e suporte pós-implantação.

### 1.6 Entregáveis
- **1.6.1** Código-fonte do agente e do frontend versionados.
- **1.6.2** Documentação técnica (arquitetura, APIs, modelo de dados, guias de uso).
- **1.6.3** Relatórios de testes e métricas (throughput, deduplicação, taxas de sucesso).
- **1.6.4** Material de treinamento e handover para equipes de operação/suporte.

