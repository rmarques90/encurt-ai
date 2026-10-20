# encurt.ai

**Idioma:** [English](README.md) | Português (Brasil)

encurt.ai é um encurtador de URLs com rastreamento de cliques, gerenciamento de links e painel administrativo. O repositório é um monorepo com workspaces npm: cliente web em Vue 3 e JavaScript e API em Node.js, TypeScript e Fastify. SQLite é o adaptador de banco de dados funcional.

## Funcionalidades

- Criar links curtos com código personalizado, data de expiração e descrição opcionais (até 200 caracteres).
- Copiar, editar, pausar e reativar links; links inativos ou expirados não redirecionam.
- Acompanhar o total de cliques e consultar estatísticas agregadas por dia. Os registros guardam o ID interno do link e o horário UTC, sem IP ou identificadores do navegador.
- Cadastrar e entrar com sessões baseadas em cookies; editar o nome da conta e trocar a senha na página de perfil.
- Usar a interface em português do Brasil ou inglês.
- Administrar usuários e links, atribuir papéis de usuário/admin, desativar contas e consultar métricas agregadas do sistema. Alterações administrativas são auditadas.
- Ao desativar uma conta, suas sessões são revogadas e seus links ficam inativos. Reativar a conta não reativa os links automaticamente.
- Exibir páginas específicas de erro 403, 404 e 500 no cliente web.

## Estrutura do repositório

```text
apps/
  api/     API Fastify, serviços de domínio em TypeScript, repositórios Drizzle, schema SQLite
  web/     Cliente Vue 3, JavaScript, Vue Router, Vite
README.md              Documentação principal em inglês
README.pt-BR.md        Documentação em português
ARCHITECTURE.md        Arquitetura, requisitos de segurança e notas de implementação
DESIGN.md              Requisitos de produto e UI com mockups de referência
user-ui.svg             Mockup do dashboard do usuário
admin-ui.svg            Mockup do painel administrativo
```

A API é organizada nos módulos de plataforma e administração, com composição de rotas em `apps/api/src/app.ts`, serviços de domínio em `apps/api/src/modules` e repositórios Drizzle. O cliente web separa rotas, chamadas de API, estado da sessão, notificações e componentes reutilizáveis.

## Requisitos

- Node.js 22.18 ou posterior (recomendamos Node 22 LTS).
- npm (o repositório usa npm workspaces).

## Desenvolvimento local

Execute os comandos na raiz do repositório. Instale as dependências:

```sh
npm install
```

Crie um arquivo de ambiente local se ainda não existir:

```powershell
Copy-Item .env.example .env
```

Os valores do exemplo são apenas para desenvolvimento local. Inicie a API e o cliente web em terminais separados:

```sh
npm run dev:api
```

```sh
npm run dev:web
```

Abra a URL do Vite exibida no terminal do frontend (normalmente `http://localhost:5173`). O Vite encaminha requisições `/api` e rotas de códigos curtos para a API em `http://localhost:3000`. Configure `API_PROXY_TARGET` se a API estiver em outro endereço.

## Deploy com domínio próprio

Em uma implantação típica, coloque um proxy reverso como Nginx, Caddy ou um balanceador gerenciado diante da API e sirva o cliente web compilado como arquivos estáticos. Aponte os registros DNS (`A`/`AAAA`, ou `CNAME` quando apropriado) para o servidor web ou balanceador e configure certificados HTTPS antes de receber tráfego de usuários.

Uma configuração simples usa um domínio para a aplicação, por exemplo `app.example.com`, e outro para os links curtos, por exemplo `go.example.com`:

1. Gere o frontend com `npm run build`. Sirva `apps/web/dist` em `app.example.com` e configure o servidor web para retornar `index.html` como fallback para rotas do cliente, como `/dashboard` e `/profile`.
2. Encaminhe `https://app.example.com/api/...` para a API. Preserve o cabeçalho `Host` recebido e encaminhe o protocolo e o endereço original do cliente (`X-Forwarded-Proto` e `X-Forwarded-For`). Navegador e API devem permanecer na mesma origem por meio desse proxy para que o cookie de sessão funcione sem credenciais entre origens.
3. Aponte `go.example.com` para o mesmo proxy reverso e direcione requisições de códigos curtos, como `/aB123xy`, para a API. Não use o fallback da SPA nesse domínio: o código curto precisa chegar à API para que ela redirecione.
4. Configure `BASE_URL=https://go.example.com` e `WEB_BASE_URL=https://app.example.com` no ambiente da API. Os novos links curtos usarão o domínio de links; acessos pelo navegador a códigos inexistentes serão redirecionados para a página 404 estilizada no domínio da aplicação. Se a aplicação e os links curtos compartilharem o domínio, configure os dois valores com essa origem.
5. Defina `NODE_ENV=production`, use um `DATA_ENCRYPTION_KEY` forte e persistente e mantenha `.env` e o banco SQLite fora da raiz pública do site. Reinicie a API após alterar as variáveis de ambiente.

Se o HTTPS terminar no proxy reverso, configure `TRUSTED_PROXY_IPS` com os IPs exatos de origem do proxy ou com a menor faixa CIDR privada que os contenha. Os valores são endereços IPv4/IPv6 ou CIDRs separados por vírgula; nomes de host, curingas e redes `/0` são rejeitados. Deixe vazio quando a API for acessada diretamente. A API só confia em cabeçalhos encaminhados quando o par TCP corresponde a essa lista. Configure o proxy para substituir `X-Forwarded-Proto` e `X-Forwarded-For`, preservar o `Host` público e impedir acesso público direto à porta da API. Para um proxy na mesma máquina, um exemplo é `TRUSTED_PROXY_IPS=127.0.0.1,::1`; em outras implantações, use os endereços que a API realmente enxerga, incluindo redes de containers ou balanceadores.

Por exemplo, se os usuários acessarem `https://app.example.com`, as chamadas à API também devem usar `https://app.example.com/api`; somente os links curtos gerados precisam usar `https://go.example.com`. `API_PROXY_TARGET` é usado pelo servidor de desenvolvimento Vite e não configura o servidor web de produção. Atualmente, a API não serve `apps/web/dist`.

**Limitação do proxy reverso:** a API compara o cabeçalho `Origin` ao protocolo e host vistos pelo Fastify, mas ainda não está configurada para confiar em cabeçalhos encaminhados pelo proxy. Quando o HTTPS termina no proxy e a conexão dele com a API usa HTTP, alterações feitas pelo navegador podem ser rejeitadas porque a API pode enxergar `http` enquanto o navegador envia uma origem `https`. Antes de usar essa topologia, configure o Fastify para confiar somente nos endereços conhecidos do proxy e garanta que o proxy substitua os cabeçalhos encaminhados, em vez de aceitar valores enviados pelo cliente. Não habilite confiança irrestrita em proxies se a API puder ser acessada diretamente. Essa configuração ainda não foi implementada; consulte também as notas de segurança abaixo.

## Variáveis de ambiente

Quando presente, a API carrega o `.env` da raiz do repositório. Variáveis já definidas no ambiente do processo têm precedência conforme o comportamento de `loadEnvFile` do Node.

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `DB_CLIENT` | `sqlite` | Seleção do banco. SQLite é o único adaptador implementado. |
| `SQLITE_FILE` | `./data/encurt-ai.sqlite` | Caminho do arquivo do banco SQLite. |
| `PORT` | `3000` | Porta de escuta da API. |
| `HOST` | `0.0.0.0` | Interface de rede da API. |
| `BASE_URL` | `http://localhost:<PORT>` | URL base pública usada para gerar links curtos. |
| `WEB_BASE_URL` | `http://localhost:5173` fora de produção; vazio em produção | Origem do frontend para acessos de navegador a links inexistentes. Configure com a origem pública da aplicação em produção. |
| `DATA_ENCRYPTION_KEY` | Nenhum padrão no código; fornecido pelo `.env.example` local | Chave hexadecimal de 64 caracteres para criptografar nomes de perfil. |
| `TRUSTED_PROXY_IPS` | Vazio (cabeçalhos de proxy não são confiáveis) | IPs ou CIDRs separados por vírgula para proxies reversos confiáveis. |
| `API_PROXY_TARGET` | `http://localhost:3000` | Destino do proxy de desenvolvimento do Vite. |
| `NODE_ENV` | Padrão do Node.js | Use `production` para ativar o atributo `Secure` do cookie de sessão. |

Gere uma chave de criptografia para produção com:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guarde a chave em um gerenciador de segredos, preserve-a entre implantações e não versione o `.env`. Se perder ou substituir a chave sem recriptografar os nomes armazenados, eles não poderão ser lidos. As senhas são armazenadas como hashes Argon2id e não podem ser revertidas ao texto original.

Atualmente, `DB_CLIENT=postgres` valida `DATABASE_URL` e falha explicitamente porque o adaptador e as migrações PostgreSQL ainda não foram implementados. Não há fallback para SQLite.

## Scripts npm

Execute na raiz do repositório:

| Comando | Descrição |
| --- | --- |
| `npm run dev:api` | Inicia a API em modo de observação. |
| `npm run dev:web` | Inicia o servidor de desenvolvimento Vite. |
| `npm test` | Executa os testes da API e do frontend. |
| `npm run typecheck` | Verifica os tipos do projeto TypeScript da API. |
| `npm run build` | Gera o build da API e do frontend. |
| `npm run bootstrap-admin -- --email <email> --password <senha>` | Promove uma conta existente a admin no banco SQLite configurado. |

O comando de bootstrap exige uma conta existente e senha de pelo menos 12 caracteres. Ele não cria uma conta. Primeiro faça o cadastro e então execute o comando. Tenha cuidado com senhas informadas na linha de comando, pois o terminal ou as ferramentas do sistema podem manter o histórico.

## Principais fluxos

1. Cadastre-se ou entre. O cadastro público sempre cria uma conta de usuário comum.
2. No Dashboard, crie um link; opcionalmente informe código personalizado, expiração e descrição.
3. Copie a URL curta, edite sua descrição, consulte métricas agregadas ou pause/reative o link.
4. Abra o menu do avatar para navegar ao Dashboard, Perfil e, para admins, Administração, ou sair.
5. No Perfil, edite o nome da conta ou troque a senha. A troca revoga outras sessões ativas e cria uma nova sessão para o navegador atual.
6. Admins podem buscar e paginar usuários e links, alterar papéis, desativar/reativar contas, gerenciar links, consultar métricas agregadas e revisar registros de auditoria pela API administrativa.

## Visão geral da API

Os endpoints autenticados usam o cookie HttpOnly `encurt_session`. Requisições que alteram dados rejeitam um cabeçalho `Origin` incompatível quando ele é enviado. Consulte o README da API para detalhes de requisições e respostas.

| Método | Endpoint | Acesso | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/health` | Público | Verificar saúde da API e do banco. |
| `POST` | `/api/auth/register` | Público | Criar conta e sessão. |
| `POST` | `/api/auth/login` | Público | Criar sessão. |
| `POST` | `/api/auth/logout` | Sessão, se presente | Revogar a sessão atual. |
| `GET` | `/api/me` | Usuário | Consultar a conta atual. |
| `PATCH` | `/api/me/name` | Usuário | Atualizar o nome da conta. |
| `PATCH` | `/api/me/password` | Usuário | Trocar senha e rotacionar sessão. |
| `GET` | `/api/me/urls`, `/api/me/stats` | Usuário | Buscar links próprios e consultar métricas agregadas. |
| `POST` | `/api/urls` | Usuário | Criar link curto. |
| `GET`, `PATCH` | `/api/urls/:code` | Dono ou admin | Consultar link; alterar estado ou descrição. |
| `GET` | `/api/urls/:code/stats` | Dono ou admin | Consultar métricas diárias agregadas do link. |
| `GET` | `/:code` | Público | Registrar clique elegível e redirecionar com HTTP 302. |
| `GET` | `/api/admin/overview`, `/api/admin/users`, `/api/admin/urls` | Admin | Consultar métricas agregadas e registros paginados. |
| `PATCH` | `/api/admin/users/:id`, `/api/admin/urls/:code` | Admin | Atualizar papel/estado da conta ou estado do link. |
| `DELETE` | `/api/admin/urls/:code` | Admin | Excluir link. |

Erros da API seguem `{ "error": { "code", "message", "requestId" } }`. O ID da requisição também aparece nos logs de erro do servidor.
Para um código curto inexistente, a navegação do navegador (`Accept: text/html`) redireciona para `${WEB_BASE_URL}/404`; clientes de API recebem a resposta JSON 404 usual.

## Segurança e privacidade

- Senhas usam Argon2id. Tokens de sessão são valores aleatórios opacos em cookies HttpOnly; somente seus hashes SHA-256 são armazenados no banco. Cookies usam `SameSite=Lax` e recebem `Secure` quando `NODE_ENV=production`.
- Nomes de perfil são criptografados com AES-256-GCM usando `DATA_ENCRYPTION_KEY`.
- A API aplica autorização nas rotas autenticadas, ações administrativas e propriedade dos links. O cadastro público não pode definir papel de admin.
- Cabeçalhos de segurança do Fastify, validação de requisições, consultas ORM parametrizadas e limites de requisição estão habilitados.
- O rastreamento de cliques armazena apenas ID do link e horário. Não armazena IP, user-agent, referenciador, ID de visitante ou query string.
- Alterações administrativas são auditadas. Os logs ocultam cookies, cabeçalhos de autorização e URLs das requisições.

Antes de usar em produção, revise as limitações conhecidas em [`apps/api/README.md`](apps/api/README.md) e [`ARCHITECTURE.md`](ARCHITECTURE.md), especialmente a validação de `Origin` quando o cabeçalho está ausente, a configuração atual da Content Security Policy desabilitada, os limites de requisição em produção, o gerenciamento e rotação de chaves e a ausência do adaptador PostgreSQL. Use HTTPS e sirva os arquivos gerados pelo frontend em um servidor web ou serviço de hospedagem configurado; atualmente, a API não serve o build do Vite.

## Validação

```sh
npm test
npm run typecheck
npm run build
```

O workspace web usa Vitest com jsdom e Vue Test Utils. O workspace da API usa Vitest para testes unitários de serviços, migrações e endpoints Fastify.

## Documentação complementar

- [Arquitetura e requisitos de segurança](ARCHITECTURE.md)
- [Produto e design da UI](DESIGN.md)
- [Desenvolvimento e endpoints da API](apps/api/README.md)
- [Referência do dashboard do usuário](user-ui.svg)
- [Referência do painel administrativo](admin-ui.svg)
