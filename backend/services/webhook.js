const axios = require('axios');

const sendWebhook = async (url, data) => {
    try {
        await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 5000
        });
        return true;
    } catch (error) {
        console.error('Webhook delivery failed:', error);
        return false;
    }
};

module.exports = { sendWebhook }; 