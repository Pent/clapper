import { ClapAssetSource, ClapOutputType, ClapSegment, ClapSegmentStatus } from "@/types"
import { isValidNumber } from "@/utils/isValidNumber"
import { generateSeed } from "@/utils/generateSeed"
import { UUID } from "@/utils/uuid"
import { parseSegmentCategory } from "@/utils/parseSegmentCategory"
import { parseOutputType } from "@/index"

export function newSegment(maybeSegment?: Partial<ClapSegment>) {

  const startTimeInMs =
    isValidNumber(maybeSegment?.startTimeInMs)
    ? (maybeSegment?.startTimeInMs || 0)
    : 0

  const assetDurationInMs =
    isValidNumber(maybeSegment?.assetDurationInMs)
    ? (maybeSegment?.assetDurationInMs || 0)
    : 1000

  const endTimeInMs =
    isValidNumber(maybeSegment?.endTimeInMs)
    ? (maybeSegment?.endTimeInMs || 0)
    : (startTimeInMs + assetDurationInMs)

  const segment: ClapSegment = {
    id: typeof maybeSegment?.id === "string" ? maybeSegment.id : UUID(),
    parentId: typeof maybeSegment?.parentId === "string" ? maybeSegment.parentId : "",
    childrenIds: Array.isArray(maybeSegment?.childrenIds) ? maybeSegment.childrenIds : [],
    track: isValidNumber(maybeSegment?.track) ? (maybeSegment?.track || 0) : 0,
    startTimeInMs,
    endTimeInMs,
    category: parseSegmentCategory(maybeSegment?.category),
    entityId: typeof maybeSegment?.entityId === "string" ? maybeSegment.entityId : "",
    workflowId: typeof maybeSegment?.workflowId === "string" ? maybeSegment.workflowId : "",
    sceneId: typeof maybeSegment?.sceneId === "string" ? maybeSegment.sceneId : "",
    startTimeInLines: isValidNumber(maybeSegment?.startTimeInLines) ? (maybeSegment?.startTimeInLines || 0) : 0,
    endTimeInLines: isValidNumber(maybeSegment?.endTimeInLines) ? (maybeSegment?.endTimeInLines || 0) : 0,
    prompt: typeof maybeSegment?.prompt === "string" ? maybeSegment.prompt : "",
    label: typeof maybeSegment?.label === "string" ? maybeSegment.label : "",
    outputType: parseOutputType(maybeSegment?.outputType, ClapOutputType.TEXT),
    renderId: typeof maybeSegment?.renderId === "string" ? maybeSegment.renderId : "",
    status: typeof maybeSegment?.status === "string" ? maybeSegment.status : ClapSegmentStatus.TO_GENERATE,
    assetUrl: typeof maybeSegment?.assetUrl === "string" ? maybeSegment.assetUrl : "",
    assetDurationInMs: isValidNumber(assetDurationInMs) ? assetDurationInMs : 0,
    assetSourceType: typeof maybeSegment?.assetSourceType === "string" ? maybeSegment.assetSourceType : ClapAssetSource.EMPTY,
    assetFileFormat: typeof maybeSegment?.assetFileFormat === "string" ? maybeSegment.assetFileFormat : "",
    revision: isValidNumber(maybeSegment?.revision) ? (maybeSegment?.revision || 0) : 0,
    createdAt: typeof maybeSegment?.createdAt === "string" ?  maybeSegment.createdAt : new Date().toISOString(),
    createdBy: typeof maybeSegment?.createdBy === "string" ?  maybeSegment.createdBy : "ai",
    editedBy: typeof maybeSegment?.editedBy === "string" ?  maybeSegment.editedBy : "ai",
    outputGain: isValidNumber(maybeSegment?.outputGain) ? (maybeSegment?.outputGain || 0) : 0,
    seed: isValidNumber(maybeSegment?.seed) ? (maybeSegment?.seed || 0) : generateSeed()
  }

  return segment
}