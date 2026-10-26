import express from "express";
import { and, ilike, or, sql, eq, getTableColumns, desc } from "drizzle-orm";
import { classes, subjects, departments } from "../db/schema/index.js";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// Helper to parse positive integers from query params
const parsePositiveInt = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
};

// Get all classes with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, subject, teacher, page, limit } = req.query;

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

        // Filter out archived classes
        filterConditions.push(eq(classes.status, "active"));

        // If search query exists, filter by class name OR invite code
        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        // If subject filter exists, match subject name
        if (subject) {
            const subjectPattern = `%${String(subject).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(subjects.name, subjectPattern));
        }

        // If teacher filter exists, match teacher name
        if (teacher) {
            const teacherPattern = `%${String(teacher).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(user.name, teacherPattern));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) }
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /classes error: ${e}`);
        res.status(500).json({ error: "Failed to get classes" });
    }
});

// Get class details with teacher, subject, and department
router.get('/:id', async (req, res) => {
    const classId = Number(req.params.id);

    if(!Number.isFinite(classId)) return res.status(400).json({ error: 'No Class found.' });

    const [classDetails] = await db
        .select({
            ...getTableColumns(classes),
            subject: {
                ...getTableColumns(subjects),
            },
            department: {
                ...getTableColumns(departments),
            },
            teacher: {
                ...getTableColumns(user),
            }
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(classes.id, classId))

    if(!classDetails) return res.status(404).json({ error: 'No Class found.' });

    res.status(200).json({ data: classDetails });
})

// Create a new class
router.post("/", async (req, res) => {
    try {
        const [createdClass] = await db
            .insert(classes)
            .values({ ...req.body, inviteCode: Math.random().toString(36).substring(2, 9), schedules: [] })
            .returning({ ...getTableColumns(classes) });

        if (!createdClass) throw new Error("Failed to create class");

        res.status(201).json({ data: createdClass });
    } catch (e) {
        console.error(`POST /classes error: ${e}`);
        res.status(500).json({ error: "Failed to create class" });
    }
});

// Update a class
router.put("/:id", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        const { name, subjectId, teacherId, bannerUrl, bannerCldPubId, description, capacity, status, schedules } = req.body;

        // Check if class exists
        const [existing] = await db
            .select({ ...getTableColumns(classes) })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!existing) {
            return res.status(404).json({ error: "Class not found" });
        }

        const updateData: {
            name?: string;
            subjectId?: number;
            teacherId?: string;
            bannerUrl?: string | null;
            bannerCldPubId?: string | null;
            description?: string | null;
            capacity?: number;
            status?: "active" | "inactive" | "archived";
            schedules?: any;
        } = {};
        if (name !== undefined) updateData.name = name;
        if (subjectId !== undefined) updateData.subjectId = subjectId;
        if (teacherId !== undefined) updateData.teacherId = teacherId;
        if (bannerUrl !== undefined) updateData.bannerUrl = bannerUrl;
        if (bannerCldPubId !== undefined) updateData.bannerCldPubId = bannerCldPubId;
        if (description !== undefined) updateData.description = description;
        if (capacity !== undefined) updateData.capacity = capacity;
        if (status !== undefined) updateData.status = status;
        if (schedules !== undefined) updateData.schedules = schedules;

        const [updatedClass] = await db
            .update(classes)
            .set(updateData)
            .where(eq(classes.id, classId))
            .returning({ ...getTableColumns(classes) });

        res.status(200).json({ data: updatedClass });
    } catch (e) {
        console.error(`PUT /classes/:id error: ${e}`);
        res.status(500).json({ error: "Failed to update class" });
    }
});

// Soft delete (archive) a class
router.patch("/:id/archive", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        // Check if class exists
        const [existing] = await db
            .select({ ...getTableColumns(classes) })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!existing) {
            return res.status(404).json({ error: "Class not found" });
        }

        const [archivedClass] = await db
            .update(classes)
            .set({ status: "archived" })
            .where(eq(classes.id, classId))
            .returning({ ...getTableColumns(classes) });

        res.status(200).json({ data: archivedClass });
    } catch (e) {
        console.error(`PATCH /classes/:id/archive error: ${e}`);
        res.status(500).json({ error: "Failed to archive class" });
    }
});

export default router;