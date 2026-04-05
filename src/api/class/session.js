/* eslint-disable no-unsafe-optional-chaining */
const { WhatsAppInstance } = require('../class/instance')
const logger = require('pino')()
const config = require('../../config/config')
const { prisma } = require('../helper/prismaClient')

class Session {
    async restoreSessions() {
        let restoredSessions = new Array()
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
            logger.error(e)
        }
        return restoredSessions
    }
}

exports.Session = Session
