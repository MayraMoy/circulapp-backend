const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');

// Configuración de base de datos de prueba
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/circulapp_test';

describe('Auth Routes', () => {
  beforeAll(async () => {
    // Conectar a base de datos de prueba
    await mongoose.connect(MONGODB_TEST_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  beforeEach(async () => {
    // Limpiar la base de datos antes de cada test
    await User.deleteMany({});
  });

  afterAll(async () => {
    // Limpiar y cerrar conexión después de todos los tests
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        userType: 'individual',
        location: {
          address: 'Test Address 123',
          coordinates: { lat: -31.4201, lng: -64.1888 },
          city: 'Test City',
          province: 'Test Province'
        }
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('Usuario registrado exitosamente');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.name).toBe(userData.name);
      expect(response.body.user.password).toBeUndefined(); // Password should not be returned

      // Verificar que el usuario fue creado en la base de datos
      const user = await User.findOne({ email: userData.email });
      expect(user).toBeTruthy();
      expect(user.name).toBe(userData.name);
    });

    it('should not register user with invalid email', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Email inválido'
          })
        ])
      );
    });

    it('should not register user with short password', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'La contraseña debe tener al menos 6 caracteres'
          })
        ])
      );
    });

    it('should not register user with missing required fields', async () => {
      const userData = {
        email: 'test@example.com'
        // Missing name and password
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should not register user with duplicate email', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      // Crear el primer usuario
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Intentar crear segundo usuario con el mismo email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Another User',
          email: 'test@example.com',
          password: 'password456'
        })
        .expect(409);

      expect(response.body.message).toBe('El usuario ya existe');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Crear un usuario para las pruebas de login
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        userType: 'individual'
      });
      await user.save();
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.message).toBe('Inicio de sesión exitoso');
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.password).toBeUndefined();
    });

    it('should not login with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas');
      expect(response.body.token).toBeUndefined();
    });

    it('should not login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas');
      expect(response.body.token).toBeUndefined();
    });

    it('should not login with invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Email inválido'
          })
        ])
      );
    });

    it('should not login with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
          // Missing password
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'La contraseña es requerida'
          })
        ])
      );
    });

    it('should not login with inactive user', async () => {
      // Desactivar el usuario
      await User.findOneAndUpdate(
        { email: 'test@example.com' },
        { isActive: false }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas');
    });
  });

  describe('GET /api/auth/profile', () => {
    let token;
    let userId;

    beforeEach(async () => {
      // Crear usuario y obtener token
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        userType: 'individual'
      });
      await user.save();
      userId = user._id;

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      token = loginResponse.body.token;
    });

    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.name).toBe('Test User');
      expect(response.body.user.password).toBeUndefined();
    });

    it('should not get profile without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.message).toBe('Token no proporcionado');
    });

    it('should not get profile with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.message).toBe('Token inválido');
    });

    it('should not get profile for non-existent user', async () => {
      // Eliminar el usuario pero mantener el token
      await User.findByIdAndDelete(userId);

      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.message).toBe('Usuario no encontrado');
    });
  });

  describe('JWT Token Validation', () => {
    it('should generate valid JWT token on registration', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const token = response.body.token;
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT should have 3 parts
    });

    it('should generate valid JWT token on login', async () => {
      // Crear usuario
      const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
      await user.save();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      const token = response.body.token;
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT should have 3 parts
    });

    it('should validate user type correctly', async () => {
      const producerData = {
        name: 'Producer User',
        email: 'producer@example.com',
        password: 'password123',
        userType: 'producer'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(producerData)
        .expect(201);

      expect(response.body.user.userType).toBe('producer');
    });
  });
});