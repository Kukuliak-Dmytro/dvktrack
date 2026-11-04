import { z } from "zod";

export const GoalTypeEnum = z.enum(["WEIGHT_LOSS", "MUSCLE_GAIN", "MAINTENANCE"]);
export type GoalType = z.infer<typeof GoalTypeEnum>;

export const DailyGoalSchema = z.object({
  goalType: GoalTypeEnum,
  calories: z.coerce.number().int().min(500, "Мінімум 500 ккал").max(10000),
  maintenanceCalories: z.coerce.number().int().min(500, "Мінімум 500 ккал").max(10000),
  protein: z.coerce.number().min(0, "Мінімум 0г").max(1000),
  carbs: z.coerce.number().min(0, "Мінімум 0г").max(1000),
  fat: z.coerce.number().min(0, "Мінімум 0г").max(1000),
  fiber: z.coerce.number().min(0, "Мінімум 0г").max(200),
});

export const DailyGoalResponseSchema = DailyGoalSchema.extend({
  id: z.string(),
  updatedAt: z.string().transform((s) => new Date(s).toISOString()),
});

export type DailyGoal = z.infer<typeof DailyGoalSchema>;
export type DailyGoalInput = z.input<typeof DailyGoalSchema>;
export type DailyGoalResponse = z.infer<typeof DailyGoalResponseSchema>;
