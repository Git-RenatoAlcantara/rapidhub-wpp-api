import { Request, Response, NextFunction } from 'express'
import config from '../../config/config.js'

function tokenVerification(req: Request, res: Response, next: NextFunction) {
    const bearer = req.headers.authorization
    const token = bearer?.slice(7)?.toString()
    if (!token) {
        return res.status(403).send({
            error: true,
            message: 'no bearer token header was present',
        })
    }

    if (config.token !== token) {
        return res
            .status(403)
            .send({ error: true, message: 'invalid bearer token supplied' })
    }
    next()
}

export default tokenVerification
