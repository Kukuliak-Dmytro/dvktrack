"use client";

import React, { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, RotateCcw, Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AIChatMessage } from "./AIChatMessage";
import { AIChatInput } from "./AIChatInput";

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  { label: "🥘 Що є в наявності?", prompt: "Що в мене ще лишилося з їжі?" },
  { label: "🍳 Сніданок", prompt: "З'їв на сніданок 2 варені яйця та тост із сиром 30г" },
  { label: "🍗 Обід", prompt: "З'їв на обід 200г вареної гречки та 150г запеченого курячого філе" },
  { label: "🍎 Перекус", prompt: "З'їв 1 середнє яблуко та випив капучино 250мл" },
  { label: "📊 Що з'їв?", prompt: "Що я сьогодні вже з'їв і скільки там калорій?" },
];

export function AIChatSidebar({ isOpen, onClose }: AIChatSidebarProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messageImages, setMessageImages] = useState<Record<string, string>>({});

  const [modelInfo, setModelInfo] = useState<{ displayName: string; isCloud: boolean }>({
    displayName: "Gemini 3.5 Flash",
    isCloud: true,
  });

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
      body: {
        sessionId,
        currentDate: new Date().toISOString().split("T")[0],
        currentTime: `${new Date().getHours()}:${new Date().getMinutes().toString().padStart(2, "0")}`,
      },
    }),
    onFinish: () => {
      // Invalidate React Query caches so food logs, totals, and deficit banners update instantly
      queryClient.invalidateQueries({ queryKey: ["foodLog"] });
      queryClient.invalidateQueries({ queryKey: ["foodLogSummary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const isGenerating = status === "streaming" || status === "submitted";

  useEffect(() => {
    fetch("/api/ai/model")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.displayName) setModelInfo(data);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = async (textToSend: string, imageFiles?: File[]) => {
    const trimmed = textToSend.trim();
    if ((!trimmed && (!imageFiles || imageFiles.length === 0)) || isGenerating) return;

    const uploadedUrls: string[] = [];
    const uploadedDataUrls: string[] = [];

    if (imageFiles && imageFiles.length > 0) {
      try {
        const uploadPromises = imageFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/storage/upload", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Не вдалося завантажити ${file.name}`);
          }

          const data = await res.json();
          return { url: data.url as string, dataUrl: data.dataUrl as string };
        });

        const results = await Promise.all(uploadPromises);
        results.forEach((r) => {
          if (r.url) uploadedUrls.push(r.url);
          if (r.dataUrl) uploadedDataUrls.push(r.dataUrl);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Помилка завантаження фото";
        toast.error(msg);
        return;
      }
    }

    const messageText =
      trimmed ||
      (uploadedUrls.length > 0
        ? uploadedUrls.length === 1
          ? "Проаналізуй це фото страви та запиши її в щоденник."
          : `Проаналізуй ці ${uploadedUrls.length} фото страв та запиши їх у щоденник.`
        : "");

    await sendMessage(
      {
        text: messageText,
        metadata:
          uploadedUrls.length > 0
            ? {
                imageUrl: uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls),
                imageUrls: uploadedUrls,
              }
            : undefined,
      },
      {
        body: {
          imageUrl: uploadedUrls[0],
          imageUrls: uploadedUrls,
          imageDataUrl: uploadedDataUrls[0],
          imageDataUrls: uploadedDataUrls,
        },
      }
    );
  };

  const handleResetChat = () => {
    setMessages([]);
    setSessionId(null);
    setMessageImages({});
  };

  return (
    <aside
      className={
        isOpen
          ? "fixed inset-0 z-50 flex flex-col bg-background w-full h-[100dvh] animate-in slide-in-from-top duration-300 lg:static lg:inset-auto lg:z-20 lg:h-full lg:w-[400px] xl:w-[440px] lg:border-l lg:border-border lg:bg-background lg:animate-none lg:shadow-none lg:shrink-0"
          : "hidden"
      }
      aria-label="AI Food Assistant">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between border-b border-border/80 px-4 py-3.5 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">AI Щоденник</h2>
              <span
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                  modelInfo.isCloud
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    modelInfo.isCloud ? "bg-blue-500" : "bg-emerald-500"
                  } animate-pulse`}
                />
                {modelInfo.displayName}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Швидке логування їжі людською мовою</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetChat}
            title="Новий діалог"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Закрити"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Messages Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 text-sm">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4 space-y-4 text-muted-foreground my-auto">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">Чим можу допомогти?</h3>
              <p className="text-xs max-w-xs">
                Просто напишіть, що ви з&apos;їли, і я автоматично розрахую КБЖВ та зроблю запис у базі даних.
              </p>
            </div>

            {/* Quick Prompt Pills */}
            <div className="w-full pt-4 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground/80 text-left">Швидкі приклади:</p>
              <div className="grid grid-cols-1 gap-1.5 text-left">
                {QUICK_PROMPTS.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qp.prompt, [])}
                    className="group flex items-center justify-between rounded-xl border border-border/70 bg-card p-2.5 text-xs text-foreground transition-all hover:border-primary/50 hover:bg-muted/40">
                    <span className="font-medium">{qp.label}</span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[240px] group-hover:text-foreground">
                      {qp.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <AIChatMessage
              key={message.id}
              message={message}
              imageUrl={messageImages[message.id]}
            />
          ))
        )}

        {isGenerating && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic pl-9">
            <span className="flex gap-1 items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
            </span>
            <span>Асистент аналізує та записує...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Modular Chat Input */}
      <AIChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        onStop={stop}
      />
    </aside>
  );
}
