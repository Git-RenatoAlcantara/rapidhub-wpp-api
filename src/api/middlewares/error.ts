import { Request, Response, NextFunction } from 'express'
import APIError from '../errors/api.error.js'

export const handler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode ? err.statusCode : 500

    res.setHeader('Content-Type', 'application/json')
    res.status(statusCode)
    res.json({
        error: true,
        code: statusCode,
        message: err.message,
    })
}

export const notFound = (req: Request, res: Response, _next: NextFunction) => {
    const err = new APIError({
        message: 'Not found',
        status: 404,
    })
    return handler(err, req, res, _next)
}
