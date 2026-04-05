const { PrismaClient } = require('@prisma/client')
const logger = require('pino')()

if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        'postgresql://postgres:postgres@localhost:5432/whatsapp_api?schema=public'
}

const prisma = new PrismaClient()

async function connectPrisma() {
    try {
        await prisma.$connect()
        logger.info('STATE: Successfully connected to Database via Prisma')
    } catch (error) {
        logger.error(
            {
                error: {
                    name: error?.name,
                    code: error?.code,
                    message: error?.message,
                },
            },
            'STATE: Connection to Database failed!'
        )
        process.exit(1)
    }
}

module.exports = { prisma, connectPrisma }
