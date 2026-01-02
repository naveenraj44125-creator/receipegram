const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user profile by username
router.get('/:username', (req, res) => {
  const db = getDatabase();
  const { username } = req.params;

  db.get(
    'SELECT id, username, email, fullName, bio, profileImage, createdAt FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) {
        db.close();
        return res.status(404).json({ message: 'User not found' });
      }

      // Get user's recipes count
      db.get(
        'SELECT COUNT(*) as recipeCount FROM recipes WHERE userId = ?',
        [user.id],
        (err, recipeResult) => {
          if (err) {
            console.error(err);
            db.close();
            return res.status(500).json({ message: 'Database error' });
          }

          // Get followers count
          db.get(
            'SELECT COUNT(*) as followersCount FROM followers WHERE followingId = ?',
            [user.id],
            (err, followersResult) => {
              if (err) {
                console.error(err);
                db.close();
                return res.status(500).json({ message: 'Database error' });
              }

              // Get following count
              db.get(
                'SELECT COUNT(*) as followingCount FROM followers WHERE followerId = ?',
                [user.id],
                (err, followingResult) => {
                  db.close();
                  
                  if (err) {
                    console.error(err);
                    return res.status(500).json({ message: 'Database error' });
                  }

                  res.json({
                    user: {
                      ...user,
                      recipeCount: recipeResult.recipeCount,
                      followersCount: followersResult.followersCount,
                      followingCount: followingResult.followingCount
                    }
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// Follow/Unfollow user
router.post('/:userId/follow', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.id;
  const followingId = parseInt(userId);

  if (followerId === followingId) {
    return res.status(400).json({ message: 'Cannot follow yourself' });
  }

  const db = getDatabase();

  // Check if already following
  db.get(
    'SELECT id FROM followers WHERE followerId = ? AND followingId = ?',
    [followerId, followingId],
    (err, existing) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (existing) {
        // Unfollow
        db.run(
          'DELETE FROM followers WHERE followerId = ? AND followingId = ?',
          [followerId, followingId],
          function(err) {
            db.close();
            
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Database error' });
            }

            res.json({ message: 'Unfollowed successfully', isFollowing: false });
          }
        );
      } else {
        // Follow
        db.run(
          'INSERT INTO followers (followerId, followingId) VALUES (?, ?)',
          [followerId, followingId],
          function(err) {
            db.close();
            
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Database error' });
            }

            res.json({ message: 'Followed successfully', isFollowing: true });
          }
        );
      }
    }
  );
});

// Check if following a user
router.get('/:userId/following-status', authenticateToken, (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.id;
  const followingId = parseInt(userId);

  const db = getDatabase();

  db.get(
    'SELECT id FROM followers WHERE followerId = ? AND followingId = ?',
    [followerId, followingId],
    (err, result) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({ isFollowing: !!result });
    }
  );
});

// Get user's followers
router.get('/:userId/followers', (req, res) => {
  const { userId } = req.params;
  const db = getDatabase();

  db.all(
    `SELECT u.id, u.username, u.fullName, u.profileImage 
     FROM followers f 
     JOIN users u ON f.followerId = u.id 
     WHERE f.followingId = ?
     ORDER BY f.createdAt DESC`,
    [userId],
    (err, followers) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({ followers });
    }
  );
});

// Get users that a user is following
router.get('/:userId/following', (req, res) => {
  const { userId } = req.params;
  const db = getDatabase();

  db.all(
    `SELECT u.id, u.username, u.fullName, u.profileImage 
     FROM followers f 
     JOIN users u ON f.followingId = u.id 
     WHERE f.followerId = ?
     ORDER BY f.createdAt DESC`,
    [userId],
    (err, following) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({ following });
    }
  );
});

// Search users
router.get('/search/:query', (req, res) => {
  const { query } = req.params;
  const db = getDatabase();

  db.all(
    `SELECT id, username, fullName, profileImage, bio 
     FROM users 
     WHERE username LIKE ? OR fullName LIKE ?
     LIMIT 20`,
    [`%${query}%`, `%${query}%`],
    (err, users) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({ users });
    }
  );
});

module.exports = router;
