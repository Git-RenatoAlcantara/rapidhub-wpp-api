const { proto } = require('@whiskeysockets/baileys/WAProto')
const {
    Curve,
    signedKeyPair,
} = require('@whiskeysockets/baileys/lib/Utils/crypto')
const {
    generateRegistrationId,
} = require('@whiskeysockets/baileys/lib/Utils/generics')
const { randomBytes } = require('crypto')
const { prisma } = require('./prismaClient')

const initAuthCreds = () => {
    const identityKey = Curve.generateKeyPair()
    return {
        noiseKey: Curve.generateKeyPair(),
        signedIdentityKey: identityKey,
        signedPreKey: signedKeyPair(identityKey, 1),
        registrationId: generateRegistrationId(),
        advSecretKey: randomBytes(32).toString('base64'),
        processedHistoryMessages: [],
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSettings: {
            unarchiveChats: false,
        },
    }
}

const BufferJSON = {
    replacer: (k, value) => {
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

    reviver: (_, value) => {
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

module.exports = async function usePrismaAuthState(sessionName) {
    await prisma.session.upsert({
        where: { name: sessionName },
        update: {},
        create: { name: sessionName },
    })

    const writeData = (data, id) => {
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
    const readData = async (id) => {
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
    const removeData = async (id) => {
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
    const creds = (await readData('creds')) || (0, initAuthCreds)()
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {}
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
                set: async (data) => {
                    const tasks = []
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
