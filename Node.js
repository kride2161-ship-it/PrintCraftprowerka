const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function loadData() {
  const defaultData = {
    users: [
      { id: 'usr_1', username: 'Ксения', balance: 150, firstPassChar: '7', avatar: '🎨', role: 'Клиент' },
      { id: 'usr_2', username: 'Александр', balance: 0, firstPassChar: '1', avatar: '🛠️', role: 'Мастер 3D' },
      { id: 'usr_3', username: 'ПринтКрафт_Дево', balance: 500, firstPassChar: '9', avatar: '👑', role: 'VIP' }
    ],
    chatMessages: [
      { id: 'c1', username: 'Админ', text: 'Добро пожаловать в чат ПРИНТКРАФТ! Задавайте вопросы по заказам.', isAdmin: true, time: '12:00', avatar: '👑' }
    ],
    reviews: [
      { id: 'r1', username: 'Ксения', rating: 5, text: 'Очень хороший магазин, качественные товары, распечатали мне подставку для часов, так она вошла как родная. Умеют делать по чертежам, рекомендую магазин.' }
    ]
  };

  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
      return defaultData;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Ошибка чтения db.json:', err);
    return defaultData;
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Ошибка записи в db.json:', err);
  }
}

let db = loadData();

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString(), totalUsers: db.users.length });
});

app.get('/api/users', (req, res) => {
  res.json(db.users);
});

app.get('/api/reviews', (req, res) => {
  res.json(db.reviews);
});

app.get('/api/chat', (req, res) => {
  res.json(db.chatMessages);
});

io.on('connection', (socket) => {
  console.log(`[Node.js Server] Клиент подключился: ${socket.id}`);

  // Отправляем все текущие данные подключившемуся клиенту
  socket.emit('init_data', {
    users: db.users,
    chatMessages: db.chatMessages,
    reviews: db.reviews
  });

  // Авторизация / регистрация пользователя
  socket.on('user_auth', (userData) => {
    let user = db.users.find(u => u.username.toLowerCase() === userData.username.toLowerCase());
    if (!user) {
      user = {
        id: 'usr_' + Date.now().toString().slice(-6),
        username: userData.username,
        balance: 0,
        firstPassChar: userData.firstPassChar || '1',
        avatar: userData.avatar || '⚡',
        role: 'Клиент'
      };
      db.users.push(user);
    } else {
      if (userData.firstPassChar) user.firstPassChar = userData.firstPassChar;
      if (userData.avatar) user.avatar = userData.avatar;
    }
    saveData(db);

    socket.emit('auth_success', user);
    io.emit('users_updated', db.users);
  });

  // Изменение баланса админом
  socket.on('admin_change_balance', ({ userId, delta }) => {
    const user = db.users.find(u => u.id === userId);
    if (user) {
      user.balance = Math.max(0, user.balance + delta);
      saveData(db);

      io.emit('users_updated', db.users);
      io.emit('balance_changed', { userId: user.id, newBalance: user.balance });
    }
  });

  // Чат сообщение
  socket.on('send_message', (msgData) => {
    const newMsg = {
      id: 'c_' + Date.now(),
      username: msgData.username,
      avatar: msgData.avatar || '⚡',
      text: msgData.text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isAdmin: msgData.username.toLowerCase() === 'админ'
    };
    db.chatMessages.push(newMsg);
    saveData(db);

    io.emit('new_message', newMsg);
  });

  // Новый отзыв
  socket.on('submit_review', (reviewData) => {
    const newReview = {
      id: 'r_' + Date.now(),
      username: reviewData.username,
      rating: reviewData.rating,
      text: reviewData.text
    };
    db.reviews.unshift(newReview);
    saveData(db);

    io.emit('new_review', newReview);
  });

  socket.on('disconnect', () => {
    console.log(`[Node.js Server] Отключение: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Node.js сервер ПРИНТКРАФТ запущен на http://localhost:${PORT}`);
});
