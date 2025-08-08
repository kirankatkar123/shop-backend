// server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const multer = require('multer');
const streamifier = require('streamifier');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MySQL connection (env-driven)
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Connect DB
db.connect(err => {
  if (err) {
    console.error('MySQL connection error:', err);
    // don't exit here if you prefer to allow the app to start for debugging
  } else {
    console.log('✅ MySQL Connected');
  }
});

// Use memory storage so multer gives us a buffer (we'll stream to Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// ---------- ROUTES ----------

// Get categories
app.get('/categories', (req, res) => {
  db.query('SELECT * FROM categories', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Add category
app.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Category name is required' });

  db.query('INSERT INTO categories (name) VALUES (?)', [name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId, name });
  });
});

// Upload product (image streamed to Cloudinary)
app.post('/products', upload.single('image'), (req, res) => {
  const { title, description, price, category_id } = req.body;

  function insertProduct(imageUrl) {
    db.query(
      'INSERT INTO products (title, description, price, image, category_id) VALUES (?, ?, ?, ?, ?)',
      [title, description, price || 0, imageUrl, category_id || null],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Product added successfully' });
      }
    );
  }

  if (req.file && req.file.buffer) {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: process.env.CLOUDINARY_FOLDER || 'shop_products' },
      (error, result) => {
        if (error) return res.status(500).json({ error });
        insertProduct(result.secure_url);
      }
    );
    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  } else {
    // no image supplied
    insertProduct(null);
  }
});

// Get products (with category name)
app.get('/products', (req, res) => {
  db.query(
    'SELECT p.*, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id',
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
