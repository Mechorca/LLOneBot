import {OB11BaseNoticeEvent} from "./OB11BaseNoticeEvent";
import {OB11GroupNoticeEvent} from "./OB11GroupNoticeEvent";

export class OB11GroupAdminNoticeEvent extends OB11GroupNoticeEvent {
    notice_type = "group_admin"
    sub_type: "set" | "unset"  // "set" | "unset"
}