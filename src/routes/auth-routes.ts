import express from "express";
import { eq, and, sql, getTableColumns, desc } from "drizzle-orm";
import { classes, subjects, enrollments } from "../db/schema/index.js";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// Helper to require authentication
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized", message: "You must be logged in to access this resource" });
    }
    next();
};

// GET /api/me — Current user profile
router.get("/me", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;

        const [foundUser] = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
                imageCldPubId: user.imageCldPubId,
                createdAt: user.createdAt,
            })
            .from(user)
            .where(eq(user.id, userId));

        if (!foundUser) {
            return res.status(404).json({ error: "User not found" });
        }

        res.status(200).json({ data: foundUser });
    } catch (e) {
        console.error(`GET /api/me error: ${e}`);
        res.status(500).json({ error: "Failed to get user profile" });
    }
});

// GET /api/classes/my — Classes taught by the current user (teacher)
router.get("/classes/my", requireAuth, async (req, res) => {
    try {
        const teacherId = req.user!.id;

        const { search, page, limit } = req.query;

        const parsedPage = typeof page === "string" ? Number(page) : 1;
        const parsedLimit = Math.min(typeof limit === "string" ? Number(limit) : 10, 100);
        const offset = (parsedPage - 1) * parsedLimit;

        const filterConditions = [eq(classes.teacherId, teacherId), eq(classes.status, "active")];

        if (search) {
            filterConditions.push(
                sql`classes.name ILIKE ${`%${search}%`}`
            );
        }

        const whereClause = and(...filterConditions);

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const myClasses = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(parsedLimit)
            .offset(offset);

        // Get enrollment counts for each class
        const classesWithCounts = await Promise.all(
            myClasses.map(async (classItem) => {
                const [enrollmentCount] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(enrollments)
                    .where(eq(enrollments.classId, classItem.id));

                return {
                    ...classItem,
                    enrolledCount: enrollmentCount?.count ?? 0,
                };
            })
        );

        res.status(200).json({
            data: classesWithCounts,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / parsedLimit),
            },
        });
    } catch (e) {
        console.error(`GET /api/classes/my error: ${e}`);
        res.status(500).json({ error: "Failed to get teacher's classes" });
    }
});

// GET /api/classes/enrolled — Classes the current user is enrolled in (student)
router.get("/classes/enrolled", requireAuth, async (req, res) => {
    try {
        const studentId = req.user!.id;

        const { search, page, limit } = req.query;

        const parsedPage = typeof page === "string" ? Number(page) : 1;
        const parsedLimit = Math.min(typeof limit === "string" ? Number(limit) : 10, 100);
        const offset = (parsedPage - 1) * parsedLimit;

        // Get enrolled classes by joining enrollments -> classes -> subjects -> teacher
        const filterConditions = [
            eq(enrollments.studentId, studentId),
            eq(classes.status, "active"),
        ];

        if (search) {
            filterConditions.push(
                sql`classes.name ILIKE ${`%${search}%`}`
            );
        }

        const whereClause = and(...filterConditions);

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const enrolledClasses = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) },
            })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(enrollments.createdAt))
            .limit(parsedLimit)
            .offset(offset);

        res.status(200).json({
            data: enrolledClasses,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / parsedLimit),
            },
        });
    } catch (e) {
        console.error(`GET /api/classes/enrolled error: ${e}`);
        res.status(500).json({ error: "Failed to get enrolled classes" });
    }
});

// POST /api/classes/join — Join a class by invite code (student self-enrollment)
router.post("/classes/join", requireAuth, async (req, res) => {
    try {
        const studentId = req.user!.id;
        const { inviteCode } = req.body;

        if (!inviteCode) {
            return res.status(400).json({ error: "Invite code is required" });
        }

        // Find the class by invite code
        const [foundClass] = await db
            .select({ ...getTableColumns(classes) })
            .from(classes)
            .where(eq(classes.inviteCode, inviteCode));

        if (!foundClass) {
            return res.status(404).json({ error: "Class not found", message: "Invalid invite code" });
        }

        if (foundClass.status !== "active") {
            return res.status(409).json({ error: "Class not available", message: "This class is no longer active" });
        }

        // Check if already enrolled
        const [existingEnrollment] = await db
            .select({ ...getTableColumns(enrollments) })
            .from(enrollments)
            .where(
                and(
                    eq(enrollments.studentId, studentId),
                    eq(enrollments.classId, foundClass.id)
                )
            );

        if (existingEnrollment) {
            return res.status(409).json({ error: "Already enrolled", message: "You are already enrolled in this class" });
        }

        // Check capacity
        const [enrollmentCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(enrollments)
            .where(eq(enrollments.classId, foundClass.id));

        const currentEnrollments = enrollmentCount?.count ?? 0;
        const capacity = foundClass.capacity ?? 50;

        if (currentEnrollments >= capacity) {
            return res.status(409).json({ error: "Class full", message: "This class has reached its capacity" });
        }

        // Create enrollment
        const [newEnrollment] = await db
            .insert(enrollments)
            .values({
                studentId,
                classId: foundClass.id,
            })
            .returning({ ...getTableColumns(enrollments) });

        res.status(201).json({ data: newEnrollment });
    } catch (e) {
        console.error(`POST /api/classes/join error: ${e}`);
        res.status(500).json({ error: "Failed to join class" });
    }
});

export default router;
