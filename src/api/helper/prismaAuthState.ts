import { proto, initAuthCreds } from '@whiskeysockets/baileys'
import { prisma } from './prismaClient.js'

const BufferJSON = {
    replacer: (_k: string, value: any) => {
        if (
            Buffer.isBuffer(value) ||
            value instanceof Uint8Array ||
            value?.type === 'Buffer'
        ) {
            return {
                type: 'Buffer',
                data: Buffer.from(value?.data || value).toString('base64'),
            }
        }

        return value
    },

    reviver: (_: string, value: any) => {
        if (
            typeof value === 'object' &&
            !!value &&
            (value.buffer === true || value.type === 'Buffer')
        ) {
            const val = value.data || value.value
            return typeof val === 'string'
                ? Buffer.from(val, 'base64')
                : Buffer.from(val || [])
        }

        return value
    },
}

export default async function usePrismaAuthState(sessionName: string) {
    await prisma.session.upsert({
        where: { name: sessionName },
        update: {},
        create: { name: sessionName },
    })

    const writeData = (data: any, id: string) => {
        return prisma.authState.upsert({
            where: {
                id_sessionId: {
                    id,
                    sessionId: sessionName,
                },
            },
            update: {
                data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
            },
            create: {
                id,
                sessionId: sessionName,
                data: JSON.parse(JSON.stringify(data, BufferJSON.replacer)),
            },
        })
    }
    const readData = async (id: string) => {
        try {
            const row = await prisma.authState.findUnique({
                where: {
                    id_sessionId: {
                        id,
                        sessionId: sessionName,
                    },
                },
                select: {
                    data: true,
                },
            })
            if (!row?.data) {
                return null
            }
            return JSON.parse(JSON.stringify(row.data), BufferJSON.reviver)
        } catch (error) {
            return null
        }
    }
    const removeData = async (id: string) => {
        try {
            await prisma.authState.delete({
                where: {
                    id_sessionId: {
                        id,
                        sessionId: sessionName,
                    },
                },
            })
        } catch (_a) {
            return null
        }
    }
    const storedCreds = await readData('creds')
    const creds = storedCreds || initAuthCreds()
    // pairingEphemeralKeyPair may be absent from credentials stored before it was
    // introduced in Baileys, or from sessions that pre-date the pairing-code flow.
    // Regenerate it when missing so requestPairingCode never crashes on .public.
    if (!creds.pairingEphemeralKeyPair) {
        creds.pairingEphemeralKeyPair = initAuthCreds().pairingEphemeralKeyPair
    }
    return {
        state: {
            creds,
            keys: {
                get: async (type: string, ids: string[]) => {
                    const data: Record<string, any> = {}
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`)
                            if (type === 'app-state-sync-key' && value) {
                                value =
                                    proto.Message.AppStateSyncKeyData.fromObject(
                                        value
                                    )
                            }
                            data[id] = value
                        })
                    )
                    return data
                },
                set: async (data: Record<string, Record<string, any>>) => {
                    const tasks: Promise<any>[] = []
                    for (const category of Object.keys(data)) {
                        for (const id of Object.keys(data[category])) {
                            const value = data[category][id]
                            const key = `${category}-${id}`
                            tasks.push(
                                value ? writeData(value, key) : removeData(key)
                            )
                        }
                    }
                    await Promise.all(tasks)
                },
            },
        },
        saveCreds: () => {
            return writeData(creds, 'creds')
        },
    }
}
