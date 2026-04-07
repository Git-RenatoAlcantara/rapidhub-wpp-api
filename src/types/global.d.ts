import { WhatsAppInstance } from '../api/class/instance.js'

declare global {
    // eslint-disable-next-line no-var
    var WhatsAppInstances: Record<string, WhatsAppInstance>
}

export {}
