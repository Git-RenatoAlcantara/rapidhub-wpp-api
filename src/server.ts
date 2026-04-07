import dotenv from 'dotenv'
import { pino } from 'pino'
dotenv.config()

import app from './config/express.js'
import config from './config/config.js'

import { Session } from './api/class/session.js'
import { prisma, connectPrisma } from './api/helper/prismaClient.js'

const logger = pino()

let server: ReturnType<typeof app.listen>

server = app.listen(config.port, async () => {
    logger.info(`Listening on port ${config.port}`)
    await connectPrisma()
    if (config.restoreSessionsOnStartup) {
        logger.info(`Restoring Sessions`)
        const session = new Session()
        const restoreSessions = await session.restoreSessions()
        logger.info(`${restoreSessions.length} Session(s) Restored`)
    }
})

const exitHandler = () => {
    if (server) {
        server.close(async () => {
            await prisma.$disconnect().catch(() => null)
            logger.info('Server closed')
            process.exit(1)
        })
    } else {
        process.exit(1)
    }
}

const unexpectedErrorHandler = (error: Error) => {
    logger.error(error)
    exitHandler()
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)

process.on('SIGTERM', () => {
    logger.info('SIGTERM received')
    if (server) {
        server.close()
    }
})

export default server
