const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// 设置静态文件目录，使根路径可以直接访问public目录下的文件
app.use(express.static(path.join(__dirname, 'public')));
// 保留原有的/public路径，向后兼容
app.use('/public', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 会话配置
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000 // 会话有效期为1天
  }
}));

// 测试路由 - 用于诊断会话和用户状态
app.get('/test-session', (req, res) => {
  console.log('会话测试:', {
    hasSession: !!req.session,
    hasUser: !!req.session.user,
    user: req.session.user ? {
      username: req.session.user.username,
      isAdmin: req.session.user.isAdmin
    } : '未登录'
  });
  res.json({
    sessionId: req.sessionID,
    hasUser: !!req.session.user,
    user: req.session.user ? {
      username: req.session.user.username,
      isAdmin: req.session.user.isAdmin
    } : null
  });
});

// 管理员认证测试路由 - 用于诊断管理员权限问题
app.get('/test-admin', (req, res) => {
  // 手动设置管理员会话用于测试
  req.session.user = {
    id: 1,
    username: 'admin',
    password: 'admin123',
    email: 'admin@example.com',
    phone: '13800000001',
    isAdmin: true,
    createdAt: new Date().toISOString()
  };
  console.log('管理员测试会话已设置');
  res.redirect('/admin');
});

// 认证中间件
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// 管理员认证中间件 - 添加日志记录
function isAdmin(req, res, next) {
  console.log('管理员认证检查:', { 
    hasSession: !!req.session.user, 
    isAdmin: req.session.user ? req.session.user.isAdmin : false,
    username: req.session.user ? req.session.user.username : '未登录'
  });
  if (req.session.user && req.session.user.isAdmin) {
    return next();
  }
  res.status(403).send('无权限访问，请使用管理员账号登录后重试。');
}

// 连接数据库（当前使用内存存储，如需使用MongoDB，请取消注释以下代码）
/*
mongoose.connect('mongodb://localhost:27017/yahooEvents', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB 连接成功');
}).catch((err) => {
  console.error('MongoDB 连接失败:', err);
});
*/

// 如果使用MongoDB，需要定义Event和Participant模型
/*
const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  startTime: { type: Date, required: true },
  departure: { type: String, required: true },
  arrival: { type: String, required: true },
  aircraftTypes: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const ParticipantSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  participateTime: { type: Date, default: Date.now }
});

const Event = mongoose.model('Event', EventSchema);
const Participant = mongoose.model('Participant', ParticipantSchema);
*/

// 为了演示，使用内存存储，并添加一些模拟数据
// 用户数据 - 仅保留管理员用户
let users = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123', // 实际项目中应该使用加密存储
    isAdmin: true,
    createdAt: new Date()
  }
];

// 活动数据 - 清空活动列表
let events = [];

// 参与者数据 - 清空参与者列表
let participants = [];

// 路由
// 首页 - 活动列表
app.get('/', (req, res) => {
  res.render('index', { events, user: req.session.user });
});

// 活动详情页
app.get('/event/:id', (req, res) => {
  const event = events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).send('活动不存在');
  
  const eventParticipants = participants.filter(p => p.eventId === parseInt(req.params.id));
  
  res.render('event-detail', { 
    event, 
    participants: eventParticipants,
    participantCount: eventParticipants.length,
    user: req.session.user 
  });
});

// 参加活动 - 需要登录
app.post('/event/:id/participate', isAuthenticated, (req, res) => {
  const event = events.find(e => e.id === parseInt(req.params.id));
  if (!event) return res.status(404).send('活动不存在');
  
  const currentUser = req.session.user;
  
  // 检查用户是否已经参加了该活动
  const hasParticipated = participants.some(p => 
    p.userId === currentUser.id && p.eventId === parseInt(req.params.id)
  );
  
  if (hasParticipated) {
    return res.status(400).send('您已经参加过该活动');
  }
  
  // 从表单中获取参加活动的信息
  const { name, qq, flightNumber, aircraftType } = req.body;
  
  if (!name || !qq || !flightNumber || !aircraftType) {
    return res.status(400).send('请填写完整的参加活动信息');
  }
  
  participants.push({
    id: participants.length + 1,
    eventId: parseInt(req.params.id),
    userId: currentUser.id,
    name: name, // 使用表单中的姓名
    qq: qq, // 添加QQ号
    aircraftType: aircraftType, // 添加选择的机型
    flightNumber: flightNumber, // 添加航班号
    participateTime: new Date()
  });
  
  res.redirect(`/event/${req.params.id}`);
});

// 用户登录页面
app.get('/login', (req, res) => {
  res.render('login');
});

// 用户登录提交
// 登录提交处理 - 添加详细日志记录
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('登录请求:', { username });
  
  if (!username || !password) {
    console.log('登录失败: 用户名或密码为空', { username });
    return res.render('login', { error: '请输入用户名和密码' });
  }
  
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    console.log('登录失败: 用户名或密码错误', { username });
    return res.render('login', { error: '用户名或密码错误' });
  }
  
  // 设置会话
  req.session.user = user;
  console.log('登录成功:', { username, isAdmin: user.isAdmin });
  
  // 如果是管理员，重定向到管理后台
  if (user.isAdmin) {
    console.log('管理员登录，重定向到后台管理');
    res.redirect('/admin');
  } else {
    res.redirect('/');
  }
});

// 用户注册页面
app.get('/register', (req, res) => {
  res.render('register');
});

// 用户注册提交
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).send('请填写完整信息');
  }
  
  // 检查用户名是否已存在
  if (users.some(u => u.username === username)) {
    return res.status(400).send('用户名已存在');
  }
  
  // 创建新用户
  const newUser = {
    id: users.length + 1,
    username,
    password, // 实际项目中应该使用加密存储
    isAdmin: false, // 所有新注册用户默认为普通用户
    createdAt: new Date()
  };
  
  users.push(newUser);
  
  // 自动登录新用户
  req.session.user = newUser;
  
  // 如果是管理员，登录后直接进入后台
  if (newUser.isAdmin) {
    res.redirect('/admin');
  } else {
    res.redirect('/');
  }
});

// 用户注销
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('注销失败:', err);
    }
    res.redirect('/');
  });
});

// 后台管理 - 需要管理员权限
app.get('/admin', isAdmin, (req, res) => {
  const eventsWithParticipants = events.map(event => {
    const eventParticipants = participants.filter(p => p.eventId === event.id);
    return {
      ...event,
      participantCount: eventParticipants.length,
      participants: eventParticipants
    };
  });
  
  res.render('admin', { events: eventsWithParticipants, user: req.session.user, users });
});

// 添加活动页面 - 需要管理员权限
app.get('/admin/add-event', isAdmin, (req, res) => {
  res.render('add-event', { user: req.session.user });
});

// 添加活动提交 - 需要管理员权限
app.post('/admin/add-event', isAdmin, (req, res) => {
  const { title, startTime, departure, arrival, aircraftTypes, details } = req.body;
  
  if (!title || !startTime || !departure || !arrival) {
    return res.status(400).send('请填写必要的活动信息');
  }
  
  events.push({
    id: events.length + 1,
    title,
    startTime: new Date(startTime),
    departure,
    arrival,
    aircraftTypes: aircraftTypes ? (Array.isArray(aircraftTypes) ? aircraftTypes : [aircraftTypes]) : [],
    details,
    createdAt: new Date()
  });
  
  res.redirect('/admin');
});

// 用户管理页面 - 需要管理员权限
app.get('/admin/users', isAdmin, (req, res) => {
  res.render('admin-users', { users, user: req.session.user });
});



// 切换用户管理员权限 - 需要管理员权限
app.post('/admin/users/toggle-admin/:id', isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).send('用户不存在');
  }
  
  // 不允许取消最后一个管理员的权限
  if (user.isAdmin && users.filter(u => u.isAdmin).length <= 1) {
    return res.status(400).send('系统至少需要保留一个管理员用户');
  }
  
  // 不允许用户取消自己的管理员权限（如果他是唯一的管理员）
  if (user.id === req.session.user.id && user.isAdmin && users.filter(u => u.isAdmin).length <= 1) {
    return res.status(400).send('您是唯一的管理员，不能取消自己的管理员权限');
  }
  
  // 切换管理员状态
  user.isAdmin = !user.isAdmin;
  
  console.log(`${user.isAdmin ? '设置用户为管理员' : '取消用户管理员权限'}: ${user.username}`);
  res.redirect('/admin/users');
});

// 删除用户 - 需要管理员权限
app.post('/admin/users/delete/:id', isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).send('用户不存在');
  }
  
  const userToDelete = users[userIndex];
  
  // 不允许删除自己
  if (userToDelete.id === req.session.user.id) {
    return res.status(400).send('不允许删除当前登录的用户');
  }
  
  // 不允许删除最后一个管理员
  if (userToDelete.isAdmin && users.filter(u => u.isAdmin).length <= 1) {
    return res.status(400).send('系统至少需要保留一个管理员用户');
  }
  
  // 从参与者表中删除相关记录
  participants = participants.filter(p => p.userId !== userId);
  
  // 删除用户
  users.splice(userIndex, 1);
  
  console.log(`用户已删除: ${userToDelete.username}`);
  res.redirect('/admin/users');
});

// 删除活动 - 需要管理员权限
app.post('/admin/events/delete/:id', isAdmin, (req, res) => {
  const eventId = parseInt(req.params.id);
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    return res.status(404).send('活动不存在');
  }
  
  // 从参与者表中删除相关记录
  participants = participants.filter(p => p.eventId !== eventId);
  
  // 删除活动
  events.splice(eventIndex, 1);
  
  console.log(`活动已删除: ID=${eventId}`);
  res.redirect('/admin');
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});