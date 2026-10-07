import { Agent } from "@earendil-works/pi-agent-core";
import type {
  AgentEvent,
  AgentMessage,
  StreamFn
} from "@earendil-works/pi-agent-core";
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  type ImageContent,
  type StopReason,
  type TextContent,
  type ThinkingContent,
  type ToolCall
} from "@earendil-works/pi-ai";
import { CliError } from "../cli-error";

const SMOKE_PROMPT = "请用一句话确认你已就绪。";
const SMOKE_REPLY = "冒烟完成：DeepWrite CLI headless 链路正常。";
const SMOKE_MODEL_ID = "smoke-model";

type AssistantBlock = TextContent | ThinkingContent | ToolCall;
type ToolResultBlock = TextContent | ImageContent;

type AgentMessageRole =
  | "user"
  | "assistant"
  | "toolResult"
  | "bashExecution"
  | "custom"
  | "branchSummary"
  | "compactionSummary";

interface MessageSummary {
  readonly role: AgentMessageRole;
  readonly textLength: number;
  readonly stopReason: StopReason | undefined;
  readonly errorMessage: string | undefined;
}

function contentTextLength(
  blocks: readonly (AssistantBlock | ToolResultBlock)[]
): number {
  return blocks.reduce(
    (total, block) =>
      block.type === "text" ? total + block.text.length : total,
    0
  );
}

function simpleContentTextLength(
  content: string | readonly (TextContent | ImageContent)[]
): number {
  return typeof content === "string"
    ? content.length
    : contentTextLength(content);
}

function assertNeverMessage(message: never): never {
  throw new Error(`未知的消息类型：${String(message)}`);
}

function messageSummary(message: AgentMessage): MessageSummary {
  switch (message.role) {
    case "user":
      return {
        role: "user",
        textLength: simpleContentTextLength(message.content),
        stopReason: undefined,
        errorMessage: undefined
      };
    case "assistant": {
      const { stopReason, errorMessage } = message;
      return {
        role: "assistant",
        textLength: contentTextLength(message.content),
        stopReason,
        errorMessage
      };
    }
    case "toolResult":
      return {
        role: "toolResult",
        textLength: contentTextLength(message.content),
        stopReason: undefined,
        errorMessage: undefined
      };
    case "bashExecution":
      return {
        role: "bashExecution",
        textLength: message.command.length + message.output.length,
        stopReason: undefined,
        errorMessage: undefined
      };
    case "custom":
      return {
        role: "custom",
        textLength: simpleContentTextLength(message.content),
        stopReason: undefined,
        errorMessage: undefined
      };
    case "branchSummary":
      return {
        role: "branchSummary",
        textLength: message.summary.length,
        stopReason: undefined,
        errorMessage: undefined
      };
    case "compactionSummary":
      return {
        role: "compactionSummary",
        textLength: message.summary.length,
        stopReason: undefined,
        errorMessage: undefined
      };
    default:
      return assertNeverMessage(message);
  }
}

/**
 * Zero-network headless smoke: one scripted faux-provider turn driven through
 * the real Agent runtime. Never touches buildProviderRuntime (which demands a
 * real baseUrl); the faux provider is fully in-memory.
 */
export async function runSmokeCommand(): Promise<number> {
  const faux = fauxProvider({
    api: "smoke-faux",
    provider: "smoke-faux",
    tokensPerSecond: 0,
    models: [{ id: SMOKE_MODEL_ID, name: "Smoke Model", reasoning: false }]
  });
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel(SMOKE_MODEL_ID);
  if (model === undefined) {
    throw new CliError(
      `faux provider 未注册冒烟模型 ${SMOKE_MODEL_ID}，冒烟无法开始。`
    );
  }
  // An empty faux queue yields an assistant error message; script exactly one reply.
  faux.setResponses([fauxAssistantMessage(SMOKE_REPLY)]);

  const agent = new Agent({
    initialState: {
      model,
      systemPrompt: "你是 DeepWrite CLI 的 headless 冒烟智能体，请简短回复。"
    },
    streamFn: models.streamSimple.bind(models) as StreamFn,
    sessionId: "smoke-faux"
  });

  let turnCount = 0;
  let assistantMessageEnds = 0;
  let failure: string | undefined;
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    if (event.type === "turn_start") {
      turnCount += 1;
      console.log(`turn_start 第 ${turnCount} 轮`);
      return;
    }
    if (event.type !== "message_end") return;
    const summary = messageSummary(event.message);
    console.log(
      `message_end role=${summary.role} textLength=${summary.textLength}`
    );
    if (summary.role !== "assistant") return;
    assistantMessageEnds += 1;
    if (summary.stopReason === "error" || summary.stopReason === "aborted") {
      failure = summary.errorMessage ?? `stopReason=${summary.stopReason}`;
    }
  });

  try {
    await agent.prompt(SMOKE_PROMPT);
  } finally {
    unsubscribe();
  }

  if (failure !== undefined) {
    console.log(`SMOKE_FAIL ${failure}`);
    return 1;
  }
  if (assistantMessageEnds === 0) {
    console.log("SMOKE_FAIL 未观察到 assistant message_end 事件。");
    return 1;
  }
  console.log(`SMOKE_OK messageEnds=${assistantMessageEnds}`);
  return 0;
}
