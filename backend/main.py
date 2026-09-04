from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.database import create_db_and_tables
from backend.app.api import webhooks, recovery, policies, telemetry, benchmark

app = FastAPI(
    title="CascadeGuard API",
    description="Razorpay Autonomous Revenue Recovery Sentinel Gatekeeper API",
    version="1.0.0"
)

# Configure CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    # Ensure SQLite tables exist on startup
    create_db_and_tables()

# Health check routes
@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "CascadeGuard",
        "version": "1.0.0"
    }

# Mount routers
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(recovery.router, prefix="/api/v1/recovery", tags=["Recovery"])
app.include_router(policies.router, prefix="/api/v1/policies", tags=["Policies"])
app.include_router(telemetry.router, prefix="/api/v1/telemetry", tags=["Telemetry"])
app.include_router(benchmark.router, prefix="/api/v1/benchmark", tags=["Benchmark"])
