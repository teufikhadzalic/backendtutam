const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
  ssl: process.env.PG_CONNECTION_STRING?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

app.get('/', (req, res) => {
  res.send('MentzerTrack Backend is running!');
});

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
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

app.post('/programs', async (req, res) => {
  const { title, goal, exercises } = req.body;

  if (!title || !goal || !Array.isArray(exercises)) {
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
    const programId = program.id;

    for (const ex of exercises) {
      await client.query(
        'INSERT INTO exercises(program_id, name, reps, type) VALUES($1, $2, $3, $4)',
        [programId, ex.name, ex.reps, ex.type]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.status(201).json({ message: 'Program created successfully', program });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create program' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
