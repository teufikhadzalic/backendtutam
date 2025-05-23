const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// PLEASE JUST WORKK bro
app.use(cors());
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


// Root endpoint
app.get('/', (req, res) => {
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

// GETall workout programs with exercises
app.get('/programs', async (req, res) => {
  try {
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

    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// POST create wo program
app.post('/programs', async (req, res) => {
  const { title, goal, exercises } = req.body;

  console.log("Request body:", req.body); // Log data yang diterima

  if (!title || !goal || !Array.isArray(exercises)) {
    console.error("Invalid input:", { title, goal, exercises }); // Log input tidak valid
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
    console.log("Program created:", program); // Log program yang dibuat

    const programId = program.id;

    for (const ex of exercises) {
      console.log("Inserting exercise:", ex); // Log setiap exercise
      await client.query(
        'INSERT INTO exercises(program_id, name, reps, type) VALUES($1, $2, $3, $4)',
        [programId, ex.name, ex.reps, ex.type]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Program created successfully', program });
  } catch (err) {
    console.error("Error during program creation:", err); // Log error
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// DELETE a program and its exercises
app.delete('/programs/:id', async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

// POST add an exercise to a program
app.post('/programs/:id/exercises', async (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Failed to add exercise.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
