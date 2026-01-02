const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for video field'));
      }
    } else if (file.fieldname === 'image') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for image field'));
      }
    } else {
      cb(new Error('Unknown field'));
    }
  }
});

// Create new recipe
router.post('/', authenticateToken, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  const {
    title,
    description,
    ingredients,
    instructions,
    cookingTime,
    servings,
    difficulty,
    visibility,
    tags
  } = req.body;

  if (!title || !ingredients || !instructions) {
    return res.status(400).json({ message: 'Title, ingredients, and instructions are required' });
  }

  const videoPath = req.files?.video ? req.files.video[0].filename : null;
  const imagePath = req.files?.image ? req.files.image[0].filename : null;

  const db = getDatabase();

  db.run(
    `INSERT INTO recipes (
      userId, title, description, ingredients, instructions, 
      videoPath, imagePath, cookingTime, servings, difficulty, visibility, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      title,
      description || '',
      ingredients,
      instructions,
      videoPath,
      imagePath,
      parseInt(cookingTime) || null,
      parseInt(servings) || null,
      difficulty || 'medium',
      visibility || 'public',
      tags || ''
    ],
    function(err) {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Error creating recipe' });
      }

      const recipeId = this.lastID;

      // Get the created recipe with user info
      db.get(
        `SELECT r.*, u.username, u.fullName, u.profileImage
         FROM recipes r
         JOIN users u ON r.userId = u.id
         WHERE r.id = ?`,
        [recipeId],
        (err, recipe) => {
          db.close();
          
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Error fetching created recipe' });
          }

          res.status(201).json({
            message: 'Recipe created successfully',
            recipe: {
              ...recipe,
              likeCount: 0,
              commentCount: 0,
              isLiked: false
            }
          });
        }
      );
    }
  );
});

// Get recipes (with pagination and filtering)
router.get('/', (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    tags,
    difficulty,
    userId,
    following,
    visibility = 'public'
  } = req.query;

  const offset = (page - 1) * limit;
  let query = `
    SELECT r.*, u.username, u.fullName, u.profileImage,
           COUNT(DISTINCT l.id) as likeCount,
           COUNT(DISTINCT c.id) as commentCount
    FROM recipes r
    JOIN users u ON r.userId = u.id
    LEFT JOIN likes l ON r.id = l.recipeId
    LEFT JOIN comments c ON r.id = c.recipeId
  `;
  
  const conditions = [];
  const params = [];

  // Visibility filter
  if (req.headers.authorization) {
    // If user is authenticated, they can see friends' recipes too
    const token = req.headers.authorization.split(' ')[1];
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      if (following === 'true') {
        // Show only recipes from users they follow
        query += ` JOIN followers f ON r.userId = f.followingId `;
        conditions.push('f.followerId = ?');
        params.push(decoded.id);
      } else {
        // Show public recipes and friends' recipes
        conditions.push('(r.visibility = ? OR (r.visibility = ? AND EXISTS (SELECT 1 FROM followers WHERE followerId = ? AND followingId = r.userId)) OR r.userId = ?)');
        params.push('public', 'friends', decoded.id, decoded.id);
      }
    } catch (error) {
      conditions.push('r.visibility = ?');
      params.push('public');
    }
  } else {
    conditions.push('r.visibility = ?');
    params.push('public');
  }

  // Search filter
  if (search) {
    conditions.push('(r.title LIKE ? OR r.description LIKE ? OR r.ingredients LIKE ? OR r.tags LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Tags filter
  if (tags) {
    conditions.push('r.tags LIKE ?');
    params.push(`%${tags}%`);
  }

  // Difficulty filter
  if (difficulty) {
    conditions.push('r.difficulty = ?');
    params.push(difficulty);
  }

  // User filter
  if (userId) {
    conditions.push('r.userId = ?');
    params.push(userId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += `
    GROUP BY r.id, u.id
    ORDER BY r.createdAt DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(parseInt(limit), parseInt(offset));

  const db = getDatabase();

  db.all(query, params, (err, recipes) => {
    if (err) {
      console.error(err);
      db.close();
      return res.status(500).json({ message: 'Database error' });
    }

    // If user is authenticated, check if they liked each recipe
    if (req.headers.authorization) {
      const token = req.headers.authorization.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
        
        if (recipes.length > 0) {
          const recipeIds = recipes.map(r => r.id).join(',');
          db.all(
            `SELECT recipeId FROM likes WHERE userId = ? AND recipeId IN (${recipeIds})`,
            [decoded.id],
            (err, likes) => {
              db.close();
              
              if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Database error' });
              }

              const likedRecipeIds = likes.map(l => l.recipeId);
              const recipesWithLikes = recipes.map(recipe => ({
                ...recipe,
                isLiked: likedRecipeIds.includes(recipe.id)
              }));

              res.json({ recipes: recipesWithLikes });
            }
          );
        } else {
          db.close();
          res.json({ recipes: [] });
        }
      } catch (error) {
        db.close();
        res.json({ recipes: recipes.map(recipe => ({ ...recipe, isLiked: false })) });
      }
    } else {
      db.close();
      res.json({ recipes: recipes.map(recipe => ({ ...recipe, isLiked: false })) });
    }
  });
});

// Get single recipe
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  db.get(
    `SELECT r.*, u.username, u.fullName, u.profileImage,
            COUNT(DISTINCT l.id) as likeCount,
            COUNT(DISTINCT c.id) as commentCount
     FROM recipes r
     JOIN users u ON r.userId = u.id
     LEFT JOIN likes l ON r.id = l.recipeId
     LEFT JOIN comments c ON r.id = c.recipeId
     WHERE r.id = ?
     GROUP BY r.id`,
    [id],
    (err, recipe) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (!recipe) {
        db.close();
        return res.status(404).json({ message: 'Recipe not found' });
      }

      // Check if user is authenticated and if they liked this recipe
      let isLiked = false;
      if (req.headers.authorization) {
        const token = req.headers.authorization.split(' ')[1];
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
          
          db.get(
            'SELECT id FROM likes WHERE userId = ? AND recipeId = ?',
            [decoded.id, id],
            (err, like) => {
              db.close();
              
              if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Database error' });
              }

              res.json({ recipe: { ...recipe, isLiked: !!like } });
            }
          );
        } catch (error) {
          db.close();
          res.json({ recipe: { ...recipe, isLiked: false } });
        }
      } else {
        db.close();
        res.json({ recipe: { ...recipe, isLiked: false } });
      }
    }
  );
});

// Like/Unlike recipe
router.post('/:id/like', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const db = getDatabase();

  // Check if already liked
  db.get(
    'SELECT id FROM likes WHERE userId = ? AND recipeId = ?',
    [userId, id],
    (err, existing) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (existing) {
        // Unlike
        db.run(
          'DELETE FROM likes WHERE userId = ? AND recipeId = ?',
          [userId, id],
          function(err) {
            db.close();
            
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Database error' });
            }

            res.json({ message: 'Recipe unliked', isLiked: false });
          }
        );
      } else {
        // Like
        db.run(
          'INSERT INTO likes (userId, recipeId) VALUES (?, ?)',
          [userId, id],
          function(err) {
            db.close();
            
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Database error' });
            }

            res.json({ message: 'Recipe liked', isLiked: true });
          }
        );
      }
    }
  );
});

// Add comment to recipe
router.post('/:id/comments', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ message: 'Comment content is required' });
  }

  const db = getDatabase();

  db.run(
    'INSERT INTO comments (userId, recipeId, content) VALUES (?, ?, ?)',
    [userId, id, content.trim()],
    function(err) {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      const commentId = this.lastID;

      // Get the created comment with user info
      db.get(
        `SELECT c.*, u.username, u.fullName, u.profileImage
         FROM comments c
         JOIN users u ON c.userId = u.id
         WHERE c.id = ?`,
        [commentId],
        (err, comment) => {
          db.close();
          
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Database error' });
          }

          res.status(201).json({ message: 'Comment added', comment });
        }
      );
    }
  );
});

// Get comments for recipe
router.get('/:id/comments', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  db.all(
    `SELECT c.*, u.username, u.fullName, u.profileImage
     FROM comments c
     JOIN users u ON c.userId = u.id
     WHERE c.recipeId = ?
     ORDER BY c.createdAt DESC`,
    [id],
    (err, comments) => {
      db.close();
      
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Database error' });
      }

      res.json({ comments });
    }
  );
});

// Update recipe
router.put('/:id', authenticateToken, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    ingredients,
    instructions,
    cookingTime,
    servings,
    difficulty,
    visibility,
    tags
  } = req.body;

  const db = getDatabase();

  // First, check if the recipe belongs to the user
  db.get(
    'SELECT * FROM recipes WHERE id = ? AND userId = ?',
    [id, req.user.id],
    (err, recipe) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (!recipe) {
        db.close();
        return res.status(404).json({ message: 'Recipe not found or access denied' });
      }

      const videoPath = req.files?.video ? req.files.video[0].filename : recipe.videoPath;
      const imagePath = req.files?.image ? req.files.image[0].filename : recipe.imagePath;

      db.run(
        `UPDATE recipes SET 
         title = ?, description = ?, ingredients = ?, instructions = ?,
         videoPath = ?, imagePath = ?, cookingTime = ?, servings = ?,
         difficulty = ?, visibility = ?, tags = ?
         WHERE id = ?`,
        [
          title || recipe.title,
          description !== undefined ? description : recipe.description,
          ingredients || recipe.ingredients,
          instructions || recipe.instructions,
          videoPath,
          imagePath,
          cookingTime ? parseInt(cookingTime) : recipe.cookingTime,
          servings ? parseInt(servings) : recipe.servings,
          difficulty || recipe.difficulty,
          visibility || recipe.visibility,
          tags !== undefined ? tags : recipe.tags,
          id
        ],
        function(err) {
          if (err) {
            console.error(err);
            db.close();
            return res.status(500).json({ message: 'Error updating recipe' });
          }

          // Get the updated recipe
          db.get(
            `SELECT r.*, u.username, u.fullName, u.profileImage
             FROM recipes r
             JOIN users u ON r.userId = u.id
             WHERE r.id = ?`,
            [id],
            (err, updatedRecipe) => {
              db.close();
              
              if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Error fetching updated recipe' });
              }

              res.json({ message: 'Recipe updated successfully', recipe: updatedRecipe });
            }
          );
        }
      );
    }
  );
});

// Delete recipe
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const db = getDatabase();

  // First, check if the recipe belongs to the user and get file paths
  db.get(
    'SELECT videoPath, imagePath FROM recipes WHERE id = ? AND userId = ?',
    [id, req.user.id],
    (err, recipe) => {
      if (err) {
        console.error(err);
        db.close();
        return res.status(500).json({ message: 'Database error' });
      }

      if (!recipe) {
        db.close();
        return res.status(404).json({ message: 'Recipe not found or access denied' });
      }

      // Delete the recipe
      db.run('DELETE FROM recipes WHERE id = ?', [id], function(err) {
        db.close();
        
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Error deleting recipe' });
        }

        // Delete associated files
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (recipe.videoPath) {
          const videoFilePath = path.join(uploadsDir, recipe.videoPath);
          if (fs.existsSync(videoFilePath)) {
            fs.unlinkSync(videoFilePath);
          }
        }
        if (recipe.imagePath) {
          const imageFilePath = path.join(uploadsDir, recipe.imagePath);
          if (fs.existsSync(imageFilePath)) {
            fs.unlinkSync(imageFilePath);
          }
        }

        res.json({ message: 'Recipe deleted successfully' });
      });
    }
  );
});

module.exports = router;
