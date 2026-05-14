/* eslint-disable no-console */
import axios from 'axios'

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

function printUsage() {
    console.log('Uso:')
    console.log(
        '  node scripts/test-pairing-code.js --phone <NUMERO> [--key <SESSION_KEY>] [--url http://localhost:3333] [--token TOKEN]'
    )
    console.log('')
    console.log('Exemplo:')
    console.log(
        '  node scripts/test-pairing-code.js --phone 5511999999999 --key cmp4hgb8w00002j2l0bls5tfw'
    )
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        printUsage()
        return
    }

    const key = args.key || process.env.INSTANCE_KEY || 'cmp4hgb8w00002j2l0bls5tfw'
    const phone = args.phone || process.env.TEST_PHONE
    const baseUrl = normalizeUrl(args.url || process.env.API_URL)
    const token = args.token || process.env.TOKEN || ''

    if (!phone) {
        console.error('ERRO: --phone é obrigatório (ex.: 5511999999999)')
        printUsage()
        process.exit(1)
    }

    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const url = `${baseUrl}/v1/instances/${key}/pairing-code`

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  Teste: Pairing Code')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  URL:        POST ${url}`)
    console.log(`  Key:        ${key}`)
    console.log(`  Phone:      ${phone}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
        const res = await axios.post(
            url,
            { phoneNumber: phone },
            { headers, timeout: 30000 }
        )

        console.log('')
        console.log('✅ Resposta HTTP', res.status)
        console.log(JSON.stringify(res.data, null, 2))

        if (res.data?.pairingCode) {
            console.log('')
            console.log('┌─────────────────────────────────────┐')
            console.log(`│  Código de pareamento: ${res.data.pairingCode.padEnd(12)} │`)
            console.log('└─────────────────────────────────────┘')
            console.log('')
            console.log('No WhatsApp do celular:')
            console.log('  Configurações → Dispositivos conectados → Conectar dispositivo')
            console.log('  → Conectar com número de telefone → digitar o código acima')
        }
    } catch (err) {
        const status = err?.response?.status
        const data = err?.response?.data

        console.error('')
        console.error(`❌ Erro HTTP ${status || '(sem resposta)'}`)
        if (data) console.error(JSON.stringify(data, null, 2))
        else console.error(err.message)
        process.exit(1)
    }
}

main()
