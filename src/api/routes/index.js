const express = require('express')
const router = express.Router()
const instanceRoutes = require('./instance.route')
const messageRoutes = require('./message.route')
const miscRoutes = require('./misc.route')
const groupRoutes = require('./group.route')
const v1Routes = require('./v1.route')
const docsRoutes = require('./docs.route')

router.get('/status', (req, res) => res.send('OK'))
router.use('/', docsRoutes)
router.use('/instance', instanceRoutes)
router.use('/message', messageRoutes)
router.use('/group', groupRoutes)
router.use('/misc', miscRoutes)
router.use('/v1', v1Routes)

module.exports = router
