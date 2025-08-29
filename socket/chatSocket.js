// socket/chatSocket.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');

module.exports = (io) => {
  // Middleware de autenticación para Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user || !user.isActive) {
        return next(new Error('Usuario no válido'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Autenticación fallida'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.user.name} (${socket.userId})`);

    // Unirse a salas de chats del usuario
    socket.on('join_chats', async () => {
      try {
        const userChats = await Chat.find({
          participants: socket.userId,
          isActive: true
        }).select('_id');

        userChats.forEach(chat => {
          socket.join(chat._id.toString());
        });

        console.log(`Usuario ${socket.userId} se unió a ${userChats.length} chats`);
      } catch (error) {
        console.error('Error al unirse a chats:', error);
      }
    });

    // Enviar mensaje
    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, messageType = 'text' } = data;

        // Verificar que el usuario pertenece al chat
        const chat = await Chat.findOne({
          _id: chatId,
          participants: socket.userId
        });

        if (!chat) {
          socket.emit('error', { message: 'Chat no encontrado' });
          return;
        }

        // Crear mensaje
        const newMessage = {
          sender: socket.userId,
          content,
          messageType,
          isRead: false
        };

        chat.messages.push(newMessage);
        chat.lastMessage = {
          content,
          sender: socket.userId,
          timestamp: new Date()
        };

        await chat.save();

        // Obtener el mensaje poblado
        const savedMessage = chat.messages[chat.messages.length - 1];
        const populatedMessage = await Chat.findById(chatId)
          .populate('messages.sender', 'name avatar')
          .select('messages')
          .slice('messages', -1);

        const messageToSend = populatedMessage.messages[0];

        // Enviar mensaje a todos los participantes del chat
        io.to(chatId).emit('new_message', {
          chatId,
          message: messageToSend
        });

        // Enviar notificación a los otros participantes
        const otherParticipants = chat.participants.filter(
          id => id.toString() !== socket.userId
        );

        otherParticipants.forEach(participantId => {
          io.to(participantId.toString()).emit('chat_notification', {
            chatId,
            senderName: socket.user.name,
            message: content,
            timestamp: new Date()
          });
        });

      } catch (error) {
        console.error('Error enviando mensaje:', error);
        socket.emit('error', { message: 'Error enviando mensaje' });
      }
    });

    // Marcar mensajes como leídos
    socket.on('mark_read', async (data) => {
      try {
        const { chatId } = data;

        await Chat.updateMany(
          {
            _id: chatId,
            'messages.sender': { $ne: socket.userId },
            'messages.isRead': false
          },
          {
            $set: { 'messages.$[elem].isRead': true }
          },
          {
            arrayFilters: [{ 'elem.sender': { $ne: socket.userId } }]
          }
        );

        // Notificar a otros participantes
        socket.to(chatId).emit('messages_read', {
          chatId,
          readBy: socket.userId
        });

      } catch (error) {
        console.error('Error marcando mensajes como leídos:', error);
      }
    });

    // Usuario escribiendo
    socket.on('typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user_typing', {
        chatId,
        userId: socket.userId,
        userName: socket.user.name
      });
    });

    // Usuario dejó de escribir
    socket.on('stop_typing', (data) => {
      const { chatId } = data;
      socket.to(chatId).emit('user_stop_typing', {
        chatId,
        userId: socket.userId
      });
    });

    // Desconexión
    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${socket.user.name} (${socket.userId})`);
    });

    // Manejo de errores
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};