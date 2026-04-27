# CLAUDE.md — Guia para Agentes de IA

Documento otimizado para LLMs trabalhando neste repositório. Carregado automaticamente pelo Claude Code. Mantenha conciso, factual e com caminhos clicáveis.

## Visão geral

`whatsapp-api-nodejs` (rapidhub-wpp-api) é uma API REST sobre [Baileys](https://github.com/WhiskeySockets/Baileys) que expõe múltiplas instâncias do WhatsApp Web (multi-device) via HTTP, com persistência em PostgreSQL (Prisma) e webhooks de eventos.

- Linguagem: **TypeScript** (ESM, `"type": "module"`)
- Runtime: Node.js, build com `tsc` → `dist/`
- Servidor: Express 4
- Banco: PostgreSQL via Prisma (`prisma/schema.prisma`)
- WhatsApp: `@whiskeysockets/baileys` v6.7.x
- Logger: `pino`
- Estado in-memory: `global.WhatsAppInstances` (mapa `key → WhatsAppInstance`) — declarado em [src/config/express.ts:19](src/config/express.ts#L19) e tipado em [src/types/global.d.ts](src/types/global.d.ts)

## Comandos essenciais

| Tarefa | Comando |
| --- | --- |
| Dev (nodemon + tsx) | `yarn dev` |
| Build TypeScript | `yarn build` |
| Produção | `yarn start` (executa `dist/server.js`) |
| Lint | `yarn lint:check` / `yarn lint:fix` |
| Format | `yarn format:check` / `yarn format:write` |
| Testes | `yarn test` (mocha em `tests/`) |
| Enviar msg de teste | `yarn send:test` ([scripts/send-test-message.js](scripts/send-test-message.js)) |
| Listar grupos | `yarn groups:list` ([scripts/list-groups.js](scripts/list-groups.js)) |
| Migração Prisma | `npx prisma migrate dev` (precisa de `DATABASE_URL`) |

Banco precisa estar de pé antes do `start`/`dev`. Em ambiente local há `docker-compose.yml`.

## Estrutura

```
src/
  server.ts                       # bootstrap + restore de sessões + handlers de processo
  config/
    config.ts                     # leitura/saneamento de envs (única fonte de verdade)
    express.ts                    # app Express, middlewares globais, registro de rotas
  api/
    routes/
      index.ts                    # mount points: /instance, /message, /group, /misc, /v1, /docs
      instance.route.ts           # rotas legadas RPC-style
      message.route.ts
      group.route.ts
      misc.route.ts
      v1.route.ts                 # superfície REST nova (preferir nas integrações novas)
      docs.route.ts               # GET /openapi.yaml e GET /docs (Swagger UI)
    controllers/
      instance.controller.ts      # init/qr/qrbase64/info/restore/logout/delete/list
      message.controller.ts       # text/image/video/audio/doc/mediaurl/button/contact/list/setstatus/mediabutton/read/react
      group.controller.ts
      misc.controller.ts
    middlewares/
      tokenCheck.ts               # Authorization: Bearer <TOKEN> (somente se PROTECT_ROUTES=true)
      keyCheck.ts                 # valida ?key= e restaura instância persistida se necessário
      loginCheck.ts               # exige instância ONLINE (rejeita se phone desconectado)
      paramKey.ts                 # bindParamToQuery para rotas /v1/:key — copia params → query
      error.ts                    # error handler global
    class/
      instance.ts                 # WhatsAppInstance — núcleo: socket, eventos, envio, webhook
      session.ts                  # Session.restoreSessions() — recupera de Prisma
    helper/
      prismaClient.ts             # singleton Prisma + connectPrisma()
      prismaAuthState.ts          # auth state do Baileys persistido no Postgres
      downloadMsg.ts, processbtn.ts, genVc.ts, sleep.ts
    errors/                       # ApiError, ExtendableError
    views/qrcode.ejs              # template usado por GET /instance/qr (HTML)
prisma/schema.prisma              # modelos: Session, AuthState, Chat
openapi/openapi.yaml              # spec OpenAPI 3.1 das rotas /v1
```

## Configuração (.env)

Todas as envs são lidas em [src/config/config.ts](src/config/config.ts). Valores não definidos caem nos defaults abaixo.

| Var | Default | Função |
| --- | --- | --- |
| `PORT` | `3333` | Porta HTTP |
| `TOKEN` | `''` | Bearer token quando `PROTECT_ROUTES=true` |
| `PROTECT_ROUTES` | `false` | Liga `tokenCheck` global em todas as rotas |
| `RESTORE_SESSIONS_ON_START_UP` | `false` | Recarrega sessões persistidas ao subir |
| `APP_URL` | `false` | Usado para montar URL do QR retornada em `/init` |
| `LOG_LEVEL` | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent` |
| `INSTANCE_MAX_RETRY_QR` | `2` | Limite de retries de QR |
| `CLIENT_PLATFORM` | `windows` | `ubuntu`/`linux`/`windows`/`macos`/`darwin`/`baileys` |
| `CLIENT_BROWSER` | `Chrome` | Nome do navegador exibido no WhatsApp |
| `CLIENT_VERSION` | `4.0.0` | Versão do cliente |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/whatsapp_api?schema=public` | Conexão Prisma |
| `WEBHOOK_ENABLED` | `false` | Habilita webhook globalmente (sobrescreve flag por instância) |
| `WEBHOOK_URL` | `''` | URL padrão para POST de eventos |
| `WEBHOOK_BASE64` | `false` | Anexa `msgContent` em base64 para mídia |
| `WEBHOOK_ALLOWED_EVENTS` | `all` | CSV; ver lista abaixo. **Nunca** deixar vazio |
| `MARK_MESSAGES_READ` | `false` | Marca mensagens recebidas como lidas automaticamente |

## Endpoints

### Health / Docs

- `GET /status` → `OK`
- `GET /openapi.yaml` → spec OpenAPI 3.1
- `GET /docs` → Swagger UI

### REST `v1` (preferir em código novo) — [src/api/routes/v1.route.ts](src/api/routes/v1.route.ts)

| Método | Path | Body / Query |
| --- | --- | --- |
| `POST` | `/v1/instances` | body: `{ key?, webhook?, webhookUrl? }` |
| `GET` | `/v1/instances` | `?active=true` retorna apenas keys persistidas |
| `POST` | `/v1/instances/restore` | restaura todas as sessões persistidas |
| `GET` | `/v1/instances/:key` | info da instância |
| `DELETE` | `/v1/instances/:key` | apaga sessão e remove do mapa |
| `DELETE` | `/v1/instances/:key/session` | logout (mantém key livre para novo init) |
| `GET` | `/v1/instances/:key/qr` | retorna QR base64 + status |
| `POST` | `/v1/instances/:key/messages` | body: `{ to, message }` (aceita `id` em vez de `to`) |
| `POST` | `/v1/instances/:key/groups/:groupId/messages` | body: `{ message }` |
| `GET` | `/v1/instances/:key/groups` | grupos cacheados |
| `GET` | `/v1/instances/:key/groups/live` | força fetch ao Baileys |
| `DELETE` | `/v1/instances/:key/groups/:groupId` | sai do grupo |

`bindParamToQuery` ([src/api/middlewares/paramKey.ts](src/api/middlewares/paramKey.ts)) copia `:key`/`:groupId` da URL para `req.query` para reaproveitar os controllers legados.

### Legadas RPC-style (todas usam `?key=`)

`instance`: `GET|POST /instance/init`, `GET /instance/qr` (HTML), `GET /instance/qrbase64`, `GET /instance/info`, `GET|POST /instance/restore`, `GET|POST|DELETE /instance/logout`, `DELETE /instance/delete`, `GET /instance/list[?active=true]`

`message` (todas POST, `?key=`): `/text`, `/image`, `/video`, `/audio`, `/doc`, `/mediaurl`, `/button`, `/contact`, `/list`, `/mediabutton`, `/read`, `/react`, `PUT /setstatus`. Mídias usam `multer` em memória (campo `file`).

`group`: `/create`, `/listall` (GET), `/leave` (GET|DELETE), `/inviteuser`, `/makeadmin`, `/demoteadmin`, `/getinvitecode` (GET), `/getinstanceinvitecode` (GET), `/getallgroups` (GET), `/participantsupdate`, `/settingsupdate`, `/updatesubject`, `/updatedescription`, `/inviteinfo`, `/groupjoin`

`misc`: `/onwhatsapp` (GET), `/downProfile` (GET), `/getStatus` (GET), `/blockUser` (GET), `/updateProfilePicture` (POST), `/getuserorgroupbyid` (GET)

## Autenticação e middlewares

1. `tokenCheck` ([src/api/middlewares/tokenCheck.ts](src/api/middlewares/tokenCheck.ts)) — global, **só ativa quando `PROTECT_ROUTES=true`**. Espera `Authorization: Bearer <TOKEN>`.
2. `keyCheck` ([src/api/middlewares/keyCheck.ts](src/api/middlewares/keyCheck.ts)) — exige `?key=` válido. Se a key não está em memória, tenta restaurar do banco antes de rejeitar (com lock para evitar race).
3. `loginCheck` ([src/api/middlewares/loginCheck.ts](src/api/middlewares/loginCheck.ts)) — exige `instance.online === true` (telefone conectado). Use em rotas que dependem do socket aberto.

Ordem típica: `bindParamToQuery → keyVerify → loginVerify → controller`.

## Identificadores (JIDs)

`WhatsAppInstance.getWhatsAppId(id)` ([src/api/class/instance.ts:999](src/api/class/instance.ts#L999)) normaliza:
- já contém `@g.us` ou `@s.whatsapp.net` → retorna como está
- contém `-` → grupo (`@g.us`)
- caso contrário → contato (`@s.whatsapp.net`)

`verifyId` lança `'no account exists'` se o número não estiver no WhatsApp.

## Webhook

Disparado por [WhatsAppInstance.SendWebhook](src/api/class/instance.ts#L144). Eventos só são enviados se:
1. Instância tem `allowWebhook=true` **E** `customWebhook` configurado, OU `WEBHOOK_ENABLED=true` global.
2. O nome do evento está em `config.webhookAllowedEvents`.

Payload: `POST { type, body, instanceKey }` com timeout 10s. Falhas são logadas mas não interrompem o fluxo.

Eventos suportados (ver README §WEBHOOK_ALLOWED_EVENTS):
`all`, `connection`, `connection.update`, `connection:open`, `connection:close`, `presence`, `presence.update`, `messages`, `messages.upsert`, `call`, `CB:call`, `call:offer`, `call:terminate`, `groups`, `groups.upsert`, `groups.update`, `group_participants`, `group-participants.update`.

`WEBHOOK_BASE64=true` baixa mídia (`image`/`video`/`audio`) e anexa em `msgContent` no payload de mensagem.

## Persistência

Modelos em [prisma/schema.prisma](prisma/schema.prisma):
- `Session(name unique)` — registra a key
- `AuthState(id, sessionId)` — credenciais do Baileys serializadas (BufferJSON em [src/api/helper/prismaAuthState.ts](src/api/helper/prismaAuthState.ts))
- `Chat(key, chat Json)` — cache de chats/grupos por instância

`deleteSessionData` (em `instance.ts`) apaga `Session` + cascata para `AuthState`. `Chat` é gerenciado separadamente.

## Ciclo de vida da instância

`WhatsAppInstance` ([src/api/class/instance.ts](src/api/class/instance.ts)) é o coração. Estados em `instance.connectionStatus`: `idle | connecting | qr | open | close | reconnecting | logging_out`.

- `init()` — idempotente via `initPromise`; chama `initializeSocket()`.
- `initializeSocket()` — derruba socket anterior, faz upsert de `Session`, carrega auth state, monta socket Baileys (versão obtida via `fetchLatestBaileysVersion`), registra handlers.
- `setHandler()` — escuta `creds.update`, `connection.update`, `chats.*`, `messages.upsert`, `messages.update`, `CB:call`, `groups.*`, `group-participants.update`. Usa `socketGeneration` para descartar callbacks de sockets velhos.
- `reconnectInstance()` — backoff linear (`baseWait * attempts`, máx 15 s, máx 10 tentativas). Não reconecta se `manualLogoutInProgress`, código terminal (`loggedOut`/`badSession`/`multideviceMismatch`/`forbidden`), ou `405` (rejeição upstream).
- `logoutInstance()` — flag `manualLogoutInProgress=true`, chama `sock.logout()`, derruba socket, apaga sessão.
- Mensagens recebidas (não `fromMe`) são logadas no console em pt-BR com emojis (📩 / 👥) — esse log é intencional, **não remover sem perguntar**.

## Convenções e armadilhas

- **ESM puro**: imports usam extensão `.js` mesmo em arquivos `.ts` (ex.: `from './session.js'`). Manter o padrão.
- **Acesso a instâncias**: sempre via `WhatsAppInstances[key]` (global). Não criar mapas paralelos.
- **`req.query.key`**: padrão em todos os controllers. Em rotas `v1`, `bindParamToQuery` já populou. Não trocar para `req.params` sem ajustar o middleware.
- **Erros do Baileys** geralmente vêm com `error.output.statusCode` (Boom). Códigos relevantes: `408` (pre-key timeout / QR expirado), `405` (registro rejeitado), `515` (restart required), `DisconnectReason.loggedOut/badSession/multideviceMismatch/forbidden` (terminais).
- **Mensagens em português**: as mensagens de erro retornadas em `lastConnectionError` e respostas de QR estão em pt-BR. Manter o idioma ao adicionar novas.
- **Não usar `--no-verify`** em commits (pre-commit roda `lint-staged` com Prettier).
- **Logs `console.log` de mensagens recebidas** ([src/api/class/instance.ts:778-800](src/api/class/instance.ts#L778-L800)) são feature, não debug residual.
- **Suprimir log spam**: `createBaileysLogger()` rebaixa para `warn` três cenários: stream-error com restart-required, pre-key upload timeout, e "No session found to decrypt message".
- **`lastDisconnectCode`** alimenta `buildQrFailureMessage` em [instance.controller.ts:37](src/api/controllers/instance.controller.ts#L37) — preserve esse contrato ao mexer no fluxo de QR.

## Tarefas comuns

- **Adicionar nova rota `v1`**: editar [src/api/routes/v1.route.ts](src/api/routes/v1.route.ts), reusar controllers legados via `bindParamToQuery`, atualizar [openapi/openapi.yaml](openapi/openapi.yaml).
- **Adicionar tipo de mensagem**: novo controller em `message.controller.ts` + método em `WhatsAppInstance` + rota em `message.route.ts` (e opcionalmente `v1.route.ts`).
- **Adicionar campo persistido**: editar `prisma/schema.prisma`, rodar `npx prisma migrate dev --name <descrição>`, regenerar client (`npx prisma generate`).
- **Mexer em reconexão**: lógica concentrada em `reconnectInstance`/`setDisconnectState` em [instance.ts](src/api/class/instance.ts). Testar com cenários 408, 515, e logout manual.
- **Novo evento de webhook**: adicionar handler em `setHandler()`, gatear pela whitelist `config.webhookAllowedEvents`, atualizar README §WEBHOOK_ALLOWED_EVENTS.

## Testes manuais rápidos

```bash
# 1. Criar instância
curl -X POST http://localhost:3333/v1/instances -H 'Content-Type: application/json' -d '{}'

# 2. Pegar QR (base64 PNG data URL)
curl http://localhost:3333/v1/instances/<KEY>/qr

# 3. Após escanear, enviar texto
curl -X POST http://localhost:3333/v1/instances/<KEY>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"5511999999999","message":"oi"}'
```

## Limites conhecidos / dívida

- Sem testes automatizados cobrindo o socket Baileys (apenas placeholder em `tests/`).
- `WhatsAppInstances` é in-memory — sem suporte a múltiplos workers/cluster.
- `setHandler` mistura cache local (`this.instance.chats/messages`) com banco — risco de divergência sob concorrência alta.
- Algumas mensagens de erro de grupo são strings hardcoded em inglês ([instance.ts:1239+](src/api/class/instance.ts#L1239)).
