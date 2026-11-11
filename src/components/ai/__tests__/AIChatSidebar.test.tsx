import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChatStore } from "@/stores/useChatStore";
import { AIChatSidebar } from "../AIChatSidebar";

function createOpenStreamController() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
  });
  const encoder = new TextEncoder();
  const enqueueSse = (payload: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  };
  const close = () => {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  };
  return { stream, enqueueSse, close };
}

describe("AIChatSidebar image send", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.getState().resetChat();
  });

  afterEach(() => {
    useChatStore.getState().resetChat();
    global.fetch = originalFetch;
  });

  it("renders exactly one user message bubble while streaming an image send", async () => {
    const openStream = createOpenStreamController();
    let resolveChatStarted!: () => void;
    const chatStarted = new Promise<void>((resolve) => {
      resolveChatStarted = resolve;
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("/api/ai/model")) {
        return new Response(
          JSON.stringify({ displayName: "Gemini 3.5 Flash", isCloud: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/api/storage/upload")) {
        return new Response(
          JSON.stringify({
            url: "/api/storage/file/meal.png",
            key: "meal.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aW1n",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/api/ai/chat")) {
        openStream.enqueueSse({ type: "start", messageId: "assistant-1" });
        openStream.enqueueSse({ type: "text-start", id: "text-1" });
        openStream.enqueueSse({ type: "text-delta", id: "text-1", delta: "Аналізую..." });
        resolveChatStarted();

        // Keep the stream intentionally open while asserting
        return new Response(openStream.stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
            "x-session-id": "session-123",
          },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AIChatSidebar isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const imageFile = new File(["fake-image-bytes"], "meal.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [imageFile] } });

    const submitButton = await screen.findByTitle("Надіслати");
    fireEvent.click(submitButton);

    // Wait until /api/ai/chat is open and streaming has begun
    await chatStarted;
    await waitFor(() => {
      expect(screen.getByText(/Аналізую\.\.\./)).toBeInTheDocument();
    });

    // While the chat response stream is open, there must be ONLY 1 user bubble
    const userBubbles = container.querySelectorAll(".justify-end");
    expect(userBubbles).toHaveLength(1);
    expect(screen.getAllByAltText("Прикріплене фото 1")).toHaveLength(1);
    expect(useChatStore.getState().chatId).toBe("session-123");
    expect(useChatStore.getState().attachments).toHaveLength(0);

    // Cleanly close stream and confirm count stays 1
    openStream.enqueueSse({ type: "text-end", id: "text-1" });
    openStream.enqueueSse({ type: "finish", finishReason: "stop" });
    openStream.close();

    await waitFor(() => {
      expect(useChatStore.getState().isGenerating).toBe(false);
    });
    expect(container.querySelectorAll(".justify-end")).toHaveLength(1);
  });
});
