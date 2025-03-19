const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }
};

const isDataConsumer = (req, res, next) => {
    if (req.user && req.user.role === 'data_consumer') {
        next();
    } else {
        res.status(403).json({ error: 'Unauthorized. Data consumer access required.' });
    }
};

module.exports = {
    isAdmin,
    isDataConsumer
}; 