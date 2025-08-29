// routes/chat.js
const express = require('express');
const Chat = require('../models/Chat');
const Product = require('../models/Product');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Obtener chats del usuario
router.get('/', async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.user.userId,
      isActive: true
    })
    .populate('participants', 'name avatar')
    .populate('product', 'title images')
    .sort({ 'lastMessage.timestamp': -1 });

    res.json({ chats });
  } catch (error) {
    console.error('Error obteniendo chats:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Iniciar chat con propietario de producto
router.post('/start', [
  body('productId').isMongoId().withMessage('ID de producto inválido'),
  body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Mensaje inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, message } = req.body;

    const product = await Product.findById(productId).populate('owner');
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.owner._id.toString() === req.user.userId) {
      return res.status(400).json({ message: 'No puedes chatear contigo mismo' });
    }

    // Buscar chat existente
    let chat = await Chat.findOne({
      participants: { $all: [req.user.userId, product.owner._id] },
      product: productId
    });

    if (!chat) {
      // Crear nuevo chat
      chat = new Chat({
        participants: [req.user.userId, product.owner._id],
        product: productId,
        messages: [],
        isActive: true
      });
    }

    // Agregar mensaje
    const newMessage = {
      sender: req.user.userId,
      content: message,
      messageType: 'text'
    };

    chat.messages.push(newMessage);
    chat.lastMessage = {
      content: message,
      sender: req.user.userId,
      timestamp: new Date()
    };

    await chat.save();

    const populatedChat = await Chat.findById(chat._id)
      .populate('participants', 'name avatar')
      .populate('product', 'title images');

    res.status(201).json({
      message: 'Chat iniciado exitosamente',
      chat: populatedChat
    });
  } catch (error) {
    console.error('Error iniciando chat:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Obtener mensajes de un chat
router.get('/:chatId/messages', async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user.userId
    })
    .populate('messages.sender', 'name avatar')
    .populate('product', 'title images status');

    if (!chat) {
      return res.status(404).json({ message: 'Chat no encontrado' });
    }

    // Marcar mensajes como leídos
    await Chat.updateMany(
      {
        _id: req.params.chatId,
        'messages.sender': { $ne: req.user.userId }
      },
      {
        $set: { 'messages.$[].isRead': true }
      }
    );

    res.json({ chat });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Enviar mensaje
router.post('/:chatId/messages', [
  body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Contenido del mensaje inválido'),
  body('messageType').optional().isIn(['text', 'image']).withMessage('Tipo de mensaje inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, messageType = 'text' } = req.body;

    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user.userId
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat no encontrado' });
    }

    const newMessage = {
      sender: req.user.userId,
      content,
      messageType,
      isRead: false
    };

    chat.messages.push(newMessage);
    chat.lastMessage = {
      content,
      sender: req.user.userId,
      timestamp: new Date()
    };

    await chat.save();

    const populatedMessage = await Chat.findById(chat._id)
      .populate('messages.sender', 'name avatar')
      .select('messages')
      .slice('messages', -1);

    res.status(201).json({
      message: 'Mensaje enviado exitosamente',
      newMessage: populatedMessage.messages[0]
    });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;
