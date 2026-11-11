import { create } from "zustand";
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
} from "ai";
import { toast } from "sonner";

export const MAX_CHAT_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ChatMessageMetadata {
  clientId?: string;
  status?: "uploading" | "pending" | "confirmed" | "error";
  imageUrl?: string;
  imageUrls?: string[];
}

export type ChatMessage = UIMessage<ChatMessageMetadata>;

export interface ChatAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

interface SendMessageOptions {
  onFinish?: () => void;
}

export interface ChatStoreState {
  chatId: string | null;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  isGenerating: boolean;
  abortController: AbortController | null;

  addAttachments: (incomingFiles: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  sendMessage: (text: string, options?: SendMessageOptions) => Promise<void>;
  stop: () => void;
  resetChat: () => void;
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildOptimisticDisplayText(trimmed: string, imageCount: number): string {
  if (trimmed) return trimmed;
  if (imageCount === 1) return "Аналіз фотографії страви";
  if (imageCount > 1) return `Аналіз ${imageCount} фотографій страв`;
  return "";
}

function buildFinalUserText(trimmed: string, uploadedCount: number): string {
  if (trimmed) return trimmed;
  if (uploadedCount === 1) return "Проаналізуй це фото страви та запиши її в щоденник.";
  if (uploadedCount > 1) {
    return `Проаналізуй ці ${uploadedCount} фото страв та запиши їх у щоденник.`;
  }
  return "";
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  chatId: null,
  messages: [],
  attachments: [],
  isGenerating: false,
  abortController: null,

  addAttachments: (incomingFiles) => {
    const filesArray = Array.from(incomingFiles);
    if (filesArray.length === 0) return;

    const currentAttachments = get().attachments;
    const remainingSlots = MAX_CHAT_IMAGES - currentAttachments.length;
    if (remainingSlots <= 0) {
      toast.info(`Можна додати щонайбільше ${MAX_CHAT_IMAGES} зображень.`);
      return;
    }

    let filesToAdd = filesArray;
    if (filesArray.length > remainingSlots) {
      filesToAdd = filesArray.slice(0, remainingSlots);
      toast.info(
        `Можна додати щонайбільше ${MAX_CHAT_IMAGES} зображень. Додано перші ${remainingSlots}.`
      );
    }

    const nextAttachments: ChatAttachment[] = [];
    for (const file of filesToAdd) {
      if (!file.type.startsWith("image/")) {
        toast.error(`Файл "${file.name}" не є зображенням`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`Зображення "${file.name}" занадто велике (макс. 10 МБ)`);
        continue;
      }
      nextAttachments.push({
        id: createClientId("att"),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextAttachments.length > 0) {
      set((state) => ({
        attachments: [...state.attachments, ...nextAttachments],
      }));
    }
  },

  removeAttachment: (id) => {
    set((state) => {
      const target = state.attachments.find((att) => att.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return {
        attachments: state.attachments.filter((att) => att.id !== id),
      };
    });
  },

  clearAttachments: () => {
    const current = get().attachments;
    current.forEach((att) => URL.revokeObjectURL(att.previewUrl));
    set({ attachments: [] });
  },

  stop: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
    }
    set({ isGenerating: false, abortController: null });
  },

  resetChat: () => {
    const { abortController, attachments } = get();
    if (abortController) {
      abortController.abort();
    }
    attachments.forEach((att) => URL.revokeObjectURL(att.previewUrl));
    set({
      chatId: null,
      messages: [],
      attachments: [],
      isGenerating: false,
      abortController: null,
    });
  },

  sendMessage: async (text, options) => {
    const trimmed = text.trim();
    const { attachments, isGenerating } = get();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;

    const pendingAttachments = [...attachments];
    const clientId = createClientId("user");
    const optimisticText = buildOptimisticDisplayText(trimmed, pendingAttachments.length);
    const controller = new AbortController();

    const optimisticUserMessage: ChatMessage = {
      id: clientId,
      role: "user",
      parts: [{ type: "text", text: optimisticText }],
      metadata: {
        clientId,
        status: pendingAttachments.length > 0 ? "uploading" : "pending",
        imageUrls: pendingAttachments.map((att) => att.previewUrl),
      },
    };

    // Single-source optimistic insert: clear input attachments and append one user entry
    set((state) => ({
      attachments: [],
      messages: [...state.messages, optimisticUserMessage],
      isGenerating: true,
      abortController: controller,
    }));

    const uploadedUrls: string[] = [];
    const uploadedDataUrls: string[] = [];
    let shouldRevokeOnCleanup = true;

    try {
      if (pendingAttachments.length > 0) {
        const uploadResults = await Promise.all(
          pendingAttachments.map(async (att) => {
            const formData = new FormData();
            formData.append("file", att.file);
            const res = await fetch("/api/storage/upload", {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || `Не вдалося завантажити ${att.file.name}`);
            }

            const data = await res.json();
            return { url: data.url as string, dataUrl: data.dataUrl as string };
          })
        );

        uploadResults.forEach((r) => {
          if (r.url) uploadedUrls.push(r.url);
          if (r.dataUrl) uploadedDataUrls.push(r.dataUrl);
        });

        const finalUserText = buildFinalUserText(trimmed, uploadedUrls.length);

        // Reconcile the exact pending user message in-place with permanent URLs
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === clientId
              ? {
                  ...msg,
                  parts: [{ type: "text", text: finalUserText }],
                  metadata: {
                    ...msg.metadata,
                    status: "pending",
                    imageUrl:
                      uploadedUrls.length === 1
                        ? uploadedUrls[0]
                        : JSON.stringify(uploadedUrls),
                    imageUrls: uploadedUrls,
                  },
                }
              : msg
          ),
        }));

        pendingAttachments.forEach((att) => URL.revokeObjectURL(att.previewUrl));
        shouldRevokeOnCleanup = false;
      }

      const now = new Date();
      const { chatId, messages } = get();
      const requestMessages = messages.filter((m) => m.metadata?.status !== "error");

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId: chatId,
          currentDate: now.toISOString().split("T")[0],
          currentTime: `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`,
          messages: requestMessages,
          imageUrl: uploadedUrls[0],
          imageUrls: uploadedUrls,
          imageDataUrl: uploadedDataUrls[0],
          imageDataUrls: uploadedDataUrls,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Помилка надсилання повідомлення");
      }

      const nextChatId = response.headers.get("x-session-id");

      // Server accepted and persisted the user turn: mark pending message confirmed in-place
      set((state) => ({
        chatId: nextChatId || state.chatId,
        messages: state.messages.map((msg) =>
          msg.id === clientId
            ? {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  status: "confirmed",
                },
              }
            : msg
        ),
      }));

      if (response.body) {
        const assistantSlotId = createClientId("assistant");
        let assistantInserted = false;

        const chunkStream = parseJsonEventStream({
          stream: response.body,
          schema: uiMessageChunkSchema,
        }).pipeThrough(
          new TransformStream({
            async transform(chunk, streamController) {
              if (!chunk.success) throw chunk.error;
              streamController.enqueue(chunk.value);
            },
          })
        );

        for await (const streamedMessage of readUIMessageStream({
          stream: chunkStream,
          terminateOnError: true,
        })) {
          if (controller.signal.aborted) break;

          const assistantMessage: ChatMessage = {
            ...(streamedMessage as ChatMessage),
            id: streamedMessage.id || assistantSlotId,
            metadata: {
              ...(streamedMessage.metadata as ChatMessageMetadata | undefined),
              clientId: assistantSlotId,
            },
          };

          set((state) => {
            if (!assistantInserted) {
              assistantInserted = true;
              return { messages: [...state.messages, assistantMessage] };
            }
            return {
              messages: state.messages.map((msg) =>
                msg.metadata?.clientId === assistantSlotId ? assistantMessage : msg
              ),
            };
          });
        }
      }

      options?.onFinish?.();
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return;
      }

      const msg = err instanceof Error ? err.message : "Помилка надсилання повідомлення";
      toast.error(msg);

      set((state) => ({
        messages: state.messages.map((item) =>
          item.id === clientId
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: "error",
                },
              }
            : item
        ),
      }));
    } finally {
      if (shouldRevokeOnCleanup) {
        pendingAttachments.forEach((att) => URL.revokeObjectURL(att.previewUrl));
      }
      if (get().abortController === controller) {
        set({ isGenerating: false, abortController: null });
      }
    }
  },
}));
