import { PrismaClient } from '@prisma/client'
import { pino } from 'pino'

const logger = pino()

if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        'postgresql://postgres:postgres@localhost:5432/whatsapp_api?schema=public'
}

export const prisma = new PrismaClient()

export async function connectPrisma(): Promise<void> {
    try {
        await prisma.$connect()
        logger.info('STATE: Successfully connected to Database via Prisma')
    } catch (error: any) {
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
