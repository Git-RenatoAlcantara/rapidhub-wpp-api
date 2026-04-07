import { downloadContentFromMessage, MediaType } from '@whiskeysockets/baileys'
import { pino } from 'pino'

const logger = pino()

export default async function downloadMessage(
    msg: Parameters<typeof downloadContentFromMessage>[0],
    msgType: MediaType
): Promise<string> {
    let buffer = Buffer.from([])
    try {
        const stream = await downloadContentFromMessage(msg, msgType)
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
    } catch (error: any) {
        logger.error(
            { error: error?.message || error },
            'Error downloading file-message'
        )
        return ''
    }
    return buffer.toString('base64')
}
