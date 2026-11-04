import { tool } from "ai";
import { z } from "zod";
import prisma from "../../../utils/prisma/prisma";
import { MealType } from "@prisma/client";
import {
  calculateRecipeNutritionData,
  calculateCookedNutritionPer100g,
  calculatePortionNutrition,
} from "../../../utils/calculations/nutrition";

export function getAgentTools(userId: string, options?: { defaultImageUrl?: string | null }) {
  return {
    search_foods: tool({
      description: "Пошук продуктів та страв у базі за назвою.",
      inputSchema: z.object({
        query: z.string().describe("Назва для пошуку"),
      }),
      execute: async ({ query }: { query: string }) => {
        try {
          const kw = extractSearchKeywords(query);
          const [ingredients, recipes] = await Promise.all([
            prisma.ingredient.findMany({
              where: {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  ...kw.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })),
                ],
                AND: [{ OR: [{ userId: null }, { userId }] }],
              },
              take: 8,
              select: {
                id: true,
                name: true,
                caloriesPer100g: true,
                proteinPer100g: true,
                carbsPer100g: true,
                fatPer100g: true,
                fiberPer100g: true,
                category: true,
              },
            }),
            prisma.recipe.findMany({
              where: {
                userId,
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  ...kw.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })),
                ],
              },
              take: 6,
              include: {
                ingredients: {
                  include: {
                    ingredient: true,
                  },
                },
              },
            }),
          ]);

          const score = (name: string) => {
            const lower = name.toLowerCase();
            let s = 0;
            if (lower === query.toLowerCase()) s += 10;
            if (lower.includes(query.toLowerCase())) s += 5;
            for (const k of kw) {
              if (lower.includes(k)) s += 2;
            }
            return s;
          };

          ingredients.sort((a, b) => score(b.name) - score(a.name));
          recipes.sort((a, b) => score(b.name) - score(a.name));

          return {
            ingredients: ingredients.slice(0, 5).map((ing) => ({
              id: ing.id,
              name: ing.name,
              caloriesPer100g: Number(ing.caloriesPer100g),
              proteinPer100g: Number(ing.proteinPer100g),
              carbsPer100g: Number(ing.carbsPer100g),
              fatPer100g: Number(ing.fatPer100g),
              fiberPer100g: Number(ing.fiberPer100g),
              category: ing.category,
            })),
            recipes: recipes.slice(0, 5).map((r) => {
              const totalNutrition = calculateRecipeNutritionData(r);
              const totalRawWeight = (r.ingredients || []).reduce(
                (sum, i) => sum + Number(i.quantityGrams),
                0
              );
              const cookedWeight = r.cookedWeightGrams ? Number(r.cookedWeightGrams) : totalRawWeight;
              const per100g = cookedWeight > 0
                ? calculateCookedNutritionPer100g(totalNutrition, cookedWeight)
                : totalNutrition;

              return {
                id: r.id,
                name: r.name,
                servings: r.servings,
                cookedWeightGrams: cookedWeight,
                caloriesPer100g: per100g.calories,
                proteinPer100g: per100g.protein,
                fatPer100g: per100g.fat,
                carbsPer100g: per100g.carbs,
                fiberPer100g: per100g.fiber,
              };
            }),
          };
        } catch (error) {
          console.error("search_foods tool error:", error);
          return { error: "Не вдалося виконати пошук у базі даних" };
        }
      },
    }),

    get_available_dishes: tool({
      description:
        "Отримує список приготованих страв і залишків їжі в холодильнику (що лишилося, що є з їжі, що не доїв).",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const recipes = await prisma.recipe.findMany({
            where: {
              userId,
              status: "RECENT",
            },
            include: {
              ingredients: {
                include: {
                  ingredient: true,
                },
              },
            },
            orderBy: { updatedAt: "desc" },
          });

          return {
            count: recipes.length,
            dishes: recipes.map((r) => {
              const totalNutrition = calculateRecipeNutritionData(r);
              const totalRawWeight = (r.ingredients || []).reduce(
                (sum, i) => sum + Number(i.quantityGrams),
                0
              );
              const cookedWeight = r.cookedWeightGrams ? Number(r.cookedWeightGrams) : totalRawWeight;
              const per100g = cookedWeight > 0
                ? calculateCookedNutritionPer100g(totalNutrition, cookedWeight)
                : totalNutrition;

              return {
                id: r.id,
                name: r.name,
                servings: r.servings,
                cookedWeightGrams: cookedWeight,
                caloriesPer100g: per100g.calories,
                proteinPer100g: per100g.protein,
                fatPer100g: per100g.fat,
                carbsPer100g: per100g.carbs,
                fiberPer100g: per100g.fiber,
              };
            }),
          };
        } catch (error) {
          console.error("get_available_dishes error:", error);
          return { error: "Не вдалося отримати список доступних страв" };
        }
      },
    }),

    create_ingredient: tool({
      description:
        "Створює новий інгредієнт/продукт у бібліотеці користувача з вказанням КБЖВ на 100 грамів.",
      inputSchema: z.object({
        name: z.string().describe("Назва продукту"),
        caloriesPer100g: z.number().describe("Калорійність на 100г"),
        proteinPer100g: z.number().describe("Білки на 100г"),
        carbsPer100g: z.number().describe("Вуглеводи на 100г"),
        fatPer100g: z.number().describe("Жири на 100г"),
        fiberPer100g: z.number().optional().default(0).describe("Клітковина на 100г"),
        category: z.string().optional().default("Інше").describe("Категорія продукту"),
      }),
      execute: async (args: {
        name: string;
        caloriesPer100g: number;
        proteinPer100g: number;
        carbsPer100g: number;
        fatPer100g: number;
        fiberPer100g?: number;
        category?: string;
      }) => {
        try {
          const existing = await prisma.ingredient.findFirst({
            where: {
              name: { equals: args.name, mode: "insensitive" },
              OR: [{ userId: null }, { userId }],
            },
          });

          if (existing) {
            return {
              id: existing.id,
              name: existing.name,
              created: false,
              message: "Продукт уже існує в базі даних",
            };
          }

          const created = await prisma.ingredient.create({
            data: {
              userId,
              name: args.name,
              caloriesPer100g: args.caloriesPer100g,
              proteinPer100g: args.proteinPer100g,
              carbsPer100g: args.carbsPer100g,
              fatPer100g: args.fatPer100g,
              fiberPer100g: args.fiberPer100g ?? 0,
              category: args.category ?? "Інше",
              isCustom: true,
            },
          });

          return {
            id: created.id,
            name: created.name,
            created: true,
          };
        } catch (error) {
          console.error("create_ingredient tool error:", error);
          return { error: "Не вдалося створити інгредієнт" };
        }
      },
    }),

    log_food_entry: tool({
      description: "Записує спожиту їжу користувача за обраний прийом та дату.",
      inputSchema: z.object({
        date: z.string().describe("YYYY-MM-DD"),
        mealType: z
          .enum(["BREAKFAST", "SNACK_1", "LUNCH", "SNACK_2", "DINNER"])
          .describe("BREAKFAST | SNACK_1 | LUNCH | SNACK_2 | DINNER"),
        imageUrl: z.string().optional().describe("URL фотографії страви в сховищі"),
        items: z.array(
          z.object({
            name: z.string().describe("Назва"),
            weightGrams: z.number().describe("Вага в грамах"),
            calories: z.number().optional().describe("Калорії"),
            protein: z.number().optional().describe("Білки"),
            carbs: z.number().optional().describe("Вуглеводи"),
            fat: z.number().optional().describe("Жири"),
            fiber: z.number().optional().default(0),
            ingredientId: z.string().optional(),
            recipeId: z.string().optional(),
            imageUrl: z.string().optional().describe("URL фотографії для окремого продукту"),
          })
        ),
      }),
      execute: async (args: {
        date: string;
        mealType: "BREAKFAST" | "SNACK_1" | "LUNCH" | "SNACK_2" | "DINNER";
        imageUrl?: string;
        items: Array<{
          name: string;
          weightGrams: number;
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
          fiber?: number;
          ingredientId?: string;
          recipeId?: string;
          imageUrl?: string;
        }>;
      }) => {
        try {
          const parsed = parseDateString(args.date);
          const entryDate = parsed
            ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
            : new Date();

          const createdEntries = [];

          for (const item of args.items) {
            let calories = item.calories ?? 0;
            let protein = item.protein ?? 0;
            let carbs = item.carbs ?? 0;
            let fat = item.fat ?? 0;
            let fiber = item.fiber ?? 0;
            let matchedRecipeId = item.recipeId;
            let matchedIngredientId = item.ingredientId;

            // 1. If recipeId provided, calculate nutrition from recipe if calories not provided
            if (matchedRecipeId && calories === 0 && weightGramsValid(item.weightGrams)) {
              const recipe = await prisma.recipe.findUnique({
                where: { id: matchedRecipeId },
                include: {
                  ingredients: {
                    include: {
                      ingredient: true,
                    },
                  },
                },
              });
              if (recipe) {
                const totalNutrition = calculateRecipeNutritionData(recipe);
                const totalRawWeight = (recipe.ingredients || []).reduce(
                  (sum, i) => sum + Number(i.quantityGrams),
                  0
                );
                const cookedWeight = recipe.cookedWeightGrams
                  ? Number(recipe.cookedWeightGrams)
                  : totalRawWeight;
                const per100g = cookedWeight > 0
                  ? calculateCookedNutritionPer100g(totalNutrition, cookedWeight)
                  : totalNutrition;
                const portion = calculatePortionNutrition(per100g, item.weightGrams);
                calories = portion.calories;
                protein = portion.protein;
                carbs = portion.carbs;
                fat = portion.fat;
                fiber = portion.fiber;
              }
            }

            // 2. If neither recipeId nor ingredientId, search recipes first by name using keywords
            if (!matchedRecipeId && !matchedIngredientId && weightGramsValid(item.weightGrams)) {
              const kw = extractSearchKeywords(item.name);
              const candidates = await prisma.recipe.findMany({
                where: {
                  userId,
                  OR: [
                    { name: { contains: item.name, mode: "insensitive" } },
                    ...kw.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })),
                  ],
                },
                include: {
                  ingredients: {
                    include: {
                      ingredient: true,
                    },
                  },
                },
                take: 6,
              });

              if (candidates.length > 0) {
                const score = (name: string) => {
                  const lower = name.toLowerCase();
                  let s = 0;
                  if (lower === item.name.toLowerCase()) s += 10;
                  if (lower.includes(item.name.toLowerCase())) s += 5;
                  for (const k of kw) {
                    if (lower.includes(k)) s += 2;
                  }
                  return s;
                };
                candidates.sort((a, b) => score(b.name) - score(a.name));
                const recipe = candidates[0];

                matchedRecipeId = recipe.id;
                if (calories === 0) {
                  const totalNutrition = calculateRecipeNutritionData(recipe);
                  const totalRawWeight = (recipe.ingredients || []).reduce(
                    (sum, i) => sum + Number(i.quantityGrams),
                    0
                  );
                  const cookedWeight = recipe.cookedWeightGrams
                    ? Number(recipe.cookedWeightGrams)
                    : totalRawWeight;
                  const per100g = cookedWeight > 0
                    ? calculateCookedNutritionPer100g(totalNutrition, cookedWeight)
                    : totalNutrition;
                  const portion = calculatePortionNutrition(per100g, item.weightGrams);
                  calories = portion.calories;
                  protein = portion.protein;
                  carbs = portion.carbs;
                  fat = portion.fat;
                  fiber = portion.fiber;
                }
              }
            }

            // 3. If still no recipe and calories === 0, calculate from ingredient using keywords
            if (!matchedRecipeId && calories === 0 && weightGramsValid(item.weightGrams)) {
              let ing = null;
              if (matchedIngredientId) {
                ing = await prisma.ingredient.findUnique({ where: { id: matchedIngredientId } });
              } else {
                const kw = extractSearchKeywords(item.name);
                const candidates = await prisma.ingredient.findMany({
                  where: {
                    OR: [
                      { name: { contains: item.name, mode: "insensitive" } },
                      ...kw.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })),
                    ],
                    AND: [{ OR: [{ userId: null }, { userId }] }],
                  },
                  take: 6,
                });

                if (candidates.length > 0) {
                  const score = (name: string) => {
                    const lower = name.toLowerCase();
                    let s = 0;
                    if (lower === item.name.toLowerCase()) s += 10;
                    if (lower.includes(item.name.toLowerCase())) s += 5;
                    for (const k of kw) {
                      if (lower.includes(k)) s += 2;
                    }
                    return s;
                  };
                  candidates.sort((a, b) => score(b.name) - score(a.name));
                  ing = candidates[0];
                }
              }

              if (ing) {
                matchedIngredientId = ing.id;
                const ratio = item.weightGrams / 100;
                calories = Math.round(Number(ing.caloriesPer100g) * ratio * 10) / 10;
                protein = Math.round(Number(ing.proteinPer100g) * ratio * 10) / 10;
                carbs = Math.round(Number(ing.carbsPer100g) * ratio * 10) / 10;
                fat = Math.round(Number(ing.fatPer100g) * ratio * 10) / 10;
                fiber = Math.round(Number(ing.fiberPer100g) * ratio * 10) / 10;
              }
            }

            const entry = await prisma.foodLogEntry.create({
              data: {
                userId,
                date: entryDate,
                mealType: args.mealType as MealType,
                name: item.name,
                weightGrams: item.weightGrams,
                calories,
                protein,
                carbs,
                fat,
                fiber,
                imageUrl: item.imageUrl || args.imageUrl || options?.defaultImageUrl || null,
                ingredientId: matchedIngredientId || null,
                recipeId: matchedRecipeId || null,
              },
            });

            createdEntries.push({
              id: entry.id,
              name: entry.name,
              weightGrams: Number(entry.weightGrams),
              calories: Number(entry.calories),
              protein: Number(entry.protein),
              carbs: Number(entry.carbs),
              fat: Number(entry.fat),
              fiber: Number(entry.fiber),
            });
          }

          const totals = createdEntries.reduce(
            (acc, curr) => ({
              calories: Math.round((acc.calories + curr.calories) * 10) / 10,
              protein: Math.round((acc.protein + curr.protein) * 10) / 10,
              carbs: Math.round((acc.carbs + curr.carbs) * 10) / 10,
              fat: Math.round((acc.fat + curr.fat) * 10) / 10,
              fiber: Math.round((acc.fiber + curr.fiber) * 10) / 10,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
          );

          // Calculate day totals across all meals for this date
          const allDayEntries = await prisma.foodLogEntry.findMany({
            where: {
              userId,
              date: entryDate,
            },
          });

          const dayTotals = allDayEntries.reduce(
            (acc, curr) => ({
              calories: Math.round((acc.calories + Number(curr.calories)) * 10) / 10,
              protein: Math.round((acc.protein + Number(curr.protein)) * 10) / 10,
              carbs: Math.round((acc.carbs + Number(curr.carbs)) * 10) / 10,
              fat: Math.round((acc.fat + Number(curr.fat)) * 10) / 10,
              fiber: Math.round((acc.fiber + Number(curr.fiber)) * 10) / 10,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
          );

          return {
            success: true,
            mealType: args.mealType,
            date: args.date,
            entriesCount: createdEntries.length,
            entries: createdEntries,
            totals,
            dayTotals,
          };
        } catch (error) {
          console.error("log_food_entry tool error:", error);
          return { error: "Не вдалося записати прийом їжі в базу даних" };
        }
      },
    }),

    get_logged_meals: tool({
      description:
        "Отримує список усіх спожитих страв і розраховані сумарні КБЖВ за обрану дату.",
      inputSchema: z.object({
        date: z.string().describe("Дата у форматі YYYY-MM-DD"),
      }),
      execute: async ({ date }: { date: string }) => {
        try {
          const parsed = parseDateString(date);
          const now = new Date();
          const targetDate = parsed
            ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
            : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

          const entries = await prisma.foodLogEntry.findMany({
            where: {
              userId,
              date: targetDate,
            },
            orderBy: { createdAt: "asc" },
          });

          const totals = entries.reduce(
            (acc, curr) => ({
              calories: Math.round((acc.calories + Number(curr.calories)) * 10) / 10,
              protein: Math.round((acc.protein + Number(curr.protein)) * 10) / 10,
              carbs: Math.round((acc.carbs + Number(curr.carbs)) * 10) / 10,
              fat: Math.round((acc.fat + Number(curr.fat)) * 10) / 10,
              fiber: Math.round((acc.fiber + Number(curr.fiber)) * 10) / 10,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
          );

          return {
            date,
            count: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              name: e.name,
              mealType: e.mealType,
              weightGrams: e.weightGrams ? Number(e.weightGrams) : null,
              calories: Number(e.calories),
              protein: Number(e.protein),
              carbs: Number(e.carbs),
              fat: Number(e.fat),
              fiber: Number(e.fiber),
            })),
            totals,
          };
        } catch (error) {
          console.error("get_logged_meals error:", error);
          return { error: "Не вдалося отримати записи харчування" };
        }
      },
    }),

    get_nutrition_goals: tool({
      description: "Отримує поточні цілі калорій та БЖВ користувача.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          let goal = await prisma.dailyGoal.findUnique({
            where: { userId },
          });
          if (!goal) {
            goal = await prisma.dailyGoal.findFirst({
              where: { userId: null },
            });
          }

          const maintenanceCalories = Number(goal?.maintenanceCalories ?? 2850);
          const targetCalories = Number(goal?.calories ?? 2000);
          const plannedDailyDiff = maintenanceCalories - targetCalories;
          const weeklyKgChange = Math.round((Math.abs(plannedDailyDiff) * 7 / 7700) * 100) / 100;

          const strategyNames: Record<string, string> = {
            WEIGHT_LOSS: "Схуднення (дефіцит)",
            MUSCLE_GAIN: "Набір м'язової маси (профіцит)",
            MAINTENANCE: "Підтримка поточної ваги (баланс)",
          };

          return {
            hasGoal: Boolean(goal),
            goalType: goal?.goalType ?? "WEIGHT_LOSS",
            strategyName: strategyNames[goal?.goalType ?? "WEIGHT_LOSS"] || "Схуднення",
            maintenanceCalories,
            targetCalories,
            plannedDailyDifferenceKcal: plannedDailyDiff,
            plannedWeeklyWeightChangeKg: weeklyKgChange,
            targetMacros: {
              protein: Number(goal?.protein ?? 120),
              fat: Number(goal?.fat ?? 65),
              carbs: Number(goal?.carbs ?? 220),
              fiber: Number(goal?.fiber ?? 30),
            },
          };
        } catch (error) {
          console.error("get_nutrition_goals error:", error);
          return { error: "Не вдалося отримати цілі харчування" };
        }
      },
    }),

    update_nutrition_goals: tool({
      description: "Оновлює цілі харчування користувача (калорії, підтримку, БЖВ).",
      inputSchema: z.object({
        goalType: z.enum(["WEIGHT_LOSS", "MUSCLE_GAIN", "MAINTENANCE"]).optional().describe("WEIGHT_LOSS | MUSCLE_GAIN | MAINTENANCE"),
        calories: z.coerce.number().optional().describe("Цільові калорії"),
        maintenanceCalories: z.coerce.number().optional().describe("Калорії підтримки"),
        protein: z.coerce.number().optional().describe("Білки (г)"),
        fat: z.coerce.number().optional().describe("Жири (г)"),
        carbs: z.coerce.number().optional().describe("Вуглеводи (г)"),
        fiber: z.coerce.number().optional().describe("Клітковина (г)"),
      }),
      execute: async (args: {
        goalType?: "WEIGHT_LOSS" | "MUSCLE_GAIN" | "MAINTENANCE";
        calories?: number;
        maintenanceCalories?: number;
        protein?: number;
        fat?: number;
        carbs?: number;
        fiber?: number;
      }) => {
        try {
          const updated = await prisma.dailyGoal.upsert({
            where: { userId },
            update: {
              ...(args.goalType ? { goalType: args.goalType } : {}),
              ...(args.calories ? { calories: Math.round(args.calories) } : {}),
              ...(args.maintenanceCalories ? { maintenanceCalories: Math.round(args.maintenanceCalories) } : {}),
              ...(args.protein !== undefined ? { protein: args.protein } : {}),
              ...(args.fat !== undefined ? { fat: args.fat } : {}),
              ...(args.carbs !== undefined ? { carbs: args.carbs } : {}),
              ...(args.fiber !== undefined ? { fiber: args.fiber } : {}),
            },
            create: {
              userId,
              goalType: args.goalType ?? "WEIGHT_LOSS",
              calories: args.calories ? Math.round(args.calories) : 2000,
              maintenanceCalories: args.maintenanceCalories ? Math.round(args.maintenanceCalories) : 2850,
              protein: args.protein ?? 120,
              fat: args.fat ?? 65,
              carbs: args.carbs ?? 220,
              fiber: args.fiber ?? 30,
            },
          });
          return {
            success: true,
            calories: Number(updated.calories),
            maintenanceCalories: Number(updated.maintenanceCalories),
            goalType: updated.goalType,
          };
        } catch (error) {
          console.error("update_nutrition_goals error:", error);
          return { error: "Не вдалося оновити цілі харчування" };
        }
      },
    }),

    get_weight_loss_progress: tool({
      description:
        "Отримує прогрес схуднення, втрати жиру (кг) та сумарного дефіциту калорій користувача від початку ведення щоденника.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const entries = await prisma.foodLogEntry.findMany({
            where: { userId },
            orderBy: { date: "asc" },
          });

          const dayMap = new Map<string, number>();
          for (const e of entries) {
            const dStr = e.date.toISOString().split("T")[0];
            dayMap.set(dStr, (dayMap.get(dStr) || 0) + Number(e.calories));
          }

          const loggedDates = Array.from(dayMap.keys()).sort();
          const totalDaysLogged = loggedDates.length;

          let goal = await prisma.dailyGoal.findUnique({
            where: { userId },
          });
          if (!goal) {
            goal = await prisma.dailyGoal.findFirst({
              where: { userId: null },
            });
          }

          const maintenanceCalories = Number(goal?.maintenanceCalories ?? 2850);
          const targetCalories = Number(goal?.calories ?? 2000);

          let totalEaten = 0;
          let cumulativeMaintenanceDeficit = 0;

          for (const dStr of loggedDates) {
            const eaten = dayMap.get(dStr) || 0;
            totalEaten += eaten;
            cumulativeMaintenanceDeficit += (maintenanceCalories - eaten);
          }

          cumulativeMaintenanceDeficit = Math.round(cumulativeMaintenanceDeficit * 10) / 10;
          const averageDailyCalories = totalDaysLogged > 0
            ? Math.round((totalEaten / totalDaysLogged) * 10) / 10
            : 0;
          const averageDailyDeficit = totalDaysLogged > 0
            ? Math.round((cumulativeMaintenanceDeficit / totalDaysLogged) * 10) / 10
            : 0;

          const estimatedFatLossKg = Math.round((cumulativeMaintenanceDeficit / 7700) * 100) / 100;
          const plannedDailyDeficit = maintenanceCalories - targetCalories;

          return {
            totalDaysLogged,
            firstLoggedDate: loggedDates[0] || null,
            lastLoggedDate: loggedDates[loggedDates.length - 1] || null,
            strategy: goal?.goalType ?? "WEIGHT_LOSS",
            maintenanceCalories,
            targetCalories,
            plannedDailyDeficitKcal: plannedDailyDeficit,
            actualAverageDailyCalories: averageDailyCalories,
            actualAverageDailyDeficitKcal: averageDailyDeficit,
            cumulativeDeficitKcal: cumulativeMaintenanceDeficit,
            estimatedFatLossKg,
            status: cumulativeMaintenanceDeficit > 0 ? "DEFICIT" : (cumulativeMaintenanceDeficit < 0 ? "SURPLUS" : "MAINTENANCE"),
            explanation: `За ${totalDaysLogged} зафіксованих днів ви створили сумарний дефіцит ${cumulativeMaintenanceDeficit} ккал відносно підтримки (${maintenanceCalories} ккал/день). Розрахункова втрата жиру: ~${estimatedFatLossKg} кг (1 кг жиру ≈ 7700 ккал дефіциту). Ваше середнє споживання: ${averageDailyCalories} ккал/день при плані ${targetCalories} ккал/день.`,
          };
        } catch (error) {
          console.error("get_weight_loss_progress error:", error);
          return { error: "Не вдалося отримати прогрес схуднення" };
        }
      },
    }),

    get_nutrition_summary: tool({
      description:
        "Отримує аналітику споживання калорій та БЖВ за період (останні 7 днів, 30 днів, по тижнях або весь час). Не використовувати для залишків їжі.",
      inputSchema: z.object({
        period: z
          .enum(["last_7_days", "last_30_days", "by_weeks", "all_time"])
          .optional()
          .default("last_7_days")
          .describe("last_7_days | last_30_days | by_weeks | all_time"),
        startDate: z.string().nullable().optional().describe("YYYY-MM-DD"),
        endDate: z.string().nullable().optional().describe("YYYY-MM-DD"),
      }),
      execute: async ({ period, startDate, endDate }: { period?: "last_7_days" | "last_30_days" | "by_weeks" | "all_time"; startDate?: string | null; endDate?: string | null }) => {
        try {
          const now = new Date();
          let fromDate: Date;
          let toDate: Date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));

          const parsedStart = parseDateString(startDate);
          if (parsedStart) {
            fromDate = new Date(Date.UTC(parsedStart.year, parsedStart.month - 1, parsedStart.day, 0, 0, 0));
          } else if (period === "last_7_days") {
            fromDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0));
          } else if (period === "last_30_days") {
            fromDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0));
          } else {
            fromDate = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));
          }

          const parsedEnd = parseDateString(endDate);
          if (parsedEnd) {
            toDate = new Date(Date.UTC(parsedEnd.year, parsedEnd.month - 1, parsedEnd.day, 23, 59, 59));
          }

          const entries = await prisma.foodLogEntry.findMany({
            where: {
              userId,
              date: {
                gte: fromDate,
                lte: toDate,
              },
            },
            orderBy: { date: "asc" },
          });

          // Group by date
          const dayMap = new Map<string, { date: string; calories: number; protein: number; fat: number; carbs: number; fiber: number; count: number }>();

          for (const e of entries) {
            const dStr = e.date.toISOString().split("T")[0];
            const existing = dayMap.get(dStr) || { date: dStr, calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, count: 0 };
            existing.calories += Number(e.calories);
            existing.protein += Number(e.protein);
            existing.fat += Number(e.fat);
            existing.carbs += Number(e.carbs);
            existing.fiber += Number(e.fiber);
            existing.count += 1;
            dayMap.set(dStr, existing);
          }

          const days = Array.from(dayMap.values()).map((d) => ({
            date: d.date,
            calories: Math.round(d.calories * 10) / 10,
            protein: Math.round(d.protein * 10) / 10,
            fat: Math.round(d.fat * 10) / 10,
            carbs: Math.round(d.carbs * 10) / 10,
            fiber: Math.round(d.fiber * 10) / 10,
            entriesCount: d.count,
          }));

          const totalDaysLogged = days.length;
          const totals = days.reduce(
            (acc, curr) => ({
              calories: Math.round((acc.calories + curr.calories) * 10) / 10,
              protein: Math.round((acc.protein + curr.protein) * 10) / 10,
              fat: Math.round((acc.fat + curr.fat) * 10) / 10,
              carbs: Math.round((acc.carbs + curr.carbs) * 10) / 10,
              fiber: Math.round((acc.fiber + curr.fiber) * 10) / 10,
            }),
            { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 }
          );

          const dailyAverages = totalDaysLogged > 0 ? {
            calories: Math.round((totals.calories / totalDaysLogged) * 10) / 10,
            protein: Math.round((totals.protein / totalDaysLogged) * 10) / 10,
            fat: Math.round((totals.fat / totalDaysLogged) * 10) / 10,
            carbs: Math.round((totals.carbs / totalDaysLogged) * 10) / 10,
            fiber: Math.round((totals.fiber / totalDaysLogged) * 10) / 10,
          } : null;

          // Fetch user's caloric goals for deficit and fat loss estimation
          let goal = await prisma.dailyGoal.findUnique({
            where: { userId },
          });
          if (!goal) {
            goal = await prisma.dailyGoal.findFirst({
              where: { userId: null },
            });
          }

          const maintenanceCalories = Number(goal?.maintenanceCalories ?? 2850);
          const targetCalories = Number(goal?.calories ?? 2000);

          let cumulativeMaintenanceDeficit = 0;
          for (const d of days) {
            cumulativeMaintenanceDeficit += (maintenanceCalories - d.calories);
          }
          cumulativeMaintenanceDeficit = Math.round(cumulativeMaintenanceDeficit * 10) / 10;

          const averageDailyDeficit = totalDaysLogged > 0
            ? Math.round((cumulativeMaintenanceDeficit / totalDaysLogged) * 10) / 10
            : 0;

          // 1 kg of body fat ≈ 7,700 kcal deficit
          const estimatedFatLossKg = Math.round((cumulativeMaintenanceDeficit / 7700) * 100) / 100;

          const plannedDailyDeficit = maintenanceCalories - targetCalories;
          const deficitAndWeightProgress = {
            hasGoal: Boolean(goal),
            strategy: goal?.goalType ?? "WEIGHT_LOSS",
            maintenanceCalories,
            targetCalories,
            plannedDailyDeficitKcal: plannedDailyDeficit,
            totalDaysLogged,
            cumulativeDeficitKcal: cumulativeMaintenanceDeficit,
            averageDailyDeficitKcal: averageDailyDeficit,
            estimatedFatLossKg,
            targetMacros: {
              protein: Number(goal?.protein ?? 120),
              fat: Number(goal?.fat ?? 65),
              carbs: Number(goal?.carbs ?? 220),
              fiber: Number(goal?.fiber ?? 30),
            },
            status: cumulativeMaintenanceDeficit > 0 ? "DEFICIT" : (cumulativeMaintenanceDeficit < 0 ? "SURPLUS" : "MAINTENANCE"),
            explanation: `За ${totalDaysLogged} зафіксованих днів сумарний дефіцит від підтримки (${maintenanceCalories} ккал/день) складає ${cumulativeMaintenanceDeficit} ккал. Розрахункова втрата жиру: ~${estimatedFatLossKg} кг (1 кг жиру ≈ 7700 ккал дефіциту).`,
          };

          // Group by calendar weeks ONLY if period === "by_weeks"
          let weeklyBreakdown = null;
          if (period === "by_weeks") {
            const weekMap = new Map<string, { weekLabel: string; calories: number; protein: number; fat: number; carbs: number; daysCount: number }>();
            for (const d of days) {
              const dt = new Date(d.date);
              const dayOfWeek = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
              const monday = new Date(dt);
              monday.setUTCDate(dt.getUTCDate() - dayOfWeek + 1);
              const sunday = new Date(monday);
              sunday.setUTCDate(monday.getUTCDate() + 6);
              const label = `${monday.toISOString().split("T")[0]} — ${sunday.toISOString().split("T")[0]}`;

              const w = weekMap.get(label) || { weekLabel: label, calories: 0, protein: 0, fat: 0, carbs: 0, daysCount: 0 };
              w.calories += d.calories;
              w.protein += d.protein;
              w.fat += d.fat;
              w.carbs += d.carbs;
              w.daysCount += 1;
              weekMap.set(label, w);
            }

            weeklyBreakdown = Array.from(weekMap.values()).map((w) => ({
              week: w.weekLabel,
              daysLogged: w.daysCount,
              totalCalories: Math.round(w.calories * 10) / 10,
              averageCaloriesPerDay: Math.round((w.calories / w.daysCount) * 10) / 10,
              averageProteinPerDay: Math.round((w.protein / w.daysCount) * 10) / 10,
              averageFatPerDay: Math.round((w.fat / w.daysCount) * 10) / 10,
              averageCarbsPerDay: Math.round((w.carbs / w.daysCount) * 10) / 10,
            }));
          }

          return {
            period: period || "last_7_days",
            totalDaysLogged,
            totals,
            dailyAverages,
            deficitAndWeightProgress,
            weeklyBreakdown,
          };
        } catch (error) {
          console.error("get_nutrition_summary error:", error);
          return { error: "Не вдалося отримати зведені дані аналітики" };
        }
      },
    }),

    delete_logged_meal: tool({
      description: "Видаляє конкретний запис споживання їжі зі щоденника за його ID.",
      inputSchema: z.object({
        entryId: z.string().describe("ID запису в таблиці food_log_entries"),
      }),
      execute: async ({ entryId }: { entryId: string }) => {
        try {
          const existing = await prisma.foodLogEntry.findFirst({
            where: { id: entryId, userId },
          });

          if (!existing) {
            return { error: "Запис не знайдено або у вас немає прав на його видалення" };
          }

          await prisma.foodLogEntry.delete({
            where: { id: entryId },
          });

          return { success: true, deletedName: existing.name };
        } catch (error) {
          console.error("delete_logged_meal error:", error);
          return { error: "Не вдалося видалити запис" };
        }
      },
    }),
  };
}

function weightGramsValid(w: unknown): w is number {
  return typeof w === "number" && !isNaN(w) && w > 0;
}

function parseDateString(dateStr: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.trim();
  const parts = dateOnly.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

function extractSearchKeywords(query: string): string[] {
  const stopwords = new Set([
    "з", "зі", "із", "та", "і", "й", "в", "у", "на", "до", "по", "під", "для", "про", "без", "від", "через", "грам", "грамів", "г", "порція", "порції", "з'їв", "зїла", "з'їла", "зїв"
  ]);
  const clean = query.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").toLowerCase();
  const words = clean.split(/\s+/).filter((w) => w.length >= 2 && !stopwords.has(w));

  const keywords: string[] = [];
  const endings = [
    "ами", "ями", "ими", "ого", "ому", "ої", "ій",
    "их", "ах", "ях", "ем", "ом", "ам", "ям",
    "ів", "ев", "єю", "ою", "ий", "ій",
    "ка", "ки", "ку", "ком", "ці",
    "а", "е", "и", "і", "о", "у", "я", "є", "ю"
  ];

  for (const word of words) {
    keywords.push(word);
    let stemmed = word;
    for (const ending of endings) {
      if (word.length - ending.length >= 3 && word.endsWith(ending)) {
        stemmed = word.slice(0, -ending.length);
        break;
      }
    }
    if (stemmed !== word && stemmed.length >= 3) {
      keywords.push(stemmed);
    }
  }

  return Array.from(new Set(keywords));
}
