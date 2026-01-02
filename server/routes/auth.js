const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  const { username, email, password, fullName } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  const db = getDatabase();

  try {
    // Check if user already exists
    db.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, existingUser) => {
        if (err) {
          console.error(err);
          db.close();
          return res.status(500).json({ message: 'Database error' });
        }

        if (existingUser) {
          db.close();
          return res.status(400).json({ message: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        db.run(
          'INSERT INTO users (username, email, password, fullName) VALUES (?, ?, ?, ?)',
          [username, email, hashedPassword, fullName || ''],
          function(err) {
            if (err) {
              console.error(err);
              db.close();
              return res.status(500).json({ message: 'Error creating user' });
            }

            const userId = this.lastID;
            const token = generateToken({ id: userId, username, email });

            db.close();
            res.status(201).json({
              message: 'User created successfully',
              token,
              user: { id: userId, username, email, fullName: fullName || '' }
            });
          }
        );
      }
    );
  } catch (error) {
    console.error(error);
    db.close();
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const db = getDatabase();

  db.get(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    [username, username],
    async (err, user) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) {
        db.close();
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      try {
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
          db.close();
          return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = generateToken(user);
        
        db.close();
        res.json({
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            bio: user.bio,
            profileImage: user.profileImage
          }
        });
      } catch (error) {
        console.error(error);
        db.close();
        res.status(500).json({ message: 'Server error' });
      }
    }
  );
});

// Get current user profile
router.get('/profile', authenticateToken, (req, res) => {
  const db = getDatabase();

  db.get(
    'SELECT id, username, email, fullName, bio, profileImage, createdAt FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ user });
    }
  );
});

// Update user profile
router.put('/profile', authenticateToken, (req, res) => {
  const { fullName, bio } = req.body;
  const db = getDatabase();

  db.run(
    'UPDATE users SET fullName = ?, bio = ? WHERE id = ?',
    [fullName || '', bio || '', req.user.id],
    function(err) {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      db.get(
        'SELECT id, username, email, fullName, bio, profileImage FROM users WHERE id = ?',
        [req.user.id],
        (err, user) => {
          db.close();
          
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Database error' });
          }

          res.json({ message: 'Profile updated successfully', user });
        }
      );
    }
  );
});

module.exports = router;
