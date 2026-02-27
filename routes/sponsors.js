import express from 'express';
import multer from 'multer';
import path from 'path';
import db from '../db.js';
import { v4 as uuid } from 'uuid';

const router = express.Router();

const storage = multer.diskStorage({
  destination: 'public/uploads/sponsors',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({ storage });

router.post('/:id/banner', upload.single('banner'), async (req, res) => {
  const sponsorId = req.params.id;
  const bannerPath = `/uploads/sponsors/${req.file.filename}`;

  await db.query(
    'UPDATE sponsors SET banner_url = $1 WHERE id = $2',
    [bannerPath, sponsorId]
  );

  res.redirect('/profile/configure');
});

export default router;
