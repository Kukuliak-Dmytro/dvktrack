"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DailyGoal, DailyGoalInput, DailyGoalSchema, GoalType } from "../../../utils/schemas/goals";
import { useDailyGoals, useUpdateDailyGoals } from "@/app/hooks/useGoals";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, TrendingDown, TrendingUp, Scale, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

export function DailyGoalsModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("goalsModal");
  const { data: goals } = useDailyGoals();
  const { mutate: updateGoals, isPending } = useUpdateDailyGoals();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<DailyGoalInput, unknown, DailyGoal>({
    resolver: zodResolver(DailyGoalSchema),
    values: goals
      ? {
          goalType: (goals.goalType as GoalType) || "WEIGHT_LOSS",
          calories: goals.calories,
          maintenanceCalories: goals.maintenanceCalories ?? 2850,
          protein: goals.protein,
          carbs: goals.carbs,
          fat: goals.fat,
          fiber: goals.fiber,
        }
      : {
          goalType: "WEIGHT_LOSS",
          calories: 2200,
          maintenanceCalories: 2850,
          protein: 150,
          carbs: 230,
          fat: 65,
          fiber: 30,
        },
  });

  const selectedGoalType = useWatch({ control, name: "goalType" }) || "WEIGHT_LOSS";
  const watchedCalories = useWatch({ control, name: "calories" }) || 2200;
  const watchedMaintenance = useWatch({ control, name: "maintenanceCalories" }) || 2850;

  const diffVsMaintenance = Number(watchedCalories) - Number(watchedMaintenance);
  const weeklyFatChangeKg = (Math.abs(diffVsMaintenance) * 7 / 7700).toFixed(2);

  const onSubmit = (data: DailyGoal) => {
    updateGoals(data, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* 1. Goal Mode Selector: WEIGHT_LOSS, MUSCLE_GAIN, MAINTENANCE */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("strategy")}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setValue("goalType", "WEIGHT_LOSS", { shouldDirty: true, shouldValidate: true })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedGoalType === "WEIGHT_LOSS"
                    ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary"
                    : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/70"
                }`}>
                <TrendingDown className={`w-4 h-4 mb-1 ${selectedGoalType === "WEIGHT_LOSS" ? "text-primary" : "text-muted-foreground"}`} />
                <span>{t("weightLoss")}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{t("deficit")}</span>
              </button>

              <button
                type="button"
                onClick={() => setValue("goalType", "MUSCLE_GAIN", { shouldDirty: true, shouldValidate: true })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedGoalType === "MUSCLE_GAIN"
                    ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary"
                    : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/70"
                }`}>
                <TrendingUp className={`w-4 h-4 mb-1 ${selectedGoalType === "MUSCLE_GAIN" ? "text-primary" : "text-muted-foreground"}`} />
                <span>{t("muscleGain")}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{t("surplus")}</span>
              </button>

              <button
                type="button"
                onClick={() => setValue("goalType", "MAINTENANCE", { shouldDirty: true, shouldValidate: true })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedGoalType === "MAINTENANCE"
                    ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary"
                    : "bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/70"
                }`}>
                <Scale className={`w-4 h-4 mb-1 ${selectedGoalType === "MAINTENANCE" ? "text-primary" : "text-muted-foreground"}`} />
                <span>{t("maintenance")}</span>
                <span className="text-[10px] font-normal text-muted-foreground">{t("balance")}</span>
              </button>
            </div>
          </div>

          {/* 2. Calories: Target and Maintenance */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-muted/30 border">
            <div className="space-y-1">
              <Label htmlFor="maintenanceCalories" className="text-xs font-semibold">
                {t("maintenanceBase")}
              </Label>
              <Input
                id="maintenanceCalories"
                type="number"
                {...register("maintenanceCalories")}
                placeholder="2850"
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">
                {t("maintenanceHint")}
              </span>
              {errors.maintenanceCalories && (
                <p className="text-xs text-red-500">{errors.maintenanceCalories.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="calories" className="text-xs font-semibold text-primary">
                {t("targetCalories")}
              </Label>
              <Input
                id="calories"
                type="number"
                {...register("calories")}
                placeholder="2200"
                className="h-9 font-semibold text-primary"
              />
              <span className="text-[10px] text-muted-foreground">
                {selectedGoalType === "WEIGHT_LOSS"
                  ? t("burnPlan")
                  : selectedGoalType === "MUSCLE_GAIN"
                  ? t("gainPlan")
                  : t("maintainPlan")}
              </span>
              {errors.calories && (
                <p className="text-xs text-red-500">{errors.calories.message}</p>
              )}
            </div>
          </div>

          {/* Dynamic Diff Summary Badge */}
          <div className="p-2.5 rounded-xl bg-card border text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span>
                {diffVsMaintenance < 0 ? (
                  <span className="text-status-deficit font-semibold">
                    {t("dailyDeficit", { calories: Math.abs(diffVsMaintenance) })}
                  </span>
                ) : diffVsMaintenance > 0 ? (
                  <span className="text-status-surplus font-semibold">
                    {t("dailySurplus", { calories: diffVsMaintenance })}
                  </span>
                ) : (
                  <span className="font-semibold text-foreground">
                    {t("exactMaintenance")}
                  </span>
                )}
              </span>
            </div>
            {diffVsMaintenance !== 0 && (
              <span className="text-[11px] text-muted-foreground">
                {t("weeklyFatChange", { kg: weeklyFatChangeKg })}
              </span>
            )}
          </div>

          {/* 3. Macros: Protein, Fat, Carbs, Fiber */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("targetMacros")}
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="protein" className="text-xs">{t("protein")}</Label>
                <Input
                  id="protein"
                  type="number"
                  step="0.1"
                  {...register("protein")}
                  placeholder="150"
                  className="h-9"
                />
                {errors.protein && (
                  <p className="text-xs text-red-500">{errors.protein.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="fiber" className="text-xs">{t("fiber")}</Label>
                <Input
                  id="fiber"
                  type="number"
                  step="0.1"
                  {...register("fiber")}
                  placeholder="30"
                  className="h-9"
                />
                {errors.fiber && (
                  <p className="text-xs text-red-500">{errors.fiber.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="carbs" className="text-xs">{t("carbs")}</Label>
                <Input
                  id="carbs"
                  type="number"
                  step="0.1"
                  {...register("carbs")}
                  placeholder="230"
                  className="h-9"
                />
                {errors.carbs && (
                  <p className="text-xs text-red-500">{errors.carbs.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="fat" className="text-xs">{t("fat")}</Label>
                <Input
                  id="fat"
                  type="number"
                  step="0.1"
                  {...register("fat")}
                  placeholder="65"
                  className="h-9"
                />
                {errors.fat && (
                  <p className="text-xs text-red-500">{errors.fat.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending} className="rounded-xl">
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
