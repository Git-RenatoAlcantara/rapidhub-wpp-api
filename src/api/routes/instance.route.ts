import express from 'express'
import * as controller from '../controllers/instance.controller.js'
import keyVerify from '../middlewares/keyCheck.js'

const router = express.Router()
router.route('/init').get(controller.init).post(controller.init)
router.route('/qr').get(keyVerify, controller.qr)
router.route('/qrbase64').get(keyVerify, controller.qrbase64)
router.route('/pairingcode').post(controller.pairingCode)
router.route('/info').get(keyVerify, controller.info)
router.route('/restore').get(controller.restore).post(controller.restore)
router.route('/logout').get(controller.logout).post(controller.logout)
router.route('/logout').delete(controller.logout)
router.route('/delete').delete(keyVerify, controller.deleteInstance)
router.route('/list').get(controller.list)

export default router
