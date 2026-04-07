import ExtendableError from './extendable.error.js'

interface APIErrorOptions {
    message: string
    errors?: any
    status?: number
}

class APIError extends ExtendableError {
    constructor({ message, errors, status = 500 }: APIErrorOptions) {
        super({
            message,
            errors,
            status,
        })
    }
}

export default APIError
