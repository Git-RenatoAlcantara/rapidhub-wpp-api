import { Request, Response, NextFunction } from 'express'

export function bindParamToQuery(paramName = 'key', queryName = 'key') {
    return (req: Request, _res: Response, next: NextFunction) => {
        const queryKey = req.query?.[queryName]
        const paramValue = req.params?.[paramName]

        if (
            (typeof queryKey === 'undefined' || queryKey === null) &&
            typeof paramValue !== 'undefined' &&
            paramValue !== null
        ) {
            ;(req.query as any)[queryName] = String(paramValue)
        }

        next()
    }
}
