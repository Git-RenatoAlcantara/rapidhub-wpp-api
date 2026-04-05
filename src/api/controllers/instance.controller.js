const { WhatsAppInstance } = require('../class/instance')
const config = require('../../config/config')
const { Session } = require('../class/session')
const { prisma } = require('../helper/prismaClient')
const sleep = require('../helper/sleep')
const logger = require('pino')()

function isInstanceActive(instance) {
    const status = instance?.instance?.connectionStatus
    return ['connecting', 'open', 'qr', 'reconnecting'].includes(status)
}

function parseBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'undefined' || value === null) return defaultValue
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
}

async function waitForQr(instance, timeoutMs = 15000, intervalMs = 300) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const qrcode = instance?.instance?.qr
        if (typeof qrcode === 'string' && qrcode.trim().length > 0) {
            return qrcode
        }
        await sleep(intervalMs)
    }
    return instance?.instance?.qr || ''
}

function buildQrFailureMessage(lastConnectionError, lastConnectionErrorCode) {
    if (lastConnectionErrorCode === 408) {
        if (
            typeof lastConnectionError === 'string' &&
            lastConnectionError.toLowerCase().includes('pre-key')
        ) {
            return 'Timeout de pre-key durante inicializacao. A API vai tentar reconectar automaticamente.'
        }
        return 'QR Code expirou antes do escaneamento. Gere um novo QR e escaneie imediatamente.'
    }

    if (lastConnectionErrorCode === 405) {
        return 'Connection Failure (405): WhatsApp rejeitou o registro deste dispositivo no momento. Tente novamente com uma nova chave.'
    }

    if (lastConnectionErrorCode === 515) {
        return 'Conexao do WhatsApp reiniciando (515). Aguarde alguns segundos e tente novamente.'
    }

    return `Falha ao gerar QR Code: ${lastConnectionError}`
}

exports.init = async (req, res) => {
    const keySource = req.query.key ?? req.body?.key
    const webhookSource = req.query.webhook ?? req.body?.webhook
    const webhookUrlSource = req.query.webhookUrl ?? req.body?.webhookUrl
    const key = keySource ? keySource.toString().trim() : ''
    const webhook = parseBoolean(webhookSource, false)
    const webhookUrl = !webhookUrlSource ? null : webhookUrlSource.toString()
    const appUrl = config.appUrl || req.protocol + '://' + req.headers.host
    const existingInstance = key ? WhatsAppInstances[key] : null
    const isPostRequest = req.method === 'POST'

    if (existingInstance && isInstanceActive(existingInstance)) {
        return res.status(200).json({
            error: false,
            message: 'Instance already initialized',
            key: existingInstance.key,
            reused: true,
            webhook: {
                enabled: webhook,
                webhookUrl: webhookUrl,
            },
            qrcode: {
                url: appUrl + '/instance/qr?key=' + existingInstance.key,
            },
            status: existingInstance.instance?.connectionStatus || 'idle',
            browser: config.browser,
        })
    }

    const instance =
        existingInstance || new WhatsAppInstance(key, webhook, webhookUrl)
    const data = await instance.init()
    WhatsAppInstances[data.key] = instance
    const shouldReturnCreated = isPostRequest && !existingInstance

    res.status(shouldReturnCreated ? 201 : 200).json({
        error: false,
        message: 'Initializing successfully',
        key: data.key,
        reused: Boolean(existingInstance),
        webhook: {
            enabled: webhook,
            webhookUrl: webhookUrl,
        },
        qrcode: {
            url: appUrl + '/instance/qr?key=' + data.key,
        },
        status: instance.instance?.connectionStatus || 'idle',
        browser: config.browser,
    })
}

exports.qr = async (req, res) => {
    try {
        const instance = WhatsAppInstances[req.query.key]
        const qrcode = await waitForQr(instance, 5000, 250)
        const phoneConnected = !!instance?.instance?.online
        const connectionStatus = instance?.instance?.connectionStatus || 'idle'
        const lastConnectionError = instance?.instance?.lastConnectionError || ''
        const lastConnectionErrorCode =
            instance?.instance?.lastDisconnectCode || null
        res.render('qrcode', {
            qrcode: qrcode,
            key: req.query.key,
            phoneConnected: phoneConnected,
            status: connectionStatus,
            lastError: lastConnectionError,
            lastErrorCode: lastConnectionErrorCode,
        })
    } catch (error) {
        logger.error(error)
        res.json({
            error: true,
            message: 'Failed to render QR page',
            qrcode: '',
        })
    }
}

exports.qrbase64 = async (req, res) => {
    try {
        const instance = WhatsAppInstances[req.query.key]
        const qrcode = await waitForQr(instance)
        const hasQr = typeof qrcode === 'string' && qrcode.trim().length > 0
        const phoneConnected = !!instance?.instance?.online
        const connectionStatus = instance?.instance?.connectionStatus || 'idle'
        const lastConnectionError = instance?.instance?.lastConnectionError || ''
        const lastConnectionErrorCode =
            instance?.instance?.lastDisconnectCode || null

        if (!hasQr && phoneConnected) {
            return res.json({
                error: true,
                message:
                    'Instancia ja conectada. Faca logout para gerar um novo QR Code.',
                qrcode: '',
                connected: true,
                status: connectionStatus,
                lastError: '',
            })
        }

        if (!hasQr && lastConnectionError) {
            return res.json({
                error: true,
                message: buildQrFailureMessage(
                    lastConnectionError,
                    lastConnectionErrorCode
                ),
                qrcode: '',
                connected: phoneConnected,
                status: connectionStatus,
                lastError: lastConnectionError,
                lastErrorCode: lastConnectionErrorCode,
            })
        }

        res.json({
            error: !hasQr,
            message: hasQr
                ? 'QR Base64 fetched successfully'
                : 'QR Code ainda nao foi gerado, tente novamente em alguns segundos',
            qrcode: qrcode,
            connected: phoneConnected,
            status: connectionStatus,
            lastError: '',
            lastErrorCode: null,
        })
    } catch (error) {
        logger.error(error)
        res.json({
            error: true,
            message: 'Failed to fetch QR Code',
            qrcode: '',
            connected: false,
            status: 'error',
            lastError: error?.message || 'unknown_error',
            lastErrorCode: null,
        })
    }
}

exports.info = async (req, res) => {
    const instance = WhatsAppInstances[req.query.key]
    let data
    try {
        data = await instance.getInstanceDetail(req.query.key)
    } catch (error) {
        data = {}
    }
    return res.json({
        error: false,
        message: 'Instance fetched successfully',
        instance_data: data,
    })
}

exports.restore = async (req, res, next) => {
    try {
        const session = new Session()
        let restoredSessions = await session.restoreSessions()
        return res.json({
            error: false,
            message: 'All instances restored',
            data: restoredSessions,
        })
    } catch (error) {
        next(error)
    }
}

exports.logout = async (req, res) => {
    let errormsg
    const key = req.query.key?.toString()

    if (!key) {
        return res.status(403).json({
            error: true,
            message: 'no key query was present',
        })
    }

    let instance = WhatsAppInstances[key]

    if (!instance) {
        const persistedSession = await prisma.session.findUnique({
            where: { name: key },
            select: { name: true },
        })
        if (!persistedSession) {
            return res.status(404).json({
                error: true,
                message: 'invalid key supplied',
            })
        }
        instance = new WhatsAppInstance(key, false, null)
    }

    try {
        errormsg = await instance.logoutInstance()
        delete WhatsAppInstances[key]
    } catch (error) {
        errormsg = error
    }
    return res.json({
        error: false,
        message: 'logout successfull',
        errormsg: errormsg ? errormsg?.message || errormsg : null,
    })
}

exports.delete = async (req, res) => {
    let errormsg
    try {
        await WhatsAppInstances[req.query.key].deleteInstance(req.query.key)
        delete WhatsAppInstances[req.query.key]
    } catch (error) {
        errormsg = error
    }
    return res.json({
        error: false,
        message: 'Instance deleted successfully',
        data: errormsg ? errormsg : null,
    })
}

exports.list = async (req, res) => {
    if (req.query.active) {
        const sessions = await prisma.session.findMany({
            select: { name: true },
        })
        const instance = sessions.map((session) => session.name)

        return res.json({
            error: false,
            message: 'All active instance',
            data: instance,
        })
    }

    let instance = Object.keys(WhatsAppInstances).map(async (key) =>
        WhatsAppInstances[key].getInstanceDetail(key)
    )
    let data = await Promise.all(instance)

    return res.json({
        error: false,
        message: 'All instance listed',
        data: data,
    })
}
