# Circulapp Backend

Bienvenido al backend de **Circulapp**, una aplicación diseñada para facilitar la gestión de procesos circulares, reutilización y sostenibilidad a través de una plataforma ágil y moderna.

## Tabla de contenido

- [Descripción](#descripción)
- [Tecnologías](#tecnologías)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Ejecutar el proyecto](#ejecutar-el-proyecto)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Contribuciones](#contribuciones)
- [Licencia](#licencia)

---

## Descripción

Este proyecto provee el backend de Circulapp, implementando una API RESTful que permite gestionar usuarios, productos, pedidos y procesos relacionados con la economía circular. La API expone endpoints seguros y eficientes para la interacción con la base de datos y la lógica de negocio.

## Tecnologías

- **Node.js**  
- **Express.js**  
- **MongoDB**  
- **Mongoose**  
- **JWT para autenticación**  
- **Docker (opcional)**  
- **Swagger para documentación de API**  

## Instalación

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/MayraMoy/circulapp-backend.git
   cd circulapp-backend
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. *(Opcional)* **Configura Docker:**
   ```bash
   docker-compose up
   ```

## Configuración

Crea un archivo `.env` en la raíz del proyecto y añade las siguientes variables según tus credenciales:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/circulapp
JWT_SECRET=tu_secreto
```

## Ejecutar el proyecto

- **Modo desarrollo:**
  ```bash
  npm run dev
  ```

- **Modo producción:**
  ```bash
  npm start
  ```

La API estará disponible en `http://localhost:3000`.

## Estructura del proyecto

```
circulapp-backend/
│
├── src/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   └── utils/
├── tests/
├── .env.example
├── package.json
└── README.md
```

## Documentación de API

Accede a la documentación interactiva de los endpoints en `/api-docs` si Swagger está habilitado.

## Contribuciones

¡Las contribuciones son bienvenidas! Por favor, abre un issue o realiza un pull request siguiendo las buenas prácticas de desarrollo.

## Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

**Contacto:**  
MayraMoy - [GitHub](https://github.com/MayraMoy)
