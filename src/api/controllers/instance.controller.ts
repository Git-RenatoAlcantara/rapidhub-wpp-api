import { Request, Response, NextFunction } from 'express'
import { WhatsAppInstance } from '../class/instance.js'
import config from '../../config/config.js'
import { Session } from '../class/session.js'
import { prisma } from '../helper/prismaClient.js'
import sleep from '../helper/sleep.js'
import { pino } from 'pino'

const logger = pino()

function isInstanceActive(instance: any): boolean {
    const status = instance?.instance?.connectionStatus
    return ['connecting', 'open', 'qr', 'reconnecting'].includes(status)
}

function parseBoolean(value: any, defaultValue = false): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'undefined' || value === null) return defaultValue
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
}

async function waitForQr(instance: any, timeoutMs = 15000, intervalMs = 300): Promise<string> {
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

function buildQrFailureMessage(lastConnectionError: string, lastConnectionErrorCode: number | null): string {
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

export const init = async (req: Request, res: Response) => {
    const keySource = (req.query.key ?? req.body?.key) as string | undefined
    const webhookSource = (req.query.webhook ?? req.body?.webhook) as string | undefined
    const webhookUrlSource = (req.query.webhookUrl ?? req.body?.webhookUrl) as string | undefined
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
            status: (existingInstance as any).instance?.connectionStatus || 'idle',
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
        status: (instance as any).instance?.connectionStatus || 'idle',
        browser: config.browser,
    })
}

export const qr = async (req: Request, res: Response) => {
    try {
        const instance = WhatsAppInstances[req.query.key as string]
        const qrcode = await waitForQr(instance, 5000, 250)
        const phoneConnected = !!(instance as any)?.instance?.online
        const connectionStatus = (instance as any)?.instance?.connectionStatus || 'idle'
        const lastConnectionError = (instance as any)?.instance?.lastConnectionError || ''
        const lastConnectionErrorCode =
            (instance as any)?.instance?.lastDisconnectCode || null
        res.render('qrcode', {
            qrcode: qrcode,
            key: req.query.key,
            phoneConnected: phoneConnected,
            status: connectionStatus,
            lastError: lastConnectionError,
            lastErrorCode: lastConnectionErrorCode,
        })
    } catch (error) {
        logger.error(error as any)
        res.json({
            error: true,
            message: 'Failed to render QR page',
            qrcode: '',
        })
    }
}

export const qrbase64 = async (req: Request, res: Response) => {
    try {
        const instance = WhatsAppInstances[req.query.key as string]
        const qrcode = await waitForQr(instance)
        const hasQr = typeof qrcode === 'string' && qrcode.trim().length > 0
        const phoneConnected = !!(instance as any)?.instance?.online
        const connectionStatus = (instance as any)?.instance?.connectionStatus || 'idle'
        const lastConnectionError = (instance as any)?.instance?.lastConnectionError || ''
        const lastConnectionErrorCode =
            (instance as any)?.instance?.lastDisconnectCode || null

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
    } catch (error: any) {
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

export const info = async (req: Request, res: Response) => {
    const instance = WhatsAppInstances[req.query.key as string]
    let data
    try {
        data = await instance.getInstanceDetail(req.query.key as string)
    } catch (error) {
        data = {}
    }
    return res.json({
        error: false,
        message: 'Instance fetched successfully',
        instance_data: data,
    })
}

export const restore = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const session = new Session()
        const restoredSessions = await session.restoreSessions()
        return res.json({
            error: false,
            message: 'All instances restored',
            data: restoredSessions,
        })
    } catch (error) {
        next(error)
    }
}

export const logout = async (req: Request, res: Response) => {
    let errormsg: any
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

export const deleteInstance = async (req: Request, res: Response) => {
    let errormsg: any
    try {
        await WhatsAppInstances[req.query.key as string].deleteInstance(req.query.key as string)
        delete WhatsAppInstances[req.query.key as string]
    } catch (error) {
        errormsg = error
    }
    return res.json({
        error: false,
        message: 'Instance deleted successfully',
        data: errormsg ? errormsg : null,
    })
}

export const list = async (req: Request, res: Response) => {
    if (req.query.active) {
        const sessions = await prisma.session.findMany({
            select: { name: true },
        })
        const instance = sessions.map((session: { name: string }) => session.name)

        return res.json({
            error: false,
            message: 'All active instance',
            data: instance,
        })
    }

    const instance = Object.keys(WhatsAppInstances).map(async (key) =>
        WhatsAppInstances[key].getInstanceDetail(key)
    )
    const data = await Promise.all(instance)

    return res.json({
        error: false,
        message: 'All instance listed',
        data: data,
    })
}

export const pairingCode = async (req: Request, res: Response) => {
    try {
        const keySource = (req.query.key ?? req.body?.key) as string | undefined
        const phoneSource =
            (req.body?.phoneNumber ?? req.query.phoneNumber) as string | undefined

        const key = keySource ? keySource.toString().trim() : ''
        const phoneNumber = phoneSource ? phoneSource.toString().trim() : ''

        if (!phoneNumber) {
            return res.status(400).json({
                error: true,
                message:
                    'phoneNumber é obrigatório (E.164 sem o sinal de +, ex.: 5511999999999).',
            })
        }

        let instance = key ? WhatsAppInstances[key] : null
        if (!instance) {
            instance = new WhatsAppInstance(key || undefined, false, null)
            WhatsAppInstances[instance.key] = instance
        }

        const code = await instance.requestPairingCode(phoneNumber)
        const runtime = (instance as any).instance

        return res.status(200).json({
            error: false,
            message: 'Pairing code generated successfully',
            key: instance.key,
            phoneNumber: runtime.pairingPhoneNumber,
            pairingCode: code,
            status: runtime.connectionStatus,
            diagnostics: {
                online: Boolean(runtime.online),
                hasQr: Boolean(runtime.qr),
                connectionStatus: runtime.connectionStatus,
                reconnectAttempts: runtime.reconnectAttempts,
                lastDisconnectCode: runtime.lastDisconnectCode,
                lastConnectionError: runtime.lastConnectionError || null,
            },
        })
    } catch (error: any) {
        logger.error(error)
        return res.status(400).json({
            error: true,
            message: error?.message || 'Falha ao gerar código de pareamento',
        })
    }
}

export { deleteInstance as delete }
