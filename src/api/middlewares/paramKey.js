function bindParamToQuery(paramName = 'key', queryName = 'key') {
    return (req, _res, next) => {
        const queryKey = req.query?.[queryName]
        const paramValue = req.params?.[paramName]

        if (
            (typeof queryKey === 'undefined' || queryKey === null) &&
            typeof paramValue !== 'undefined' &&
            paramValue !== null
        ) {
            req.query[queryName] = String(paramValue)
        }

        next()
    }
}

module.exports = {
    bindParamToQuery,
}

