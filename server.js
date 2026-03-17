const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve all static files (HTML, CSS, JS) from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`StudySync running on port ${PORT}`);
});
