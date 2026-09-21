const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ['GET', 'POST'] }
});

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function makeDefaultData() {
  return {
    users: [
      { id: 'usr_1', username: 'Ксения', balance: 150, firstPassChar: '7', avatar: '🎨', role: 'Клиент' },
      { id: 'usr_2', username: 'Александр', balance: 0, firstPassChar: '1', avatar: '🛠️', role: 'Мастер 3D' },
      { id: 'usr_3', username: 'ПринтКрафт_Дево', balance: 500, firstPassChar: '9', avatar: '👑', role: 'VIP' }
    ],
    chatMessages: [
      { id: 'c1', username: 'Админ', text: 'Добро пожаловать в чат ПРИНТКРАФТ! Задавайте вопросы по заказам.', avatar: '👑', isAdmin: true, time: '12:00' }
    ],
    reviews: []
  };
}

function loadData() {
  const fallback = makeDefaultData();
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf8');
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : fallback.users,
      chatMessages: Array.isArray(parsed.chatMessages) ? parsed.chatMessages : fallback.chatMessages,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : fallback.reviews
    };
  } catch (error) {
    console.error('Ошибка чтения db.json:', error.message);
    return fallback;
  }
}

function saveData(data) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    console.error('Ошибка записи db.json:', error.message);
  }
}

function cleanText(value, maxLength = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

let db = loadData();

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString(), totalUsers: db.users.length });
});
app.get('/api/users', (req, res) => res.json(db.users));
app.get('/api/reviews', (req, res) => res.json(db.reviews));
app.get('/api/chat', (req, res) => res.json(db.chatMessages));

io.on('connection', (socket) => {
  console.log(`[PrintCraft] Клиент подключился: ${socket.id}`);
  socket.emit('init_data', { users: db.users, chatMessages: db.chatMessages, reviews: db.reviews });

  socket.on('user_auth', (data = {}) => {
    const username = cleanText(data.username, 40);
    if (!username) return socket.emit('auth_error', 'Введите имя пользователя');
    let user = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      user = { id: `usr_${Date.now()}`, username, balance: 0, firstPassChar: cleanText(data.firstPassChar, 1) || '1', avatar: cleanText(data.avatar, 8) || '⚡', role: 'Клиент' };
      db.users.push(user);
    } else {
      if (data.firstPassChar) user.firstPassChar = cleanText(data.firstPassChar, 1);
      if (data.avatar) user.avatar = cleanText(data.avatar, 8);
    }
    saveData(db);
    socket.emit('auth_success', user);
    io.emit('users_updated', db.users);
  });

  socket.on('admin_change_balance', ({ userId, delta } = {}) => {
    const user = db.users.find((item) => item.id === userId);
    const amount = Number(delta);
    if (!user || !Number.isFinite(amount)) return;
    user.balance = Math.max(0, Number(user.balance) + amount);
    saveData(db);
    io.emit('users_updated', db.users);
    io.emit('balance_changed', { userId: user.id, newBalance: user.balance });
  });

  socket.on('send_message', (data = {}) => {
    const username = cleanText(data.username, 40);
    const text = cleanText(data.text, 1000);
    if (!username || !text) return socket.emit('message_error', 'Сообщение не может быть пустым');
    const message = { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, username, avatar: cleanText(data.avatar, 8) || '⚡', text, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), isAdmin: username.toLowerCase() === 'админ' };
    db.chatMessages.push(message);
    if (db.chatMessages.length > 500) db.chatMessages = db.chatMessages.slice(-500);
    saveData(db);
    io.emit('new_message', message);
  });

  socket.on('submit_review', (data = {}) => {
    const username = cleanText(data.username, 40);
    const text = cleanText(data.text, 1000);
    const rating = Math.min(5, Math.max(1, Number(data.rating) || 5));
    if (!username || !text) return socket.emit('review_error', 'Заполните имя и текст отзыва');
    const review = { id: `r_${Date.now()}`, username, rating, text };
    db.reviews.unshift(review);
    saveData(db);
    io.emit('new_review', review);
  });

  socket.on('disconnect', () => console.log(`[PrintCraft] Клиент отключился: ${socket.id}`));
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 PrintCraft server listening on port ${PORT}`));
