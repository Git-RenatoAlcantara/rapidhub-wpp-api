const express = require('express')
const instanceController = require('../controllers/instance.controller')
const messageController = require('../controllers/message.controller')
const groupController = require('../controllers/group.controller')
const keyVerify = require('../middlewares/keyCheck')
const loginVerify = require('../middlewares/loginCheck')
const { bindParamToQuery } = require('../middlewares/paramKey')

const router = express.Router()

const bindKeyParam = bindParamToQuery('key', 'key')
const bindGroupParam = bindParamToQuery('groupId', 'id')

router.route('/instances').post(instanceController.init).get(instanceController.list)
router.route('/instances/restore').post(instanceController.restore)

router
    .route('/instances/:key')
    .get(bindKeyParam, keyVerify, instanceController.info)
    .delete(bindKeyParam, keyVerify, instanceController.delete)

router
    .route('/instances/:key/session')
    .delete(bindKeyParam, instanceController.logout)

router
    .route('/instances/:key/qr')
    .get(bindKeyParam, keyVerify, instanceController.qrbase64)

router
    .route('/instances/:key/messages')
    .post(
        bindKeyParam,
        keyVerify,
        loginVerify,
        (req, _res, next) => {
            if (!req.body?.id && req.body?.to) {
                req.body.id = req.body.to
            }
            next()
        },
        messageController.Text
    )

router
    .route('/instances/:key/groups/:groupId/messages')
    .post(
        bindKeyParam,
        bindGroupParam,
        keyVerify,
        loginVerify,
        (req, _res, next) => {
            req.body = req.body || {}
            if (!req.body.id) {
                req.body.id = req.query.id
            }
            next()
        },
        messageController.Text
    )

router
    .route('/instances/:key/groups')
    .get(bindKeyParam, keyVerify, groupController.listAll)

router
    .route('/instances/:key/groups/live')
    .get(bindKeyParam, keyVerify, groupController.getAllGroups)

router
    .route('/instances/:key/groups/:groupId')
    .delete(
        bindKeyParam,
        bindGroupParam,
        keyVerify,
        loginVerify,
        groupController.leaveGroup
    )

module.exports = router
