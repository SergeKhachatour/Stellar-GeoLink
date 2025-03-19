const crypto = require('crypto');

const validateSignature = (req, res, next) => {
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];
    
    if (!signature || !timestamp) {
        return res.status(401).json({ error: 'Missing signature headers' });
    }

    const payload = JSON.stringify(req.body) + timestamp;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.SIGNING_SECRET)
        .update(payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
};

module.exports = { validateSignature }; 