import fs from 'fs';
import path from 'path';

const usedPath = path.resolve('./used-codes.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { code } = req.body;
  if (!code || typeof code !== 'string' || !code.includes('-')) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  const [prefix, suffix] = code.toLowerCase().split('-');
  const limits = { v200: 200, v500: 500, v1000: 1000, v5000: 5000, unlimt: Infinity };

  if (!limits[prefix] || suffix.length !== 6) {
    return res.status(400).json({ error: 'Invalid format or code' });
  }

  // Load used codes
  let used = [];
  if (fs.existsSync(usedPath)) {
    used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
  }

  if (used.includes(code)) {
    return res.status(403).json({ error: 'Code already used' });
  }

  used.push(code);
  fs.writeFileSync(usedPath, JSON.stringify(used));

  res.status(200).json({ max: limits[prefix] });
}
