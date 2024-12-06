const express = require('express');
const mysql = require('../db');
const router = express.Router();

// Get All Users
router.get('/', async (req, res) => {
    const [rows] = await mysql.query('SELECT * FROM users');
    res.json(rows);
});

// Get User by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const [rows] = await mysql.query('SELECT * FROM users WHERE id = ?', [id]);
    res.json(rows);
});

// Create User
router.post('/', async (req, res) => {
    const { name, email } = req.body;
    await mysql.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    res.json({ message: 'User created' });
});

// Delete User
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    await mysql.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted' });
});

module.exports = router;
