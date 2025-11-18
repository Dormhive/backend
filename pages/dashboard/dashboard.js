// backend/pages/dashboard/dashboard.js
const express = require('express');
const router = express.Router();

// This is a placeholder. In a real app, you'd add JWT middleware
// to protect this route and only allow logged-in users.
router.get('/', (req, res) => {
    // 9. After successful login, redirect to a Dashboard page
    // The *frontend* will handle the redirect. This API just provides data.
    res.status(200).json({
        message: "Welcome to your Dashboard!"
    });
});

module.exports = router;
