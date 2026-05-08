import { Request, Response } from 'express'

export const onWhatsapp = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string]?.verifyId(
        WhatsAppInstances[req.query.key as string]?.getWhatsAppId(req.query.id as string)
    )
    return res.status(201).json({ error: false, data: data })
}

export const downProfile = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string]?.DownloadProfile(
        req.query.id as string
    )
    return res.status(201).json({ error: false, data: data })
}

export const getStatus = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string]?.getUserStatus(
        req.query.id as string
    )
    return res.status(201).json({ error: false, data: data })
}

export const blockUser = async (req: Request, res: Response) => {
    await WhatsAppInstances[req.query.key as string]?.blockUnblock(
        req.query.id as string,
        req.query.block_status as string
    )
    if (req.query.block_status == 'block') {
        return res
            .status(201)
            .json({ error: false, message: 'Contact Blocked' })
    } else
        return res
            .status(201)
            .json({ error: false, message: 'Contact Unblocked' })
}

export const updateProfilePicture = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].updateProfilePicture(
        req.body.id,
        req.body.url
    )
    return res.status(201).json({ error: false, data: data })
}

export const getUserOrGroupById = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].getUserOrGroupById(
        req.query.id as string
    )
    return res.status(201).json({ error: false, data: data })
}

export const getContacts = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].getContacts()
    return res.status(200).json({ error: false, data: data })
}
