const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
const logger = require('pino')()

module.exports = async function downloadMessage(msg, msgType) {
    let buffer = Buffer.from([])
    try {
        const stream = await downloadContentFromMessage(msg, msgType)
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
    } catch (error) {
        logger.error(
            { error: error?.message || error },
            'Error downloading file-message'
        )
        return ''
    }
    return buffer.toString('base64')
}
