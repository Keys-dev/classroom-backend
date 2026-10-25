import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { departments, subjects } from './db/schema/index.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function seed() {
  console.log('Seeding departments...');

  const deptData = [
    { code: 'CS', name: 'Computer Science', description: 'Programming, algorithms, and software engineering' },
    { code: 'MATH', name: 'Mathematics', description: 'Pure and applied mathematics' },
    { code: 'PHYS', name: 'Physics', description: 'Classical and modern physics' },
    { code: 'CHEM', name: 'Chemistry', description: 'Organic, inorganic, and physical chemistry' },
    { code: 'BIO', name: 'Biology', description: 'Life sciences and biotechnology' },
    { code: 'ENG', name: 'English', description: 'Literature, composition, and linguistics' },
    { code: 'HIST', name: 'History', description: 'World history and historical analysis' },
    { code: 'ECON', name: 'Economics', description: 'Microeconomics, macroeconomics, and econometrics' },
  ];

  const insertedDepts = await db
    .insert(departments)
    .values(deptData)
    .onConflictDoNothing()
    .returning();

  console.log(`Inserted ${insertedDepts.length} new departments.`);

  // Fetch all departments to get their IDs
  const allDepts = await db.select().from(departments);
  const deptMap = new Map(allDepts.map((d) => [d.code, d.id]));

  console.log('Seeding subjects...');

  const subjectData = [
    // Computer Science
    { departmentId: deptMap.get('CS')!, code: 'CS101', name: 'Introduction to Programming', description: 'Learn programming fundamentals with Python' },
    { departmentId: deptMap.get('CS')!, code: 'CS201', name: 'Data Structures and Algorithms', description: 'Arrays, trees, graphs, sorting, and searching' },
    { departmentId: deptMap.get('CS')!, code: 'CS301', name: 'Database Systems', description: 'Relational databases, SQL, and NoSQL' },
    { departmentId: deptMap.get('CS')!, code: 'CS350', name: 'Operating Systems', description: 'Process management, memory, and file systems' },
    { departmentId: deptMap.get('CS')!, code: 'CS401', name: 'Machine Learning', description: 'Supervised and unsupervised learning algorithms' },

    // Mathematics
    { departmentId: deptMap.get('MATH')!, code: 'MATH101', name: 'Calculus I', description: 'Limits, derivatives, and integrals' },
    { departmentId: deptMap.get('MATH')!, code: 'MATH102', name: 'Calculus II', description: 'Integration techniques and series' },
    { departmentId: deptMap.get('MATH')!, code: 'MATH201', name: 'Linear Algebra', description: 'Vectors, matrices, and linear transformations' },
    { departmentId: deptMap.get('MATH')!, code: 'MATH301', name: 'Probability and Statistics', description: 'Probability theory and statistical inference' },

    // Physics
    { departmentId: deptMap.get('PHYS')!, code: 'PHYS101', name: 'Mechanics', description: 'Newtonian mechanics and kinematics' },
    { departmentId: deptMap.get('PHYS')!, code: 'PHYS201', name: 'Electromagnetism', description: 'Electric and magnetic fields' },
    { departmentId: deptMap.get('PHYS')!, code: 'PHYS301', name: 'Quantum Physics', description: 'Wave-particle duality and quantum mechanics' },

    // Chemistry
    { departmentId: deptMap.get('CHEM')!, code: 'CHEM101', name: 'General Chemistry', description: 'Atomic structure, bonding, and reactions' },
    { departmentId: deptMap.get('CHEM')!, code: 'CHEM201', name: 'Organic Chemistry', description: 'Carbon compounds and reactions' },

    // Biology
    { departmentId: deptMap.get('BIO')!, code: 'BIO101', name: 'General Biology', description: 'Cell biology, genetics, and evolution' },
    { departmentId: deptMap.get('BIO')!, code: 'BIO201', name: 'Molecular Biology', description: 'DNA, RNA, and protein synthesis' },

    // English
    { departmentId: deptMap.get('ENG')!, code: 'ENG101', name: 'English Composition', description: 'Academic writing and rhetoric' },
    { departmentId: deptMap.get('ENG')!, code: 'ENG201', name: 'World Literature', description: 'Classic and modern literary works' },

    // History
    { departmentId: deptMap.get('HIST')!, code: 'HIST101', name: 'World History I', description: 'Ancient civilizations to the Middle Ages' },
    { departmentId: deptMap.get('HIST')!, code: 'HIST102', name: 'World History II', description: 'Renaissance to the modern era' },

    // Economics
    { departmentId: deptMap.get('ECON')!, code: 'ECON101', name: 'Microeconomics', description: 'Supply, demand, and market structures' },
    { departmentId: deptMap.get('ECON')!, code: 'ECON102', name: 'Macroeconomics', description: 'GDP, inflation, and fiscal policy' },
  ];

  const insertedSubjects = await db
    .insert(subjects)
    .values(subjectData)
    .onConflictDoNothing()
    .returning();

  console.log(`Inserted ${insertedSubjects.length} new subjects.`);
  console.log('Seeding complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
