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
        '  node scripts/send-test-message.js --key <INSTANCE_KEY> --to <PHONE> [--message "texto"] [--url http://localhost:3333] [--token TOKEN] [--auto-init true] [--wait-ms 6000]'
    )
    console.log('')
    console.log('Exemplo:')
    console.log(
        '  npm run send:test -- --key 123 --to 5511999999999 --message "Teste da API"'
    )
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        printUsage()
        return
    }

    const key =
        args.key || process.env.TEST_INSTANCE_KEY || process.env.INSTANCE_KEY
    const to = args.to || process.env.TEST_TO || process.env.TEST_PHONE
    const message =
        args.message ||
        process.env.TEST_MESSAGE ||
        `Mensagem de teste enviada em ${new Date().toISOString()}`
    const baseUrl = normalizeUrl(args.url || process.env.API_URL)
    const token =
        args.token || process.env.API_TOKEN || process.env.TOKEN || ''
    const autoInit = toBoolean(
        args['auto-init'] ?? process.env.TEST_AUTO_INIT,
        true
    )
    const waitMs = Number(args['wait-ms'] || process.env.TEST_WAIT_MS || 6000)

    if (!key || !to) {
        console.error('Erro: informe --key e --to (ou variaveis de ambiente).')
        printUsage()
        process.exit(1)
    }

    const endpoint = `${baseUrl}/v1/instances/${encodeURIComponent(
        key
    )}/messages`
    const initEndpoint = `${baseUrl}/v1/instances`
    const qrUrl = `${baseUrl}/instance/qr?key=${encodeURIComponent(key)}`
    const headers = {
        'Content-Type': 'application/json',
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`
    }

    console.log(`Enviando mensagem de teste para ${to} usando key "${key}"...`)

    const sendMessage = () =>
        axios.post(
            endpoint,
            {
                to,
                message,
            },
            {
                headers,
                timeout: 30000,
            }
        )

    try {
        const response = await sendMessage()
        console.log('Mensagem enviada com sucesso.')
        console.log(JSON.stringify(response.data, null, 2))
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
                const qrUrlFromInit = initResponse?.data?.qrcode?.url
                if (qrUrlFromInit) {
                    console.log(`QR disponivel em: ${qrUrlFromInit}`)
                }
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
                const retryResponse = await sendMessage()
                console.log('Mensagem enviada com sucesso apos auto-init.')
                console.log(JSON.stringify(retryResponse.data, null, 2))
                return
            } catch (retryError) {
                const retryStatus = retryError?.response?.status
                const retryData = retryError?.response?.data
                if (
                    retryStatus === 401 &&
                    retryData?.message === "phone isn't connected"
                ) {
                    console.error(
                        'A instancia foi inicializada, mas o telefone nao esta conectado.'
                    )
                    console.error(`Abra o QR e conecte: ${qrUrl}`)
                } else if (retryStatus) {
                    console.error(
                        `Falha ao enviar mensagem apos auto-init (HTTP ${retryStatus}).`
                    )
                    console.error(JSON.stringify(retryData, null, 2))
                } else {
                    console.error(
                        'Falha ao enviar mensagem apos auto-init.'
                    )
                    console.error(retryError?.message || retryError)
                }
                process.exit(1)
            }
        }

        if (status) {
            console.error(`Falha ao enviar mensagem (HTTP ${status}).`)
            console.error(JSON.stringify(data, null, 2))
        } else {
            console.error('Falha ao enviar mensagem.')
            console.error(error?.message || error)
        }
        process.exit(1)
    }
}

main()
