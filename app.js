const express = require('express');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = parseInt(process.env.PORT || '422', 10);
const FORMBAR_ADDRESS = process.env.FORMBAR_ADDRESS || 'http://localhost:420';
const PUBLIC_KEY = process.env.PUBLIC_KEY || '';
const app = express();
const server = http.createServer(app);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
    res.render('index', {
        config: {
            FORMBAR_ADDRESS,
            HAS_PUBLIC_KEY: Boolean(PUBLIC_KEY),
        }
    });
});

async function sendTransfer(payload) {
    // Send the transfer request to Formbar
    const transferURL = `${FORMBAR_ADDRESS}/api/digipogs/transfer`;
    const res = await fetch(transferURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
    });

    // Parse the response and return it
    const text = await res.text();
    const json = JSON.parse(text);
    return { status: res.status, json };
}

app.post('/transfer', async (req, res) => {
    try {
        // Validate input
        const { from, to, amount, pin, reason } = req.body || {};
        if (!from || !to || !amount || pin == null) {
            res.status(400).json({ ok: false, error: 'Missing required fields' });
            return;
        }

        // Prepare the payload that will be sent to Formbar
        const payload = {
            from: Number(from),
            to: Number(to),
            amount: Number(amount),
            pin: Number(pin),
            reason: String(reason || 'Transfer'),
        };

        // Send the transfer request and check if the response is valid
        const { status, json } = await sendTransfer(payload);
        const token = json?.token;
        if (!token) {
            res.status(status).json({ ok: false, error: 'Invalid response from Formbar API (no token)', response: json });
            return;
        }

        // Decode and verify the JWT token if we have a public key
        // If no public key is set, we just decode it without verification
        let decoded;
        if (PUBLIC_KEY) {
            try {
                decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
            } catch (e) {
                res.status(200).json({ ok: false, error: 'JWT verify failed', token });
                return;
            }
        } else {
            try { decoded = jwt.decode(token); } catch {}
        }

        // Return the result
        res.status(200).json({ ok: Boolean(decoded?.success), message: decoded?.message || null, token, decoded });
    } catch (err) {
        res.status(502).json({ ok: false, error: 'HTTP request to Formbar failed', details: err?.message || String(err) });
    }
});

server.listen(PORT, () => {
    console.log(`DigipogTester running at http://localhost:${PORT}`);
    console.log(`Formbar address: ${FORMBAR_ADDRESS}`);
    console.log(`Public key loaded: ${Boolean(PUBLIC_KEY)}`);
});


