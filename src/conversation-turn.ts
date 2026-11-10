import type { Message } from "./types";

export interface OptimisticTurn {
  localId: string;
  message: Message;
}

export function beginOptimisticTurn(
  messages: Message[],
  content: string,
  clientMessageId: string,
  createdAt = new Date().toISOString(),
): OptimisticTurn {
  const localId = `local:${clientMessageId}`;
  const existing = messages.find(
    (message) =>
      message.id === localId || message.clientMessageId === clientMessageId,
  );

  if (existing) {
    existing.content = content;
    existing.status = "pending";
    return { localId, message: existing };
  }

  const message: Message = {
    id: localId,
    role: "user",
    content,
    meta: {},
    clientMessageId,
    status: "pending",
    createdAt,
  };
  messages.push(message);
  return { localId, message };
}

export function completeOptimisticTurn(
  messages: Message[],
  turn: Pick<OptimisticTurn, "localId"> & { clientMessageId: string },
  userMessage: Message,
  assistantMessage: Message,
) {
  const optimisticIndex = messages.findIndex(
    (message) =>
      message.id === turn.localId ||
      message.clientMessageId === turn.clientMessageId,
  );
  const completedUserMessage: Message = {
    ...userMessage,
    meta: userMessage.meta || {},
    status: "complete",
  };

  if (optimisticIndex >= 0) {
    messages.splice(
      optimisticIndex,
      1,
      completedUserMessage,
      assistantMessage,
    );
    return;
  }

  messages.push(completedUserMessage, assistantMessage);
}

export function failOptimisticTurn(message: Message) {
  message.status = "failed";
}
