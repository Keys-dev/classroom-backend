import type { NextFunction, Request, Response } from "express";

import { auth } from "../lib/auth.js";

const authMiddleware = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        // Better Auth stores session in cookies; we need to pass the cookie header
        const session = await auth.api.getSession({
            headers: req.headers,
        });

        if (!session?.user) {
            req.user = undefined;
            return next();
        }

        req.user = {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            role: (session.user as any).role ?? "student",
            image: session.user.image ?? null,
        };

        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        req.user = undefined;
        next();
    }
};

export default authMiddleware;
