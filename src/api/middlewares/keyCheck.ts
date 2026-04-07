import { Request, Response, NextFunction } from 'express'
import { WhatsAppInstance } from '../class/instance.js'
import config from '../../config/config.js'
import { prisma } from '../helper/prismaClient.js'
import { pino } from 'pino'

const logger = pino({ level: config.log.level })

const restoringInstances = new Map<string, Promise<WhatsAppInstance | null>>()

async function restoreInstanceIfPersisted(key: string): Promise<WhatsAppInstance | null> {
    if (WhatsAppInstances[key]) return WhatsAppInstances[key]

    if (restoringInstances.has(key)) {
        await restoringInstances.get(key)
        return WhatsAppInstances[key] || null
    }

    const restorePromise = (async () => {
        const persistedSession = await prisma.session.findUnique({
            where: { name: key },
            select: { name: true },
        })
        if (!persistedSession) return null

        const webhook = config.webhookEnabled || false
        const webhookUrl = config.webhookUrl || null
        const instance = new WhatsAppInstance(key, webhook, webhookUrl)
        await instance.init()
        WhatsAppInstances[key] = instance
        return instance
    })()

    restoringInstances.set(key, restorePromise)
    try {
        return await restorePromise
    } finally {
        restoringInstances.delete(key)
    }
}

async function keyVerification(req: Request, res: Response, next: NextFunction) {
    const key = req.query['key']?.toString().trim()
    if (!key) {
        return res
            .status(403)
            .send({ error: true, message: 'no key query was present' })
    }

    let instance = WhatsAppInstances[key]
    if (!instance) {
        try {
            instance = (await restoreInstanceIfPersisted(key)) as any
        } catch (error: any) {
            logger.error(
                {
                    key,
                    error: error?.message || error,
                },
                'STATE: Failed to restore instance from persisted session'
            )
            return res.status(500).send({
                error: true,
                message: 'failed to initialize key supplied',
            })
        }
    }

    if (!instance) {
        return res
            .status(403)
            .send({ error: true, message: 'invalid key supplied' })
    }
    next()
}

export default keyVerification
