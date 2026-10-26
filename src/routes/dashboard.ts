import express from "express";
import { sql, eq, and, isNull } from "drizzle-orm";
import { departments, subjects, classes, enrollments } from "../db/schema/index.js";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// Get aggregated dashboard stats
router.get("/", async (req, res) => {
    try {
        // --- Counts ---
        const userCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(isNull(user.deletedAt));
        const totalUsers = userCountResult[0]?.count ?? 0;

        const teacherCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(and(eq(user.role, "teacher"), isNull(user.deletedAt)));
        const totalTeachers = teacherCountResult[0]?.count ?? 0;

        const studentCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(and(eq(user.role, "student"), isNull(user.deletedAt)));
        const totalStudents = studentCountResult[0]?.count ?? 0;

        const adminCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(and(eq(user.role, "admin"), isNull(user.deletedAt)));
        const totalAdmins = adminCountResult[0]?.count ?? 0;

        const deptCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(departments)
            .where(isNull(departments.deletedAt));
        const totalDepartments = deptCountResult[0]?.count ?? 0;

        const subjectCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(subjects)
            .where(isNull(subjects.deletedAt));
        const totalSubjects = subjectCountResult[0]?.count ?? 0;

        const classCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(classes)
            .where(eq(classes.status, "active"));
        const totalClasses = classCountResult[0]?.count ?? 0;

        const enrollmentCountResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(enrollments);
        const totalEnrollments = enrollmentCountResult[0]?.count ?? 0;

        // --- Enrollment Trends (last 6 months) ---
        const enrollmentTrends = await db.execute(sql`
            SELECT 
                to_char(created_at, 'YYYY-MM') as month,
                count(*)::int as count
            FROM enrollments
            WHERE created_at >= NOW() - INTERVAL '6 months'
            GROUP BY to_char(created_at, 'YYYY-MM')
            ORDER BY month
        `);

        // --- Classes by Department ---
        const classesByDept = await db.execute(sql`
            SELECT 
                d.name as department,
                count(c.id)::int as count
            FROM classes c
            JOIN subjects s ON c.subject_id = s.id
            JOIN departments d ON s.department_id = d.id
            WHERE c.status = 'active' AND d.deleted_at IS NULL
            GROUP BY d.name
            ORDER BY count DESC
        `);

        // --- Capacity Status ---
        const capacityStatusResult = await db.execute(sql`
            SELECT 
                SUM(CASE WHEN c.capacity <= 0 THEN 0 
                    WHEN enrolled_count >= c.capacity THEN 1 
                    WHEN enrolled_count >= c.capacity * 0.8 THEN 1 
                    ELSE 0 END)::int as nearly_full_or_full,
                SUM(CASE WHEN c.capacity <= 0 THEN 0 
                    WHEN enrolled_count >= c.capacity THEN 1 
                    ELSE 0 END)::int as full,
                SUM(CASE WHEN c.capacity <= 0 THEN 0 
                    WHEN enrolled_count < c.capacity * 0.8 THEN 1 
                    ELSE 0 END)::int as available
            FROM classes c
            LEFT JOIN (
                SELECT class_id, count(*)::int as enrolled_count
                FROM enrollments
                GROUP BY class_id
            ) e ON c.id = e.class_id
            WHERE c.status = 'active'
        `);

        const capacityRow: any = capacityStatusResult.rows[0];
        const capacityStatus = {
            full: Number(capacityRow?.full ?? 0),
            nearlyFull: Number(capacityRow?.nearly_full_or_full ?? 0) - Number(capacityRow?.full ?? 0),
            available: Number(capacityRow?.available ?? 0),
        };

        // --- User Distribution ---
        const userDistribution = {
            admin: totalAdmins,
            teacher: totalTeachers,
            student: totalStudents,
        };

        // --- Key Metrics ---
        const avgClassSize = totalClasses > 0 ? Math.round(totalEnrollments / totalClasses) : 0;
        const utilizationRate = totalClasses > 0
            ? Math.round(((Number(capacityStatus.full) + Number(capacityStatus.nearlyFull)) / totalClasses) * 100)
            : 0;

        res.status(200).json({
            counts: {
                users: totalUsers,
                teachers: totalTeachers,
                students: totalStudents,
                departments: totalDepartments,
                subjects: totalSubjects,
                classes: totalClasses,
                enrollments: totalEnrollments,
            },
            enrollmentTrends: enrollmentTrends.rows.map((row: any) => ({
                month: row.month,
                count: row.count,
            })),
            classesByDept: classesByDept.rows.map((row: any) => ({
                department: row.department,
                count: row.count,
            })),
            capacityStatus,
            userDistribution,
            keyMetrics: {
                avgClassSize,
                utilizationRate,
            },
        });
    } catch (e) {
        console.error(`GET /dashboard error: ${e}`);
        res.status(500).json({ error: "Failed to get dashboard stats" });
    }
});

export default router;
