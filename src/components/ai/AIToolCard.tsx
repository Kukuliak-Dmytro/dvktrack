"use client";

import React from "react";
import {
  CheckCircle2,
  Loader2,
  Search,
  PlusCircle,
  Trash2,
  Calendar,
  Utensils,
  BarChart3,
  Target,
  ChefHat,
} from "lucide-react";

interface LoggedEntry {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
}

interface LoggedResult {
  entries?: LoggedEntry[];
  totals?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber?: number;
  };
  dayTotals?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  };
  totalDaysLogged?: number;
  dailyAverages?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  };
  count?: number;
  dishes?: Array<{
    id: string;
    name: string;
    servings?: number;
    cookedWeightGrams?: number | null;
    caloriesPer100g?: number | null;
  }>;
  ingredients?: unknown[];
  recipes?: unknown[];
  name?: string;
  deletedName?: string;
  cookedWeightGrams?: number;
  ingredientsCount?: number;
  nutritionPer100g?: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber: number;
  };
}

interface ToolInvocation {
  toolName?: string;
  toolCallId?: string;
  state?: "partial-call" | "call" | "result";
  args?: Record<string, unknown>;
  result?: LoggedResult;
}

export function AIToolCard({ tool }: { tool: ToolInvocation }) {
  const isExecuting = tool.state !== "result";
  const name = tool.toolName || "tool";

  if (name === "log_food_entry") {
    const res = tool.result;
    return (
      <div className="my-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
          {isExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span>{isExecuting ? "Записую прийом їжі..." : "Записано в щоденник харчування"}</span>
        </div>

        {res?.entries && (
          <div className="mt-2 space-y-1 text-muted-foreground">
            {res.entries.map((item: LoggedEntry, idx: number) => (
              <div key={idx} className="flex justify-between items-center text-foreground">
                <span className="font-medium">• {item.name} ({item.weightGrams}г)</span>
                <span className="text-xs text-muted-foreground">
                  {item.calories} ккал | Б: {item.protein}г | Ж: {item.fat}г | В: {item.carbs}г{typeof item.fiber === "number" ? ` | К: ${item.fiber}г` : ""}
                </span>
              </div>
            ))}
            {res.totals && (
              <div className="pt-2 border-t border-border/50 flex justify-between font-semibold text-foreground">
                <span>Разом за запис:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {res.totals.calories} ккал (Б: {res.totals.protein}г | Ж: {res.totals.fat}г | В: {res.totals.carbs}г{typeof res.totals.fiber === "number" ? ` | К: ${res.totals.fiber}г` : ""})
                </span>
              </div>
            )}
            {res.dayTotals && (
              <div className="pt-1.5 flex justify-between text-[11px] text-muted-foreground border-t border-border/30">
                <span>Всього за день:</span>
                <span className="font-medium text-foreground">
                  {res.dayTotals.calories} ккал (Б: {res.dayTotals.protein}г | Ж: {res.dayTotals.fat}г | В: {res.dayTotals.carbs}г | К: {res.dayTotals.fiber}г)
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (name === "get_available_dishes") {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Utensils className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? "Перевіряю доступні страви в наявності..."
            : `Знайдено ${tool.result?.count ?? 0} готових страв у наявності`}
        </span>
      </div>
    );
  }

  if (name === "search_foods") {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Search className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? `Пошук у базі: "${tool.args?.query || ""}"...`
            : `Знайдено продуктів: ${(tool.result?.ingredients?.length || 0) + (tool.result?.recipes?.length || 0)}`}
        </span>
      </div>
    );
  }

  if (name === "create_ingredient") {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <PlusCircle className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? `Створення інгредієнта: "${tool.args?.name || ""}"...`
            : `Створено новий інгредієнт: "${tool.result?.name || ""}"`}
        </span>
      </div>
    );
  }

  if (name === "create_dish") {
    const res = tool.result;
    return (
      <div className="my-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-primary">
          {isExecuting ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <ChefHat className="h-4 w-4 text-primary" />
          )}
          <span>
            {isExecuting
              ? `Створення страви: "${tool.args?.name || ""}"...`
              : `Створено нову страву: "${res?.name || tool.args?.name || ""}"`}
          </span>
        </div>
        {!isExecuting && res && (
          <div className="mt-1.5 pl-6 text-muted-foreground space-y-0.5">
            <div>
              Вага готової страви: <span className="font-medium text-foreground">{res.cookedWeightGrams}г</span> ({res.ingredientsCount || 0} інгр.)
            </div>
            {res.nutritionPer100g && (
              <div className="text-[11px]">
                На 100г: {res.nutritionPer100g.calories} ккал | Б: {res.nutritionPer100g.protein}г | Ж: {res.nutritionPer100g.fat}г | В: {res.nutritionPer100g.carbs}г | К: {res.nutritionPer100g.fiber}г
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (name === "get_logged_meals") {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Calendar className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? `Перевірка записів за ${tool.args?.date || ""}...`
            : `Знайдено ${tool.result?.count || 0} записів (${tool.result?.totals?.calories || 0} ккал)`}
        </span>
      </div>
    );
  }

  if (name === "get_weight_loss_progress") {
    const res = tool.result as Record<string, unknown> | undefined;
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? "Розраховую прогрес схуднення від початку..."
            : `Прогрес за ${res?.totalDaysLogged || 0} дн.: дефіцит ${Math.round(Number(res?.cumulativeDeficitKcal || 0))} ккал (~${res?.estimatedFatLossKg || 0} кг жиру)`}
        </span>
      </div>
    );
  }

  if (name === "get_nutrition_goals") {
    const goals = tool.result as Record<string, unknown> | undefined;
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Target className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? "Отримую налаштування цілей..."
            : `Ціль: ${goals?.strategyName || "Харчування"} (план: ${goals?.targetCalories || 0} ккал, підтримка: ${goals?.maintenanceCalories || 0} ккал)`}
        </span>
      </div>
    );
  }

  if (name === "update_nutrition_goals") {
    const res = tool.result as Record<string, unknown> | undefined;
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? "Оновлюю цілі харчування..."
            : `Оновлено цілі: план ${res?.calories || 0} ккал, підтримка ${res?.maintenanceCalories || 0} ккал`}
        </span>
      </div>
    );
  }

  if (name === "get_nutrition_summary") {
    const deficitInfo = (tool.result as Record<string, unknown> | undefined)?.deficitAndWeightProgress as
      | { cumulativeDeficitKcal?: number; estimatedFatLossKg?: number }
      | undefined;
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
        )}
        <span>
          {isExecuting
            ? "Розраховую аналітику за період..."
            : deficitInfo && typeof deficitInfo.estimatedFatLossKg === "number"
            ? `Зведено за ${tool.result?.totalDaysLogged || 0} дн. (дефіцит ${Math.round(deficitInfo.cumulativeDeficitKcal || 0)} ккал, ~${deficitInfo.estimatedFatLossKg} кг жиру)`
            : `Зведено дані за ${tool.result?.totalDaysLogged || 0} днів (${tool.result?.dailyAverages?.calories || 0} ккал/день у середньому)`}
        </span>
      </div>
    );
  }

  if (name === "delete_logged_meal") {
    return (
      <div className="my-1.5 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
        {isExecuting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        <span>
          {isExecuting
            ? "Видалення запису..."
            : `Видалено: ${tool.result?.deletedName || "запис"}`}
        </span>
      </div>
    );
  }

  return (
    <div className="my-1 text-xs text-muted-foreground italic">
      [{isExecuting ? "Виклик інструменту" : "Результат"}: {name}]
    </div>
  );
}
