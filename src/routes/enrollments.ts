import express from "express";
import { sql, eq, getTableColumns, and, isNull, desc } from "drizzle-orm";
import { enrollments, classes } from "../db/schema/index.js";
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

// Get all enrolled students for a class
router.get("/classes/:classId/enrollments", async (req, res) => {
    try {
        const classId = Number(req.params.classId);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        const { page, limit } = req.query;

        const parsedPage = parsePositiveInt(page, 1);
        const parsedLimit = parsePositiveInt(limit, 10);
        if (parsedPage === null || parsedLimit === null) {
            return res.status(400).json({ error: "page and limit must be positive integers" });
        }

        const MAX_LIMIT = 100;
        const currentPage = parsedPage;
        const limitPerPage = Math.min(parsedLimit, MAX_LIMIT);
        const offset = (currentPage - 1) * limitPerPage;

        // Check if class exists and is not archived
        const [classRecord] = await db
            .select({ ...getTableColumns(classes) })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        // Count enrolled students
        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(enrollments)
            .where(eq(enrollments.classId, classId));

        const totalCount = countResult[0]?.count ?? 0;

        // Get enrolled students with user details
        const enrolledList = await db
            .select({
                id: enrollments.id,
                studentId: enrollments.studentId,
                classId: enrollments.classId,
                createdAt: enrollments.createdAt,
                student: { ...getTableColumns(user) }
            })
            .from(enrollments)
            .leftJoin(user, eq(enrollments.studentId, user.id))
            .where(eq(enrollments.classId, classId))
            .orderBy(desc(enrollments.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: enrolledList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /classes/:classId/enrollments error: ${e}`);
        res.status(500).json({ error: "Failed to get enrollments" });
    }
});

// Enroll a student in a class
router.post("/classes/:classId/enrollments", async (req, res) => {
    try {
        const classId = Number(req.params.classId);
        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ error: "Student ID is required" });
        }

        // Check if class exists and is not archived
        const [classRecord] = await db
            .select({ ...getTableColumns(classes) })
            .from(classes)
            .where(eq(classes.id, classId));

        if (!classRecord) {
            return res.status(404).json({ error: "Class not found" });
        }

        if (classRecord.status === "archived") {
            return res.status(409).json({ error: "Cannot enroll in an archived class" });
        }

        // Check if student exists and is not deleted
        const [studentRecord] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(and(eq(user.id, studentId), isNull(user.deletedAt)));

        if (!studentRecord) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Check capacity
        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(enrollments)
            .where(eq(enrollments.classId, classId));

        const enrolledCount = countResult[0]?.count ?? 0;
        const capacity = classRecord.capacity ?? 50;
        if (enrolledCount >= capacity) {
            return res.status(409).json({ error: "Class is at full capacity" });
        }

        // Check if already enrolled
        const [existingEnrollment] = await db
            .select({ ...getTableColumns(enrollments) })
            .from(enrollments)
            .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)));

        if (existingEnrollment) {
            return res.status(409).json({ error: "Student is already enrolled in this class" });
        }

        // Create enrollment
        const [createdEnrollment] = await db
            .insert(enrollments)
            .values({ studentId, classId })
            .returning({ ...getTableColumns(enrollments) });

        res.status(201).json({ data: createdEnrollment });
    } catch (e: any) {
        console.error(`POST /classes/:classId/enrollments error: ${e}`);
        if (e.code === "23505") {
            return res.status(409).json({ error: "Student is already enrolled in this class" });
        }
        res.status(500).json({ error: "Failed to enroll student" });
    }
});

// Unenroll a student from a class
router.delete("/classes/:classId/enrollments/:studentId", async (req, res) => {
    try {
        const classId = Number(req.params.classId);
        const studentId = req.params.studentId;

        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        // Check if enrollment exists
        const [existingEnrollment] = await db
            .select({ ...getTableColumns(enrollments) })
            .from(enrollments)
            .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)));

        if (!existingEnrollment) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        // Delete enrollment
        await db
            .delete(enrollments)
            .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)));

        res.status(200).json({ data: { id: existingEnrollment.id } });
    } catch (e) {
        console.error(`DELETE /classes/:classId/enrollments/:studentId error: ${e}`);
        res.status(500).json({ error: "Failed to unenroll student" });
    }
});

export default router;
