/**
 * 本机私有配置：把四类一次性分析任务固化到本地模型条目，保证 NSFW 素材
 * （书稿正文、修改差异、文风样本）永不触云。覆盖优先于界面所选模型。
 *
 * 该映射绑定本机 userData 中的模型条目 id，属个人 fork 的本机配置：
 * 换机或更换模型条目时需手改此常量。override id 不在模型配置时任务被
 * 干净拒绝（无默认模型回退、无触云路径，有意为之）。
 *
 * 已接受的取舍：Renderer 预算预检仍按界面所选模型计算，Main/Agent 复核
 * 按本地模型执行，大输入的拒绝面因 agent 而异（详见计划 Scope C5）；
 * 运行载荷的思考等级会按本地模型选项校验，残留的非 off 等级会被拒
 * （fail-closed，宁拒勿触云）。
 *
 * long-book-decomposition 有意不在映射内：其运行模型必须与任务快照一致，
 * 运行期覆盖会破坏该不变量；chat 类智能体同样不覆盖。
 *
 * 打包冒烟（DEEPWRITE_SMOKE === "1"）整体跳过该映射，原样返回界面所选
 * 模型：冒烟工作区是全新 profile，不含本机模型条目，固化映射只会把四类
 * 任务推向不存在的 id 而必挂。旁路仅由该环境变量触发，判定严格等于 "1"，
 * 无变量时生产 fail-closed 行为一分不变；与 smoke-decomposition-model、
 * smoke-book-identity-model 的冒烟旁路同型。
 */
export const EXTRAS_LOCAL_MODEL_OVERRIDES: Partial<Record<string, string>> = {
  "long-book-analysis": "model_74478acd",
  "short-book-analysis": "model_74478acd",
  "revision-analysis": "model_74478acd",
  "style-comparison": "model_74478acd"
};

/** 映射命中返回本地模型 id，否则原样返回界面所选模型。 */
export function resolveExtrasRunModelId(
  agentId: string,
  requestedModelId: string | undefined
): string | undefined {
  if (process.env.DEEPWRITE_SMOKE === "1") {
    return requestedModelId;
  }
  return EXTRAS_LOCAL_MODEL_OVERRIDES[agentId] ?? requestedModelId;
}
