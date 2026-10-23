import express from "express"
import { or, ilike, and, sql, eq, getTableColumns, desc } from "drizzle-orm";
import { subjects, departments } from "../db/schema";
import { db } from "../db";

const router = express.Router();

//Get all subjects with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
       
        const { search, department, page, limit } = req.query;

        const parsePositiveInt = (value: unknown, fallback: number): number | null => {
            if (value === undefined) return fallback;
            if (typeof value !== "string" || value.trim() === "") return null;
            const n = Number(value);
            return Number.isInteger(n) && n >= 1 ? n : null;
        };

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

        //If search query exists, filter by subject name OR subject code
        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            );
        }

        //If department filter exists, match department name
        if (department) {
            const deptPattern = `%${String(department).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(departments.name, deptPattern));
        }

        //Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and( ...filterConditions) : undefined;

        const countResult = await db
        .select({ count: sql<number>`count(*)::int`})
        .from(subjects)
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause);

        const totalCount = countResult[0] ?.count ?? 0;

        const subjectsList = await db.select({ ...getTableColumns(subjects), 
            departments: { ...getTableColumns(departments) }
        }).from(subjects).leftJoin(departments, eq(subjects.departmentId, departments.id))
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
    })

    } catch (e) {
        console.error(`GET /subjects error: ${e}`);
        res.status(500).json({ error: 'Failed to get subjects' })
    }
})

export default router;