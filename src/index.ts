// import { eq } from 'drizzle-orm';
// import { db } from './db';
// import { departments, subjects } from './db/schema';

// async function main() {
//   try {
//     console.log('Performing CRUD operations...\n');

//     // CREATE: Insert a new department
//     const [newDept] = await db
//       .insert(departments)
//       .values({ code: 'CS', name: 'Computer Science', description: 'CS Department' })
//       .returning();

//     if (!newDept) throw new Error('Failed to create department');
//     console.log('✅ CREATE Department:', newDept);

//     // CREATE: Insert a subject linked to the department
//     const [newSubject] = await db
//       .insert(subjects)
//       .values({ departmentId: newDept.id, code: 'CS101', name: 'Intro to CS', description: 'Basic course' })
//       .returning();

//     if (!newSubject) throw new Error('Failed to create subject');
//     console.log('✅ CREATE Subject:', newSubject);

//     // READ: Select the department
//     const foundDept = await db.select().from(departments).where(eq(departments.id, newDept.id));
//     console.log('✅ READ Department:', foundDept[0]);

//     // READ: Select subjects by department
//     const foundSubjects = await db.select().from(subjects).where(eq(subjects.departmentId, newDept.id));
//     console.log('✅ READ Subjects:', foundSubjects);

//     // UPDATE: Change the department name
//     const [updatedDept] = await db
//       .update(departments)
//       .set({ name: 'Computer Science & Engineering' })
//       .where(eq(departments.id, newDept.id))
//       .returning();

//     console.log('✅ UPDATE Department:', updatedDept);

//     // DELETE: Remove the subject first (due to foreign key)
//     await db.delete(subjects).where(eq(subjects.id, newSubject.id));
//     console.log('✅ DELETE Subject');

//     // DELETE: Remove the department
//     await db.delete(departments).where(eq(departments.id, newDept.id));
//     console.log('✅ DELETE Department');

//     console.log('\nCRUD operations completed successfully.');
//   } catch (error) {
//     console.error('❌ Error performing CRUD operations:', error);
//     process.exit(1);
//   }
// }

// main();


import express from 'express'
import cors from "cors";

import subjectsRouter from './routes/subjects'
import securityMiddleware from './middleware/security.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/Auth';

const app = express();
const PORT = 8000;

const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) {
  throw new Error('FRONTEND_URL is not defined');
}

 app.use(cors({
  origin: frontendUrl,
   methods: ['GET', 'POST', 'PUT', 'DELETE'],
   credentials: true
 }))

 app.all('/api/auth/{*splat}', toNodeHandler(auth));


app.use(express.json());

app.use(securityMiddleware)

app.use('/api/subjects', subjectsRouter)

app.get('/', (req, res) => {
  res.send('Hello, welcome to the Classroom API!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`)
});