import express, { Request, Response, NextFunction } from 'express'
import * as instanceController from '../controllers/instance.controller.js'
import * as messageController from '../controllers/message.controller.js'
import * as groupController from '../controllers/group.controller.js'
import * as miscController from '../controllers/misc.controller.js'
import keyVerify from '../middlewares/keyCheck.js'
import loginVerify from '../middlewares/loginCheck.js'
import { bindParamToQuery } from '../middlewares/paramKey.js'

const router = express.Router()

const bindKeyParam = bindParamToQuery('key', 'key')
const bindGroupParam = bindParamToQuery('groupId', 'id')

router.route('/instances').post(instanceController.init).get(instanceController.list)
router.route('/instances/restore').post(instanceController.restore)

router
    .route('/instances/:key')
    .get(bindKeyParam, keyVerify, instanceController.info)
    .delete(bindKeyParam, keyVerify, instanceController.deleteInstance)

router
    .route('/instances/:key/session')
    .delete(bindKeyParam, instanceController.logout)

router
    .route('/instances/:key/qr')
    .get(bindKeyParam, keyVerify, instanceController.qrbase64)

router
    .route('/instances/:key/pairing-code')
    .post(bindKeyParam, instanceController.pairingCode)

router
    .route('/instances/:key/messages')
    .post(
        bindKeyParam,
        keyVerify,
        loginVerify,
        (req: Request, _res: Response, next: NextFunction) => {
            if (!req.body?.id && req.body?.to) {
                req.body.id = req.body.to
            }
            next()
        },
        messageController.Text
    )

router
    .route('/instances/:key/contacts')
    .get(bindKeyParam, keyVerify, loginVerify, miscController.getContacts)

router
    .route('/instances/:key/groups/:groupId/messages')
    .post(
        bindKeyParam,
        bindGroupParam,
        keyVerify,
        loginVerify,
        (req: Request, _res: Response, next: NextFunction) => {
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

export default router
