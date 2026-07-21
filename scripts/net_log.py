import subprocess
import time
import csv
import sys
from datetime import datetime

# --- Configuration ---
DEVICES = {
    "VF+": "192.168.0.200",
    "Master Radio": "192.168.0.102",
    "Follower Arm Radio": "192.168.0.103",
    "IP Camera Radio": "192.168.0.101"
}

# Ping every 60 seconds. 
INTERVAL_SECONDS = 10 
# ---------------------

def get_latencies(ip_list):
    results = {}
    try:
        # fping arguments used:
        # -C 1: Send exactly 1 ping per target
        # -q: Quiet mode (only output the results, no progress info)
        process = subprocess.run(
            ['fping', '-C', '1', '-q'] + ip_list,
            capture_output=True,
            text=True
        )
        
        output = process.stderr.strip().split('\n')
        
        for line in output:
            if not line:
                continue
            
            parts = line.split(':')
            if len(parts) == 2:
                ip = parts[0].strip()
                latency_str = parts[1].strip()
                
                if latency_str == '-':
                    results[ip] = None  # Device is down / Timeout
                else:
                    try:
                        results[ip] = float(latency_str)
                    except ValueError:
                        results[ip] = None
                        
    except Exception as e:
        print(f"Unexpected error running fping: {e}")
        
    return results

def main():
    # 1. Generate standard timestamped filename
    start_time_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"network_log_fping_{start_time_str}.csv"
    
    ip_list = list(DEVICES.values())

    # 2. Create the file and write the CSV headers
    print(f"Starting fping network logger. Writing data to: {filename}")
    print("Press Ctrl+C to stop.")
    
    with open(filename, mode='a', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(["Date", "Time", "Device_Name", "IP_Address", "Latency_ms", "Status"])

    try:
        # 3. Main Logging Loop
        while True:
            now = datetime.now()
            date_str = now.strftime("%Y-%m-%d")
            time_str = now.strftime("%H:%M:%S")

            # Get all latencies at exactly the same time
            latencies = get_latencies(ip_list)

            with open(filename, mode='a', newline='') as file:
                writer = csv.writer(file)

                for name, ip in DEVICES.items():
                    latency = latencies.get(ip)

                    if latency is not None:
                        status = "Up"
                        latency_val = f"{latency:.2f}"
                    else:
                        status = "Down"
                        latency_val = "TIMEOUT"

                    # Write to the log file
                    writer.writerow([date_str, time_str, name, ip, latency_val, status])

                    # Print to the terminal
                    print(f"[{date_str} {time_str}] {name} ({ip}): {latency_val} ms | Status: {status}")
            
            print("-" * 50) 
            
            # Wait for the next cycle
            time.sleep(INTERVAL_SECONDS)

    except KeyboardInterrupt:
        print("\nLogging stopped")

if __name__ == "__main__":
    main()
