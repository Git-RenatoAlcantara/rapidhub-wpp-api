interface ExtendableErrorOptions {
    message: string
    errors?: any
    status?: number
}

class ExtendableError extends Error {
    errors?: any
    status?: number
    statusCode?: number

    constructor({ message, errors, status }: ExtendableErrorOptions) {
        super(message)
        this.name = this.constructor.name
        this.message = message
        this.errors = errors
        this.status = status
        this.statusCode = status
    }
}

export default ExtendableError
