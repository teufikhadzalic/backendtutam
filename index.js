const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: ["https://tutam-frontend-teufik.vercel.app"], // Pastikan URL frontend benar
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// PostgreSQL pool setup for Neon
const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
  ssl: process.env.PG_CONNECTION_STRING?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

// Simulasi database pengguna
const users = [];

// Middleware untuk validasi token JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  console.log("Token received:", token); // Debugging token

  if (!token) {
    console.error("No token provided");
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, 'secret_key', (err, user) => {
    if (err) {
      console.error("Invalid token:", err.message); // Debugging token error
      return res.status(403).json({ error: 'Invalid token.' });
    }
    req.user = user;
    next();
  });
};

// Root endpoint
app.get('/', (req, res) => {
  console.log("Root endpoint accessed"); // Debugging root access
  res.send('MentzerTrack Backend is running!');
});

// User Authentication Endpoints
app.post('/user/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ name, email, password: hashedPassword });

  res.status(201).json({ message: 'User registered successfully.' });
});

app.post('/user/login', async (req, res) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign({ email: user.email }, 'secret_key', { expiresIn: '1h' });
  res.json({ token, user: { name: user.name, email: user.email } });
});

// GET all workout programs with exercises
app.get('/programs', authenticateToken, async (req, res) => {
  try {
    console.log("Request received at /programs"); // Debugging request
    const result = await pool.query(`
      SELECT 
        wp.id AS program_id,
        wp.title,
        wp.goal,
        e.id AS exercise_id,
        e.name AS exercise_name,
        e.reps,
        e.type
      FROM workout_programs wp
      LEFT JOIN exercises e ON e.program_id = wp.id
      ORDER BY wp.id;
    `);

    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.program_id]) {
        grouped[row.program_id] = {
          id: row.program_id,
          title: row.title,
          goal: row.goal,
          exercises: []
        };
      }

      if (row.exercise_id) {
        grouped[row.program_id].exercises.push({
          id: row.exercise_id,
          name: row.exercise_name,
          reps: row.reps,
          type: row.type
        });
      }
    });

    console.log("Programs fetched successfully:", Object.values(grouped)); // Debugging response
    res.json(Object.values(grouped));
  } catch (err) {
    console.error("Error in /programs:", err); // Debugging error
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// POST create a new workout program with exercises
app.post('/programs', authenticateToken, async (req, res) => {
  const { title, goal, exercises } = req.body;

  console.log("Request body:", req.body); // Debugging request body

  if (!title || !goal || !Array.isArray(exercises)) {
    console.error("Invalid input:", { title, goal, exercises }); // Debugging invalid input
    return res.status(400).json({ error: 'Invalid input. Title, goal, and exercises are required.' });
  }

  try {
    const client = await pool.connect();
    await client.query('BEGIN');

    const insertProgram = await client.query(
      'INSERT INTO workout_programs(title, goal) VALUES($1, $2) RETURNING id, title, goal',
      [title, goal]
    );

    const program = insertProgram.rows[0];
    console.log("Program created:", program); // Debugging program creation

    const programId = program.id;

    for (const ex of exercises) {
      console.log("Inserting exercise:", ex); // Debugging exercise insertion
      await client.query(
        'INSERT INTO exercises(program_id, name, reps, type) VALUES($1, $2, $3, $4)',
        [programId, ex.name, ex.reps, ex.type]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Program created successfully', program });
  } catch (err) {
    console.error("Error during program creation:", err); // Debugging error
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// DELETE a program and its exercises
app.delete('/programs/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid program ID' });
  }

  try {
    const result = await pool.query('DELETE FROM workout_programs WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Program not found' });
    }

    res.json({ message: 'Program deleted successfully' });
  } catch (err) {
    console.error("Error during program deletion:", err); // Debugging error
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

// POST add an exercise to a program
app.post('/programs/:id/exercises', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, reps, type } = req.body;

  if (!name || !reps || !type) {
    return res.status(400).json({ error: 'Name, reps, and type are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO exercises (program_id, name, reps, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, name, reps, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error during exercise addition:", err); // Debugging error
    res.status(500).json({ error: 'Failed to add exercise.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
