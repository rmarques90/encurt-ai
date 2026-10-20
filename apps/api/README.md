# @encurt-ai/api

Backend inicial do encurt.ai, executado como workspace npm independente.

## Desenvolvimento

Na raiz do monorepo: `npm install`, `npm run dev:api`, `npm run typecheck` e `npm test`.
O arquivo SQLite local padrão é `./data/encurt-ai.sqlite`; configure `SQLITE_FILE` e `PORT` conforme necessário. `BASE_URL` define a origem usada para formar os links curtos.

As configurações locais ficam no `.env` da raiz, carregado automaticamente pela API. O `.env` já vem preenchido para desenvolvimento; em outra cópia do projeto use `Copy-Item .env.example .env`. A chave incluída é fixa e serve somente para desenvolvimento local. Para produção, gere uma chave hexadecimal de 64 caracteres com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, injete-a por um gerenciador de segredos e preserve-a entre inicializações. Sem a mesma chave, os nomes não podem ser descriptografados. A primeira inicialização migra e criptografa os nomes existentes.

Se a API estiver atrás de um proxy HTTPS, configure `TRUSTED_PROXY_IPS` com os endereços IP ou CIDRs exatos dos proxies que podem se conectar à API, separados por vírgula. Sem essa configuração, o Fastify não confia em `X-Forwarded-*`. A lista aceita somente IPs/CIDRs IPv4 ou IPv6 e rejeita curingas e redes `/0`. Configure o proxy para substituir os cabeçalhos encaminhados, preservar `Host` e bloqueie conexões públicas diretas à porta da API. Não use `0.0.0.0/0` ou `::/0`.

`DB_CLIENT` aceita `sqlite` (padrão) ou `postgres`. Postgres requer `DATABASE_URL` no formato `postgres://` ou `postgresql://`; a seleção é validada sem revelar credenciais. As migrações SQLite registram versões na tabela `schema_migrations` e preservam a conversão da tabela `audit_logs` legada.

Para criar a primeira conta administrativa, registre a conta normalmente e então execute na raiz:

```powershell
npm run bootstrap-admin -- --email admin@example.com --password "uma-senha-com-12-caracteres"
```

O comando requer que a conta já exista e promove somente o e-mail informado. Em produção use HTTPS; os cookies passam a `Secure` automaticamente quando `NODE_ENV=production`.

## Endpoints implementados

- `POST /api/auth/register` `{email,password,name?}` cria sempre papel `user` e abre sessão; se `name` for omitido, usa a parte do e-mail antes do `@`.
- `POST /api/auth/login` `{email,password}` abre sessão; `POST /api/auth/logout` revoga-a.
- `GET /api/me` e `GET /api/me/urls` retornam perfil e links próprios. `PATCH /api/me/password` `{currentPassword,newPassword}` troca a senha, encerra outras sessões e mantém a sessão atual com um novo token.
- `POST /api/urls` `{url,customCode?,expiresAt?,description?}`; the optional free-text description is limited to 200 characters. `GET /api/urls/:code`; `PATCH /api/urls/:code` accepts `{isActive}` or `{description}`.
- `GET /api/urls/:code/stats?from&to&interval=day` retorna total e série agregada diária.
- `GET /:code` redireciona links elegíveis com 302; evento mínimo e contador são gravados na mesma transação.
- `GET /api/admin/overview` e `GET /api/admin/users?limit&offset` exigem papel admin.
- `PATCH /api/admin/users/:id` `{isDisabled}` exige admin. A desativação marca a conta, revoga sessões ainda válidas, pausa os links e grava auditoria atomicamente. Reativar limpa somente `disabled_at`; links continuam inativos.
- `GET /health` faz verificação básica do processo e banco.

Erros seguem `{error:{code,message,requestId}}`. Clique armazena somente o ID interno do link e horário UTC, sem IP, user-agent, referer, query string ou ID de visitante. Nenhuma validação faz requisição ao destino.

## Limites da primeira versão

Este backend está em desenvolvimento. As rotas usam handlers Fastify em `src/app.ts`, serviços de domínio em `src/modules` e interfaces de repositório implementadas com Drizzle. `better-sqlite3` fica restrito à composição da conexão. O bootstrap administrativo ainda usa SQL direto como ferramenta operacional.

SQLite é o único adaptador funcional neste build. O registro de migrações mantém compatibilidade com o arquivo SQLite existente e inclui a conversão auditada de `audit_logs` legado. A seleção e validação do URL PostgreSQL já existem, mas o adaptador assíncrono, migrações PostgreSQL e conversão dos repositórios ainda estão pendentes. Não foi configurado CORS: use proxy de mesma origem para o frontend. As verificações de origem rejeitam mutações de origem cruzada quando o cabeçalho Origin existe. Rate limits e configurações de proxy ainda precisam de revisão para produção.

Account, role, and link administration is audited. Contracts for this release are listed below. SQLite schema changes are recorded in `schema_migrations` (versions 1 and 2); PostgreSQL migrations remain pending.

## Listagens e operações administrativas

- `GET /api/me/urls?search=&status=all|active|inactive|expired&page=1&pageSize=10` retorna `{items,total,page,pageSize}`. A consulta restringe a propriedade no repositório; status expirado usa `expires_at <= agora` em UTC.
- `GET /api/me/stats?from=&to=&interval=day` retorna contagem e série diária somente dos links do usuário, agregada de `click_events` sem identificação de visitantes.
- `GET /api/admin/urls` aceita os mesmos filtros de link e exige admin. `PATCH /api/admin/urls/:code` aceita `{isActive}`; `DELETE /api/admin/urls/:code` remove o link.
- `GET /api/admin/users?search=&status=all|active|disabled&role=all|user|admin&page=1&pageSize=10` retorna envelope paginado. `PATCH /api/admin/users/:id` aceita exatamente `{isDisabled}` ou `{role:'user'|'admin'}`.
- Todas as mutações administrativas são auditadas junto com a mutação na mesma transação. A remoção registra ID e código mínimos antes do hard-delete; o destino e seus parâmetros não entram na auditoria.
- A migração SQLite versionada `2` ajusta `audit_logs` legado para permitir as ações de papel e link.

## Sessões e suporte de banco

As sessões usam cookie opaco `encurt_session` com TTL de sete dias. O valor aleatório em claro fica no cookie HttpOnly; somente seu hash SHA-256 é armazenado em `sessions`. `Secure` é habilitado em produção, `SameSite=Lax`, logout e desativação revogam sessões, e mutações rejeitam cabeçalho `Origin` de outra origem quando ele está presente. `Origin` ausente é aceito hoje; exigir origem confiável nas mutações de navegador autenticadas por cookie é uma pendência CSRF antes da produção. Quando configurado, `TRUSTED_PROXY_IPS` faz o Fastify usar o protocolo encaminhado somente para conexões originadas nos proxies listados; sem ele, cabeçalhos encaminhados não são confiáveis. Esta escolha substitui JWT/refresh: a API consulta a sessão e o estado da conta no servidor, permitindo revogação imediata sem token de renovação.

Nomes de perfil são criptografados no banco com AES-256-GCM; a chave fica fora do banco em `DATA_ENCRYPTION_KEY`. Senhas permanecem como hashes Argon2id com salt, que não podem ser revertidos para o texto original. Não perca nem troque a chave de criptografia sem um processo de rotação e recriptografia.

As migrações SQLite têm registro de versão (atualmente até a versão 4, que criptografa nomes de perfil). O adaptador PostgreSQL assíncrono, suas migrações e a conversão integral dos repositórios/serviços ainda não estão disponíveis; `DB_CLIENT=postgres` é validado, mas o processo falha explicitamente em vez de abrir SQLite por engano.


