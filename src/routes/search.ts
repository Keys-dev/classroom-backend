import express from "express";
import { or, ilike, and, isNull, desc } from "drizzle-orm";
import { classes, subjects, departments } from "../db/schema/index.js";
import { user } from "../db/schema/auth.js";
import { db } from "../db/index.js";

const router = express.Router();

// Search across users, classes, and subjects
router.get("/", async (req, res) => {
    try {
        const q = req.query.q as string;
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: "Search query parameter 'q' is required" });
        }

        const searchPattern = `%${q}%`;
        const limit = 5;

        // Search users by name or email
        const usersResults = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
            })
            .from(user)
            .where(and(
                isNull(user.deletedAt),
                or(
                    ilike(user.name, searchPattern),
                    ilike(user.email, searchPattern)
                )
            ))
            .orderBy(desc(user.createdAt))
            .limit(limit);

        // Search classes by name or invite code
        const classesResults = await db
            .select({
                id: classes.id,
                name: classes.name,
                inviteCode: classes.inviteCode,
                status: classes.status,
                bannerUrl: classes.bannerUrl,
            })
            .from(classes)
            .where(or(
                ilike(classes.name, searchPattern),
                ilike(classes.inviteCode, searchPattern)
            ))
            .orderBy(desc(classes.createdAt))
            .limit(limit);

        // Search subjects by name or code
        const subjectsResults = await db
            .select({
                id: subjects.id,
                name: subjects.name,
                code: subjects.code,
            })
            .from(subjects)
            .where(and(
                isNull(subjects.deletedAt),
                or(
                    ilike(subjects.name, searchPattern),
                    ilike(subjects.code, searchPattern)
                )
            ))
            .orderBy(desc(subjects.createdAt))
            .limit(limit);

        res.status(200).json({
            users: usersResults,
            classes: classesResults,
            subjects: subjectsResults,
        });
    } catch (e) {
        console.error(`GET /search error: ${e}`);
        res.status(500).json({ error: "Failed to search" });
    }
});

export default router;
