import express from "express";
import { or, ilike, and, sql, eq, getTableColumns, desc, isNull } from "drizzle-orm";
import { user } from "../db/schema/auth.js";
import { classes } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

// Helper to parse positive integers from query params
const parsePositiveInt = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
};

// Get all users with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, role, page, limit } = req.query;

        const parsedPage = parsePositiveInt(page, 1);
        const parsedLimit = parsePositiveInt(limit, 10);
        if (parsedPage === null || parsedLimit === null) {
            return res.status(400).json({ error: "page and limit must be positive integers" });
        }

        const MAX_LIMIT = 100;
        const currentPage = parsedPage;
        const limitPerPage = Math.min(parsedLimit, MAX_LIMIT);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        // Filter out soft-deleted users
        filterConditions.push(isNull(user.deletedAt));

        // If search query exists, filter by user name OR user email
        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`)
                )
            );
        }

        // If role filter exists, match role exactly
        if (role) {
            filterConditions.push(eq(user.role, role as any));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /users error: ${e}`);
        res.status(500).json({ error: "Failed to get users" });
    }
});

// Get single user by ID
router.get("/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        const [foundUser] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(and(eq(user.id, userId), isNull(user.deletedAt)));

        if (!foundUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: foundUser });
    } catch (e) {
        console.error(`GET /users/:id error: ${e}`);
        res.status(500).json({ error: "Failed to get user" });
    }
});

// Create a new user
router.post("/", async (req, res) => {
    try {
        const { name, email, role, image } = req.body;

        if (!name || !email || !role) {
            return res.status(400).json({ error: "Name, email, and role are required" });
        }

        const crypto = await import("crypto");
        const id = crypto.randomUUID();
        const [createdUser] = await db
            .insert(user)
            .values({ id, name, email, role, image })
            .returning({ ...getTableColumns(user) });

        res.status(201).json({ data: createdUser });
    } catch (e: any) {
        console.error(`POST /users error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A user with this email already exists" });
        }
        res.status(500).json({ error: "Failed to create user" });
    }
});

// Update a user
router.put("/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, image } = req.body;

        // Check if user exists and is not deleted
        const [existing] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(and(eq(user.id, userId), isNull(user.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "User not found" });
        }

        const updateData: { name?: string; email?: string; role?: "student" | "teacher" | "admin"; image?: string | null } = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role !== undefined) updateData.role = role;
        if (image !== undefined) updateData.image = image;

        const [updatedUser] = await db
            .update(user)
            .set(updateData)
            .where(eq(user.id, userId))
            .returning({ ...getTableColumns(user) });

        res.status(200).json({ data: updatedUser });
    } catch (e: any) {
        console.error(`PUT /users/:id error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A user with this email already exists" });
        }
        res.status(500).json({ error: "Failed to update user" });
    }
});

// Soft delete (archive) a user
router.patch("/:id/archive", async (req, res) => {
    try {
        const userId = req.params.id;

        // Check if user exists and is not already deleted
        const [existing] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(and(eq(user.id, userId), isNull(user.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check constraint: cannot archive teachers with active classes
        if (existing.role === "teacher") {
            const classCountResult = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(classes)
                .where(and(
                    eq(classes.teacherId, userId),
                    eq(classes.status, "active")
                ));

            const classCount = classCountResult[0]?.count ?? 0;
            if (classCount > 0) {
                return res.status(409).json({ error: "Cannot archive teacher with active classes" });
            }
        }

        const [archivedUser] = await db
            .update(user)
            .set({ deletedAt: sql`NOW()` })
            .where(eq(user.id, userId))
            .returning({ ...getTableColumns(user) });

        res.status(200).json({ data: archivedUser });
    } catch (e) {
        console.error(`PATCH /users/:id/archive error: ${e}`);
        res.status(500).json({ error: "Failed to archive user" });
    }
});

export default router;
