# Stellar-GeoLink

Stellar-GeoLink is a geolocation-based platform that connects wallet providers with data consumers, providing secure and efficient location data management services. This project was created to serve as a backend data provider for the [BlockchainMaps Unity 3D visualization tool](https://github.com/SergeKhachatour/BlockchainMaps-Server), which requires structured geolocation data for blockchain nodes and transactions.

## Integration with BlockchainMaps

The Stellar-GeoLink platform provides:
- Standardized geolocation data for blockchain nodes
- Real-time updates for node locations and statuses
- Secure API endpoints compatible with Unity's HTTP client
- Role-based access for different data providers
- Structured data format optimized for 3D visualization

The data from this platform feeds directly into the BlockchainMaps Unity project, enabling:
- 3D visualization of blockchain nodes on a world map
- Real-time marker updates based on geographical coordinates
- Visual connections between blockchain nodes
- Differentiation between various blockchain types (Stellar, USDC/Circle)

## Project Structure

```
Stellar-GeoLink/
├── backend/
│   ├── config/             # Database and API configurations
│   ├── middleware/         # Auth, API key, and request handling
│   ├── routes/            # API endpoint definitions
│   ├── services/          # Business logic and data processing
│   └── app.js             # Main application entry point
├── frontend/
│   ├── public/            # Static assets
│   └── src/
│       ├── components/    # Reusable UI components
│       ├── contexts/      # React context providers
│       ├── pages/         # Main application views
│       └── services/      # API integration services
```

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- Redis
- Mapbox API key (for maps functionality)

## Environment Variables

### Backend (.env)
```
PORT=4000
DATABASE_URL=postgresql://username:password@localhost:5432/geolink
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
MAPBOX_TOKEN=your_mapbox_token
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:4000/api
REACT_APP_MAPBOX_TOKEN=your_mapbox_token
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/Stellar-GeoLink.git
cd Stellar-GeoLink
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

4. Set up the database:
- Create a PostgreSQL database
- Run the schema migrations from `database/schema.sql`

## Running the Application

1. Start the backend server:
```bash
cd backend
npm start
```

2. Start the frontend development server:
```bash
cd frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Documentation: http://localhost:4000/api-docs

## User Roles

- **Admin**: Full system access and management capabilities
- **Wallet Provider**: Manage wallet locations and transaction data
- **Data Consumer**: Access location data through API endpoints
- **SDF Employee**: Special role for Stellar Development Foundation employees with:
  - Access to sensitive blockchain node data
  - Ability to manage node configurations
  - Permission to view detailed analytics
  - Authorization to approve data provider requests

## Features

- User authentication and authorization
- Role-based access control
- Real-time geolocation tracking
- Interactive maps with Mapbox
- API key management
- Usage analytics
- Geofencing capabilities

## API Documentation

API documentation is available through Swagger UI at `/api-docs` when the server is running.

## Dependencies

### Backend
- Express.js
- PostgreSQL (pg)
- Redis
- JSON Web Tokens (jsonwebtoken)
- bcrypt
- cors
- and others (see package.json)

### Frontend
- React
- Material-UI
- Mapbox GL
- Axios
- React Router
- Chart.js
- and others (see package.json)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email sergekhachatour@gmail.com or open an issue in the repository.