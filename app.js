const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const s3 = new S3Client({ region: 'ap-south-1' });

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'mysql-db',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'redhat',
  database: process.env.DB_NAME || 'movie_db',
});
const cors = require('cors');
app.use(cors());

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    throw err;
  }
  console.log('Connected to the database');
});

const createTable = `
  CREATE TABLE IF NOT EXISTS movies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    image_url VARCHAR(255) NOT NULL,
    video_url VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    description TEXT,
    rating DECIMAL(3, 1),
    founded_year INT
  )
`;

db.query(createTable, (err) => {
  if (err) {
    console.error("Error creating Recipe table:", err);
  } else {
    console.log("Recipe table created or already exists");
  }
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png' && ext !== '.mp4') {
      return cb(new Error('Only images and video files are allowed'));
    }
    cb(null, true);
  },
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

// Helper function to upload files to S3
const uploadToS3 = async (fileBuffer, fileName, contentType) => {
  const uploadParams = {
    Bucket: 'moviebucketsudhanshuvlog',
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(uploadParams);
  await s3.send(command);
  return `https://${uploadParams.Bucket}.s3.amazonaws.com/${fileName}`;
};

// Register a new recipe
app.post('/recipe', (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: err.message });
    }

    const { title, country, description, rating, founded_year } = req.body;

    try {
      const image = req.files.image[0];
      const video = req.files.video[0];

      const imageFileName = `${uuidv4()}${path.extname(image.originalname)}`;
      const videoFileName = `${uuidv4()}${path.extname(video.originalname)}`;

      const imageUrl = await uploadToS3(image.buffer, imageFileName, image.mimetype);
      const videoUrl = await uploadToS3(video.buffer, videoFileName, video.mimetype);

      const sql = `INSERT INTO movies (image_url, video_url, title, genre, description, rating, founded_year) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const values = [imageUrl, videoUrl, title, country, description, rating, founded_year];

      db.query(sql, values, (err, result) => {
        if (err) {
          console.error('Error inserting movie:', err);
          res.status(500).json({ error: 'Internal Server Error' });
        } else {
          res.status(201).json({ message: 'Movie registered successfully', movieId: result.insertId });
        }
      });
    } catch (error) {
      console.error('Error uploading to S3:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
});

// Fetch all recipes
app.get('/recipes', (req, res) => {
  db.query('SELECT * FROM movies', (err, rows) => {
    if (err) {
      console.error('Error fetching recipes:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(200).json(rows);
    }
  });
});

// Fetch a movie by ID
app.get('/recipes/:id', (req, res) => {
  const recipeId = req.params.id;

  db.query('SELECT * FROM recipes WHERE id = ?', [recipeId], (err, row) => {
    if (err) {
      console.error('Error fetching recipe:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else if (row.length === 0) {
      res.status(404).json({ error: 'recipe not found' });
    } else {
      res.status(200).json(row[0]);
    }
  });
});

// Search movies
app.get('/recipe/search', (req, res) => {
  const { query } = req.query;
  const searchQuery = `%${query}%`;

  const searchSql = 'SELECT * FROM recipes WHERE title LIKE ? OR genre LIKE ?';
  const searchValues = [searchQuery, searchQuery];

  db.query(searchSql, searchValues, (err, rows) => {
    if (err) {
      console.error('Error searching recipes:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(200).json(rows);
    }
  });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app; // Export for testing

