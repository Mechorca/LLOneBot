import {
    OB11Group,
    OB11GroupMember,
    OB11GroupMemberRole,
    OB11Message,
    OB11MessageData,
    OB11MessageDataType,
    OB11User
} from "./types";
import { AtType, ChatType, Group, GroupMember, IMAGE_HTTP_HOST, RawMessage, SelfInfo, User } from '../ntqqapi/types';
import {fileCache, getFriend, getGroupMember, getHistoryMsgBySeq, selfInfo} from '../common/data';
import { file2base64, getConfigUtil, log } from "../common/utils";
import { NTQQApi } from "../ntqqapi/ntcall";
import { EventType } from "./event/OB11BaseEvent";
import { encodeCQCode } from "./cqcode";


export class OB11Constructor {
    static async message(msg: RawMessage): Promise<OB11Message> {

        const { enableLocalFile2Url, ob11: { messagePostFormat } } = getConfigUtil().getConfig()
        const message_type = msg.chatType == ChatType.group ? "group" : "private";
        const resMsg: OB11Message = {
            self_id: parseInt(selfInfo.uin),
            user_id: parseInt(msg.senderUin),
            time: parseInt(msg.msgTime) || Date.now(),
            message_id: msg.msgShortId,
            real_id: msg.msgId,
            message_type: msg.chatType == ChatType.group ? "group" : "private",
            sender: {
                user_id: parseInt(msg.senderUin),
                nickname: msg.sendNickName,
                card: msg.sendMemberName || "",
            },
            raw_message: "",
            font: 14,
            sub_type: "friend",
            message: messagePostFormat === 'string' ? '' : [],
            message_format: messagePostFormat === 'string' ? 'string' : 'array',
            post_type: selfInfo.uin == msg.senderUin ? EventType.MESSAGE_SENT : EventType.MESSAGE,
        }
        if (msg.chatType == ChatType.group) {
            resMsg.sub_type = "normal" // 这里go-cqhttp是group，而onebot11标准是normal, 蛋疼
            resMsg.group_id = parseInt(msg.peerUin)
            const member = await getGroupMember(msg.peerUin, msg.senderUin);
            if (member) {
                resMsg.sender.role = OB11Constructor.groupMemberRole(member.role);
                resMsg.sender.nickname = member.nick
            }
        } else if (msg.chatType == ChatType.friend) {
            resMsg.sub_type = "friend"
            const friend = await getFriend(msg.senderUin);
            if (friend) {
                resMsg.sender.nickname = friend.nick;
            }
        } else if (msg.chatType == ChatType.temp) {
            resMsg.sub_type = "group"
        }

        for (let element of msg.elements) {
            let message_data: OB11MessageData | any = {
                data: {},
                type: "unknown"
            }
            if (element.textElement && element.textElement?.atType !== AtType.notAt) {
                message_data["type"] = OB11MessageDataType.at
                if (element.textElement.atType == AtType.atAll) {
                    // message_data["data"]["mention"] = "all"
                    message_data["data"]["qq"] = "all"
                } else {
                    let atUid = element.textElement.atNtUid
                    let atQQ = element.textElement.atUid
                    if (!atQQ || atQQ === "0") {
                        const atMember = await getGroupMember(msg.peerUin, null, atUid)
                        if (atMember) {
                            atQQ = atMember.uin
                        }
                    }
                    if (atQQ) {
                        // message_data["data"]["mention"] = atQQ
                        message_data["data"]["qq"] = atQQ
                    }
                }
            } else if (element.textElement) {
                message_data["type"] = "text"
                let text = element.textElement.content
                if (!text.trim()) {
                    continue;
                }
                message_data["data"]["text"] = text
            } else if (element.replyElement) {
                message_data["type"] = "reply"
                const replyMsg = getHistoryMsgBySeq(element.replyElement.replayMsgSeq)
                if (replyMsg) {
                    message_data["data"]["id"] = replyMsg.msgShortId.toString()
                } else {
                    continue
                }
            } else if (element.picElement) {
                message_data["type"] = "image"
                // message_data["data"]["file"] = element.picElement.sourcePath
                message_data["data"]["file"] = element.picElement.fileName
                // message_data["data"]["path"] = element.picElement.sourcePath
                message_data["data"]["url"] = IMAGE_HTTP_HOST + element.picElement.originImageUrl
                // message_data["data"]["file_id"] = element.picElement.fileUuid
                message_data["data"]["file_size"] = element.picElement.fileSize
                fileCache.set(element.picElement.fileName, {
                    fileName: element.picElement.fileName,
                    filePath: element.picElement.sourcePath,
                    fileSize: element.picElement.fileSize.toString(),
                    url: IMAGE_HTTP_HOST + element.picElement.originImageUrl,
                    downloadFunc: async () => {
                    await NTQQApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                        element.elementId, element.picElement.thumbPath.get(0), element.picElement.sourcePath)
                }})
                // 不在自动下载图片

            } else if (element.videoElement) {
                message_data["type"] = OB11MessageDataType.video;
                message_data["data"]["file"] = element.videoElement.fileName
                message_data["data"]["path"] = element.videoElement.filePath
                // message_data["data"]["file_id"] = element.videoElement.fileUuid
                message_data["data"]["file_size"] = element.videoElement.fileSize
                fileCache.set(element.videoElement.fileName, {
                    fileName: element.videoElement.fileName,
                    filePath: element.videoElement.filePath,
                    fileSize: element.videoElement.fileSize,
                    downloadFunc: async () => {
                        await NTQQApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                            element.elementId, element.videoElement.thumbPath.get(0), element.videoElement.filePath)
                    }})
                // 怎么拿到url呢
            } else if (element.fileElement) {
                message_data["type"] = OB11MessageDataType.file;
                message_data["data"]["file"] = element.fileElement.fileName
                // message_data["data"]["path"] = element.fileElement.filePath
                // message_data["data"]["file_id"] = element.fileElement.fileUuid
                message_data["data"]["file_size"] = element.fileElement.fileSize
                fileCache.set(element.fileElement.fileName, {
                    fileName: element.fileElement.fileName,
                    filePath: element.fileElement.filePath,
                    fileSize: element.fileElement.fileSize,
                    downloadFunc: async () => {
                        await NTQQApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                            element.elementId, null, element.fileElement.filePath)
                    }})
                // 怎么拿到url呢
            }
            else if (element.pttElement) {
                message_data["type"] = OB11MessageDataType.voice;
                message_data["data"]["file"] = element.pttElement.fileName
                message_data["data"]["path"] = element.pttElement.filePath
                // message_data["data"]["file_id"] = element.pttElement.fileUuid
                message_data["data"]["file_size"] = element.pttElement.fileSize
                fileCache.set(element.pttElement.fileName, {
                    fileName: element.pttElement.fileName,
                    filePath: element.pttElement.filePath,
                    fileSize: element.pttElement.fileSize,
                })

                // log("收到语音消息", msg)
                // window.LLAPI.Ptt2Text(message.raw.msgId, message.peer, messages).then(text => {
                //     console.log("语音转文字结果", text);
                // }).catch(err => {
                //     console.log("语音转文字失败", err);
                // })
            } else if (element.arkElement) {
                message_data["type"] = OB11MessageDataType.json;
                message_data["data"]["data"] = element.arkElement.bytesData;
            } else if (element.faceElement) {
                message_data["type"] = OB11MessageDataType.face;
                message_data["data"]["id"] = element.faceElement.faceIndex.toString();
            }

            // if (message_data.data.file) {
            //     let filePath: string = message_data.data.file;
            //     if (!enableLocalFile2Url) {
            //         message_data.data.file = "file://" + filePath
            //     } else { // 不使用本地路径
            //         const ignoreTypes = [OB11MessageDataType.file, OB11MessageDataType.video]
            //         if (!ignoreTypes.includes(message_data.type)) {
            //             if (message_data.data.url && !message_data.data.url.startsWith(IMAGE_HTTP_HOST + "/download")) {
            //                 message_data.data.file = message_data.data.url
            //             } else {
            //                 let { err, data } = await file2base64(filePath);
            //                 if (err) {
            //                     log("文件转base64失败", filePath, err)
            //                 } else {
            //                     message_data.data.file = "base64://" + data
            //                 }
            //             }
            //         } else {
            //             message_data.data.file = "file://" + filePath
            //         }
            //     }
            // }

            if (message_data.type !== "unknown" && message_data.data) {
                const cqCode = encodeCQCode(message_data);
                if (messagePostFormat === 'string') {
                    (resMsg.message as string) += cqCode;
                } else (resMsg.message as OB11MessageData[]).push(message_data);

                resMsg.raw_message += cqCode;
            }
        }
        resMsg.raw_message = resMsg.raw_message.trim();
        return resMsg;
    }

    static friend(friend: User): OB11User {
        return {
            user_id: parseInt(friend.uin),
            nickname: friend.nick,
            remark: friend.remark
        }

    }

    static selfInfo(selfInfo: SelfInfo): OB11User {
        return {
            user_id: parseInt(selfInfo.uin),
            nickname: selfInfo.nick
        }
    }

    static friends(friends: User[]): OB11User[] {
        return friends.map(OB11Constructor.friend)
    }

    static groupMemberRole(role: number): OB11GroupMemberRole | undefined {
        return {
            4: OB11GroupMemberRole.owner,
            3: OB11GroupMemberRole.admin,
            2: OB11GroupMemberRole.member
        }[role]
    }

    static groupMember(group_id: string, member: GroupMember): OB11GroupMember {
        return {
            group_id: parseInt(group_id),
            user_id: parseInt(member.uin),
            nickname: member.nick,
            card: member.cardName,
            role: OB11Constructor.groupMemberRole(member.role),
        }
    }

    static groupMembers(group: Group): OB11GroupMember[] {
        log("construct ob11 group members", group)
        return group.members.map(m => OB11Constructor.groupMember(group.groupCode, m))
    }

    static group(group: Group): OB11Group {
        return {
            group_id: parseInt(group.groupCode),
            group_name: group.groupName,
            member_count: group.memberCount,
            max_member_count: group.maxMember
        }
    }

    static groups(groups: Group[]): OB11Group[] {
        return groups.map(OB11Constructor.group)
    }
}
