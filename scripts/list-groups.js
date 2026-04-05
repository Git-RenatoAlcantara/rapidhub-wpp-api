/* eslint-disable no-console */
const axios = require('axios')

function parseArgs(argv) {
    const args = {}
    for (let i = 0; i < argv.length; i++) {
        const current = argv[i]
        if (!current.startsWith('--')) continue
        const key = current.slice(2)
        const next = argv[i + 1]
        if (!next || next.startsWith('--')) {
            args[key] = true
            continue
        }
        args[key] = next
        i++
    }
    return args
}

function normalizeUrl(url) {
    return String(url || 'http://localhost:3333').replace(/\/+$/, '')
}

function toBoolean(value, defaultValue = false) {
    if (typeof value === 'undefined' || value === null) return defaultValue
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
    return defaultValue
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function printUsage() {
    console.log('Uso:')
    console.log(
        '  node scripts/list-groups.js --key <INSTANCE_KEY> [--url http://localhost:3333] [--token TOKEN] [--auto-init true] [--wait-ms 6000]'
    )
    console.log('')
    console.log('Exemplo:')
    console.log('  npm run groups:list -- --key 123')
}

function normalizeLiveGroups(instanceData) {
    return Object.values(instanceData || {})
        .filter(
            (group) =>
                typeof group?.id === 'string' && group.id.includes('@g.us')
        )
        .map((group, index) => {
            const participants = Array.isArray(group?.participants)
                ? group.participants
                : Object.values(group?.participants || {})
            return {
                index,
                name: group?.subject || group?.name || '',
                jid: group?.id,
                participant: participants,
                creation: group?.creation || null,
                subjectOwner: group?.subjectOwner || null,
            }
        })
}

function printGroups(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
        console.log('Nenhum grupo encontrado.')
        return
    }

    console.log(`Total de grupos: ${groups.length}`)
    for (const group of groups) {
        const name = group?.name || '(sem nome)'
        const jid = group?.jid || group?.id || '(sem jid)'
        console.log(`- ${name} | ${jid}`)
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        printUsage()
        return
    }

    const key =
        args.key || process.env.TEST_INSTANCE_KEY || process.env.INSTANCE_KEY
    const baseUrl = normalizeUrl(args.url || process.env.API_URL)
    const token =
        args.token || process.env.API_TOKEN || process.env.TOKEN || ''
    const autoInit = toBoolean(
        args['auto-init'] ?? process.env.TEST_AUTO_INIT,
        true
    )
    const waitMs = Number(args['wait-ms'] || process.env.TEST_WAIT_MS || 6000)

    if (!key) {
        console.error('Erro: informe --key (ou TEST_INSTANCE_KEY/INSTANCE_KEY).')
        printUsage()
        process.exit(1)
    }

    const headers = {}
    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    const listEndpoint = `${baseUrl}/v1/instances/${encodeURIComponent(
        key
    )}/groups`
    const liveEndpoint = `${baseUrl}/v1/instances/${encodeURIComponent(
        key
    )}/groups/live`
    const infoEndpoint = `${baseUrl}/v1/instances/${encodeURIComponent(key)}`
    const initEndpoint = `${baseUrl}/v1/instances`
    let qrUrl = `${baseUrl}/instance/qr?key=${encodeURIComponent(key)}`

    const fetchInstanceInfoSafe = async () => {
        try {
            const response = await axios.get(infoEndpoint, {
                headers,
                timeout: 30000,
            })
            return response?.data?.instance_data || null
        } catch (_error) {
            return null
        }
    }

    const fetchGroupsWithFallback = async () => {
        try {
            const liveResponse = await axios.get(liveEndpoint, {
                headers,
                timeout: 30000,
            })
            const liveGroups = normalizeLiveGroups(
                liveResponse?.data?.instance_data
            )
            if (liveGroups.length > 0) {
                return { groups: liveGroups, source: 'live', offline: false }
            }

            const cacheResponse = await axios.get(listEndpoint, {
                headers,
                timeout: 30000,
            })
            return {
                groups: cacheResponse?.data?.data || [],
                source: 'cache_after_live',
                offline: false,
            }
        } catch (error) {
            const status = error?.response?.status
            const message = error?.response?.data?.message

            if (status === 401 && message === "phone isn't connected") {
                const cacheResponse = await axios.get(listEndpoint, {
                    headers,
                    timeout: 30000,
                })
                return {
                    groups: cacheResponse?.data?.data || [],
                    source: 'cache_offline',
                    offline: true,
                }
            }

            throw error
        }
    }

    const runListFlow = async () => {
        const result = await fetchGroupsWithFallback()
        printGroups(result.groups)

        if (result.groups.length === 0) {
            const instanceInfo = await fetchInstanceInfoSafe()
            if (instanceInfo?.phone_connected === true) {
                console.log(
                    'A instancia esta conectada, mas os grupos ainda nao foram sincronizados no cache local. Tente novamente em alguns segundos.'
                )
            } else if (
                result.offline ||
                instanceInfo?.phone_connected === false
            ) {
                console.log(
                    'A instancia esta sem conexao ativa com o WhatsApp. Abra o QR para conectar:'
                )
                console.log(qrUrl)
            }
        }
    }

    try {
        await runListFlow()
    } catch (error) {
        const status = error?.response?.status
        const data = error?.response?.data

        const isInvalidKey =
            status === 403 && data?.message === 'invalid key supplied'

        if (isInvalidKey && autoInit) {
            console.warn(
                'A key nao esta carregada na API. Inicializando instancia automaticamente...'
            )
            try {
                const initResponse = await axios.post(
                    initEndpoint,
                    { key },
                    {
                        headers,
                        timeout: 30000,
                    }
                )
                qrUrl = initResponse?.data?.qrcode?.url || qrUrl
            } catch (initError) {
                const initStatus = initError?.response?.status
                const initData = initError?.response?.data
                console.error(
                    `Falha ao inicializar a instancia automaticamente (HTTP ${initStatus || 'N/A'}).`
                )
                if (initData) {
                    console.error(JSON.stringify(initData, null, 2))
                } else {
                    console.error(initError?.message || initError)
                }
                process.exit(1)
            }

            if (waitMs > 0) {
                console.log(`Aguardando ${waitMs}ms para reconexao da sessao...`)
                await sleep(waitMs)
            }

            try {
                await runListFlow()
                return
            } catch (retryError) {
                const retryStatus = retryError?.response?.status
                const retryData = retryError?.response?.data
                if (retryStatus) {
                    console.error(
                        `Falha ao listar grupos apos auto-init (HTTP ${retryStatus}).`
                    )
                    console.error(JSON.stringify(retryData, null, 2))
                } else {
                    console.error('Falha ao listar grupos apos auto-init.')
                    console.error(retryError?.message || retryError)
                }
                process.exit(1)
            }
        }

        if (status) {
            console.error(`Falha ao listar grupos (HTTP ${status}).`)
            console.error(JSON.stringify(data, null, 2))
        } else {
            console.error('Falha ao listar grupos.')
            console.error(error?.message || error)
        }
        process.exit(1)
    }
}

main()
