import BaseAction from "./BaseAction";
import {NTQQApi} from "../../ntqqapi/ntcall";
import {getGroupMember} from "../../common/data";
import {GroupMemberRole} from "../../ntqqapi/types";
import {ActionName} from "./types";

interface Payload{
    group_id: number,
    user_id: number,
    card: string
}

export default class SetGroupCard extends BaseAction<Payload, null>{
    actionName = ActionName.SetGroupCard
    protected async _handle(payload: Payload): Promise<null> {
        const member = await getGroupMember(payload.group_id, payload.user_id)
        if(!member){
            throw `群成员${payload.user_id}不存在`
        }
        await NTQQApi.setMemberCard(payload.group_id.toString(), member.uid, payload.card || "")
        return null
    }
}