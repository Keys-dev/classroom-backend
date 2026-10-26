import express from "express";
import { or, ilike, and, sql, eq, getTableColumns, desc, isNull } from "drizzle-orm";
import { subjects, departments, classes } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

// Helper to parse positive integers from query params
const parsePositiveInt = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
};

// Get all subjects with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, department, page, limit } = req.query;

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

        // Filter out soft-deleted subjects
        filterConditions.push(isNull(subjects.deletedAt));

        // If search query exists, filter by subject name OR subject code
        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            );
        }

        // If department filter exists, match department name
        if (department) {
            const deptPattern = `%${String(department).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(departments.name, deptPattern));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const subjectsList = await db
            .select({ ...getTableColumns(subjects), departments: { ...getTableColumns(departments) } })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /subjects error: ${e}`);
        res.status(500).json({ error: "Failed to get subjects" });
    }
});

// Get single subject by ID
router.get("/:id", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);
        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        const [subject] = await db
            .select({ ...getTableColumns(subjects), departments: { ...getTableColumns(departments) } })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)));

        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: subject });
    } catch (e) {
        console.error(`GET /subjects/:id error: ${e}`);
        res.status(500).json({ error: "Failed to get subject" });
    }
});

// Create a new subject
router.post("/", async (req, res) => {
    try {
        const { name, code, description, departmentId } = req.body;

        if (!name || !code || !departmentId) {
            return res.status(400).json({ error: "Name, code, and departmentId are required" });
        }

        const [createdSubject] = await db
            .insert(subjects)
            .values({ name, code, description, departmentId })
            .returning({ ...getTableColumns(subjects) });

        res.status(201).json({ data: createdSubject });
    } catch (e: any) {
        console.error(`POST /subjects error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A subject with this code already exists" });
        }
        res.status(500).json({ error: "Failed to create subject" });
    }
});

// Update a subject
router.put("/:id", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);
        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        const { name, code, description, departmentId } = req.body;

        // Check if subject exists and is not deleted
        const [existing] = await db
            .select({ ...getTableColumns(subjects) })
            .from(subjects)
            .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "Subject not found" });
        }

        const updateData: {
            name?: string;
            code?: string;
            description?: string | null;
            departmentId?: number;
        } = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (departmentId !== undefined) updateData.departmentId = departmentId;

        const [updatedSubject] = await db
            .update(subjects)
            .set(updateData)
            .where(eq(subjects.id, subjectId))
            .returning({ ...getTableColumns(subjects) });

        res.status(200).json({ data: updatedSubject });
    } catch (e: any) {
        console.error(`PUT /subjects/:id error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "A subject with this code already exists" });
        }
        res.status(500).json({ error: "Failed to update subject" });
    }
});

// Soft delete (archive) a subject
router.patch("/:id/archive", async (req, res) => {
    try {
        const subjectId = Number(req.params.id);
        if (!Number.isFinite(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        // Check if subject exists and is not already deleted
        const [existing] = await db
            .select({ ...getTableColumns(subjects) })
            .from(subjects)
            .where(and(eq(subjects.id, subjectId), isNull(subjects.deletedAt)));

        if (!existing) {
            return res.status(404).json({ error: "Subject not found" });
        }

        // Check constraint: cannot archive if classes exist
        const classCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(classes)
            .where(eq(classes.subjectId, subjectId));

        const classCount = classCountResult[0]?.count ?? 0;
        if (classCount > 0) {
            return res.status(409).json({ error: "Cannot archive subject with active classes" });
        }

        const [archivedSubject] = await db
            .update(subjects)
            .set({ deletedAt: sql`NOW()` })
            .where(eq(subjects.id, subjectId))
            .returning({ ...getTableColumns(subjects) });

        res.status(200).json({ data: archivedSubject });
    } catch (e) {
        console.error(`PATCH /subjects/:id/archive error: ${e}`);
        res.status(500).json({ error: "Failed to archive subject" });
    }
});

export default router;