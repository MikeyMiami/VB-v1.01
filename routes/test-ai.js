const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('Test AI route is working!');
});

module.exports = router;
