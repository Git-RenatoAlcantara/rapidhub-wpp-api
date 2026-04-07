import express from 'express'
import instanceRoutes from './instance.route.js'
import messageRoutes from './message.route.js'
import miscRoutes from './misc.route.js'
import groupRoutes from './group.route.js'
import v1Routes from './v1.route.js'
import docsRoutes from './docs.route.js'

const router = express.Router()

router.get('/status', (_req, res) => res.send('OK'))
router.use('/', docsRoutes)
router.use('/instance', instanceRoutes)
router.use('/message', messageRoutes)
router.use('/group', groupRoutes)
router.use('/misc', miscRoutes)
router.use('/v1', v1Routes)

export default router
