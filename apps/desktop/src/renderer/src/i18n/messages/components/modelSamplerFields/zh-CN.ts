export default {
  samplerOverrides: "采样参数覆盖（DRY / XTC / min-p）",
  emptyItemsAreNotSent: "留空的项不会随请求发送；0 和 -1 是有效值。",
  dryMultiplier: "DRY 倍率",
  dryMultiplierHint: "范围 0–10；0 表示关闭（仍会随请求发送）。",
  dryBase: "DRY 基数",
  dryBaseHint: "范围 1–4。",
  dryAllowedLength: "DRY 匹配长度",
  dryAllowedLengthHint: "整数，范围 0–32。",
  dryPenaltyLastN: "DRY 窗口",
  dryPenaltyLastNHint: "整数，范围 -1–16384；-1 表示按上下文长度。",
  xtcProbability: "XTC 概率",
  xtcProbabilityHint: "范围 0–1；0 表示关闭（仍会随请求发送）。",
  xtcThreshold: "XTC 阈值",
  xtcThresholdHint: "范围 0–0.5。",
  minP: "min-p",
  minPHint: "范围 0–1。",
  enterAValidNumberFor: "「{arg0}」不是有效数字。",
  enterAnIntegerBetweenValueAndValue:
    "「{arg0}」需为 {arg1} 到 {arg2} 之间的整数。",
  enterAValueBetweenValueAndValue: "「{arg0}」需在 {arg1} 到 {arg2} 之间。"
};
