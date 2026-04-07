import { Request, Response } from 'express'

export const create = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].createNewGroup(
        req.body.name,
        req.body.users
    )
    return res.status(201).json({ error: false, data: data })
}

export const addNewParticipant = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].addNewParticipant(
        req.body.id,
        req.body.users
    )
    return res.status(201).json({ error: false, data: data })
}

export const makeAdmin = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].makeAdmin(
        req.body.id,
        req.body.users
    )
    return res.status(201).json({ error: false, data: data })
}

export const demoteAdmin = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].demoteAdmin(
        req.body.id,
        req.body.users
    )
    return res.status(201).json({ error: false, data: data })
}

export const listAll = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].getAllGroups()
    return res.status(200).json({ error: false, data: data })
}

export const leaveGroup = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].leaveGroup(req.query.id as string)
    return res.status(200).json({ error: false, data: data })
}

export const getInviteCodeGroup = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].getInviteCodeGroup(
        req.query.id as string
    )
    return res
        .status(200)
        .json({ error: false, link: 'https://chat.whatsapp.com/' + data })
}

export const getInstanceInviteCodeGroup = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[
        req.query.key as string
    ].getInstanceInviteCodeGroup(req.query.id as string)
    return res
        .status(200)
        .json({ error: false, link: 'https://chat.whatsapp.com/' + data })
}

export const getAllGroups = async (req: Request, res: Response) => {
    const instance = WhatsAppInstances[req.query.key as string]
    let data
    try {
        data = await (instance as any).groupFetchAllParticipating()
    } catch (error) {
        data = {}
    }
    return res.json({
        error: false,
        message: 'Instance fetched successfully',
        instance_data: data,
    })
}

export const groupParticipantsUpdate = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].groupParticipantsUpdate(
        req.body.id,
        req.body.users,
        req.body.action
    )
    return res.status(201).json({ error: false, data: data })
}

export const groupSettingUpdate = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].groupSettingUpdate(
        req.body.id,
        req.body.action
    )
    return res.status(201).json({ error: false, data: data })
}

export const groupUpdateSubject = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].groupUpdateSubject(
        req.body.id,
        req.body.subject
    )
    return res.status(201).json({ error: false, data: data })
}

export const groupUpdateDescription = async (req: Request, res: Response) => {
    const data = await WhatsAppInstances[req.query.key as string].groupUpdateDescription(
        req.body.id,
        req.body.description
    )
    return res.status(201).json({ error: false, data: data })
}

export const groupInviteInfo = async (req: Request, res: Response) => {
    const data = await (WhatsAppInstances[req.query.key as string] as any).groupGetInviteInfo(
        req.body.code
    )
    return res.status(201).json({ error: false, data: data })
}

export const groupJoin = async (req: Request, res: Response) => {
    const data = await (WhatsAppInstances[req.query.key as string] as any).groupAcceptInvite(
        req.body.code
    )
    return res.status(201).json({ error: false, data: data })
}
