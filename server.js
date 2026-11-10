
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// LICENSE DATABASE (Use a real DB in production)
// ============================================
const licenses = {
    "ASAD-XXXX-1234-ABCD": {
        user: "User1",
        active: true,
        expiresAt: "2027-06-01",       // License expiry date
        maxDevices: 1,                   // Max devices allowed
        activeDevices: [],               // Track device fingerprints
        createdAt: "2026-11-10"
    },
    "ASAD-XXXX-5678-EFGH": {
        user: "User2",
        active: true,
        expiresAt: "2027-01-01",
        maxDevices: 1,
        activeDevices: [],
        createdAt: "2026-11-10"
    }
};

// ============================================
// MIDDLEWARE: Rate Limiting (simple in-memory)
// ============================================
const rateLimitMap = {};
function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
    
    // Keep only requests from last 1 minute
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
    
    if (rateLimitMap[ip].length >= 30) {
        return res.status(429).json({ valid: false, error: "Too many requests" });
    }
    rateLimitMap[ip].push(now);
    next();
}

// ============================================
// ROUTE: Validate License
// ============================================
app.post('/api/validate', rateLimit, (req, res) => {
    const { licenseKey, deviceFingerprint } = req.body;

    if (!licenseKey || !deviceFingerprint) {
        return res.status(400).json({ valid: false, error: "Missing parameters" });
    }

    const license = licenses[licenseKey];

    // 1. Check if license exists
    if (!license) {
        return res.status(403).json({ valid: false, error: "Invalid license key" });
    }

    // 2. Check if license is active
    if (!license.active) {
        return res.status(403).json({ valid: false, error: "License has been revoked" });
    }

    // 3. Check if license has expired
    if (new Date(license.expiresAt) < new Date()) {
        return res.status(403).json({ valid: false, error: "License has expired" });
    }

    // 4. Check device limit
    if (!license.activeDevices.includes(deviceFingerprint)) {
        if (license.activeDevices.length >= license.maxDevices) {
            return res.status(403).json({ 
                valid: false, 
                error: "Device limit reached. Deactivate another device first." 
            });
        }
        license.activeDevices.push(deviceFingerprint);
    }

    // 5. All checks passed — generate a session token
    const sessionToken = crypto.randomBytes(32).toString('hex');

    return res.json({
        valid: true,
        user: license.user,
        expiresAt: license.expiresAt,
        token: sessionToken
    });
});

// ============================================
// ROUTE: Serve the Protected Script
// ============================================
app.get('/api/script', rateLimit, (req, res) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('// Unauthorized');
    }

    // In production, validate the token properly (JWT, DB lookup, etc.)
    // For now, we just check it exists

    // Return the actual script code (obfuscated in production)
    const scriptCode = `
        // ========== YOUR ACTUAL SCRIPT LOGIC ==========
        (function() {
            console.log("✅ Authenticated! Script is running.");

            // --- Your automation logic goes here ---
            // Example: Auto-fill forms, scrape data, etc.

            function mainLogic() {
                console.log("Main script logic executing...");
                // Add your actual Tampermonkey logic here
            }

            mainLogic();
        })();
    `;

    res.setHeader('Content-Type', 'application/javascript');
    res.send(scriptCode);
});

// ============================================
// ADMIN ROUTE: Revoke a License
// ============================================
app.post('/admin/revoke', (req, res) => {
    const { adminSecret, licenseKey } = req.body;

    // Simple admin auth (use proper auth in production)
    if (adminSecret !== "YOUR_ADMIN_SECRET") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    if (licenses[licenseKey]) {
        licenses[licenseKey].active = false;
        licenses[licenseKey].activeDevices = [];
        return res.json({ success: true, message: `License ${licenseKey} revoked` });
    }

    return res.status(404).json({ error: "License not found" });
});

// ============================================
// ADMIN ROUTE: List All Licenses
// ============================================
app.get('/admin/licenses', (req, res) => {
    const { adminSecret } = req.query;

    if (adminSecret !== "YOUR_ADMIN_SECRET") {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const summary = Object.entries(licenses).map(([key, data]) => ({
        licenseKey: key,
        user: data.user,
        active: data.active,
        expiresAt: data.expiresAt,
        devicesUsed: data.activeDevices.length,
        maxDevices: data.maxDevices
    }));

    return res.json(summary);
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`License server running on port ${PORT}`);
});

