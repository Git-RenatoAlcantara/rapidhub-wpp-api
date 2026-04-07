// Port number
const PORT = process.env.PORT || '3333'
const TOKEN = process.env.TOKEN || ''
const PROTECT_ROUTES = !!(
    process.env.PROTECT_ROUTES && process.env.PROTECT_ROUTES === 'true'
)

const RESTORE_SESSIONS_ON_START_UP = !!(
    process.env.RESTORE_SESSIONS_ON_START_UP &&
    process.env.RESTORE_SESSIONS_ON_START_UP === 'true'
)

const APP_URL: string | false = process.env.APP_URL || false

const ALLOWED_LOG_LEVELS = new Set([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
])
const ENV_LOG_LEVEL = (process.env.LOG_LEVEL || '').trim().toLowerCase()
const LOG_LEVEL = ALLOWED_LOG_LEVELS.has(ENV_LOG_LEVEL)
    ? ENV_LOG_LEVEL
    : 'info'

const INSTANCE_MAX_RETRY_QR = process.env.INSTANCE_MAX_RETRY_QR || 2

const sanitizeEnvText = (value: string | undefined, fallback: string): string => {
    const raw = value ?? fallback
    if (typeof raw !== 'string') return fallback
    return raw.trim().replace(/^['"]|['"]$/g, '') || fallback
}

const parseWebhookAllowedEvents = (value: string | undefined): string[] => {
    if (typeof value !== 'string') return ['all']
    const events = value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    return events.length > 0 ? events : ['all']
}

const CLIENT_PLATFORM = sanitizeEnvText(process.env.CLIENT_PLATFORM, 'windows')
const CLIENT_BROWSER = sanitizeEnvText(process.env.CLIENT_BROWSER, 'Chrome')
const CLIENT_VERSION = sanitizeEnvText(process.env.CLIENT_VERSION, '4.0.0')

// URL of the database used by Prisma (PostgreSQL connection string)
const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/whatsapp_api?schema=public'
// Enable or disable webhook globally on project
const WEBHOOK_ENABLED = !!(
    process.env.WEBHOOK_ENABLED && process.env.WEBHOOK_ENABLED === 'true'
)
// Webhook URL
const WEBHOOK_URL = sanitizeEnvText(process.env.WEBHOOK_URL, '')
// Receive message content in webhook (Base64 format)
const WEBHOOK_BASE64 = !!(
    process.env.WEBHOOK_BASE64 && process.env.WEBHOOK_BASE64 === 'true'
)
// allowed events which should be sent to webhook
const WEBHOOK_ALLOWED_EVENTS = parseWebhookAllowedEvents(
    process.env.WEBHOOK_ALLOWED_EVENTS
)
// Mark messages as seen
const MARK_MESSAGES_READ = !!(
    process.env.MARK_MESSAGES_READ && process.env.MARK_MESSAGES_READ === 'true'
)

const config = {
    port: PORT,
    token: TOKEN,
    restoreSessionsOnStartup: RESTORE_SESSIONS_ON_START_UP,
    appUrl: APP_URL,
    log: {
        level: LOG_LEVEL,
    },
    instance: {
        maxRetryQr: INSTANCE_MAX_RETRY_QR,
    },
    database: {
        url: DATABASE_URL,
    },
    browser: {
        platform: CLIENT_PLATFORM,
        browser: CLIENT_BROWSER,
        version: CLIENT_VERSION,
    },
    webhookEnabled: WEBHOOK_ENABLED,
    webhookUrl: WEBHOOK_URL,
    webhookBase64: WEBHOOK_BASE64,
    protectRoutes: PROTECT_ROUTES,
    markMessagesRead: MARK_MESSAGES_READ,
    webhookAllowedEvents: WEBHOOK_ALLOWED_EVENTS,
}

export default config
