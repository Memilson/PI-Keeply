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
| Equipe de Produto / Engenharia | Planeja releases, prioriza backlog e executa desenvolvimento |

## 3. Escopo em Alto Nível
### Incluído
- Agente Java 21 com deduplicação por chunks, compressão ZSTD e empacotamento em contêiner KBC.
- Integração com storage local e compatível com S3, incluindo registro de metadados em banco relacional.
- Painel web Next.js + Supabase com autenticação, dashboards (backups/jobs/dispositivos) e geração de URLs assinadas.
- APIs internas para remoção de backups, emissão de signed URLs, métricas e health checks.
- Observabilidade básica (logs estruturados, métricas, eventos Realtime) e documentação técnica.

### Fora de Escopo (versão atual)
- Multi-tenant completo e RBAC avançado.
- Políticas automáticas complexas de retenção (GFS, compliance avançada).
- Billing, cobrança e integrações financeiras.
- Observabilidade avançada (alertas automáticos, tracing distribuído completo).

## 4. Necessidades do Negócio
1. Reduzir custo de armazenamento de backups por meio de deduplicação eficiente.
2. Diminuir o tempo de recuperação de incidentes de perda de dados.
3. Aumentar a visibilidade do ciclo de vida de backups em endpoints distribuídos.
4. Permitir operação por equipes menos técnicas via painel web simples.
5. Atender boas práticas de integridade, segurança e auditoria (conformidade/LGPD).

## 5. Descrição do Produto
- **Agente local** em Java 21 com deduplicação por chunks, compressão ZSTD e contêiner KBC, capaz de enviar dados para storage local ou compatível com S3.
- **Backend/BaaS** baseado em Supabase/PostgreSQL para armazenar metadados e Supabase Storage/S3 para contêineres.
- **Painel web** Next.js + Supabase que autentica usuários, exibe backups/jobs/dispositivos, gera URLs assinadas, remove dados e mostra métricas.

## 6. Riscos Iniciais
| Risco | Impacto Potencial | Mitigação Inicial |
| --- | --- | --- |
| Indisponibilidade de storage/rede | Jobs falham ou demoram a completar | Retentativas, monitoramento de SLA, fallback local |
| Corrupção de contêineres ou metadados | Restaurações comprometidas | Hashes fortes, validação de integridade, backups de metadados |
| Vazamento de credenciais | Compromete storage, banco e chaves | Gestão de segredos, rotação periódica, princípio do menor privilégio |
| Baixo desempenho em ambientes restritos | Backups lentos e janelas longas | Ajuste de chunk/compressão, testes de carga, otimizações de IO |
| Falhas em RLS/políticas | Exposição de dados entre usuários | Revisar policies, testes de segurança e auditoria |
| Dependência de terceiros (Supabase/S3) | SLA externo influencia disponibilidade | Monitorar SLAs, planejar redundância/local fallback |

## 7. Premissas
1. Máquinas dos agentes têm JDK 21+, acesso aos diretórios protegidos e espaço para staging.
2. Existe banco relacional acessível (PostgreSQL/Supabase ou SQLite local).
3. Bucket compatível com S3 ou storage equivalente está provisionado quando necessário.
4. Infraestrutura Supabase (Auth, Postgres, Storage, Realtime) configurada para o painel.
5. Comunicação HTTPS entre frontend, agentes e BaaS.
6. Diretórios monitorados concedem permissões de leitura e espaço para staging.

## 8. Restrições
- Escopo atual não contempla multi-tenant completo nem RBAC avançado.
- Políticas sofisticadas de retenção automática ficam fora da versão inicial.
- Dependência de serviços terceiros (Supabase, cloud provider) e seus SLAs.
- Orçamento e cronograma delimitados pelo semestre acadêmico, exigindo priorização de entregas críticas.

## 9. Critérios de Aceitação (Resumo)
1. Execuções de backup demonstram deduplicação (redução de bytes armazenados) registrada em métricas.
2. Contêineres gerados apresentam hashes válidos e offsets consistentes (validados em testes de restauração).
3. Fluxos de restauração completa e parcial validam integridade antes da conclusão.
4. Usuários autenticados conseguem listar backups/jobs, gerar URLs assinadas e remover seus próprios dados.
5. Eventos Supabase Realtime refletem novos backups sem recarregar a página.
6. Logs e métricas registram histórico de jobs, status e falhas, suportando auditoria.

