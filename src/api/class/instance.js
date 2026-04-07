/* eslint-disable no-unsafe-optional-chaining */
const QRCode = require('qrcode')
const pino = require('pino')
const {
    default: makeWASocket,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const { v4: uuidv4 } = require('uuid')
const processButton = require('../helper/processbtn')
const generateVC = require('../helper/genVc')
const axios = require('axios')
const config = require('../../config/config')
const downloadMessage = require('../helper/downloadMsg')
const sleep = require('../helper/sleep')
const logger = pino({ level: config.log.level })
const usePrismaAuthState = require('../helper/prismaAuthState')
const { prisma } = require('../helper/prismaClient')

function normalizeWebhookUrl(value) {
    if (typeof value !== 'string') return null
    const normalized = value.trim().replace(/^['"]|['"]$/g, '')
    return normalized.length > 0 ? normalized : null
}

function createBaileysLogger() {
    return pino({
        level: config.log.level,
        hooks: {
            logMethod(args, method, level) {
                const payload = args.find(
                    (arg) =>
                        arg &&
                        typeof arg === 'object' &&
                        !Array.isArray(arg)
                )
                const message =
                    args.find((arg) => typeof arg === 'string') || ''

                const isRestartRequiredStreamError =
                    message === 'stream errored out' &&
                    String(payload?.fullErrorNode?.attrs?.code || '') ===
                        String(DisconnectReason.restartRequired)

                const isPreKeyUploadTimeout =
                    message ===
                        'Failed to check/upload pre-keys during initialization' &&
                    (payload?.error?.output?.statusCode === 408 ||
                        payload?.error?.statusCode === 408 ||
                        String(payload?.error?.message || '')
                            .toLowerCase()
                            .includes('pre-key upload timeout'))

                const isMissingSessionDecrypt =
                    message === 'failed to decrypt message' &&
                    String(payload?.err?.message || '').includes(
                        'No session found to decrypt message'
                    )

                if (
                    level >= 50 &&
                    (
                        isRestartRequiredStreamError ||
                        isPreKeyUploadTimeout ||
                        isMissingSessionDecrypt
                    )
                ) {
                    return this.warn(...args)
                }

                return method.apply(this, args)
            },
        },
    })
}

class WhatsAppInstance {
    socketConfig = {
        defaultQueryTimeoutMs: void 0,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        printQRInTerminal: false,
        logger: createBaileysLogger(),
    }
    key = ''
    authState
    allowWebhook
    webhook
    socketGeneration = 0
    initPromise = null

    instance = {
        key: this.key,
        chats: [],
        qr: '',
        messages: [],
        qrRetry: 0,
        customWebhook: '',
        connectionStatus: 'idle',
        lastConnectionError: '',
        lastDisconnectCode: null,
        reconnectInProgress: false,
        reconnectAttempts: 0,
        manualLogoutInProgress: false,
    }

    axiosInstance = axios.create({
        baseURL: config.webhookUrl,
    })

    constructor(key, allowWebhook, webhook) {
        const customWebhook = normalizeWebhookUrl(webhook)
        const defaultWebhook = normalizeWebhookUrl(config.webhookUrl)
        const effectiveWebhookUrl = customWebhook || defaultWebhook

        this.key = key ? key : uuidv4()
        this.allowWebhook = config.webhookEnabled ? true : Boolean(allowWebhook)
        this.instance.customWebhook = effectiveWebhookUrl || ''

        if (this.allowWebhook && effectiveWebhookUrl) {
            this.axiosInstance = axios.create({
                baseURL: effectiveWebhookUrl,
            })
        }
    }

    async SendWebhook(type, body, key) {
        if (!this.allowWebhook) return

        if (!this.instance.customWebhook) {
            logger.warn(
                {
                    instanceKey: this.key,
                    type,
                },
                'WEBHOOK: Ignored event because WEBHOOK_URL is not configured'
            )
            return
        }

        try {
            await this.axiosInstance.post(
                '',
                {
                    type,
                    body,
                    instanceKey: key,
                },
                {
                    timeout: 10000,
                }
            )
        } catch (error) {
            logger.warn(
                {
                    instanceKey: this.key,
                    type,
                    error: error?.message || error,
                },
                'WEBHOOK: Failed to deliver event'
            )
        }
    }

    async init() {
        if (this.initPromise) {
            logger.debug(
                {
                    instanceKey: this.key,
                },
                'STATE: Initialization already in progress, waiting for current attempt'
            )
            return this.initPromise
        }

        this.initPromise = this.initializeSocket()
        try {
            return await this.initPromise
        } finally {
            this.initPromise = null
        }
    }

    async initializeSocket() {
        await this.teardownSocket()
        await prisma.session.upsert({
            where: { name: this.key },
            update: {},
            create: { name: this.key },
        })
        const { state, saveCreds } = await usePrismaAuthState(this.key)
        this.authState = { state: state, saveCreds: saveCreds }
        const socketConfig = await this.buildSocketConfig()
        socketConfig.auth = this.authState.state
        this.instance.connectionStatus = this.instance.reconnectInProgress
            ? 'reconnecting'
            : 'connecting'
        this.instance.manualLogoutInProgress = false
        this.instance.online = false
        this.instance.qr = ''
        this.instance.qrRetry = 0
        this.instance.sock = makeWASocket(socketConfig)
        this.socketGeneration += 1
        this.setHandler(this.socketGeneration)
        return this
    }

    async teardownSocket() {
        const sock = this.instance?.sock
        if (!sock) return

        try {
            if (typeof sock?.ev?.removeAllListeners === 'function') {
                sock.ev.removeAllListeners()
            }
            if (typeof sock?.ws?.removeAllListeners === 'function') {
                sock.ws.removeAllListeners()
            }
            if (
                sock?.ws &&
                typeof sock.ws.close === 'function' &&
                sock.ws.readyState === 1
            ) {
                sock.ws.close()
            }
        } catch (error) {
            logger.debug(
                {
                    instanceKey: this.key,
                    error: error?.message || error,
                },
                'STATE: Failed to teardown previous socket cleanly'
            )
        } finally {
            this.instance.sock = null
        }
    }

    async buildSocketConfig() {
        const browserName = config.browser.browser || 'Chrome'
        const platformName = (config.browser.platform || '')
            .toString()
            .trim()
            .toLowerCase()

        const browserProfiles = {
            ubuntu: Browsers.ubuntu,
            linux: Browsers.ubuntu,
            windows: Browsers.windows,
            win32: Browsers.windows,
            macos: Browsers.macOS,
            darwin: Browsers.macOS,
            baileys: Browsers.baileys,
            md: Browsers.baileys,
            whatsappmd: Browsers.baileys,
            'whatsapp md': Browsers.baileys,
        }

        const browserFactory = browserProfiles[platformName]
        const socketConfig = {
            ...this.socketConfig,
            browser: browserFactory
                ? browserFactory(browserName)
                : Browsers.appropriate(browserName),
        }

        socketConfig.getMessage = async (key) => {
            const msg = this.instance.messages.find(
                (m) =>
                    m.key.id === key.id &&
                    m.key.remoteJid === key.remoteJid
            )
            return msg?.message || { conversation: '' }
        }

        try {
            const latest = await fetchLatestBaileysVersion()
            if (latest?.version && !latest?.error) {
                socketConfig.version = latest.version
            } else if (latest?.error) {
                logger.warn(
                    {
                        instanceKey: this.key,
                        error: latest.error,
                    },
                    'STATE: Unable to fetch latest Baileys version, using default'
                )
            }
        } catch (error) {
            logger.warn(
                {
                    instanceKey: this.key,
                    error: error?.message || error,
                },
                'STATE: Unable to fetch latest Baileys version, using default'
            )
        }

        return socketConfig
    }

    setDisconnectState(disconnectCode, disconnectMessage) {
        this.instance.lastDisconnectCode = disconnectCode
        if (
            disconnectCode === DisconnectReason.timedOut &&
            disconnectMessage === 'QR refs attempts ended'
        ) {
            this.instance.lastConnectionError =
                'QR Code expirou antes do escaneamento. Gere um novo QR e escaneie imediatamente.'
            return
        }

        if (disconnectCode === 405) {
            this.instance.lastConnectionError =
                'Connection Failure (405). O WhatsApp rejeitou o registro deste dispositivo no momento.'
            return
        }

        if (disconnectCode === DisconnectReason.timedOut || disconnectCode === 408) {
            this.instance.lastConnectionError =
                'Request Time-out durante inicializacao (pre-keys). Reconectando automaticamente.'
            return
        }

        if (disconnectCode === DisconnectReason.restartRequired) {
            this.instance.lastConnectionError =
                'Stream Errored (restart required). Reconectando automaticamente.'
            return
        }

        this.instance.lastConnectionError = disconnectMessage
    }

    isTerminalDisconnectCode(disconnectCode) {
        return [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.multideviceMismatch,
            DisconnectReason.forbidden,
        ].includes(disconnectCode)
    }

    async reconnectInstance(disconnectCode) {
        const maxReconnectAttempts = 10
        if (this.instance.manualLogoutInProgress) {
            logger.info(
                {
                    instanceKey: this.key,
                    disconnectCode,
                },
                'STATE: Manual logout in progress, skipping reconnect'
            )
            return
        }

        if (this.instance.reconnectInProgress) {
            logger.debug(
                {
                    instanceKey: this.key,
                    disconnectCode,
                },
                'STATE: Reconnect already in progress, skipping duplicate reconnect'
            )
            return
        }

        if (this.instance.reconnectAttempts >= maxReconnectAttempts) {
            this.instance.lastConnectionError =
                'Numero maximo de tentativas de reconexao atingido. Tente iniciar a instancia novamente.'
            logger.error(
                {
                    instanceKey: this.key,
                    disconnectCode,
                    reconnectAttempts: this.instance.reconnectAttempts,
                    maxReconnectAttempts,
                },
                'STATE: Max reconnect attempts reached'
            )
            return
        }

        this.instance.reconnectInProgress = true
        this.instance.reconnectAttempts++

        this.instance.connectionStatus = 'reconnecting'
        const isPreKeyOrRequestTimeout =
            disconnectCode === DisconnectReason.timedOut || disconnectCode === 408
        const baseWaitMs = isPreKeyOrRequestTimeout
            ? 4500
            : disconnectCode === DisconnectReason.restartRequired
              ? 2500
              : 2000
        const waitMs = Math.min(
            baseWaitMs * this.instance.reconnectAttempts,
            15000
        )
        logger.warn(
            {
                instanceKey: this.key,
                disconnectCode,
                reconnectAttempts: this.instance.reconnectAttempts,
                waitMs,
            },
            'STATE: Reinitializing instance after disconnect'
        )

        try {
            await sleep(waitMs)
            await this.init()
        } catch (error) {
            logger.error(
                {
                    instanceKey: this.key,
                    disconnectCode,
                    reconnectAttempts: this.instance.reconnectAttempts,
                    error: error?.message || error,
                },
                'STATE: Failed to reinitialize instance'
            )
        } finally {
            this.instance.reconnectInProgress = false
        }
    }

    setHandler(currentSocketGeneration = this.socketGeneration) {
        const sock = this.instance.sock
        const isStaleSocket = () =>
            currentSocketGeneration !== this.socketGeneration ||
            sock !== this.instance.sock
        // on credentials update save state
        sock?.ev.on('creds.update', async () => {
            if (isStaleSocket()) return
            await this.authState.saveCreds()
        })

        // on socket closed, opened, connecting
        sock?.ev.on('connection.update', async (update) => {
            if (isStaleSocket()) return
            const { connection, lastDisconnect, qr } = update

            if (connection) {
                this.instance.connectionStatus = connection
                logger.debug(
                    {
                        instanceKey: this.key,
                        connection,
                        hasQr: Boolean(qr),
                        qrRetry: this.instance.qrRetry,
                    },
                    'STATE: WhatsApp connection update'
                )
            }

            if (connection === 'connecting') return

            if (connection === 'close') {
                this.instance.online = false
                this.instance.qr = ''
                const disconnectCode =
                    lastDisconnect?.error?.output?.statusCode || null
                const disconnectMessage =
                    lastDisconnect?.error?.message ||
                    lastDisconnect?.error?.output?.payload?.message ||
                    'Unknown connection error'

                this.setDisconnectState(disconnectCode, disconnectMessage)

                const isExpectedTransientClose =
                    disconnectCode === DisconnectReason.restartRequired ||
                    disconnectCode === DisconnectReason.timedOut ||
                    disconnectCode === 408

                logger[isExpectedTransientClose ? 'warn' : 'error'](
                    {
                        instanceKey: this.key,
                        connection,
                        disconnectCode,
                        disconnectMessage,
                        reconnectAttempts: this.instance.reconnectAttempts,
                        lastDisconnect:
                            lastDisconnect?.error?.output?.payload || null,
                    },
                    'STATE: WhatsApp connection closed'
                )

                if (this.instance.manualLogoutInProgress) {
                    logger.info(
                        {
                            instanceKey: this.key,
                            disconnectCode,
                        },
                        'STATE: Manual logout close event received'
                    )
                } else if (this.isTerminalDisconnectCode(disconnectCode)) {
                    await this.deleteSessionData(this.key)
                } else if (disconnectCode === 405) {
                    logger.error(
                        {
                            instanceKey: this.key,
                            disconnectCode,
                            guidance:
                                'Create a new session key and try again later. This is usually an upstream WhatsApp registration rejection.',
                        },
                        'STATE: Stopping reconnect due to upstream connection failure'
                    )
                } else {
                    await this.reconnectInstance(disconnectCode)
                }

                if (
                    [
                        'all',
                        'connection',
                        'connection.update',
                        'connection:close',
                    ].some((e) => config.webhookAllowedEvents.includes(e))
                )
                    await this.SendWebhook(
                        'connection',
                        {
                            connection: connection,
                        },
                        this.key
                    )
            } else if (connection === 'open') {
                this.instance.lastConnectionError = ''
                this.instance.lastDisconnectCode = null
                this.instance.reconnectAttempts = 0
                this.instance.manualLogoutInProgress = false
                logger.info(
                    {
                        instanceKey: this.key,
                    },
                    'STATE: WhatsApp connection opened'
                )
                await prisma.chat.upsert({
                    where: { key: this.key },
                    update: {},
                    create: {
                        key: this.key,
                        chat: [],
                    },
                })
                this.instance.online = true
                try {
                    await this.getAllGroups()
                } catch (error) {
                    logger.debug(
                        {
                            instanceKey: this.key,
                            error: error?.message || error,
                        },
                        'STATE: Failed to refresh group cache on open'
                    )
                }
                if (
                    [
                        'all',
                        'connection',
                        'connection.update',
                        'connection:open',
                    ].some((e) => config.webhookAllowedEvents.includes(e))
                )
                    await this.SendWebhook(
                        'connection',
                        {
                            connection: connection,
                        },
                        this.key
                    )
            }

            if (qr) {
                QRCode.toDataURL(qr).then((url) => {
                    if (isStaleSocket()) return
                    this.instance.qr = url
                    this.instance.qrRetry++
                    this.instance.connectionStatus = 'qr'
                    logger.debug(
                        {
                            instanceKey: this.key,
                            qrRetry: this.instance.qrRetry,
                        },
                        'STATE: QR code updated'
                    )
                })
            }
        })

        // sending presence
        sock?.ev.on('presence.update', async (json) => {
            if (
                ['all', 'presence', 'presence.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook('presence', json, this.key)
        })

        // on receive all chats
        sock?.ev.on('chats.set', async ({ chats }) => {
            this.instance.chats = []
            const recivedChats = chats.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...recivedChats)
            await this.updateDb(this.instance.chats)
            await this.updateDbGroupsParticipants()
        })

        // on recive new chat
        sock?.ev.on('chats.upsert', (newChat) => {
            //console.log('chats.upsert')
            //console.log(newChat)
            const chats = newChat.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...chats)
        })

        // on chat change
        sock?.ev.on('chats.update', (changedChat) => {
            //console.log('chats.update')
            //console.log(changedChat)
            changedChat.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (pc) => pc.id === chat.id
                )
                const PrevChat = this.instance.chats[index]
                this.instance.chats[index] = {
                    ...PrevChat,
                    ...chat,
                }
            })
        })

        // on chat delete
        sock?.ev.on('chats.delete', (deletedChats) => {
            //console.log('chats.delete')
            //console.log(deletedChats)
            deletedChats.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (c) => c.id === chat
                )
                this.instance.chats.splice(index, 1)
            })
        })

        // on new mssage
        sock?.ev.on('messages.upsert', async (m) => {
            //console.log('messages.upsert')
            //console.log(m)
            logger.info(
                {
                    instanceKey: this.key,
                    upsertType: m?.type,
                    messageCount: Array.isArray(m?.messages)
                        ? m.messages.length
                        : 0,
                },
                'DEBUG: messages.upsert event received'
            )
            console.log(
                '[messages.upsert]',
                JSON.stringify({
                    instanceKey: this.key,
                    upsertType: m?.type,
                    messageCount: Array.isArray(m?.messages)
                        ? m.messages.length
                        : 0,
                })
            )
            if (m.type === 'prepend')
                this.instance.messages.unshift(...m.messages)
            if (m.type !== 'notify') return

            // https://adiwajshing.github.io/Baileys/#reading-messages
            if (config.markMessagesRead) {
                const unreadMessages = m.messages.map((msg) => {
                    return {
                        remoteJid: msg.key.remoteJid,
                        id: msg.key.id,
                        participant: msg.key?.participant,
                    }
                })
                await sock.readMessages(unreadMessages)
            }

            this.instance.messages.unshift(...m.messages)

            m.messages.map(async (msg) => {
                logger.info(
                    {
                        instanceKey: this.key,
                        upsertType: m?.type,
                        remoteJid: msg?.key?.remoteJid,
                        messageId: msg?.key?.id,
                        fromMe: msg?.key?.fromMe,
                    },
                    'DEBUG: messages.upsert message payload received'
                )
                console.log(
                    '[messages.upsert.message]',
                    JSON.stringify({
                        instanceKey: this.key,
                        upsertType: m?.type,
                        remoteJid: msg?.key?.remoteJid,
                        messageId: msg?.key?.id,
                        fromMe: msg?.key?.fromMe,
                    })
                )

                if (!msg.message) return

                const messageType = Object.keys(msg.message)[0]
                if (
                    [
                        'protocolMessage',
                        'senderKeyDistributionMessage',
                    ].includes(messageType)
                )
                    return

                // Log da mensagem recebida
                if (!msg.key.fromMe) {
                    const sender = msg.key.remoteJid
                    let textContent = ''
                    if (messageType === 'conversation') {
                        textContent = msg.message.conversation
                    } else if (messageType === 'extendedTextMessage') {
                        textContent = msg.message.extendedTextMessage?.text
                    } else if (messageType === 'imageMessage') {
                        textContent = msg.message.imageMessage?.caption || '[imagem]'
                    } else if (messageType === 'videoMessage') {
                        textContent = msg.message.videoMessage?.caption || '[vídeo]'
                    } else if (messageType === 'audioMessage') {
                        textContent = '[áudio]'
                    } else if (messageType === 'documentMessage') {
                        textContent = `[documento: ${msg.message.documentMessage?.fileName || ''}]`
                    } else if (messageType === 'stickerMessage') {
                        textContent = '[sticker]'
                    } else {
                        textContent = `[${messageType}]`
                    }
                    const isGroup = sender?.endsWith('@g.us')
                    const participant = msg.key.participant || msg.participant
                    if (isGroup) {
                        console.log(`\n👥 [MENSAGEM DE GRUPO]`)
                        console.log(`   Instância : ${this.key}`)
                        console.log(`   Grupo     : ${sender}`)
                        console.log(`   Remetente : ${participant || 'desconhecido'}`)
                    } else {
                        console.log(`\n📩 [MENSAGEM RECEBIDA]`)
                        console.log(`   Instância : ${this.key}`)
                        console.log(`   De        : ${sender}`)
                    }
                    console.log(`   Tipo      : ${messageType}`)
                    console.log(`   Conteúdo  : ${textContent}`)
                    console.log(`   ID        : ${msg.key.id}`)
                    console.log(`   Hora      : ${new Date().toLocaleString('pt-BR')}\n`)
                }

                const webhookData = {
                    key: this.key,
                    ...msg,
                }

                if (messageType === 'conversation') {
                    webhookData['text'] = m
                }
                if (config.webhookBase64) {
                    switch (messageType) {
                        case 'imageMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.imageMessage,
                                'image'
                            )
                            break
                        case 'videoMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.videoMessage,
                                'video'
                            )
                            break
                        case 'audioMessage':
                            webhookData['msgContent'] = await downloadMessage(
                                msg.message.audioMessage,
                                'audio'
                            )
                            break
                        default:
                            webhookData['msgContent'] = ''
                            break
                    }
                }
                if (
                    ['all', 'messages', 'messages.upsert'].some((e) =>
                        config.webhookAllowedEvents.includes(e)
                    )
                )
                    await this.SendWebhook('message', webhookData, this.key)
            })
        })

        sock?.ev.on('messages.update', async () => {
            //console.log('messages.update')
            //console.dir(messages);
        })
        sock?.ws.on('CB:call', async (data) => {
            if (data.content) {
                if (data.content.find((e) => e.tag === 'offer')) {
                    const content = data.content.find((e) => e.tag === 'offer')
                    if (
                        ['all', 'call', 'CB:call', 'call:offer'].some((e) =>
                            config.webhookAllowedEvents.includes(e)
                        )
                    )
                        await this.SendWebhook(
                            'call_offer',
                            {
                                id: content.attrs['call-id'],
                                timestamp: parseInt(data.attrs.t),
                                user: {
                                    id: data.attrs.from,
                                    platform: data.attrs.platform,
                                    platform_version: data.attrs.version,
                                },
                            },
                            this.key
                        )
                } else if (data.content.find((e) => e.tag === 'terminate')) {
                    const content = data.content.find(
                        (e) => e.tag === 'terminate'
                    )

                    if (
                        ['all', 'call', 'call:terminate'].some((e) =>
                            config.webhookAllowedEvents.includes(e)
                        )
                    )
                        await this.SendWebhook(
                            'call_terminate',
                            {
                                id: content.attrs['call-id'],
                                user: {
                                    id: data.attrs.from,
                                },
                                timestamp: parseInt(data.attrs.t),
                                reason: data.content[0].attrs.reason,
                            },
                            this.key
                        )
                }
            }
        })

        sock?.ev.on('groups.upsert', async (newChat) => {
            //console.log('groups.upsert')
            //console.log(newChat)
            this.createGroupByApp(newChat)
            if (
                ['all', 'groups', 'groups.upsert'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_created',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('groups.update', async (newChat) => {
            //console.log('groups.update')
            //console.log(newChat)
            this.updateGroupSubjectByApp(newChat)
            if (
                ['all', 'groups', 'groups.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('group-participants.update', async (newChat) => {
            //console.log('group-participants.update')
            //console.log(newChat)
            this.updateGroupParticipantsByApp(newChat)
            if (
                [
                    'all',
                    'groups',
                    'group_participants',
                    'group-participants.update',
                ].some((e) => config.webhookAllowedEvents.includes(e))
            )
                await this.SendWebhook(
                    'group_participants_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })
    }

    async deleteInstance(key) {
        try {
            await this.teardownSocket()
            await this.deleteSessionData(key)
        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async logoutInstance() {
        let logoutError = null
        this.instance.manualLogoutInProgress = true
        this.instance.reconnectInProgress = false
        this.instance.connectionStatus = 'logging_out'

        try {
            await this.instance?.sock?.logout()
        } catch (error) {
            logoutError = error
            logger.warn(
                {
                    instanceKey: this.key,
                    error: error?.message || error,
                },
                'STATE: Logout request returned with error'
            )
        }

        await sleep(300)
        await this.teardownSocket()
        await this.deleteSessionData(this.key)
        this.instance.online = false
        this.instance.qr = ''
        this.instance.reconnectAttempts = 0
        this.instance.lastDisconnectCode = DisconnectReason.loggedOut
        this.instance.lastConnectionError = ''
        this.instance.connectionStatus = 'idle'
        this.instance.manualLogoutInProgress = false

        return logoutError
    }

    async getInstanceDetail(key) {
        return {
            instance_key: key,
            phone_connected: this.instance?.online,
            webhookUrl: this.instance.customWebhook,
            user: this.instance?.online ? this.instance.sock?.user : {},
        }
    }

    getWhatsAppId(id) {
        if (id.includes('@g.us') || id.includes('@s.whatsapp.net')) return id
        return id.includes('-') ? `${id}@g.us` : `${id}@s.whatsapp.net`
    }

    async verifyId(id) {
        if (id.includes('@g.us')) return true
        const [result] = await this.instance.sock?.onWhatsApp(id)
        if (result?.exists) return true
        throw new Error('no account exists')
    }

    async sendTextMessage(to, message) {
        await this.verifyId(this.getWhatsAppId(to))
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { text: message }
        )
        return data
    }

    async sendMediaFile(to, file, type, caption = '', filename) {
        await this.verifyId(this.getWhatsAppId(to))
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                mimetype: file.mimetype,
                [type]: file.buffer,
                caption: caption,
                ptt: type === 'audio' ? true : false,
                fileName: filename ? filename : file.originalname,
            }
        )
        return data
    }

    async sendUrlMediaFile(to, url, type, mimeType, caption = '') {
        await this.verifyId(this.getWhatsAppId(to))

        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [type]: {
                    url: url,
                },
                caption: caption,
                mimetype: mimeType,
            }
        )
        return data
    }

    async DownloadProfile(of) {
        await this.verifyId(this.getWhatsAppId(of))
        const ppUrl = await this.instance.sock?.profilePictureUrl(
            this.getWhatsAppId(of),
            'image'
        )
        return ppUrl
    }

    async getUserStatus(of) {
        await this.verifyId(this.getWhatsAppId(of))
        const status = await this.instance.sock?.fetchStatus(
            this.getWhatsAppId(of)
        )
        return status
    }

    async blockUnblock(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const status = await this.instance.sock?.updateBlockStatus(
            this.getWhatsAppId(to),
            data
        )
        return status
    }

    async sendButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                templateButtons: processButton(data.buttons),
                text: data.text ?? '',
                footer: data.footerText ?? '',
                viewOnce: true,
            }
        )
        return result
    }

    async sendContactMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const vcard = generateVC(data)
        const result = await this.instance.sock?.sendMessage(
            await this.getWhatsAppId(to),
            {
                contacts: {
                    displayName: data.fullName,
                    contacts: [{ displayName: data.fullName, vcard }],
                },
            }
        )
        return result
    }

    async sendListMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                text: data.text,
                sections: data.sections,
                buttonText: data.buttonText,
                footer: data.description,
                title: data.title,
                viewOnce: true,
            }
        )
        return result
    }

    async sendMediaButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [data.mediaType]: {
                    url: data.image,
                },
                footer: data.footerText ?? '',
                caption: data.text,
                templateButtons: processButton(data.buttons),
                mimetype: data.mimeType,
                viewOnce: true,
            }
        )
        return result
    }

    async setStatus(status, to) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendPresenceUpdate(status, to)
        return result
    }

    // change your display picture or a group's
    async updateProfilePicture(id, url) {
        try {
            const img = await axios.get(url, { responseType: 'arraybuffer' })
            const res = await this.instance.sock?.updateProfilePicture(
                id,
                img.data
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message: 'Unable to update profile picture',
            }
        }
    }

    // get user or group object from db by id
    async getUserOrGroupById(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === this.getWhatsAppId(id))
            if (!group)
                throw new Error(
                    'unable to get group, check if the group exists'
                )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error get group failed')
        }
    }

    // Group Methods
    parseParticipants(users) {
        return users.map((users) => this.getWhatsAppId(users))
    }

    async updateDbGroupsParticipants() {
        try {
            let groups = await this.groupFetchAllParticipating()
            let Chats = await this.getChat()
            if (groups && Chats) {
                for (const value of Object.values(groups)) {
                    let group = Chats.find((c) => c.id === value.id)
                    if (group) {
                        let participants = []
                        for (const participant of Object.values(
                            value.participants
                        )) {
                            participants.push(participant)
                        }
                        group.participant = participants
                        if (value.creation) {
                            group.creation = value.creation
                        }
                        if (value.subjectOwner) {
                            group.subjectOwner = value.subjectOwner
                        }
                        Chats.filter((c) => c.id === value.id)[0] = group
                    }
                }
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating groups failed')
        }
    }

    async createNewGroup(name, users) {
        try {
            const group = await this.instance.sock?.groupCreate(
                name,
                users.map(this.getWhatsAppId)
            )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error create new group failed')
        }
    }

    async addNewParticipant(id, users) {
        try {
            const res = await this.instance.sock?.groupAdd(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'Unable to add participant, you must be an admin in this group',
            }
        }
    }

    async makeAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupMakeAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to promote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async demoteAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupDemoteAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to demote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async getAllGroups() {
        const mapChatsToGroupList = (chats = []) =>
            chats
                .filter(
                    (chat) =>
                        typeof chat?.id === 'string' &&
                        chat.id.includes('@g.us')
                )
                .map((data, i) => {
                    return {
                        index: i,
                        name: data?.name || data?.subject || '',
                        jid: data.id,
                        participant: Array.isArray(data?.participant)
                            ? data.participant
                            : [],
                        creation: data?.creation || null,
                        subjectOwner: data?.subjectOwner || null,
                    }
                })

        if (this.instance?.online && this.instance?.sock) {
            try {
                const groups = await this.groupFetchAllParticipating()
                const liveGroups = Object.values(groups || {})
                    .map((group, i) => {
                        const participants = Array.isArray(group?.participants)
                            ? group.participants
                            : Object.values(group?.participants || {})

                        return {
                            index: i,
                            name: group?.subject || group?.name || '',
                            jid: group?.id,
                            participant: participants,
                            creation: group?.creation || null,
                            subjectOwner: group?.subjectOwner || null,
                        }
                    })
                    .filter(
                        (group) =>
                            typeof group?.jid === 'string' &&
                            group.jid.includes('@g.us')
                    )

                if (liveGroups.length > 0) {
                    try {
                        const chats = await this.getChat()
                        const nonGroupChats = chats.filter(
                            (chat) =>
                                !(
                                    typeof chat?.id === 'string' &&
                                    chat.id.includes('@g.us')
                                )
                        )
                        const existingGroupMap = new Map(
                            chats
                                .filter(
                                    (chat) =>
                                        typeof chat?.id === 'string' &&
                                        chat.id.includes('@g.us')
                                )
                                .map((chat) => [chat.id, chat])
                        )

                        const mergedGroupChats = liveGroups.map((group) => {
                            const existing = existingGroupMap.get(group.jid)
                            return {
                                id: group.jid,
                                name: group.name,
                                participant: group.participant,
                                messages: Array.isArray(existing?.messages)
                                    ? existing.messages
                                    : [],
                                creation: group.creation,
                                subjectOwner: group.subjectOwner,
                            }
                        })

                        await this.updateDb([...nonGroupChats, ...mergedGroupChats])
                    } catch (error) {
                        logger.debug(
                            {
                                instanceKey: this.key,
                                error: error?.message || error,
                            },
                            'STATE: Failed to persist live groups cache'
                        )
                    }

                    return liveGroups
                }
            } catch (error) {
                logger.warn(
                    {
                        instanceKey: this.key,
                        error: error?.message || error,
                    },
                    'STATE: Failed to fetch live groups, falling back to cached groups'
                )
            }
        }

        const Chats = await this.getChat()
        return mapChatsToGroupList(Chats)
    }

    async leaveGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group) throw new Error('no group exists')
            return await this.instance.sock?.groupLeave(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error leave group failed')
        }
    }

    async getInviteCodeGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group)
                throw new Error(
                    'unable to get invite code, check if the group exists'
                )
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    async getInstanceInviteCodeGroup(id) {
        try {
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    // get Chat object from db
    async getChat(key = this.key) {
        const dbResult = await prisma.chat.findUnique({
            where: { key: key },
            select: { chat: true },
        })
        return Array.isArray(dbResult?.chat) ? dbResult.chat : []
    }

    // create new group by application
    async createGroupByApp(newChat) {
        try {
            let Chats = await this.getChat()
            let group = {
                id: newChat[0].id,
                name: newChat[0].subject,
                participant: newChat[0].participants,
                messages: [],
                creation: newChat[0].creation,
                subjectOwner: newChat[0].subjectOwner,
            }
            Chats.push(group)
            await this.updateDb(Chats)
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupSubjectByApp(newChat) {
        //console.log(newChat)
        try {
            if (newChat[0] && newChat[0].subject) {
                let Chats = await this.getChat()
                Chats.find((c) => c.id === newChat[0].id).name =
                    newChat[0].subject
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupParticipantsByApp(newChat) {
        //console.log(newChat)
        try {
            if (newChat && newChat.id) {
                let Chats = await this.getChat()
                let chat = Chats.find((c) => c.id === newChat.id)
                let is_owner = false
                if (chat) {
                    if (!Array.isArray(chat.participant)) {
                        chat.participant = []
                    }
                    if (chat.participant && newChat.action == 'add') {
                        for (const participant of newChat.participants) {
                            chat.participant.push({
                                id: participant,
                                admin: null,
                            })
                        }
                    }
                    if (chat.participant && newChat.action == 'remove') {
                        for (const participant of newChat.participants) {
                            // remove group if they are owner
                            if (chat.subjectOwner == participant) {
                                is_owner = true
                            }
                            chat.participant = chat.participant.filter(
                                (p) => p.id != participant
                            )
                        }
                    }
                    if (chat.participant && newChat.action == 'demote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = null
                            }
                        }
                    }
                    if (chat.participant && newChat.action == 'promote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = 'superadmin'
                            }
                        }
                    }
                    if (is_owner) {
                        Chats = Chats.filter((c) => c.id !== newChat.id)
                    } else {
                        Chats.filter((c) => c.id === newChat.id)[0] = chat
                    }
                    await this.updateDb(Chats)
                }
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async groupFetchAllParticipating() {
        try {
            const result =
                await this.instance.sock?.groupFetchAllParticipating()
            return result
        } catch (e) {
            logger.error('Error group fetch all participating failed')
        }
    }

    // update promote demote remove
    async groupParticipantsUpdate(id, users, action) {
        try {
            const res = await this.instance.sock?.groupParticipantsUpdate(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
                action
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to ' +
                    action +
                    ' some participants, check if you are admin in group or participants exists',
            }
        }
    }

    // update group settings like
    // only allow admins to send messages
    async groupSettingUpdate(id, action) {
        try {
            const res = await this.instance.sock?.groupSettingUpdate(
                this.getWhatsAppId(id),
                action
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to ' + action + ' check if you are admin in group',
            }
        }
    }

    async groupUpdateSubject(id, subject) {
        try {
            const res = await this.instance.sock?.groupUpdateSubject(
                this.getWhatsAppId(id),
                subject
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to update subject check if you are admin in group',
            }
        }
    }

    async groupUpdateDescription(id, description) {
        try {
            const res = await this.instance.sock?.groupUpdateDescription(
                this.getWhatsAppId(id),
                description
            )
            return res
        } catch (e) {
            //console.log(e)
            return {
                error: true,
                message:
                    'unable to update description check if you are admin in group',
            }
        }
    }

    // update db document -> chat
    async updateDb(object) {
        try {
            await prisma.chat.upsert({
                where: { key: this.key },
                update: { chat: object },
                create: { key: this.key, chat: object },
            })
        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async deleteSessionData(key = this.key) {
        try {
            await prisma.authState.deleteMany({
                where: { sessionId: key },
            })
            await prisma.chat.deleteMany({
                where: { key: key },
            })
            await prisma.session.deleteMany({
                where: { name: key },
            })
            logger.info('STATE: Deleted session data')
        } catch (e) {
            logger.error(e)
            logger.error('Error deleting session data failed')
        }
    }

    async readMessage(msgObj) {
        try {
            const key = {
                remoteJid: msgObj.remoteJid,
                id: msgObj.id,
                participant: msgObj?.participant, // required when reading a msg from group
            }
            const res = await this.instance.sock?.readMessages([key])
            return res
        } catch (e) {
            logger.error('Error read message failed')
        }
    }

    async reactMessage(id, key, emoji) {
        try {
            const reactionMessage = {
                react: {
                    text: emoji, // use an empty string to remove the reaction
                    key: key,
                },
            }
            const res = await this.instance.sock?.sendMessage(
                this.getWhatsAppId(id),
                reactionMessage
            )
            return res
        } catch (e) {
            logger.error('Error react message failed')
        }
    }
}

exports.WhatsAppInstance = WhatsAppInstance
