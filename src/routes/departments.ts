import express from "express";
import { or, ilike, and, sql, eq, getTableColumns, desc, isNull } from "drizzle-orm";
import { departments, subjects } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

// Helper to parse positive integers from query params
const parsePositiveInt = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
};

// Get all departments with optional search and pagination
router.get("/", async (req, res) => {
    try {
        const { search, page, limit } = req.query;

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

        // Filter out soft-deleted departments
        filterConditions.push(isNull(departments.deletedAt));

        // If search query exists, filter by name OR code
        if (search) {
            filterConditions.push(
                or(
                    ilike(departments.name, `%${search}%`),
                    ilike(departments.code, `%${search}%`)
                )
            );
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(departments)
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const departmentsList = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(whereClause)
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: departmentsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /departments error: ${e}`);
        res.status(500).json({ error: "Failed to get departments" });
    }
});

// Get single department by ID
router.get("/:id", async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        if (!Number.isFinite(deptId)) {
            return res.status(400).json({ error: "Invalid department ID" });
        }

        const [department] = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(and(eq(departments.id, deptId), isNull(departments.deletedAt)));

        if (!department) {
            return res.status(404).json({ error: "Department not found" });
        }

        res.status(200).json({ data: department });
    } catch (e) {
        console.error(`GET /departments/:id error: ${e}`);
        res.status(500).json({ error: "Failed to get department" });
    }
});

// Create a new department
router.post("/", async (req, res) => {
    try {
        const { name, code, description } = req.body;

        if (!name || !code) {
            return res.status(400).json({ error: "Name and code are required" });
        }

        const [createdDept] = await db
            .insert(departments)
            .values({ name, code, description })
            .returning({ ...getTableColumns(departments) });

        res.status(201).json({ data: createdDept });
    } catch (e: any) {
        console.error(`POST /departments error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A department with this name or code already exists" });
        }
        res.status(500).json({ error: "Failed to create department" });
    }
});

// Update a department
router.put("/:id", async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        if (!Number.isFinite(deptId)) {
            return res.status(400).json({ error: "Invalid department ID" });
        }

        const { name, code, description } = req.body;

        // Check if department exists and is not deleted
        const [existing] = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(and(eq(departments.id, deptId), isNull(departments.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "Department not found" });
        }

        const updateData: { name?: string; code?: string; description?: string | null } = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;

        const [updatedDept] = await db
            .update(departments)
            .set(updateData)
            .where(eq(departments.id, deptId))
            .returning({ ...getTableColumns(departments) });

        res.status(200).json({ data: updatedDept });
    } catch (e: any) {
        console.error(`PUT /departments/:id error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A department with this name or code already exists" });
        }
        res.status(500).json({ error: "Failed to update department" });
    }
});

// Soft delete (archive) a department
router.patch("/:id/archive", async (req, res) => {
    try {
        const deptId = Number(req.params.id);
        if (!Number.isFinite(deptId)) {
            return res.status(400).json({ error: "Invalid department ID" });
        }

        // Check if department exists and is not already deleted
        const [existing] = await db
            .select({ ...getTableColumns(departments) })
            .from(departments)
            .where(and(eq(departments.id, deptId), isNull(departments.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "Department not found" });
        }

        // Check constraint: cannot archive if subjects exist
        const subjectCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(subjects)
            .where(and(
                eq(subjects.departmentId, deptId),
                isNull(subjects.deletedAt)
            ));

        const subjectCount = subjectCountResult[0]?.count ?? 0;
        if (subjectCount > 0) {
            return res.status(409).json({ error: "Cannot archive department with active subjects" });
        }

        const [archivedDept] = await db
            .update(departments)
            .set({ deletedAt: sql`NOW()` })
            .where(eq(departments.id, deptId))
            .returning({ ...getTableColumns(departments) });

        res.status(200).json({ data: archivedDept });
    } catch (e) {
        console.error(`PATCH /departments/:id/archive error: ${e}`);
        res.status(500).json({ error: "Failed to archive department" });
    }
});

export default router;
