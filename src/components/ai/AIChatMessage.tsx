"use client";

import React, { useState, useMemo } from "react";
import { type UIMessage, isToolUIPart } from "ai";
import { Bot, User as UserIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AIThoughtBlock } from "./AIThoughtBlock";
import { AIToolCard } from "./AIToolCard";
import { ImageLightbox } from "./ImageLightbox";

const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2 w-full overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-left text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/80 border-b border-border/60">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-border/40">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-muted/40 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-2.5 py-1.5 font-semibold text-foreground text-xs whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2.5 py-1.5 text-foreground/90 whitespace-nowrap text-xs">
      {children}
    </td>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1.5 space-y-1 pl-4 list-disc marker:text-primary text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1.5 space-y-1 pl-4 list-decimal marker:text-primary text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm leading-relaxed">{children}</li>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 text-sm leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-base mt-2 mb-1 text-foreground">{children}</h3>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-sm mt-2 mb-1 text-foreground">{children}</h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-sm mt-2 mb-1 text-foreground">{children}</h3>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
      {children}
    </code>
  ),
};

interface AIChatMessageProps {
  message: UIMessage;
  imageUrl?: string | null;
}

export function AIChatMessage({ message, imageUrl }: AIChatMessageProps) {
  const isUser = message.role === "user";
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const rawMetadata = message.metadata as { imageUrl?: string; imageUrls?: string[] } | undefined;
  const rawImage =
    rawMetadata?.imageUrl ||
    imageUrl ||
    (message as unknown as { imageUrl?: string }).imageUrl ||
    null;
  const rawImagesList = rawMetadata?.imageUrls;

  const resolvedImages: string[] = useMemo(() => {
    if (Array.isArray(rawImagesList) && rawImagesList.length > 0) {
      return rawImagesList.filter(Boolean);
    }
    if (typeof rawImage === "string" && rawImage.trim()) {
      const trimmed = rawImage.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          // ignore parsing error
        }
      }
      return [trimmed];
    }
    return [];
  }, [rawImagesList, rawImage]);

  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}

      <div
        className={`space-y-1.5 ${
          isUser ? "max-w-[85%] items-end" : "flex-1 min-w-0 items-start"
        }`}>
        {/* Render attached image(s) in user chat bubble */}
        {isUser && resolvedImages.length > 0 && (
          <div
            className={`grid gap-1.5 ml-auto mb-1 max-w-[280px] ${
              resolvedImages.length === 1
                ? "grid-cols-1"
                : resolvedImages.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
            }`}>
            {resolvedImages.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setLightboxIndex(idx)}
                className="group relative overflow-hidden rounded-xl border border-primary/20 shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer hover:opacity-95 transition-opacity"
                title="Відкрити зображення">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl}
                  alt={`Прикріплене фото ${idx + 1}`}
                  className={`w-full object-cover transition-transform duration-200 group-hover:scale-105 ${
                    resolvedImages.length === 1 ? "max-h-56 rounded-xl" : "h-20 rounded-lg"
                  }`}
                />
              </button>
            ))}
          </div>
        )}

        {/* Render message parts */}
        {message.parts.map((part, pIdx) => {
          if (part.type === "reasoning") {
            const reasoningText =
              (part as { reasoning?: string; text?: string }).reasoning ||
              (part as { text?: string }).text ||
              "";
            return <AIThoughtBlock key={pIdx} content={reasoningText} />;
          }

          if (part.type === "text") {
            if (!part.text) return null;
            const trimmed = part.text.trim();
            if (trimmed.startsWith('{"name":') && trimmed.includes('"arguments":')) {
              return null;
            }

            // Pre-tool reasoning: if this text part is followed by a tool call later in parts
            const isIntermediateThought =
              !isUser &&
              message.parts
                .slice(pIdx + 1)
                .some((p) => isToolUIPart(p) || p.type === "reasoning");

            // If text is enclosed in <think> tags
            if (!isUser && trimmed.includes("<think>")) {
              const thinkMatch = trimmed.match(/<think>([\s\S]*?)<\/think>/);
              const thinkContent = thinkMatch ? thinkMatch[1].trim() : "";
              const remainingText = trimmed.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

              return (
                <React.Fragment key={pIdx}>
                  {thinkContent && <AIThoughtBlock content={thinkContent} />}
                  {remainingText && (
                    <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs overflow-hidden bg-muted/70 text-foreground border border-border/50 rounded-bl-xs w-full">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {remainingText}
                      </ReactMarkdown>
                    </div>
                  )}
                </React.Fragment>
              );
            }

            if (isIntermediateThought) {
              return <AIThoughtBlock key={pIdx} content={part.text} />;
            }

            return (
              <div
                key={pIdx}
                className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs overflow-hidden ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-br-xs whitespace-pre-wrap ml-auto"
                    : "bg-muted/70 text-foreground border border-border/50 rounded-bl-xs w-full"
                }`}>
                {isUser ? (
                  part.text
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}>
                    {part.text}
                  </ReactMarkdown>
                )}
              </div>
            );
          }

          if (isToolUIPart(part)) {
            const toolPart = part as {
              toolName?: string;
              type: string;
              toolCallId?: string;
              state?: string;
              input?: Record<string, unknown>;
              output?: Record<string, unknown>;
            };
            const toolName = toolPart.toolName || toolPart.type.replace("tool-", "");
            // Skip rendering duplicate consecutive badges
            if (toolPart.output && toolPart.output.isDuplicateConsecutive) {
              return null;
            }
            return (
              <AIToolCard
                key={pIdx}
                tool={{
                  toolName,
                  toolCallId: toolPart.toolCallId,
                  state: toolPart.state === "output-available" ? "result" : "call",
                  args: toolPart.input,
                  result: toolPart.output,
                }}
              />
            );
          }

          return null;
        })}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground mt-0.5">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={resolvedImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
