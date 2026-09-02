import os
import sys
import subprocess
import threading
import signal
import time

def log_stream(stream, prefix):
    """
    Reads stream line by line and prints it with a labeled prefix.
    """
    try:
        for line in iter(stream.readline, ""):
            if not line:
                break
            print(f"{prefix} {line.strip()}", flush=True)
    except Exception as e:
        print(f"[{prefix.strip('[]')}] Log stream error: {e}", flush=True)

def main():
    print("=" * 60)
    print("Starting CascadeGuard: Razorpay Autonomous Revenue Recovery Sentinel")
    print("=" * 60)

    # Determine paths and commands based on OS
    is_windows = sys.platform == "win32"
    
    # 1. Backend config
    backend_dir = os.path.join(os.getcwd(), "backend")
    if is_windows:
        python_executable = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
    else:
        python_executable = os.path.join(backend_dir, "venv", "bin", "python")
        
    backend_cmd = [
        python_executable, 
        "-m", 
        "uvicorn", 
        "backend.main:app", 
        "--host", "127.0.0.1", 
        "--port", "8000", 
        "--reload"
    ]

    # 2. Frontend config
    frontend_dir = os.path.join(os.getcwd(), "frontend")
    # On Windows, npm is npm.cmd, so we run through shell or use shell=True
    frontend_cmd = "npm run dev"

    # Start Backend
    print(f"[Launcher] Starting backend in {backend_dir}...")
    try:
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=os.getcwd(),  # Run from root so 'backend.main:app' import is resolved
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=dict(os.environ, PYTHONPATH=os.getcwd())
        )
    except Exception as e:
        print(f"[Launcher ERROR] Failed to start backend: {e}")
        sys.exit(1)

    # Start Frontend
    print(f"[Launcher] Starting frontend in {frontend_dir}...")
    try:
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            shell=True,
            bufsize=1
        )
    except Exception as e:
        print(f"[Launcher ERROR] Failed to start frontend: {e}")
        backend_proc.terminate()
        sys.exit(1)

    # Spawn logging threads
    threads = []
    
    t_be_out = threading.Thread(target=log_stream, args=(backend_proc.stdout, "[BACKEND]"), daemon=True)
    t_be_err = threading.Thread(target=log_stream, args=(backend_proc.stderr, "[BACKEND-ERR]"), daemon=True)
    t_fe_out = threading.Thread(target=log_stream, args=(frontend_proc.stdout, "[FRONTEND]"), daemon=True)
    t_fe_err = threading.Thread(target=log_stream, args=(frontend_proc.stderr, "[FRONTEND-ERR]"), daemon=True)

    for t in [t_be_out, t_be_err, t_fe_out, t_fe_err]:
        t.start()
        threads.append(t)

    print("\n[Launcher] Both services running. Press CTRL+C to terminate cleanly.\n")

    # Graceful shutdown handler
    def shutdown_services(signum, frame):
        print("\n[Launcher] Received termination signal. Cleaning up subprocesses...")
        
        # Terminate frontend
        print("[Launcher] Stopping frontend...")
        try:
            if is_windows:
                # Windows taskkill is often needed for processes spawned under shell=True
                subprocess.run(f"taskkill /F /T /PID {frontend_proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                frontend_proc.terminate()
        except Exception:
            pass

        # Terminate backend
        print("[Launcher] Stopping backend...")
        try:
            if is_windows:
                subprocess.run(f"taskkill /F /T /PID {backend_proc.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                backend_proc.terminate()
        except Exception:
            pass

        backend_proc.wait()
        frontend_proc.wait()
        print("[Launcher] Subprocesses stopped. Exiting sentinel clean.")
        sys.exit(0)

    # Register signals for CTRL+C and termination
    signal.signal(signal.SIGINT, shutdown_services)
    signal.signal(signal.SIGTERM, shutdown_services)

    # Keep main thread alive monitoring processes
    try:
        while True:
            be_exit = backend_proc.poll()
            fe_exit = frontend_proc.poll()
            
            if be_exit is not None:
                print(f"[Launcher] Backend exited unexpectedly with code {be_exit}.")
                shutdown_services(None, None)
            if fe_exit is not None:
                print(f"[Launcher] Frontend exited unexpectedly with code {fe_exit}.")
                shutdown_services(None, None)
                
            time.sleep(1)
    except SystemExit:
        pass
    except KeyboardInterrupt:
        shutdown_services(None, None)

if __name__ == "__main__":
    main()
