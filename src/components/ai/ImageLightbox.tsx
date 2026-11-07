"use client";

import React, { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  onClose,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, images.length - 1))
  );

  const total = images.length;
  const currentImage = images[currentIndex];

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [total]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  }, [total]);

  // Handle keyboard shortcuts (Esc, Left, Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, handlePrev, handleNext]);

  // Lock background scroll when open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!currentImage) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Перегляд зображень"
      className="fixed inset-0 z-100 flex flex-col items-center justify-between bg-black/90 p-4 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={onClose}>
      {/* Top Header Bar */}
      <div
        className="w-full flex items-center justify-between px-2 pt-2 text-white/90 z-10"
        onClick={(e) => e.stopPropagation()}>
        <div className="text-xs sm:text-sm font-medium tracking-wide bg-black/40 px-3 py-1 rounded-full border border-white/10">
          {total > 1 ? `${currentIndex + 1} / ${total}` : "Зображення"}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/90 hover:bg-white/20 transition-colors cursor-pointer"
          title="Закрити (Esc)">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Image Container */}
      <div
        className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-6"
        onClick={(e) => e.stopPropagation()}>
        {/* Previous Button */}
        {total > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white/90 hover:bg-black/80 hover:scale-105 transition-all shadow-lg border border-white/10 z-10 cursor-pointer"
            title="Попереднє (ArrowLeft)">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentImage}
          src={currentImage}
          alt={`Зображення ${currentIndex + 1}`}
          className="max-h-[82vh] max-w-[88vw] object-contain rounded-xl shadow-2xl transition-all duration-150 animate-in zoom-in-95"
        />

        {/* Next Button */}
        {total > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:right-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-black/60 text-white/90 hover:bg-black/80 hover:scale-105 transition-all shadow-lg border border-white/10 z-10 cursor-pointer"
            title="Наступне (ArrowRight)">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple images) */}
      {total > 1 && (
        <div
          className="w-full max-w-md flex items-center justify-center gap-2 overflow-x-auto pb-2 z-10"
          onClick={(e) => e.stopPropagation()}>
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative h-12 w-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                idx === currentIndex
                  ? "border-primary scale-105 shadow-md"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={`Мініатюра ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
