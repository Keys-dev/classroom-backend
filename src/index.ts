import express, { Request, Response } from 'express';

const app = express();
const PORT = 8000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello from Express server' });
});

app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
