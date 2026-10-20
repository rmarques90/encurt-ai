# encurt.ai - design do encurtador de URLs

## Objetivo

Construir uma API em Node.js e TypeScript que cria códigos curtos para URLs, redireciona para a URL original e permite consultar estatísticas básicas de acesso. SQLite é o banco padrão para desenvolvimento e instalações pequenas; PostgreSQL pode ser selecionado sem alterar as rotas ou regras de negócio.

## Stack proposta

- Node.js LTS + TypeScript (modo strict).
- Fastify para HTTP, validação e plugins.
- Drizzle ORM para acesso tipado a SQLite e PostgreSQL.
- `better-sqlite3` como driver SQLite local e `pg` como driver PostgreSQL.
- Zod para validar configuração e entradas HTTP.
- Vitest para testes unitários e de integração.

Drizzle permite escolher o driver/dialeto na inicialização. A aplicação deve encapsular essa escolha no módulo de infraestrutura; handlers e serviços não conhecem o driver concreto. As migrações ficam separadas por dialeto (`migrations/sqlite` e `migrations/postgres`), porque os dois bancos têm diferenças de tipos e DDL.

## Estrutura sugerida

```text
src/
  app.ts                 # cria Fastify e registra rotas/plugins
  server.ts              # inicialização, sinais e encerramento gracioso
  config/env.ts          # validação de variáveis de ambiente
  db/
    index.ts             # cria a conexão escolhida
    schema.ts            # tabelas e tipos comuns
    migrate.ts           # executa migrações do dialeto ativo
  modules/urls/
    url.routes.ts        # endpoints e contratos HTTP
    url.service.ts       # regras de criação, resolução e métricas
    url.repository.ts    # operações persistentes
    url.schemas.ts       # validação de payload e parâmetros
  plugins/
    error-handler.ts
    rate-limit.ts
```

## Configuração

```dotenv
PORT=3000
BASE_URL=http://localhost:3000
DB_CLIENT=sqlite
SQLITE_FILE=./data/urls.sqlite
# Para PostgreSQL:
# DB_CLIENT=postgres
# DATABASE_URL=postgres://user:password@localhost:5432/url_shortener
DEFAULT_TTL_DAYS=0
# Segredos de autenticação devem ser injetados pelo ambiente/secret manager.
# Nunca salvar valores reais no arquivo versionado.
```

`DB_CLIENT` aceita apenas `sqlite` ou `postgres`. PostgreSQL exige `DATABASE_URL` válida. `DEFAULT_TTL_DAYS=0` significa que links não expiram por padrão.

## Modelo de dados

Tabela `urls`:

| Campo | Tipo lógico | Observação |
|---|---|---|
| `id` | inteiro/serial | Chave primária gerada pelo banco |
| `code` | texto | Único, case-sensitive, 6–12 caracteres |
| `target_url` | texto | URL absoluta validada; limite recomendado de 2048 caracteres |
| `created_at` | timestamp | UTC |
| `expires_at` | timestamp nullable | Link expirável |
| `is_active` | boolean | Começa `true`; pode ser pausado e reativado pelo dono ou por admin |
| `click_count` | inteiro | Contador agregado; começa em zero e acompanha redirecionamentos registrados |
| `user_id` | inteiro/serial nullable | Dono do link; nullable apenas para links legados/anônimos, se habilitados |

Tabela `users`: `id`, `email` (único, normalizado), `password_hash`, `role` (`user` ou `admin`), `email_verified_at`, `created_at`, `updated_at`, `disabled_at` nullable. Desativar uma conta revoga suas sessões e marca como inativos todos os links do usuário. Reativar a conta não reativa os links automaticamente; cada link precisa ser reativado explicitamente pelo dono ou por um admin.

Tabela `sessions`: hash SHA-256 único do token opaco, `user_id`, `expires_at` e `revoked_at` nullable. O token aleatório em claro é enviado somente no cookie; nunca é persistido nem registrado em logs. O TTL é sete dias. Logout e desativação de conta revogam a sessão imediatamente. Esta decisão substitui JWT/refresh para permitir revogação server-side simples e checagem atual do estado da conta em cada requisição.

Tabela `click_events`: `id`, `url_id`, `occurred_at` (UTC). Cada redirecionamento registrado cria um evento para permitir métricas ao longo do tempo. Não armazenar IP, identificador do visitante, user-agent, query string nem URL de referência. Definir retenção configurável e permitir apagar eventos antigos sem alterar o contador histórico agregado. O contador `click_count` e o evento devem ser gravados na mesma transação para não divergir.

Índices: restrição única em `code`, índice em `expires_at` e índice composto em `click_events(url_id, occurred_at)`. A métrica conta redirecionamentos registrados; não promete identificar pessoas únicas nem filtrar todos os robôs.

## API inicial

- `POST /api/urls` — requer usuário autenticado; recebe `{ "url": "https://...", "customCode?": "...", "expiresAt?": "ISO-8601" }`; responde `201` com `code`, `shortUrl`, `targetUrl`, `expiresAt`, `isActive` e `clickCount`.
- `GET /:code` — só redireciona quando o link existe, está ativo, não expirou e pertence a uma conta ativa. Registra o evento e incrementa `click_count` atomicamente antes de responder `302` com `Location` apontando para a URL de destino. Links inexistentes, inativos, pertencentes a contas desativadas ou expirados respondem `404` sem registrar clique.
- `GET /api/urls/:code` — dono consulta metadados, estado, total de cliques e série temporal agregada; admin pode consultar qualquer link; não expõe dados de visitantes.
- `PATCH /api/urls/:code` — dono atualiza `{ "isActive": true | false }`; admin pode atualizar qualquer link. A resposta inclui o estado persistido. Reativar um link expirado não estende sua validade; ele continua sem redirecionar e aparece como expirado.
- `GET /api/urls/:code/stats?from=...&to=...&interval=day` — dono consulta contagens agregadas por período; admin pode consultar qualquer link. Limitar intervalos aceitos e validar datas em UTC.
- `GET /health` — verifica disponibilidade HTTP e do banco.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` — cadastro, abertura e encerramento de sessão opaca. Não há endpoint de refresh.
- `GET /api/me`, `GET /api/me/urls` — perfil e links do usuário autenticado.
- `/api/admin/*` — gerenciamento de usuários, links e métricas globais; todos os endpoints exigem papel `admin`.

Cadastro público sempre cria papel `user`. Nunca aceitar `role` vindo do formulário ou confiar em um papel fornecido pelo cliente. Criar o primeiro administrador por comando de bootstrap/seed protegido no ambiente operacional; permitir que admins alterem papéis com auditoria.

Para códigos automáticos, usar Base62 sobre um identificador gerado, ou gerar código aleatório criptograficamente seguro e repetir em caso de colisão. A primeira opção produz códigos previsíveis; a segunda reduz enumeração. Para este serviço, preferir aleatório e impor unicidade no banco, com algumas tentativas limitadas. Códigos personalizados devem validar charset e tamanho, e colisões retornam `409`.

## Regras importantes

- Aceitar apenas `http:` e `https:`; rejeitar outros esquemas.
- Não buscar nem validar o destino fazendo requisições de saída. Isso reduz risco de SSRF.
- Aplicar limite de requisições, especialmente em criação e redirecionamento.
- Fazer a gravação do evento e o incremento do contador atomicamente no banco para evitar perda concorrente ou divergência entre o total e os eventos retidos.
- Um link inativo fica pausado: não redireciona e não registra novos cliques, mas seus metadados e estatísticas anteriores continuam visíveis ao dono e ao admin. Expiração e inativação são condições separadas; reativar não remove a expiração. Desativar uma conta revoga suas sessões e inativa todos os links dela na mesma transação; reativar a conta não reativa os links automaticamente.
- Comparar expiração com UTC e tratar `expires_at <= agora` como expirado.
- Não registrar query strings completas nem credenciais eventualmente presentes nas URLs nos logs.
- Fechar pool/conexão em `SIGINT` e `SIGTERM`.
- Aplicar autorização por proprietário em toda leitura/alteração de links, além da autenticação. Usar consultas com `user_id` no filtro para reduzir risco de IDOR.
- Armazenar senhas com Argon2id (parâmetros atuais revisados na implementação) e limitar tentativas de login/cadastro/recuperação.
- Exigir HTTPS em produção; não registrar senhas, JWTs, cookies ou tokens de recuperação.

## Estratégia de persistência

Definir uma interface de repositório consumida pelo serviço (`create`, `findByCode`, `recordClick`, `setActive`, `getStats`). `recordClick` grava evento e contador na mesma transação. A composição da aplicação escolhe a implementação do driver no arranque com base em `DB_CLIENT`. O restante do domínio usa tipos comuns e não importa `better-sqlite3` nem `pg` diretamente.

SQLite é adequado para uso local e baixo volume, com arquivo persistente e backup. PostgreSQL é a opção para múltiplas instâncias, concorrência maior e operação gerenciada. A troca de banco requer aplicar as migrações correspondentes e configurar a variável adequada.

## Etapas de implementação

1. Criar o projeto TypeScript, scripts de desenvolvimento/build e validação de ambiente.
2. Implementar schema, conexão selecionável e migrações para ambos os bancos.
3. Implementar serviço e repositório com geração segura de códigos.
4. Expor endpoints, validação, erros padronizados e limitação de taxa.
5. Documentar execução local, migrações, configuração PostgreSQL e operação.

## Contas e sessões

Usar senha Argon2id e sessão opaca aleatória server-side. O cookie `encurt_session` usa `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção e expiração de sete dias. Persistir somente SHA-256 do token. Hoje, validar `Origin` nas mutações quando presente e rejeitar origem diferente; `Origin` ausente é aceito. Exigir origem confiável nas mutações de navegador autenticadas por cookie é uma pendência CSRF antes de produção. Não há token CSRF separado. `SameSite=Lax` e o bloqueio de origem cruzada complementam o uso de mesma origem. O servidor consulta a sessão, papel e estado da conta em cada requisição. Logout e desativação revogam a sessão no servidor. Não usar JWT, refresh token, localStorage ou sessionStorage para credenciais de sessão.

## Painel administrativo

O painel permite listar, buscar, desativar e reativar contas; listar/remover links; pausar/reativar links; consultar métricas agregadas; e promover/rebaixar usuários. Exigir papel admin no servidor em cada operação, registrar trilha de auditoria para alterações administrativas e aplicar paginação/filtros. Não oferecer visualização de senhas, tokens ou dados pessoais de clique. As métricas devem ser agregadas e respeitar retenção/privacidade.

## Interface e identidade visual

Construir UI responsiva em Vue 3 + JavaScript com Vite, usando Composition API e Vue Router para navegação, servida junto à API ou em origem controlada. Áreas: landing page, cadastro/login, dashboard do usuário para criar/copiar/gerir links e painel admin protegido por papel. No dashboard, mostrar total de cliques, gráfico agregado por período e estatísticas por link; cada link exibe badge Ativo/Inativo e ação para pausar ou reativar, com confirmação clara do efeito no redirecionamento. Links expirados devem ter indicação própria, separada de Inativo. As listas de usuários e links oferecem busca, filtros e paginação; o painel admin permite alterar papéis e administrar links, com auditoria. Manter autenticação e chamadas à API em composables/serviços separados dos componentes de tela; incluir estados claros de carregamento, vazio, sucesso e erro, confirmação para ações destrutivas, navegação por teclado, contraste acessível e layout utilizável em telas pequenas.

### Referências visuais

Usar os mockups abaixo como referência de hierarquia, espaçamento, superfícies, cores e densidade de informação ao implementar a UI. São exemplos de direção visual; manter os requisitos funcionais e responsivos descritos acima.

**Dashboard do usuário**

![Mockup do dashboard do usuário](user-ui.svg)

**Painel administrativo**

![Mockup do painel administrativo](admin-ui.svg)

Usar uma paleta escura inspirada na interface do Codex, sem depender de copiar logotipo ou ativos proprietários: fundo grafite/carvão, superfícies em cinza escuro, texto branco suave, texto secundário cinza e uma cor de destaque verde/ciano discreta para ações e foco. Manter cores semânticas consistentes para sucesso, aviso e erro, com contraste WCAG AA; oferecer preferência clara/escura ou ao menos respeitar `prefers-color-scheme`. Definir tokens CSS para cores, espaçamento, raios e foco para facilitar ajustes posteriores.

