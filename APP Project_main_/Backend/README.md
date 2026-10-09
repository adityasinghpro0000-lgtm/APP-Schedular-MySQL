# CPU Scheduling Simulator Backend

## Quick Start

### Install Dependencies

```bash
cd Backend
pip install -r requirements.txt
```

### Run the Backend

#### Using FastAPI (Recommended)
```bash
# Set environment variable to use FastAPI
set USE_FASTAPI=true  # Windows
# or
export USE_FASTAPI=true  # Linux/Mac

# Run the server
python server.py
```

#### Using Legacy Server
```bash
# Set environment variable to use legacy server
set USE_FASTAPI=false  # Windows
# or
export USE_FASTAPI=false  # Linux/Mac

# Run the server
python server.py
```

### Access Points
- **API Base**: http://127.0.0.1:8000/
- **API Docs** (FastAPI): http://127.0.0.1:8000/docs
- **Frontend**: http://127.0.0.1:8000/

## API Endpoints

### Workload Generation
- `GET /api/v1/workload` - Generate synthetic workload

### Profiles
- `GET /api/v1/profiles` - List all profiles
- `POST /api/v1/profiles` - Create new profile
- `PUT /api/v1/profiles/{id}` - Update profile
- `DELETE /api/v1/profiles/{id}` - Delete profile
- `POST /api/v1/profiles/{id}/activate` - Activate profile
- `POST /api/v1/profiles/{id}/photo` - Upload profile photo
- `DELETE /api/v1/profiles/{id}/photo` - Remove profile photo

### Workspaces
- `GET /api/v1/workspaces` - List workspaces
- `POST /api/v1/workspaces` - Create workspace
- `PUT /api/v1/workspaces/{id}` - Update workspace
- `DELETE /api/v1/workspaces/{id}` - Delete workspace
- `POST /api/v1/workspaces/{id}/save` - Save workspace state
- `GET /api/v1/workspaces/{id}/export` - Export workspace

### System Logs
- `GET /api/v1/logs` - Get logs
- `POST /api/v1/logs` - Create log
- `DELETE /api/v1/logs` - Clear logs
- `GET /api/v1/logs/export` - Export logs

### Simulations
- `GET /api/v1/simulations/{id}` - Get simulation result
- `POST /api/v1/simulations` - Create simulation result
- `GET /api/v1/simulations/{id}/export/csv` - Export CSV
- `GET /api/v1/simulations/{id}/export/json` - Export JSON

## Frontend Integration

Update your frontend API calls:

```javascript
// Old (legacy server)
fetch('/api/workload?count=5')

// New (FastAPI backend)
fetch('http://localhost:8000/api/v1/workload?count=5')
```

For authentication:
```javascript
const token = localStorage.getItem('jwt_token');
fetch('/api/v1/profiles', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## Configuration

Set environment variables:
- `USE_FASTAPI=true` - Use FastAPI backend
- `DEBUG=true` - Enable debug mode with hot reload
- `SECRET_KEY=your-secret-key` - JWT secret key
- DATABASE_URL=mysql+pymysql://root:password@localhost/cpu_scheduling - MySQL connection URL

## Database

The backend uses MySQL by default. Put your local connection URL in Backend/.env as DATABASE_URL=...; this file is ignored by Git. The FastAPI server creates missing tables on startup. Run python server.py from the Backend directory with USE_FASTAPI=true (the default). Open the app through http://127.0.0.1:8000/ instead of opening HTML files directly. Profiles, workspaces, workspace processes/jobs, and system logs are stored in MySQL. Existing browser profiles, workspaces, and logs are imported when their screens first load.

## Project Structure

```
Backend/
├── main.py                    # FastAPI application
├── server.py                  # Server entry point
├── config.py                  # Configuration
├── requirements.txt           # Python dependencies
├── database/
│   ├── __init__.py
│   └── session.py            # Database session management
├── models/
│   ├── __init__.py
│   ├── profile.py            # Profile model
│   ├── workspace.py          # Workspace model
│   ├── log.py                # Log model
│   └── simulation.py         # Simulation model
├── schemas/
│   ├── __init__.py
│   ├── profile.py            # Profile schemas
│   ├── workspace.py          # Workspace schemas
│   ├── log.py                # Log schemas
│   ├── workload.py           # Workload schemas
│   └── simulation.py         # Simulation schemas
├── crud/
│   ├── __init__.py
│   ├── profile.py            # Profile CRUD
│   ├── workspace.py          # Workspace CRUD
│   ├── log.py                # Log CRUD
│   └── simulation.py         # Simulation CRUD
├── api/
│   └── v1/
│       ├── __init__.py
│       ├── auth.py           # Auth endpoints
│       ├── profiles.py       # Profile endpoints
│       ├── workspaces.py     # Workspace endpoints
│       ├── logs.py           # Log endpoints
│       ├── workload.py       # Workload endpoints
│       └── simulations.py    # Simulation endpoints
└── utils/
    ├── __init__.py
    ├── workload_generator.py # Workload generation
    ├── security.py           # Security utilities
    └── validators.py         # Input validation
```

## Migration Notes

The backend supports both legacy and FastAPI modes. To fully migrate:

1. Install FastAPI dependencies: `pip install fastapi uvicorn pydantic sqlalchemy python-jose passlib python-dotenv`

2. Update frontend to use new API endpoints

3. Implement authentication in frontend

4. Test all functionality

5. Deploy with `USE_FASTAPI=true`

## Support

For questions or issues, check:
- FastAPI docs: https://fastapi.tiangolo.com/
- SQLAlchemy docs: https://docs.sqlalchemy.org/
