import AgentAPI from "apminsight";
AgentAPI.config()

import express from 'express';
import cors from "cors";

import subjectsRouter from "./routes/subjects.js";
import usersRouter from "./routes/users.js";
import classesRouter from "./routes/classes.js";
import departmentsRouter from "./routes/departments.js";
import enrollmentsRouter from "./routes/enrollments.js";
import dashboardRouter from "./routes/dashboard.js";
import searchRouter from "./routes/search.js";
import authRoutesRouter from "./routes/auth-routes.js";
import securityMiddleware from "./middleware/security.js";
import authMiddleware from "./middleware/auth.js";
import {toNodeHandler} from "better-auth/node";
import {auth} from "./lib/auth.js";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}))

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

// Auth middleware must run before security middleware so req.user is available
app.use(authMiddleware);
app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter)
app.use('/api/users', usersRouter)
app.use('/api/classes', classesRouter)
app.use('/api/departments', departmentsRouter)
app.use('/api/enrollments', enrollmentsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/search', searchRouter)
app.use('/api', authRoutesRouter)

app.get('/', (req, res) => {
  res.send('Hello, welcome to the Classroom API!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});