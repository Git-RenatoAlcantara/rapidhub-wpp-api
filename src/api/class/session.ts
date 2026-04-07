import { WhatsAppInstance } from './instance.js'
import { pino } from 'pino'
import config from '../../config/config.js'
import { prisma } from '../helper/prismaClient.js'

const logger = pino()

export class Session {
    async restoreSessions(): Promise<string[]> {
        const restoredSessions: string[] = []
        try {
            const sessions = await prisma.session.findMany({
                select: { name: true },
            })
            for (const { name: key } of sessions) {
                if (WhatsAppInstances[key]) {
                    restoredSessions.push(key)
                    continue
                }
                const webhook = config.webhookEnabled || false
                const webhookUrl = config.webhookUrl || null
                const instance = new WhatsAppInstance(key, webhook, webhookUrl)
                await instance.init()
                WhatsAppInstances[key] = instance
                restoredSessions.push(key)
            }
        } catch (e) {
            logger.error('Error restoring sessions')
            logger.error(e as any)
        }
        return restoredSessions
    }
}
