// utils/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendWelcomeEmail(user) {
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: '¡Bienvenido a Circulapp!',
      html: `
        <h1>¡Bienvenido a Circulapp, ${user.name}!</h1>
        <p>Gracias por unirte a nuestra comunidad de economía circular.</p>
        <p>Con Circulapp podrás:</p>
        <ul>
          <li>Donar productos que ya no uses</li>
          <li>Encontrar objetos que necesitas</li>
          <li>Contribuir al medio ambiente</li>
          <li>Conectar con tu comunidad</li>
        </ul>
        <p>¡Comienza a explorar y haz tu primera publicación!</p>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Email de bienvenida enviado a:', user.email);
    } catch (error) {
      console.error('Error enviando email de bienvenida:', error);
    }
  }

  async sendTransactionNotification(user, transaction, type) {
    let subject, html;

    switch (type) {
      case 'request':
        subject = 'Nueva solicitud para tu producto';
        html = `
          <h2>¡Tienes una nueva solicitud!</h2>
          <p>Hola ${user.name},</p>
          <p>Alguien está interesado en tu producto. Revisa tu chat para más detalles.</p>
        `;
        break;
      case 'accepted':
        subject = 'Tu solicitud fue aceptada';
        html = `
          <h2>¡Tu solicitud fue aceptada!</h2>
          <p>Hola ${user.name},</p>
          <p>El donante ha aceptado tu solicitud. Coordina la entrega a través del chat.</p>
        `;
        break;
      case 'completed':
        subject = 'Transacción completada';
        html = `
          <h2>¡Transacción completada!</h2>
          <p>Hola ${user.name},</p>
          <p>Tu transacción ha sido marcada como completada. No olvides calificar tu experiencia.</p>
        `;
        break;
    }

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject,
      html
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error enviando notificación por email:', error);
    }
  }
}

module.exports = new EmailService();