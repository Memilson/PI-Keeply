# Mapa rápido de rotas e componentes Keeply

Visão geral para navegar e simplificar o frontend, com foco em copy clara (pt-BR) e tema claro da Keeply.

## Landing e marketing (`src/app/landingPage`)
- **layout.tsx**: aplica navbar de marketing (`components/landingPage/LandingNavbar`) + footer (`components/marketing/UnifiedMarketing`). Use este layout para novas páginas públicas.
- **landing/page.tsx**: hero + destaques + prova social. Baseie novas seções neste padrão (gradiente leve, cards brancos, botões arredondados).
- **recursos/page.tsx**, **solucoes/page.tsx**, **pricing/page.tsx**: seções de benefícios, planos e casos de uso. Reaproveitam `keeplyStyles` para grids/cards.
- **faq/page.tsx**: filtro de categorias + acordeão. Texto deve ser direto e em português, sem jargão.
- **login/register/forgot/reset**: formulários simples com campos `keeplyStyles.input` e ações claras (“Entrar”, “Criar conta”, “Enviar link”).

## Área pessoal (`src/app/personal`)
- **layout.tsx**: envolve páginas autenticadas com `DashboardNavbar` e `UnifiedCommon`.
- **dashboard/page.tsx** (se existir) + **files/page.tsx**, **profile/page.tsx**: consumo de hooks (`useBackups`, `useJobs`) e componentes de dashboard (cards, listas, métricas). Manter navegação e estado aqui; evitar lógica duplicada nas páginas.

## APIs internas (`src/app/api`)
- `/api/backups`, `/api/jobs`, `/api/metrics`, `/api/health` + diretórios de agentes/dispositivos. Todas usam `requireAuth` quando protegido; respostas padronizadas por `jsonError`.
- Ajustes de negócio concentrados nos handlers; UI só chama via `useAuthorizedFetch`.

## Componentes reutilizáveis (`src/components`)
- **marketing**: `UnifiedMarketing` (footer/layout). Adicionar novos blocos públicos aqui.
- **common**: `DashboardNavbar`, `UnifiedCommon` (efeitos `Reveal`).
- **ui**: `UnifiedUI` (botões base). Preferir `keeplyStyles` para classes rápidas.
- **profile/dashboard**: cartões, listas e seções específicas do painel.

## Tema e copy
- Paleta clara: fundo `slate-50/white`, primário `#0067B8`/`#0B5CAB`, acentos `sky` e `emerald`. Cards brancos com borda `slate-200` e `rounded-2xl/3xl`.
- Tom: “backup sem drama”. Frases curtas, benefício explícito (“backup só do que mudou, mais rápido e leve”). Evitar inglês desnecessário.
- Botões sempre com verbos de ação: “Começar backup grátis”, “Ver planos”, “Salvar alterações”.

## Checklist de simplificação
- **Remover duplicatas**: concentra navbar/rodapé em `landingPage/layout.tsx`; evitar navs soltas em cada página.
- **Aproveitar tokens**: usar `keeplyStyles` (cores, botões, inputs) em vez de classes ad-hoc.
- **Limpar copy**: revisar textos longos ou jargão; manter português claro e benefícios diretos.
- **Organizar dados mockados**: deixar arrays (cards, FAQ, planos) perto do componente, tipados, para facilitar ajuste.
- **Padronizar estados**: loaders simples (`animate-spin` + `text-blue-600`), mensagens de sucesso/erro com caixas `bg-green-50/red-50` e bordas correspondentes.

## Próximos passos sugeridos
1) Centralizar formulários de autenticação em componentes reutilizáveis para login/register/forgot/reset.
2) Criar `themes/keeply.ts` único para tokens e gradientes e referenciar em todas as páginas públicas.
3) Revisar APIs stub (ex.: `POST /api/jobs`) e remover funções mortas no client.
