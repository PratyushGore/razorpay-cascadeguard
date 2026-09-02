# 🛡️ CascadeGuard — Razorpay Autonomous Revenue Recovery Sentinel

[![Python](https://img.shields.io/badge/Python-3.11%2B%20%7C%20FastAPI-3776AB?style=flat&logo=python&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18%20%7C%20TypeScript-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/TailwindCSS-v3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![AI Engine](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-8E75B2?style=flat&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Tests](https://img.shields.io/badge/Tests-13%2F13%20Passing-brightgreen?style=flat)]()
[![Compliance](https://img.shields.io/badge/Compliance-RBI%20%7C%20NACHA%20%7C%20PSD3-emerald?style=flat)]()

> **Submission for the Razorpay AI Buildathon — Track 03: AI Revenue Recovery**  
> An autonomous, telemetry-aware revenue recovery sentinel with a deterministic, multi-jurisdiction compliance gatekeeper that overrides rogue AI proposals to enforce strict regulatory limits.

---

## 📌 The Problem

When transactions fail across payment rails (UPI timeouts, acquiring bank switch degradations, mandate velocity limits, insufficient balances), online merchants lose up to **4% of their Gross Merchandise Value (GMV)**.

Existing automated recovery scripts and naive AI agents suffer from three critical bottlenecks:

1. **Telemetry Blindness:** They treat all transaction failures as user-level errors. If an issuing bank's core UPI switch is degraded (e.g., HDFC/SBI experiencing timeouts), naive retry scripts spam the customer with payment links immediately, causing consecutive failures and burning through user attempt limits.
2. **Regulatory & Compliance Violations:** Autonomous LLMs generating payment retry schedules lack mathematical boundaries. They can easily violate statutory financial regulations, such as **Reserve Bank of India (RBI) e-mandate guidelines** (mandatory 8-hour cooling periods, 3-retry caps, ₹15,000 AFA thresholds) or **US NACHA regulations** on NSF return limits.
3. **The Financial "Black Box" Problem:** Unbounded AI agents lack cryptographic explainability. Financial operations and compliance teams have zero tamper-proof audit trails explaining *why* an action was chosen, *which* regulation was verified, or *how* funds were recovered.

---

## 💡 The Solution: CascadeGuard

**CascadeGuard** bridges real-time bank telemetry, generative AI reasoning (Gemini 2.5 Flash), and a deterministic Finite State Machine (FSM) Compliance Gatekeeper to automate payment failure recovery without human error or regulatory non-compliance.

### Core Architecture Flow

```text
[ Razorpay Failure Webhooks (payment.failed, subscription.halted) ]
                              │
                              ▼
        [ Bank Switch Telemetry & Error Diagnoser ]
        (Correlates error codes with real-time node uptime)
                              │
                              ▼
          [ AI Strategist Engine (Gemini 2.5 Flash) ]
     (Proposes context-aware recovery cadences & intent links)
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│        DETERMINISTIC COMPLIANCE GATEWAY (Multi-Jurisdiction)              │
│                                                                           │
│   • IN_RBI.yaml          • US_NACHA.yaml          • EU_PSD3.yaml          │
│                                                                           │
│   [ Evaluates: Switch Health, Velocity Caps, Mandatory Cooling Off ]      │
│   [ Overrides & Sanitizes Rogue / Non-Compliant AI Proposals ]           │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
                      [ Cryptographic Audit Ledger ]
                 (SHA-256 Chained Blocks with Policy Stamps)
                                      │
                                      ▼
                     [ Execution Dispatcher & APIs ]
             (Smart Schedulers, Intent Links, Fallbacks)
```

---

## ⚖️ Pluggable Multi-Jurisdiction Compliance Matrix

Instead of hardcoding rules, CascadeGuard uses declarative YAML policy matrices that hot-reload on the fly:

| Jurisdiction | Authority | Key Guardrails Enforced Deterministically |
| :--- | :--- | :--- |
| `IN_RBI` | Reserve Bank of India | Max 3 retries/24h, 8h cooling period on mandates, ₹15,000 AFA threshold check, UPI switch health gating (<70% halts immediate retry). |
| `US_NACHA` | NACHA / CFPB | Max 2 NSF returns, hard block on revoked authorization codes (`R05`, `R07`, `R10`, `R29`), 240m card retry spacing. |
| `EU_PSD3` | European Banking Authority | €30 frictionless SCA threshold, mandatory 30m spacing on soft declines with step-up re-authentication. |

---

## 📊 50-Case Synthetic Benchmark Results

The built-in benchmark runner executes 50 diverse failure cases covering UPI downtime, card limits, recurring mandates, and cross-border edge cases:

| Metric | CascadeGuard Benchmark Score |
| :--- | :--- |
| **Total Test Scenarios** | `50 Cases` |
| **Recovered Revenue Rate** | `84.0%` |
| **Compliance Violations** | **`0` (100% Policy Adherence)** |
| **Deterministic Overrides Applied** | `18 / 50` (AI Proposals Sanitized/Halted) |
| **Average Decision Latency** | `< 120 ms` |
| **Audit Ledger Verification** | `100% Valid SHA-256 Hash Chain` |

---

## 🛠️ Engineering Challenges: Where We Got Stuck & How We Solved It

During the architecture and development of CascadeGuard, we encountered two critical engineering bottlenecks that traditional AI wrappers fail to address:

### 1. The Non-Deterministic AI Vulnerability in Financial Workflows
* **The Problem:** In initial prototypes, when Gemini 2.5 was prompted to suggest retry schedules for failed recurring e-mandates, it occasionally hallucinated aggressive cadences (e.g., retrying every 10–30 minutes to minimize churn). In Indian payment rails, this directly violates **RBI Master Directions on Recurring Mandates**, which enforce strict 8-hour cooling-off intervals and a maximum of 3 retries per 24-hour cycle. Giving an LLM direct execution access to payment retry APIs created an unacceptable regulatory and compliance risk.
* **The Solution:** We decoupled strategy generation from execution by building a **Deterministic Finite State Machine (FSM) Compliance Gatekeeper**. Instead of allowing the AI to execute actions directly:
  1. The LLM acts solely as a *Strategy Proposer*, outputting a strict Pydantic-validated JSON payload.
  2. The proposed action is intercepted by an independent, non-AI Policy Layer loaded with declarative YAML rulebooks (`IN_RBI.yaml`, `US_NACHA.yaml`, `EU_PSD3.yaml`).
  3. If the AI proposes an illegal interval (e.g., 5-minute retry), the Gatekeeper deterministically clamps and overrides the parameter to the statutory minimum (e.g., 480 minutes) and stamps the action with a cryptographic audit token before dispatching.

---

### 2. Telemetry-Aware Degradation & Offline Fallback Reliability
* **The Problem:** In payment failure recovery, an LLM cannot make informed decisions in a vacuum without knowing the health of the underlying banking rail. When an issuing bank switch (e.g., HDFC or SBI) degraded to 30% uptime, standard gateway retries resulted in immediate consecutive failures. Furthermore, relying purely on remote LLM API calls introduced latency and single-point-of-failure vulnerabilities during network drops.
* **The Solution:** 
  1. We engineered a **Dual-Layer Diagnostic Engine**: Before invoking the AI model, the system queries an in-memory Bank Node Telemetry registry to classify failures into **Technical Declines (TD)** (switch down, timeouts) vs. **Business Declines (BD)** (insufficient balance, card expired).
  2. We built a **Zero-Downtime Deterministic Fallback Engine**: If the remote Gemini API key is unavailable, times out, or encounters rate limits, CascadeGuard automatically falls back to an internal heuristic rule state machine, ensuring 100% throughput and zero unhandled webhook crashes.

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm

### 1. Clone & Setup
```bash
git clone https://github.com/<your-username>/razorpay-cascadeguard.git
cd razorpay-cascadeguard
```

### 2. Configure Backend Environment
```bash
cd backend
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Linux / macOS:
source venv/bin/activate

pip install -r requirements.txt
cd ..
```

*(Optional: Set your Gemini API key in `backend/.env` or rely on the built-in deterministic fallback engine)*:
```env
GEMINI_API_KEY=your_gemini_api_key_here
RAZORPAY_KEY_ID=rzp_test_sampleKey
RAZORPAY_KEY_SECRET=sampleSecretKey
RAZORPAY_WEBHOOK_SECRET=sampleWebhookSecret
DATABASE_URL=sqlite:///./cascadeguard.db
ACTIVE_JURISDICTION=IN_RBI
```

### 3. Configure Frontend Environment
```bash
cd frontend
npm install
cd ..
```

### 4. Run Both Services Concurrently (Single Command)
Run the root demo launcher to spin up both the FastAPI backend and React frontend concurrently:
```bash
python run_demo.py
```
- **Mission Control Dashboard:** `http://localhost:5173`
- **FastAPI Interactive Swagger Docs:** `http://localhost:8000/docs`

### 5. Run Automated Verification Tests
Execute the full pytest suite to verify all compliance gates, webhook HMAC checks, and benchmark endpoints:
```powershell
# In project root:
$env:PYTHONPATH="."
.\backend\venv\Scripts\python -m pytest backend/tests/ -v
```

---

## 📁 Repository Structure

```plaintext
razorpay-cascadeguard/
├── .gitignore
├── LICENSE
├── README.md                           # Architecture documentation and benchmark report
├── run_demo.py                         # Concurrent multi-process launcher
│
├── backend/                            # Python FastAPI Backend
│   ├── requirements.txt
│   ├── main.py                         # FastAPI application entrypoint & CORS
│   │
│   ├── app/
│   │   ├── api/                        # REST & Webhook Route Controllers
│   │   │   ├── webhooks.py             # Razorpay HMAC verification & event pipeline
│   │   │   ├── recovery.py             # Transaction lookup & retry dispatcher
│   │   │   ├── policies.py             # Multi-jurisdiction policy manager
│   │   │   ├── telemetry.py            # Real-time bank switch health simulator
│   │   │   └── benchmark.py            # 50-case benchmark runner endpoint
│   │   │
│   │   ├── core/                       # App Configuration & DB Setup
│   │   │   ├── config.py               # Pydantic BaseSettings loader
│   │   │   ├── database.py             # SQLModel session engine
│   │   │   └── security.py             # HMAC-SHA256 & hash-chain utilities
│   │   │
│   │   ├── engine/                     # AI & Telemetry Engine
│   │   │   ├── diagnoser.py            # Failure classification (TD vs BD)
│   │   │   ├── llm_strategist.py       # Gemini 2.5 Flash structured output caller
│   │   │   └── telemetry_tracker.py    # Bank switch uptime registry
│   │   │
│   │   ├── guardrails/                 # Deterministic Compliance Engine
│   │   │   ├── gatekeeper.py           # Core FSM evaluation & override logic
│   │   │   ├── policy_loader.py        # YAML rulebook loader & validator
│   │   │   └── rules/                  # Declarative regulatory files
│   │   │       ├── IN_RBI.yaml         # Reserve Bank of India e-mandate rules
│   │   │       ├── US_NACHA.yaml       # US NACHA ACH limits & return rules
│   │   │       └── EU_PSD3.yaml        # European Banking Authority SCA rules
│   │   │
│   │   └── models/                     # Data Schemas & Tables
│   │       ├── schemas.py              # Pydantic v2 schemas
│   │       └── entities.py             # SQLModel database tables
│   │
│   └── tests/                          # Test Suite & Benchmark Scenarios
│       ├── test_compliance_fsm.py      # 13 Automated FSM & Security Unit Tests
│       └── benchmark_50_cases.json     # Curated 50-case failure scenarios
│
└── frontend/                           # React (Vite + TypeScript + Tailwind CSS)
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx                     # Main Dashboard Layout & State Orchestrator
        ├── components/                 # Mission Control UI Panels
        │   ├── TopMetricBar.tsx        # High-level counters & status badges
        │   ├── LiveFailureFeed.tsx     # Real-time scrolling webhook failure feed
        │   ├── DiagnosticInspector.tsx # Bank switch health & Gemini AI reasoning
        │   ├── ComplianceMatrix.tsx    # Live policy switcher & override alerts
        │   ├── ChaosControlPanel.tsx   # Switch outage & benchmark buttons
        │   └── AuditLedgerTable.tsx    # Cryptographic state transition log
        ├── services/                   # API & Mock Data Connectors
        └── types/                      # TypeScript Interface Definitions
```

---

## 🛡️ License

This project is licensed under the MIT License — see the [LICENSE](file:///c:/Users/praty/OneDrive/Desktop/razorpay-cascadeguard/LICENSE) file for details.