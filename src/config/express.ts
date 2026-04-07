import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import exceptionHandler from 'express-exception-handler'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
;(exceptionHandler as any).handle()
const app = express()
import * as error from '../api/middlewares/error.js'
import tokenCheck from '../api/middlewares/tokenCheck.js'
import config from './config.js'

app.use(express.json())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true }))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '../api/views'))
global.WhatsAppInstances = {}

import routes from '../api/routes/index.js'
if (config.protectRoutes) {
    app.use(tokenCheck)
}
app.use('/', routes)
app.use(error.handler)

export default app
