const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticateUser = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // If no token, user is not authenticated but we'll let the route handler decide what to do
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Fetch user's public key from database
        const result = await pool.query(
            'SELECT public_key FROM users WHERE id = $1',
            [decoded.user.id]
        );
        
        if (result.rows.length > 0) {
            req.user = {
                ...decoded.user,
                public_key: result.rows[0].public_key
            };
        } else {
            req.user = decoded.user;
        }
        
        next();
    } catch (err) {
        // Invalid token, but we'll let the route handler decide what to do
        req.user = null;
        next();
    }
};

const authenticateAdmin = async (req, res, next) => {
    try {
        // First run the normal user authentication
        await authenticateUser(req, res, async () => {
            // Then check if the user is an admin
            if (req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Access denied. Admin rights required.' });
            }
            next();
        });
    } catch (error) {
        res.status(401).json({ message: 'Authentication failed' });
    }
};

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        next();
    };
};

module.exports = { 
    authenticateUser, 
    authenticateAdmin,
    requireAuth,
    requireRole 
}; 