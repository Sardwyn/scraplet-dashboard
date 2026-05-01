/**
 * Prediction Manager
 * Handles !prediction start/end/cancel and !bet commands.
 * Integrates with loyalty_balances for point deduction/payout.
 */
import scrapbotDb from '../../scrapbotDb.js';

// Active predictions per channel (in-memory cache)
const activePredictions = new Map(); // channelId -> prediction row

export async function handlePredictionCommand(channelId, username, platform, args, sendChatFn) {
  const [subCmd, ...rest] = args;
  
  if (subCmd === 'start') {
    return startPrediction(channelId, rest.join(' '), sendChatFn);
  }
  if (subCmd === 'end') {
    return endPrediction(channelId, rest[0], sendChatFn);
  }
  if (subCmd === 'cancel') {
    return cancelPrediction(channelId, sendChatFn);
  }
}

export async function handleBetCommand(channelId, username, platform, args, sendChatFn) {
  const [optionLabel, amountStr] = args;
  const amount = parseInt(amountStr, 10);
  
  if (!optionLabel || isNaN(amount) || amount <= 0) {
    return sendChatFn(channelId, `@${username} Usage: !bet <option> <amount>`);
  }
  
  const pred = activePredictions.get(channelId);
  if (!pred || pred.status !== 'open') {
    return sendChatFn(channelId, `@${username} No active prediction right now.`);
  }
  
  const options = pred.options;
  const option = options.find(o => o.label.toLowerCase() === optionLabel.toLowerCase() || o.id === optionLabel);
  if (!option) {
    const labels = options.map(o => o.label).join(', ');
    return sendChatFn(channelId, `@${username} Invalid option. Choose: ${labels}`);
  }
  
  // Check balance
  const { rows: balRows } = await scrapbotDb.query(
    'SELECT balance FROM loyalty_balances WHERE channel_id=$1 AND username=$2 AND platform=$3',
    [channelId, username, platform]
  );
  const balance = balRows[0]?.balance ?? 0;
  if (balance < amount) {
    return sendChatFn(channelId, `@${username} Not enough points. You have ${balance}.`);
  }
  
  // Check for existing bet
  const { rows: existingBet } = await scrapbotDb.query(
    'SELECT id FROM prediction_bets WHERE prediction_id=$1 AND username=$2 AND platform=$3',
    [pred.id, username, platform]
  );
  if (existingBet.length) {
    return sendChatFn(channelId, `@${username} You already placed a bet on this prediction.`);
  }
  
  // Deduct points and record bet
  await scrapbotDb.query(
    'UPDATE loyalty_balances SET balance = balance - $1 WHERE channel_id=$2 AND username=$3 AND platform=$4',
    [amount, channelId, username, platform]
  );
  await scrapbotDb.query(
    'INSERT INTO prediction_bets (prediction_id, username, platform, option_id, amount) VALUES ($1,$2,$3,$4,$5)',
    [pred.id, username, platform, option.id, amount]
  );
  
  // Update option total
  option.total_wagered = (option.total_wagered || 0) + amount;
  await scrapbotDb.query('UPDATE predictions SET options=$1 WHERE id=$2', [JSON.stringify(options), pred.id]);
  activePredictions.set(channelId, { ...pred, options });
  
  sendChatFn(channelId, `@${username} Bet ${amount} points on "${option.label}" ✓`);
}

async function startPrediction(channelId, text, sendChatFn) {
  if (activePredictions.has(channelId)) {
    return sendChatFn(channelId, 'A prediction is already active. Use !prediction end or !prediction cancel first.');
  }
  
  // Parse: "Question | Option1 | Option2"
  const parts = text.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) {
    return sendChatFn(channelId, 'Usage: !prediction start Question | Option1 | Option2');
  }
  
  const [question, ...optionLabels] = parts;
  const options = optionLabels.map((label, i) => ({ id: String(i + 1), label, total_wagered: 0 }));
  
  const { rows } = await scrapbotDb.query(
    'INSERT INTO predictions (channel_id, question, options, status) VALUES ($1,$2,$3,$4) RETURNING *',
    [channelId, question, JSON.stringify(options), 'open']
  );
  
  activePredictions.set(channelId, rows[0]);
  const optStr = options.map((o, i) => `${i+1}. ${o.label}`).join(' | ');
  sendChatFn(channelId, `📊 Prediction: "${question}" — ${optStr} — Use !bet <option> <amount>`);
}

async function endPrediction(channelId, winningLabel, sendChatFn) {
  const pred = activePredictions.get(channelId);
  if (!pred) return sendChatFn(channelId, 'No active prediction.');
  
  const options = pred.options;
  const winner = options.find(o => o.label.toLowerCase() === winningLabel?.toLowerCase() || o.id === winningLabel);
  if (!winner) {
    return sendChatFn(channelId, `Invalid option. Choose: ${options.map(o => o.label).join(', ')}`);
  }
  
  // Get all bets
  const { rows: bets } = await scrapbotDb.query(
    'SELECT * FROM prediction_bets WHERE prediction_id=$1', [pred.id]
  );
  
  const totalPool = bets.reduce((s, b) => s + b.amount, 0);
  const winningBets = bets.filter(b => b.option_id === winner.id);
  const winningPool = winningBets.reduce((s, b) => s + b.amount, 0);
  
  // Distribute proportional payouts
  for (const bet of winningBets) {
    const payout = winningPool > 0 ? Math.floor((bet.amount / winningPool) * totalPool) : 0;
    await scrapbotDb.query(
      `INSERT INTO loyalty_balances (channel_id, username, platform, balance, total_earned)
       VALUES ($1,$2,$3,$4,$4)
       ON CONFLICT (channel_id, username, platform)
       DO UPDATE SET balance = loyalty_balances.balance + $4`,
      [channelId, bet.username, bet.platform, payout]
    );
    await scrapbotDb.query('UPDATE prediction_bets SET payout=$1 WHERE id=$2', [payout, bet.id]);
  }
  
  await scrapbotDb.query(
    'UPDATE predictions SET status=$1, winning_option_id=$2, resolved_at=NOW() WHERE id=$3',
    ['closed', winner.id, pred.id]
  );
  activePredictions.delete(channelId);
  
  sendChatFn(channelId, `🏆 Prediction ended! Winner: "${winner.label}" — ${winningBets.length} winners share ${totalPool} points`);
}

async function cancelPrediction(channelId, sendChatFn) {
  const pred = activePredictions.get(channelId);
  if (!pred) return sendChatFn(channelId, 'No active prediction.');
  
  // Refund all bets
  const { rows: bets } = await scrapbotDb.query(
    'SELECT * FROM prediction_bets WHERE prediction_id=$1', [pred.id]
  );
  for (const bet of bets) {
    await scrapbotDb.query(
      `INSERT INTO loyalty_balances (channel_id, username, platform, balance, total_earned)
       VALUES ($1,$2,$3,$4,$4)
       ON CONFLICT (channel_id, username, platform)
       DO UPDATE SET balance = loyalty_balances.balance + $4`,
      [channelId, bet.username, bet.platform, bet.amount]
    );
  }
  
  await scrapbotDb.query('UPDATE predictions SET status=$1 WHERE id=$2', ['cancelled', pred.id]);
  activePredictions.delete(channelId);
  sendChatFn(channelId, `Prediction cancelled. All ${bets.length} bets refunded.`);
}
