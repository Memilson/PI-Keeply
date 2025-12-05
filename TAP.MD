# TAP – Sistema Keeply de Backup Distribuído

## 1. Identificação do Projeto
- **Título:** Sistema Keeply de Backup Distribuído
- **Patrocinador / Cliente:** Direção e áreas que demandam backup confiável
- **Gerente Responsável:** Responsável de Tecnologia / Líder Técnico indicado pelo patrocinador
- **Data de elaboração:** 2025

## 2. Partes Interessadas Principais
| Stakeholder | Responsabilidades |
| --- | --- |
| Administrador de TI / DevOps | Configura diretórios, monitora agente/painel e resolve falhas |
| Operador de Suporte | Realiza restaurações, acompanha incidentes e orienta usuários |
| Usuários Finais | Instalam o agente nos dispositivos e acompanham seus backups no painel |
| Time de Segurança e Conformidade | Define políticas de acesso, criptografia e auditoria |
| Patrocinador / Direção | Aprova orçamento, prioriza roadmap e acompanha indicadores |

## 3. Necessidades do Negócio
1. Reduzir custo de armazenamento de backups por meio de deduplicação eficiente.
2. Diminuir o tempo de recuperação de incidentes de perda de dados.
3. Aumentar a visibilidade do ciclo de vida de backups em endpoints distribuídos.
4. Permitir operação por equipes menos técnicas via painel web simples.
5. Atender boas práticas de integridade, segurança e auditoria (conformidade/LGPD).

## 4. Descrição do Produto
- **Agente local** em Java 21 com deduplicação por chunks, compressão ZSTD e contêiner KBC, capaz de enviar dados para storage local ou compatível com S3.
- **Backend/BaaS** baseado em Supabase/PostgreSQL para armazenar metadados e Supabase Storage/S3 para contêineres.
- **Painel web** Next.js + Supabase que autentica usuários, exibe backups/jobs/dispositivos, gera URLs assinadas, remove dados e mostra métricas.

## 5. Riscos Iniciais
| Risco | Impacto Potencial | Mitigação Inicial |
| --- | --- | --- |
| Indisponibilidade de storage/rede | Jobs falham ou demoram a completar | Retentativas, monitoramento de SLA, fallback local |
| Corrupção de contêineres ou metadados | Restaurações ficam comprometidas | Hashes fortes, validação de integridade, backups de metadados |
| Vazamento de credenciais | Compromete storage, banco e chaves | Gestão de segredos, rotação periódica, princípio do menor privilégio |
| Baixo desempenho em ambientes restritos | Backups lentos e janelas longas | Ajuste de chunk/compressão, teste de carga, otimizações de IO |
| Falhas em RLS/políticas | Exposição de dados entre usuários | Revisar policies, testes de segurança e auditoria |

## 6. Premissas
1. Máquinas dos agentes têm JDK 21+ e acesso aos diretórios protegidos.
2. Existe banco relacional acessível (PostgreSQL/Supabase ou SQLite local).
3. Bucket compatível com S3 ou storage equivalente está provisionado quando necessário.
4. Infraestrutura Supabase (Auth, Postgres, Storage, Realtime) configurada para o painel.
5. Comunicação HTTPS entre frontend, agentes e BaaS.
6. Diretórios monitorados concedem permissões de leitura e espaço para staging.

## 7. Restrições
- Escopo atual não contempla multi-tenant completo nem RBAC avançado.
- Políticas sofisticadas de retenção automática (GFS, etc.) ficam fora da versão inicial.
- Dependência de serviços terceiros (Supabase, cloud provider) e seus SLAs.

## 8. Critérios de Aceitação
1. Execuções de backup demonstram deduplicação (redução de bytes armazenados).
2. Contêineres gerados apresentam hashes válidos e offsets consistentes.
3. Fluxos de restauração completa e parcial validam integridade antes da conclusão.
4. Usuários autenticados conseguem listar backups/jobs, gerar URLs assinadas e remover seus próprios dados.
5. Eventos Supabase Realtime refletem novos backups sem recarregar a página.
6. Logs e métricas registram histórico de jobs, status e falhas, suportando auditoria.

